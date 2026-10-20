// Instrumento de valor ganado (kit anatomy) sincronizado con la curva S: tres probetas con lo
// planificado (PV), lo ganado (EV) y lo gastado (AC) a la fecha en foco. En la del centro un anillo
// marca dónde debería ir (PV): la luz es el atraso (SPI). En la derecha un anillo marca lo ganado
// (EV): lo que sobra es sobrecosto (CPI); el anillo tenue es el EAC. Mismos puntos que la curva S.
import { useMemo } from 'react'
import type { PuntoSerie } from '../../domain/evm'
import { fmtFechaCorta } from '../../domain/fechas'
import { mm, num, pct } from '../../domain/formato'
import { anillo, atajos, banco, cursor, k, liquido, regla, vaso } from './base'
import { enViewBox, FiguraIso, useCursorVivo } from './Figura'

const W = 560, H = 420
const R = 15, BASE = 6, ALTO = 100
const XS = [-62, 0, 62]
const PLATE = { x: -112, y: -42, w: 224, d: 118, r: 8 }
const X0 = -84, LARGO = 168, RY = 47
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-62, 0, BASE + ALTO + 4], [62, 0, BASE + ALTO + 4]], W, H, { pad: 14, azimuth: 38 })
const { S, at, box } = atajos(P)

function llave(x: number) {
  const a = ((P.azimuth ?? 45) * Math.PI) / 180
  const fx = x + Math.cos(a) * (R + 2), fy = Math.sin(a) * (R + 2)
  return S(k.cylinder(fx, fy, 1.6, 2.4, 5, P, 14), { tone: 'mid' }) + S(box(fx - 3, fy - 0.6, 6, 1.2, 7.4, 1, 0.3), { tone: 'mid' })
}

export default function FiguraEVM({ puntos, eac, modo, foco, onFoco }: {
  puntos: PuntoSerie[]
  eac?: number
  modo: 'costo' | 'avance'
  foco: number | null
  onFoco: (i: number | null) => void
}) {
  const n = Math.max(1, puntos.length - 1)
  const iCorte = Math.max(0, puntos.map((p) => (modo === 'costo' ? p.ev : p.avanceReal) != null).lastIndexOf(true))
  const valores = useMemo(() => puntos.map((p) => modo === 'costo'
    ? { pv: p.pv, ev: p.ev ?? null, ac: p.ac ?? null }
    : { pv: p.avancePlan, ev: p.avanceReal ?? null, ac: null }), [puntos, modo])
  const max = useMemo(() => Math.max(1e-9, modo === 'costo' ? eac ?? 0 : 1, ...valores.flatMap((v) => [v.pv, v.ev ?? 0, v.ac ?? 0])) * 1.04, [valores, eac, modo])
  const esc = ALTO / max
  const estatico = useMemo(() => {
    const vasos = XS.map((x) => vaso(P, { x, r: R, base: BASE, alto: ALTO, marcas: [0.25, 0.5, 0.75].map((f) => f * ALTO) }))
    return {
      fondo: banco(P, PLATE) + regla(P, { x0: X0, largo: LARGO, y: RY, n, cada: 4, hoy: iCorte }) +
        S(box(-84, -36, 168, 8, 0, 1, 0.6), { tone: 'lo' }),
      vasos: vasos.map((v, i) => ({ pie: v.pie + llave(XS[i]), vidrio: v.vidrio })),
      eac: modo === 'costo' && eac != null ? `<path class="iso-line" data-tone="mid" d="${anillo(P, XS[2], 0, R, BASE + eac * esc)}" style="stroke-dasharray:2 2"/>` : '',
      cursor: cursor(P, RY),
    }
  }, [n, iCorte, modo, eac, esc])
  const vivo = useCursorVivo({ foco, reposo: iCorte, tour: (s) => { const c = s % 16; return c < 11 ? (c / 11) * n : iCorte } })
  if (puntos.length === 0) return null
  const u = Math.min(n, Math.max(0, vivo.u))
  const i0 = Math.floor(u), f = u - i0, i1 = Math.min(n, i0 + 1)
  // EV y AC existen sólo hasta el corte: después quedan en su último valor real
  const real = (i: number, k2: 'ev' | 'ac') => valores[Math.min(i, iCorte)][k2]
  const mezcla = (a: number | null, b: number | null) => (a == null || b == null ? a ?? b : a + (b - a) * f)
  const pv = mezcla(valores[i0].pv, valores[i1].pv) ?? 0
  const ev = mezcla(real(i0, 'ev'), real(i1, 'ev'))
  const ac = mezcla(real(i0, 'ac'), real(i1, 'ac'))
  const despues = u > iCorte + 0.01
  const spi = ev != null && pv > 0 ? ev / pv : null
  const cpi = ev != null && ac ? ev / ac : null
  const fmt = (v: number) => (modo === 'costo' ? mm(v) : pct(v, 0))
  const x0s = at([X0, RY, 0])[0], x1s = at([X0 + LARGO, RY, 0])[0]
  const indice = (e: React.PointerEvent<HTMLDivElement>) => Math.round(Math.min(1, Math.max(0, (enViewBox(e, vivo.ref.current, W, H)[0] - x0s) / (x1s - x0s))) * n)
  const vals = [pv, ev, ac]
  return (
    <FiguraIso width={W} height={H} stageRef={vivo.ref}
      label="Tres probetas sobre un banco: valor planificado, valor ganado y costo real a la fecha del cursor. Un anillo en la del centro marca lo planificado y otro en la de la derecha lo ganado."
      aria="Instrumento de valor ganado: flechas cambian la fecha, Inicio y Fin van a los extremos"
      hint={modo === 'costo' ? 'PV · EV · AC' : 'Plan · Real'}
      lectura={<>{fmtFechaCorta(puntos[Math.round(u)].fecha)}{despues ? ' (sólo plan)' : ''} · {modo === 'costo' ? 'PV' : 'plan'} {fmt(pv)} · {modo === 'costo' ? 'EV' : 'real'} {ev != null ? fmt(ev) : '—'}{modo === 'costo' && ac != null ? ` · AC ${fmt(ac)}` : ''}{spi != null ? ` · SPI ${num(spi, 2)}` : ''}{cpi != null ? ` · CPI ${num(cpi, 2)}` : ''}</>}
      onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) onFoco(indice(e)) }}
      onPointerDown={(e) => onFoco(indice(e))}
      onPointerLeave={() => onFoco(null)}
      onKeyDown={(e) => {
        const base = foco ?? Math.round(u)
        const to = e.key === 'ArrowRight' ? base + 1 : e.key === 'ArrowLeft' ? base - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n : e.key === 'Escape' ? null : undefined
        if (to === undefined) return
        e.preventDefault()
        onFoco(to == null ? null : Math.min(n, Math.max(0, to)))
      }}
      capas={[
        estatico.fondo,
        ...XS.flatMap((x, i) => [
          estatico.vasos[i].pie,
          liquido(P, x, 0, R, BASE, (vals[i] ?? 0) * esc, i === 1),
          estatico.vasos[i].vidrio,
          i === 1 ? <path key="a1" className="iso-line" data-tone="hi" d={pv > 0 ? anillo(P, x, 0, R, BASE + pv * esc) : ''} style={{ strokeWidth: 1.2 }} /> : '',
          i === 2 && ev != null && modo === 'costo' ? <path key="a2" className="iso-line" data-tone="hi" d={anillo(P, x, 0, R, BASE + ev * esc)} style={{ strokeWidth: 1.2 }} /> : '',
          i === 2 ? estatico.eac : '',
        ]),
        <g key="cu" transform={k.translateAlong(P, [X0 + (LARGO * u) / n, 0, 0])} dangerouslySetInnerHTML={{ __html: estatico.cursor }} />,
      ]}
    />
  )
}
