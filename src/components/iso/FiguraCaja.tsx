// Instrumento de caja (kit anatomy) sincronizado con el gráfico de flujo semanal: el estanque es la
// caja disponible de la semana en foco, el chorro de arriba son los cobros de esa semana, la llave de
// abajo los pagos y el estanque chico las retenciones de EP que el mandante aún no devuelve. El
// anillo marcado es el colchón mínimo. Todo sale de calcularCaja (los mismos números del gráfico).
import { useMemo } from 'react'
import type { SemanaCaja } from '../../domain/caja'
import { fmtFechaCorta } from '../../domain/fechas'
import { mm } from '../../domain/formato'
import { anillo, atajos, banco, cursor, k, liquido, regla, vaso } from './base'
import { enViewBox, FiguraIso, useCursorVivo } from './Figura'

const W = 560, H = 400
const T = { x: 8, y: 0, r: 30, base: 6, alto: 84 }
const RT = { x: -62, y: -16, r: 11, base: 6, alto: 34 }
const PLATE = { x: -104, y: -56, w: 214, d: 140, r: 8 }
const X0 = -80, LARGO = 168, RY = 50

const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [T.x, -40, 108], [T.x, 0, 96]], W, H, { pad: 14, azimuth: 38 })
const { S, L, D, at, box, seg } = atajos(P)
const A = ((P.azimuth ?? 45) * Math.PI) / 180
const frente = (t: typeof T, dr = 0): [number, number] => [t.x + Math.cos(A) * (t.r - 0.6 + dr), t.y + Math.sin(A) * (t.r - 0.6 + dr)]
const [SX, SY] = frente(T)
const [OX, OY] = frente(T, 3)

function entrada() {
  return [
    S(box(-44, -40, 5, 5, 0, 1.5, 0.4), { tone: 'lo' }),
    S(box(-43, -39, 3, 3, 1.5, 102, 0.3), { tone: 'mid' }),
    S(box(-43, -39, SX + 44.5, 3, 101.5, 3, 0.3), { tone: 'mid', crease: 'lo' }),
    S(box(SX - 1.5, -39, 3, SY + 40.5, 101.5, 3, 0.3), { tone: 'mid', crease: 'lo' }),
    S(box(SX - 2, SY - 2, 4, 4, 96, 6, 0.4), { tone: 'mid' }),
    S(k.cylinder(-41.5, -33, 3.6, 60, 1.6, P, 24), { tone: 'mid' }),
    D([at([-41.5, -33, 61.6])], { size: 0.5, tone: 'hi' }),
  ].join('')
}
function retorno() {
  const vx = (RT.x + RT.r + T.x - T.r) / 2
  return [
    S(box(RT.x + RT.r - 1, RT.y - 1.5, T.x - T.r - (RT.x + RT.r) + 2, 3, 3, 3, 0.3), { tone: 'mid', crease: 'lo' }),
    S(box(vx - 2.5, RT.y - 2.5, 5, 5, 2, 5, 0.6), { tone: 'mid' }),
    S(k.cylinder(vx, RT.y, 0.6, 7, 3, P, 10), { tone: 'mid', crease: 'none' }),
    S(k.cylinder(vx, RT.y, 3.4, 10, 1, P, 24), { tone: 'mid' }),
  ].join('')
}
function salida() {
  return [
    S(box(OX - 7, OY - 6, 14, 18, 0, 1, 0.6), { tone: 'lo' }),
    L([0, 1, 2, 3, 4].map((i) => k.lineOnTop([OX - 7, OY - 3 + i * 3], [OX + 7, OY - 3 + i * 3], 1, P)).join(''), { tone: 'faint' }),
    S(box(OX - 1.5, OY - 3, 3, 3, 8, 3, 0.3), { tone: 'mid' }),
    S(box(OX - 1.5, OY - 1.5, 3, 3, 6.5, 2, 0.3), { tone: 'mid' }),
  ].join('')
}

export default function FiguraCaja({ semanas, colchon, corte, foco, onFoco }: {
  semanas: SemanaCaja[]
  colchon: number
  corte: number
  foco: number | null
  onFoco: (i: number | null) => void
}) {
  const n = semanas.length - 1
  const iHoy = Math.max(0, semanas.findIndex((s) => s.desde + 6 >= corte))
  const escala = useMemo(() => {
    const max = Math.max(colchon, 1, ...semanas.map((s) => s.saldo))
    const ret = Math.max(1, ...semanas.map((s) => s.retenido))
    const flujo = Math.max(1, ...semanas.map((s) => Math.max(s.ingresos, s.egresos)))
    return { esc: (T.alto - 4) / max, ret: (RT.alto - 3) / ret, flujo }
  }, [semanas, colchon])
  const estatico = useMemo(() => {
    const t = vaso(P, { ...T, marcas: [0.25, 0.5, 0.75].map((f) => f * (T.alto - 4)) })
    const r = vaso(P, { ...RT, marcas: [10, 20] })
    return {
      fondo: [banco(P, PLATE), regla(P, { x0: X0, largo: LARGO, y: RY, n: Math.max(1, n), cada: 4, hoy: iHoy }), entrada(), r.pie].join(''),
      retVidrio: r.vidrio + retorno(),
      tPie: t.pie,
      tVidrio: t.vidrio + `<path class="iso-line" data-tone="hi" d="${anillo(P, T.x, T.y, T.r, T.base + colchon * escala.esc)}" style="stroke-width:1.2"/>`,
      salida: salida(),
      cursor: cursor(P, RY),
    }
  }, [n, iHoy, colchon, escala])
  const vivo = useCursorVivo({
    foco, reposo: iHoy,
    tour: (s) => { const c = s % 20; return c < 14 ? (c / 14) * n : iHoy },
  })
  if (semanas.length === 0) return null
  const u = Math.min(n, Math.max(0, vivo.u))
  const i0 = Math.floor(u), f = u - i0, i1 = Math.min(n, i0 + 1)
  const mezcla = (a: number, b: number) => a + (b - a) * f
  const sem = semanas[Math.round(u)]
  const saldo = mezcla(semanas[i0].saldo, semanas[i1].saldo)
  const retenido = mezcla(semanas[i0].retenido, semanas[i1].retenido)
  const h = Math.max(0, saldo) * escala.esc
  const opEntra = sem.ingresos > 0 ? Math.min(1, 0.35 + sem.ingresos / escala.flujo) : 0
  const opSale = sem.egresos > 0 ? Math.min(1, 0.35 + sem.egresos / escala.flujo) : 0
  const xCur = X0 + (LARGO * u) / Math.max(1, n)
  const x0s = at([X0, RY, 0])[0], x1s = at([X0 + LARGO, RY, 0])[0]
  const indice = (e: React.PointerEvent<HTMLDivElement>) => Math.round(Math.min(1, Math.max(0, (enViewBox(e, vivo.ref.current, W, H)[0] - x0s) / (x1s - x0s))) * n)
  return (
    <FiguraIso width={W} height={H} stageRef={vivo.ref}
      label="Estanque de caja sobre un banco: se llena con los cobros de la semana, se vacía con los pagos y un estanque chico guarda las retenciones; una regla recorre las semanas de la obra."
      aria="Instrumento de caja: flechas cambian la semana, Inicio y Fin van a los extremos"
      hint="Recorre las semanas"
      lectura={<>sem {fmtFechaCorta(sem.desde)}{sem.real ? '' : ' (proy.)'} · caja <b className={saldo < colchon ? 'text-amber-700' : ''}>{mm(saldo)}</b> · retenido {mm(retenido)}</>}
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
        liquido(P, RT.x, RT.y, RT.r, RT.base, retenido * escala.ret, false),
        estatico.retVidrio,
        estatico.tPie,
        liquido(P, T.x, T.y, T.r, T.base, h, sem.real),
        estatico.tVidrio,
        <path key="ch" className="iso-line" data-tone="lit" data-flow="" d={seg([SX, SY, 96], [SX, SY, T.base + h])} style={{ strokeWidth: 1.6, opacity: opEntra }} />,
        estatico.salida,
        <path key="de" className="iso-line" data-tone="hi" data-flow="" d={seg([OX, OY, 6.5], [OX, OY, 1])} style={{ strokeWidth: 1.4, opacity: opSale }} />,
        <g key="cu" transform={k.translateAlong(P, [xCur, 0, 0])} dangerouslySetInnerHTML={{ __html: estatico.cursor }} />,
      ]}
    />
  )
}
