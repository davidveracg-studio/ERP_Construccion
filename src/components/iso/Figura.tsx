// Contenedor de una figura isométrica dentro de la app: estilos del kit (una sola vez), el SVG por
// capas (texto estático del kit o nodos vivos de React, en orden de pintado) y una lectura al pie.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ISO_CSS } from './kit'

let estilos = false
function useEstilos() {
  useEffect(() => {
    if (estilos || typeof document === 'undefined') return
    estilos = true
    const s = document.createElement('style')
    s.dataset.iso = ''
    s.textContent = `${ISO_CSS}
.iso-figura{--anatomy-paper:#ffffff;--anatomy-card:#ffffff}
.iso-figura .iso-dots[data-tone="lit"] circle{fill:var(--anatomy-lit);opacity:1}
.iso-figura [data-fade]{transition:opacity .35s var(--anatomy-ease)}
@media (prefers-reduced-motion:reduce){.iso-figura [data-fade]{transition:none}}
.iso-figura .iso-stage{touch-action:pan-y;cursor:ew-resize;border-radius:6px}
.iso-figura .iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}`
    document.head.appendChild(s)
  }, [])
}

export type Capa = string | ReactNode

export function FiguraIso({ width, height, label, capas, hint, lectura, aria, stageRef, onPointerMove, onPointerDown, onPointerLeave, onKeyDown, className }: {
  width: number
  height: number
  label: string
  capas: Capa[]
  hint?: string
  lectura: ReactNode
  aria: string
  stageRef?: React.Ref<HTMLDivElement>
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerLeave?: (e: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  className?: string
}) {
  useEstilos()
  return (
    <div className={`iso iso-figura ${className ?? ''}`} data-theme="light">
      <div ref={stageRef} className="iso-stage" tabIndex={0} role="group" aria-label={aria}
        onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerLeave={onPointerLeave} onKeyDown={onKeyDown}>
        <svg className="iso-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          {capas.map((c, i) => (typeof c === 'string' ? <g key={i} dangerouslySetInnerHTML={{ __html: c }} /> : <g key={i}>{c}</g>))}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[11px] text-slate-500">
        {hint && <span className="uppercase tracking-wider">{hint}</span>}
        <span className="tabular ml-auto text-slate-700" aria-live="polite">{lectura}</span>
      </div>
    </div>
  )
}

/** Posición del puntero en unidades del viewBox. */
export function enViewBox(e: React.PointerEvent<Element>, el: Element | null, width: number, height: number): [number, number] {
  const svg = el?.querySelector('svg')
  const r = (svg ?? e.currentTarget).getBoundingClientRect()
  return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height]
}

const quieto = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Cursor compartido entre un gráfico y su figura: `foco` (índice o null) viene del padre. Mientras
 * nadie interactúa y la figura está en pantalla, un recorrido (`tour`, en índices) la anima.
 * Devuelve la posición suavizada `u` y el reloj `t` (segundos) para animaciones propias.
 */
export function useCursorVivo({ foco, reposo, tour, tau = 0.22, animando = false }: {
  foco: number | null
  reposo: number
  tour?: (seg: number) => number
  tau?: number
  animando?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState({ u: foco ?? reposo, t: 0 })
  const s = useRef({ u: foco ?? reposo, t: 0, reloj: 0, visible: false, ultimaInteraccion: -1e9, frame: 0, last: 0 })
  const props = useRef({ foco, reposo, tour, tau, animando })
  props.current = { foco, reposo, tour, tau, animando }
  if (foco != null) s.current.ultimaInteraccion = performance.now()

  useEffect(() => {
    const st = s.current
    const tick = (now: number) => {
      const p = props.current
      const dt = st.last ? Math.min((now - st.last) / 1000, 1 / 30) : 1 / 60
      st.last = now
      st.t += dt
      const calm = quieto()
      const libre = p.foco == null && now - st.ultimaInteraccion > 3600 && !!p.tour && !calm
      if (libre) st.reloj += dt
      const target = p.foco ?? (libre ? p.tour!(st.reloj) : p.reposo)
      st.u = calm ? target : st.u + (target - st.u) * (1 - Math.exp(-dt / p.tau))
      if (Math.abs(target - st.u) < 1e-3) st.u = target
      setEstado({ u: st.u, t: st.t })
      const quietoYa = !libre && st.u === target && !p.animando
      st.frame = st.visible && !quietoYa ? requestAnimationFrame(tick) : 0
    }
    const correr = () => { if (!st.frame && st.visible) { st.last = 0; st.frame = requestAnimationFrame(tick) } }
    const io = new IntersectionObserver((e) => { st.visible = e[e.length - 1].isIntersecting; if (st.visible) correr() }, { rootMargin: '120px 0px' })
    if (ref.current) io.observe(ref.current)
    ;(st as unknown as { correr: () => void }).correr = correr
    return () => { io.disconnect(); cancelAnimationFrame(st.frame); st.frame = 0 }
  }, [])
  // Cualquier cambio de foco o de animación despierta el bucle
  useEffect(() => { (s.current as unknown as { correr?: () => void }).correr?.() }, [foco, reposo, animando])
  return { ref, u: estado.u, t: estado.t }
}
