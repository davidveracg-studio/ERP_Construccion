// Monte Carlo del plazo como tablero de Galton (kit anatomy): cada bolita es una de las corridas
// reales de simularPlazo; cae por las filas de clavos y se apila en el casillero de su semana de
// término. Relleno = termina dentro del plazo; anillo = termina después. La placa marcada es el
// término contractual y los marcadores de la regla son P50 (bajo) y P80 (alto).
import { useMemo, useRef, useState } from 'react'
import type { SimulacionPlazo } from '../../domain/predictivo'
import { fmtFecha } from '../../domain/fechas'
import { pct } from '../../domain/formato'
import { atajos, banco, k, puntosLit } from './base'
import { FiguraIso, useCursorVivo } from './Figura'

const W = 560, H = 470
const PASO = 8, ZF = 100, ZB = 10, YB = 4
const LANZAR = 3.2, VUELO = 0.9

export default function FiguraMontecarlo({ sim }: { sim: SimulacionPlazo }) {
  const B = sim.histograma.length
  const filas = Math.max(2, B - 1)
  const DZ = Math.min(8, (ZF - ZB - 34) / filas)
  const xBin = (b: number) => (b - (B - 1) / 2) * PASO
  const dias = sim.histograma[1] ? sim.histograma[1].desde - sim.histograma[0].desde : 1
  const xFecha = (f: number) => xBin(0) - PASO / 2 + ((f - sim.histograma[0].desde) / dias) * PASO
  const ancho = B * PASO + 24
  const PLATE = { x: -ancho / 2 - 20, y: -30, w: ancho + 40, d: 70, r: 8 }
  const P = useMemo(() => k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-ancho / 2, 0, 126], [ancho / 2, 0, 126]], W, H, { pad: 14, azimuth: 66 }), [ancho])
  const { S, L, D, at, seg, box } = atajos(P)
  const cumple = (b: number) => sim.histograma[b].desde + dias <= sim.contractual
  const estatico = useMemo(() => {
    const out: string[] = [banco(P, PLATE)]
    // Regla con una marca por casillero y el término contractual
    const tira = { x: xBin(0) - PASO, y: 12, w: B * PASO + PASO, d: 7, r: 1 }
    out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }))
    out.push(L(sim.histograma.map((_, b) => k.lineOnTop([xBin(b), tira.y], [xBin(b), tira.y + 2.4], 0.6, P)).join(''), { tone: 'lo' }))
    const xc = Math.min(tira.x + tira.w - 1, Math.max(tira.x + 1, xFecha(sim.contractual)))
    out.push(L(k.lineOnTop([xc, tira.y], [xc, tira.y + tira.d - 1], 0.6, P), { tone: 'hi' }))
    out.push(D([at([xc, tira.y + tira.d - 1, 0.6])], { size: 0.6, tone: 'hi' }))
    // Tablero, tolva y clavos
    const x0 = -ancho / 2, x1 = ancho / 2
    out.push(S(box(x0 - 4, -8, ancho + 8, 18, 0, ZB, 1), { tone: 'mid' }))
    out.push(D([[x0, -4], [x1, -4], [x0, 6], [x1, 6]].map(([x, y]) => at([x, y, ZB])), { size: 0.45 }))
    out.push(S(box(x0, -2, ancho, 4, ZB, 112, 0.6), { tone: 'mid', crease: 'lo' }))
    out.push(L(k.pathOf([at([x0 + 4, 2, ZB + 4]), at([x1 - 4, 2, ZB + 4]), at([x1 - 4, 2, ZB + 108]), at([x0 + 4, 2, ZB + 108])], true), { tone: 'faint' }))
    out.push(S(box(-9, 2, 18, 6, ZF + 10, 8, 0.6), { tone: 'mid' }))
    out.push(L(seg([-2, 8, ZF + 10], [2, 8, ZF + 10]), { tone: 'hi' }))
    const clavos: [number, number][] = []
    for (let r = 0; r < filas; r++) for (let j = 0; j <= r; j++) clavos.push(at([(j - r / 2) * PASO, 2.4, ZF - r * DZ]) as [number, number])
    out.push(L(clavos.map(([x, y]) => `M${(x - 0.9).toFixed(1)} ${y.toFixed(1)}a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0`).join(''), { tone: 'mid' }))
    out.push(D(clavos, { size: 0.45, tone: 'hi' }))
    const fondo = out.join('')
    // Separadores de casilleros y placa del término contractual (delante de las pilas)
    const sep: string[] = []
    for (let b = 0; b <= B; b++) sep.push(S(box(xBin(b) - PASO / 2 - 0.4, 2, 0.8, 5, ZB, 26, 0.1), { tone: 'lo', crease: 'none' }))
    sep.push(S(box(xc - 0.6, 6.4, 1.2, 1.2, ZB, 32, 0.1), { tone: 'hi', crease: 'none' }))
    return { fondo, sep: sep.join(''), marca: (alto: number) => S(k.slabOf({ x: -1.4, y: tira.y + 3.2, w: 2.8, d: 3, r: 0.6 }, 0.6, alto, P, 2), { tone: alto > 2 ? 'hi' : 'mid' }) }
  }, [P, sim])

  // Corridas reales, mezcladas de forma reproducible; cada una con su camino de clavos
  const bolitas = useMemo(() => {
    const lista = sim.histograma.flatMap((h, b) => Array.from({ length: h.n }, () => b))
    let s = 7
    const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]] }
    return lista.map((b) => {
      const pasos = Array.from({ length: filas }, (_, r) => r < Math.min(b, filas))
      for (let i = pasos.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [pasos[i], pasos[j]] = [pasos[j], pasos[i]] }
      let j = 0
      return { b, col: [0, ...pasos.map((p) => (j += p ? 1 : 0))] }
    })
  }, [sim, filas])
  const [inicio, setInicio] = useState(0)
  const ultimo = useRef(0)
  const vivo = useCursorVivo({ foco: null, reposo: 0, animando: ultimo.current - inicio < LANZAR + VUELO + 0.3 })
  ultimo.current = vivo.t
  const t = vivo.t - inicio
  const N = bolitas.length
  const quieto = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const cuentas = sim.histograma.map(() => 0)
  const vuelo: [number, number, boolean][] = []
  const max = Math.max(1, ...sim.histograma.map((h) => h.n))
  const porPunto = Math.max(1, Math.ceil(max / 30))
  bolitas.forEach((x, i) => {
    const ts = (i / N) * LANZAR
    if (quieto || t >= ts + VUELO) { cuentas[x.b]++; return }
    if (t < ts) return
    const s = ((t - ts) / VUELO) * (filas + 2)
    let px: number, pz: number
    if (s < filas) {
      const r = Math.floor(s), f = s - r
      const xa = (x.col[r] - r / 2) * PASO, xb = r + 1 < filas ? (x.col[r + 1] - (r + 1) / 2) * PASO : xBin(x.b)
      px = xa + (xb - xa) * f
      pz = ZF - r * DZ - DZ * f + 2.2 + Math.sin(Math.PI * f) * 1.6
    } else {
      const f = Math.min(1, (s - filas) / 2)
      px = xBin(x.b)
      const tope = ZB + 1.3 + Math.floor(cuentas[x.b] / porPunto / 3) * 2.4
      pz = ZF - filas * DZ + 2.2 - (ZF - filas * DZ + 2.2 - tope) * f * f
    }
    const [sx, sy] = at([px, YB, pz])
    vuelo.push([sx, sy, cumple(x.b)])
  })
  const lleno: [number, number][] = []
  const anillos: string[] = []
  cuentas.forEach((c, b) => {
    for (let i = 0; i < Math.round(c / porPunto); i++) {
      const [sx, sy] = at([xBin(b) + ((i % 3) - 1) * 2.4, YB, ZB + 1.3 + Math.floor(i / 3) * 2.4])
      if (cumple(b)) lleno.push([sx, sy]); else anillos.push(`M${(sx - 1.1).toFixed(1)} ${sy.toFixed(1)}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`)
    }
  })
  for (const [sx, sy, ok] of vuelo) { if (ok) lleno.push([sx, sy]); else anillos.push(`M${(sx - 1.1).toFixed(1)} ${sy.toFixed(1)}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`) }
  const caidas = cuentas.reduce((a, c) => a + c, 0)
  const listo = caidas >= N
  return (
    <div>
      <FiguraIso width={W} height={H} stageRef={vivo.ref}
        label={`Tablero de Galton con ${N} corridas de la simulación del plazo apiladas por semana de término; una placa marca el término contractual.`}
        aria="Monte Carlo del plazo como tablero de Galton"
        hint={listo ? `${N} corridas · relleno = en plazo` : `simulando… ${caidas} de ${N}`}
        lectura={<>P50 {fmtFecha(sim.p50 - 1)} · P80 {fmtFecha(sim.p80 - 1)} · cumple {pct(sim.probCumplir, 0)}</>}
        capas={[
          estatico.fondo,
          puntosLit(lleno, 1.2),
          `<path class="iso-line" data-tone="hi" d="${anillos.join('')}" style="stroke-width:0.9"/>`,
          estatico.sep,
          <g key="p50" opacity={listo ? 1 : 0.25} transform={k.translateAlong(P, [xFecha(sim.p50), 0, 0])} dangerouslySetInnerHTML={{ __html: estatico.marca(1.6) }} />,
          <g key="p80" opacity={listo ? 1 : 0.25} transform={k.translateAlong(P, [xFecha(sim.p80), 0, 0])} dangerouslySetInnerHTML={{ __html: estatico.marca(2.8) }} />,
        ]}
      />
      <div className="flex justify-end">
        <button type="button" onClick={() => setInicio(vivo.t)} className="rounded px-2 py-0.5 text-xs text-marca hover:bg-slate-100">↻ Repetir simulación</button>
      </div>
    </div>
  )
}
