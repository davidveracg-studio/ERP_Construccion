// Instrumento del Last Planner (kit anatomy) sincronizado con el gráfico de PPC: bandejas en
// cascada con las tareas comprometidas de la semana elegida. Al cerrar la semana las cumplidas
// caen a la bandeja "hecho" y las otras a "no cumplidas". PPC = cumplidas ÷ comprometidas.
import { useMemo, useRef } from 'react'
import { META_PPC, type SemanaPPC } from '../../domain/lastPlanner'
import { fmtFecha } from '../../domain/fechas'
import { pct } from '../../domain/formato'
import { atajos, banco, cursor, k, puntosLit, regla } from './base'
import { enViewBox, FiguraIso, useCursorVivo } from './Figura'

const W = 560, H = 380
const BAND = {
  b: { x: -60, y: -40, w: 64, d: 44, z: 30, r: 1 },
  c: { x: 20, y: -40, w: 52, d: 40, z: 8, r: 1 },
  d: { x: 20, y: 6, w: 52, d: 22, z: 8, r: 1 },
}
const PLATE = { x: -100, y: -54, w: 196, d: 120, r: 8 }
const X0 = -76, LARGO = 152, RY = 40
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-60, -40, 40]], W, H, { pad: 14, azimuth: 48 })
const { S, L, D, at, box, depth } = atajos(P)

function bandeja(t: typeof BAND.b) {
  const out: string[] = []
  const postes = k.corners(t, 3).sort((a, b) => depth(...a) - depth(...b))
  if (t.z > 10) for (const [x, y] of postes.slice(0, 2)) out.push(S(k.cylinder(x, y, 1.4, 0, t.z, P, 12), { tone: 'lo', crease: 'none' }))
  out.push(S(k.slabOf(t, t.z - 1.6, 1.6, P, 2, 0.3), { tone: 'mid' }))
  if (t.z > 10) for (const [x, y] of postes.slice(2)) out.push(S(k.cylinder(x, y, 1.4, 0, t.z - 1.6, P, 12), { tone: 'lo', crease: 'none' }))
  else out.push(S(box(t.x + 2, t.y + 2, t.w - 4, t.d - 4, 0, t.z - 1.6, 0.6), { tone: 'lo' }))
  out.push(L(k.planOutline(k.insetPlan(t, 2.4), t.z, P, 2), { tone: 'lo' }))
  out.push(D(k.corners(t, 1.2).map(([x, y]) => at([x, y, t.z])), { size: 0.45 }))
  return out.join('')
}
const lugar = (t: typeof BAND.b, i: number, cols: number): [number, number, number] => {
  const c = i % cols, f = Math.floor(i / cols)
  return [t.x + 6 + c * 8 + (f % 2) * 2, t.y + 6 + f * 8, t.z + 1.4]
}
const salto = (p: number[], q: number[], f: number): [number, number, number] => {
  const e = f * f * (3 - 2 * f)
  return [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e + Math.sin(Math.PI * f) * 8]
}

export default function FiguraPPC({ serie, semana, onSemana }: { serie: SemanaPPC[]; semana: number; onSemana: (lunes: number) => void }) {
  const n = Math.max(1, serie.length - 1)
  const iSel = Math.max(0, serie.findIndex((s) => s.lunes === semana))
  const estatico = useMemo(() => ({
    fondo: banco(P, PLATE) + regla(P, { x0: X0, largo: LARGO, y: RY, n, cada: 1 }) + bandeja(BAND.b) +
      S(box(BAND.b.x + BAND.b.w, -26, BAND.c.x - BAND.b.x - BAND.b.w + 4, 8, 16, 1, 0.3), { tone: 'lo' }) + bandeja(BAND.c) + bandeja(BAND.d),
    cursor: cursor(P, RY),
  }), [n])
  // La caída arranca cada vez que cambia la semana elegida
  const inicio = useRef({ lunes: semana, t: 0 })
  const ultimo = useRef(0)
  const vivo = useCursorVivo({ foco: iSel, reposo: iSel, animando: ultimo.current - inicio.current.t < 2.6 })
  if (inicio.current.lunes !== semana) inicio.current = { lunes: semana, t: vivo.t }
  ultimo.current = vivo.t
  const quieto = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const s = serie[iSel]
  if (!s) return null
  const t = quieto ? 9 : vivo.t - inicio.current.t
  const fC = s.cerrada ? Math.min(1, Math.max(0, (t - 0.5) / 1.4)) : 0
  const lit: [number, number][] = []
  const anillos: string[] = []
  let iC = 0, iD = 0
  for (let i = 0; i < s.comprometidas; i++) {
    const ok = i < s.cumplidas
    const a = lugar(BAND.b, i, 7)
    const destino = ok ? lugar(BAND.c, iC++, 6) : lugar(BAND.d, iD++, 6)
    const [sx, sy] = at(fC > 0 ? salto(a, destino, fC) : a)
    if (ok || !s.cerrada) lit.push([sx, sy])
    else anillos.push(`M${(sx - 2).toFixed(1)} ${sy.toFixed(1)}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0`)
  }
  const x0s = at([X0, RY, 0])[0], x1s = at([X0 + LARGO, RY, 0])[0]
  const indice = (e: React.PointerEvent<HTMLDivElement>) => Math.round(Math.min(1, Math.max(0, (enViewBox(e, vivo.ref.current, W, H)[0] - x0s) / (x1s - x0s))) * n)
  return (
    <FiguraIso width={W} height={H} stageRef={vivo.ref}
      label="Bandejas en cascada: arriba las tareas comprometidas de la semana; al cerrarla, las cumplidas caen a la bandeja de hecho y las otras a la de no cumplidas."
      aria="Instrumento del PPC: flechas cambian la semana"
      hint={s.cerrada ? 'arriba: comprometidas · abajo: hecho / no cumplidas' : 'semana en curso'}
      lectura={<>{fmtFecha(s.lunes).slice(0, 5)} · {s.cerrada ? <>cumplidas {s.cumplidas} de {s.comprometidas} · PPC <b className={s.ppc != null && s.ppc < META_PPC ? 'text-amber-700' : ''}>{s.ppc != null ? pct(s.ppc, 0) : '—'}</b></> : <>{s.comprometidas} comprometidas</>}</>}
      onPointerDown={(e) => onSemana(serie[indice(e)].lunes)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!d) return
        e.preventDefault()
        onSemana(serie[Math.min(n, Math.max(0, iSel + d))].lunes)
      }}
      capas={[
        estatico.fondo,
        `<path class="iso-line" data-tone="hi" d="${anillos.join('')}" style="stroke-width:1.1"/>`,
        puntosLit(lit, 2.1),
        <g key="cu" transform={k.translateAlong(P, [X0 + (LARGO * vivo.u) / n, 0, 0])} dangerouslySetInnerHTML={{ __html: estatico.cursor }} />,
      ]}
    />
  )
}
