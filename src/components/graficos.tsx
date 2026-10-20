// Gráficos SVG propios (18 §4). Colores de serie validados: EV azul, AC naranja,
// PV aqua (discontinua) con etiquetas directas; estados usan la paleta de estado.
import { useId, useState } from 'react'
import { suave, useProgreso } from './animacion'
import type { SemanaCaja } from '../domain/caja'
import type { PuntoSerie } from '../domain/evm'
import { fmtFecha, fmtFechaCorta } from '../domain/fechas'
import { mm, pct } from '../domain/formato'
import type { Dia } from '../domain/types'

const C = { pv: '#1baf7a', ev: '#2a78d6', ac: '#eb6834', grid: '#e2e8f0', texto: '#475569', eje: '#94a3b8' }

// ---------------------------------------------------------------------------
// Curva S
// ---------------------------------------------------------------------------
export function CurvaS({ puntos, corte, eac, terminoProyectado, modo = 'costo', animar = true }: {
  puntos: PuntoSerie[]
  corte: Dia
  eac?: number
  terminoProyectado?: Dia
  modo?: 'costo' | 'avance'
  /** Dibuja las curvas en el tiempo al aparecer (no en informes impresos). */
  animar?: boolean
}) {
  const W = 720, H = 280, m = { l: 64, r: 88, t: 16, b: 28 }
  const [hover, setHover] = useState<number | null>(null)
  const clip = useId()
  const anim = useProgreso<HTMLDivElement>(2200, `${puntos.length}-${modo}`)
  const avance = animar ? suave(anim.p) : 1
  const f0 = puntos[0]?.fecha ?? 0
  const f1 = Math.max(puntos.at(-1)?.fecha ?? 1, terminoProyectado ?? 0)
  const val = (p: PuntoSerie, k: 'pv' | 'ev' | 'ac') =>
    modo === 'costo' ? p[k] : k === 'pv' ? p.avancePlan : k === 'ev' ? p.avanceReal : undefined
  const maxY = modo === 'costo' ? Math.max(eac ?? 0, ...puntos.map((p) => Math.max(p.pv, p.ev ?? 0, p.ac ?? 0))) * 1.05 : 1
  const x = (f: number) => m.l + ((f - f0) / Math.max(1, f1 - f0)) * (W - m.l - m.r)
  const y = (v: number) => H - m.b - (v / (maxY || 1)) * (H - m.t - m.b)
  const linea = (k: 'pv' | 'ev' | 'ac') =>
    puntos.filter((p) => val(p, k) != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)},${y(val(p, k)!).toFixed(1)}`).join(' ')
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
  const ticksX = puntos.filter((_, i) => i % Math.ceil(puntos.length / 7) === 0)
  const ultimo = (k: 'pv' | 'ev' | 'ac') => [...puntos].reverse().find((p) => val(p, k) != null)
  const fmtY = (v: number) => (modo === 'costo' ? mm(v) : pct(v, 0))
  const hp = hover != null ? puntos[hover] : null
  const etiquetas = (['pv', 'ev', 'ac'] as const)
    .map((k) => ({ k, p: ultimo(k) }))
    .filter((e) => e.p && (modo === 'costo' || e.k !== 'ac'))
    .map((e) => ({ ...e, yy: y(val(e.p!, e.k)!), xx: x(e.p!.fecha) }))
  const eacLbl = modo === 'costo' && eac != null && terminoProyectado != null ? { yy: y(eac), xx: x(terminoProyectado) } : null
  // Evita que las etiquetas directas se superpongan (incluida la de EAC)
  const todas = [...etiquetas, ...(eacLbl ? [eacLbl] : [])].sort((a, b) => a.yy - b.yy)
  todas.forEach((e, i, arr) => { if (i && Math.abs(e.xx - arr[i - 1].xx) < 90 && e.yy - arr[i - 1].yy < 14) e.yy = arr[i - 1].yy + 14 })
  const nombre = { pv: modo === 'costo' ? 'PV planificado' : 'Planificado', ev: modo === 'costo' ? 'EV ganado' : 'Real', ac: 'AC real' }

  return (
    <div className="relative" ref={anim.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Curva S"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const fx = ((e.clientX - r.left) / r.width) * W
          let best = 0
          puntos.forEach((p, i) => { if (Math.abs(x(p.fecha) - fx) < Math.abs(x(puntos[best].fecha) - fx)) best = i })
          setHover(best)
        }}>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.texto}>{fmtY(v)}</text>
          </g>
        ))}
        {ticksX.map((p) => (
          <text key={p.fecha} x={x(p.fecha)} y={H - 8} textAnchor="middle" fontSize="11" fill={C.texto}>{fmtFechaCorta(p.fecha)}</text>
        ))}
        {corte >= f0 && corte <= f1 && (
          <g>
            <line x1={x(corte)} x2={x(corte)} y1={m.t} y2={H - m.b} stroke={C.eje} strokeDasharray="3 3" />
            <text x={x(corte) + 4} y={m.t + 10} fontSize="11" fill={C.texto}>hoy</text>
          </g>
        )}
        <defs><clipPath id={clip}><rect x={0} y={0} width={m.l + avance * (W - m.l - m.r) + 2} height={H} /></clipPath></defs>
        <g clipPath={avance < 1 ? `url(#${clip})` : undefined}>
        {modo === 'costo' && eac != null && terminoProyectado != null && ultimo('ac') && (
          <path d={`M${x(ultimo('ac')!.fecha)},${y(ultimo('ac')!.ac!)} L${x(terminoProyectado)},${y(eac)}`} stroke={C.ac} strokeWidth="2" strokeDasharray="2 4" fill="none" />
        )}
        <path d={linea('pv')} stroke={C.pv} strokeWidth="2" strokeDasharray="6 4" fill="none" />
        <path d={linea('ev')} stroke={C.ev} strokeWidth="2" fill="none" />
        {modo === 'costo' && <path d={linea('ac')} stroke={C.ac} strokeWidth="2" fill="none" />}
        </g>
        {avance < 1 && <line x1={m.l + avance * (W - m.l - m.r)} x2={m.l + avance * (W - m.l - m.r)} y1={m.t} y2={H - m.b} stroke={C.eje} strokeWidth="1" />}
        {etiquetas.map((e) => (
          <g key={e.k} opacity={avance < 1 ? 0 : 1}>
            <circle cx={x(e.p!.fecha)} cy={y(val(e.p!, e.k)!)} r="4" fill={C[e.k]} stroke="white" strokeWidth="2" />
            <text x={Math.min(W - m.r + 6, x(e.p!.fecha) + 8)} y={e.yy + 4} fontSize="11" fill={C.texto}>{nombre[e.k]}</text>
          </g>
        ))}
        {modo === 'costo' && eac != null && terminoProyectado != null && (
          <text opacity={avance < 1 ? 0 : 1} x={Math.min(x(terminoProyectado) + 6, W - m.r + 6)} y={(eacLbl?.yy ?? y(eac)) + 4} fontSize="11" fill={C.texto}>EAC {mm(eac)}</text>
        )}
        {hp && <line x1={x(hp.fecha)} x2={x(hp.fecha)} y1={m.t} y2={H - m.b} stroke={C.texto} strokeWidth="1" />}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${Math.min(70, (x(hp.fecha) / W) * 100)}%` }}>
          <div className="mb-1 font-semibold">{fmtFecha(hp.fecha)}</div>
          {(['pv', 'ev', 'ac'] as const).filter((k) => val(hp, k) != null).map((k) => (
            <div key={k} className="tabular flex items-center gap-2">
              <span className="inline-block h-0.5 w-3" style={{ background: C[k] }} />
              <span className="text-slate-600">{nombre[k]}</span>
              <span className="ml-auto font-medium">{fmtY(val(hp, k)!)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <Leyenda color={C.pv} discontinua>{nombre.pv}</Leyenda>
        <Leyenda color={C.ev}>{nombre.ev}</Leyenda>
        {modo === 'costo' && <Leyenda color={C.ac}>{nombre.ac}</Leyenda>}
        {modo === 'costo' && <Leyenda color={C.ac} discontinua>Proyección a EAC</Leyenda>}
      </div>
    </div>
  )
}

function Leyenda({ color, discontinua, children }: { color: string; discontinua?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={color} strokeWidth="2" strokeDasharray={discontinua ? '4 3' : undefined} /></svg>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Barras comparativas (planificado vs real)
// ---------------------------------------------------------------------------
export function BarrasAvance({ plan, real }: { plan: number; real: number }) {
  return (
    <div className="space-y-2">
      {[['Planificado', plan, C.pv], ['Real', real, C.ev]].map(([n, v, col]) => (
        <div key={n as string} className="flex items-center gap-3">
          <span className="w-20 text-xs text-slate-600">{n}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded-r" style={{ width: `${Math.min(100, (v as number) * 100)}%`, background: col as string }} />
          </div>
          <span className="tabular w-14 text-right text-sm font-semibold">{pct(v as number, 1)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cascada (waterfall) de la desviación
// ---------------------------------------------------------------------------
export function Cascada({ items, total }: { items: { etiqueta: string; monto: number; detalle?: string }[]; total: number }) {
  const W = 720, fila = 30, m = { l: 210, r: 90 }
  const H = (items.length + 1) * fila + 20
  let acc = 0
  const barras = items.map((it) => { const s = acc; acc += it.monto; return { ...it, desde: s, hasta: acc } })
  const vals = [0, ...barras.flatMap((b) => [b.desde, b.hasta]), total]
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = (v: number) => m.l + ((v - min) / Math.max(1, max - min)) * (W - m.l - m.r)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Descomposición de la desviación">
      <line x1={x(0)} x2={x(0)} y1={0} y2={H - 10} stroke={C.eje} />
      {barras.map((b, i) => {
        const y0 = i * fila + 6
        const a = Math.min(x(b.desde), x(b.hasta)), w = Math.max(2, Math.abs(x(b.hasta) - x(b.desde)))
        const color = b.monto > 0 ? '#dc2626' : '#059669'
        return (
          <g key={i}>
            <title>{`${b.etiqueta}: ${mm(b.monto)}${b.detalle ? ` — ${b.detalle}` : ''}`}</title>
            <text x={m.l - 8} y={y0 + 15} textAnchor="end" fontSize="12" fill="#0f172a">{b.etiqueta.length > 30 ? b.etiqueta.slice(0, 29) + '…' : b.etiqueta}</text>
            <rect x={a} y={y0 + 3} width={w} height={fila - 10} rx="3" fill={color} />
            <text x={Math.max(x(b.desde), x(b.hasta)) + 6} y={y0 + 15} fontSize="11" fill={C.texto}>{b.monto > 0 ? '+' : ''}{mm(b.monto)}</text>
          </g>
        )
      })}
      <g>
        <text x={m.l - 8} y={items.length * fila + 21} textAnchor="end" fontSize="12" fontWeight="600">Desviación total (AC − EV)</text>
        <rect x={Math.min(x(0), x(total))} y={items.length * fila + 9} width={Math.max(2, Math.abs(x(total) - x(0)))} height={fila - 10} rx="3" fill="#334155" />
        <text x={Math.max(x(0), x(total)) + 6} y={items.length * fila + 21} fontSize="11" fontWeight="600" fill="#0f172a">{mm(total)}</text>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Pareto horizontal
// ---------------------------------------------------------------------------
export function Pareto({ items, formato = mm, onClick }: {
  items: { id: string; etiqueta: string; monto: number; detalle?: string }[]
  formato?: (v: number) => string
  onClick?: (id: string) => void
}) {
  const max = Math.max(1, ...items.map((i) => i.monto))
  const total = items.reduce((s, i) => s + i.monto, 0)
  let acum = 0
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        acum += it.monto
        return (
          <button key={it.id} onClick={() => onClick?.(it.id)} disabled={!onClick}
            className="group block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 disabled:hover:bg-transparent"
            title={it.detalle}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-800">{it.etiqueta}</span>
              <span className="tabular shrink-0 text-slate-700">{formato(it.monto)} <span className="text-xs text-slate-400">· {pct(acum / (total || 1), 0)} acum.</span></span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${(it.monto / max) * 100}%` }} />
            </div>
            {it.detalle && <div className="mt-0.5 truncate text-xs text-slate-500">{it.detalle}</div>}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparkline con umbral
// ---------------------------------------------------------------------------
export function Sparkline({ valores, umbral, alto = 40, formato }: { valores: (number | null)[]; umbral?: number; alto?: number; formato?: (v: number) => string }) {
  const vs = valores.filter((v): v is number => v != null)
  if (vs.length < 2) return null
  const W = 200
  const lo = Math.min(...vs, umbral ?? Infinity), hi = Math.max(...vs, umbral ?? -Infinity)
  const x = (i: number) => (i / (valores.length - 1)) * (W - 8) + 4
  const y = (v: number) => alto - 4 - ((v - lo) / Math.max(1e-9, hi - lo)) * (alto - 8)
  const d = valores.map((v, i) => (v == null ? '' : `${i && valores[i - 1] != null ? 'L' : 'M'}${x(i)},${y(v)}`)).join(' ')
  const last = valores.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${alto}`} className="h-10 w-full max-w-[200px]" role="img" aria-label={`Tendencia: ${vs.map((v) => (formato ? formato(v) : v.toFixed(2))).join(', ')}`}>
      {umbral != null && <line x1="0" x2={W} y1={y(umbral)} y2={y(umbral)} stroke="#94a3b8" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke={C.ev} strokeWidth="2" />
      {valores[last] != null && <circle cx={x(last)} cy={y(valores[last]!)} r="3.5" fill={C.ev} stroke="white" strokeWidth="1.5" />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Barras de rendimiento real vs presupuestado
// ---------------------------------------------------------------------------
export function BarrasRendimiento({ items }: { items: { etiqueta: string; real: number; pres: number; unidad: string }[] }) {
  const max = Math.max(...items.flatMap((i) => [i.real, i.pres])) * 1.1 || 1
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const desv = it.real / it.pres - 1
        return (
          <div key={it.etiqueta}>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-800">{it.etiqueta}</span>
              <span className={`tabular ${desv > 0.1 ? 'text-crit' : desv > 0.05 ? 'text-warn' : 'text-slate-600'}`}>
                {it.real.toFixed(3)} vs {it.pres.toFixed(3)} HH/{it.unidad} ({desv >= 0 ? '+' : ''}{(desv * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="relative mt-1 h-3 rounded bg-slate-100">
              <div className="h-full rounded" style={{ width: `${(it.real / max) * 100}%`, background: C.ev }} />
              <div className="absolute -top-1 h-5 w-0.5 bg-slate-800" style={{ left: `${(it.pres / max) * 100}%` }} title="Presupuestado (APU)" />
            </div>
          </div>
        )
      })}
      <p className="text-xs text-slate-500">Barra azul: rendimiento real. Marca negra: presupuestado en el APU.</p>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Flujo de caja semanal: cobros (arriba) y pagos (abajo) en barras, caja disponible en línea.
// Lo proyectado va más claro y la línea, discontinua después de hoy.
// ---------------------------------------------------------------------------
export function FlujoCaja({ semanas, corte, colchon }: { semanas: SemanaCaja[]; corte: Dia; colchon: number }) {
  const W = 720, H = 300, m = { l: 64, r: 16, t: 16, b: 28 }
  const [hover, setHover] = useState<number | null>(null)
  const clip = useId()
  // Entrada: las semanas se llenan una tras otra y la caja avanza como un nivel de agua
  const anim = useProgreso<HTMLDivElement>(2600, semanas.length)
  if (semanas.length === 0) return null
  const frente = anim.p * semanas.length
  const crece = (i: number) => suave(Math.min(1, Math.max(0, (frente - i) / 1.5)))
  const iFrente = Math.min(semanas.length - 1, Math.floor(frente))
  const max = Math.max(colchon, ...semanas.map((s) => Math.max(s.ingresos, s.saldo))) * 1.08
  const min = Math.min(0, ...semanas.map((s) => Math.min(-s.egresos, s.saldo))) * 1.08
  const ancho = (W - m.l - m.r) / semanas.length
  const x = (i: number) => m.l + i * ancho
  const y = (v: number) => m.t + ((max - v) / (max - min || 1)) * (H - m.t - m.b)
  const iHoy = semanas.findIndex((s) => s.desde + 6 >= corte)
  const real = semanas.slice(0, iHoy + 1)
  const proy = semanas.slice(Math.max(0, iHoy))
  const linea = (pts: SemanaCaja[], desde: number) => pts.map((s, i) => `${i ? 'L' : 'M'}${(x(desde + i) + ancho / 2).toFixed(1)},${y(s.saldo).toFixed(1)}`).join(' ')
  const ticksY = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)
  const paso = Math.max(1, Math.ceil(semanas.length / 8))
  const h = hover != null ? semanas[hover] : null

  return (
    <div className="relative" ref={anim.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Flujo de caja semanal"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const i = Math.floor((((e.clientX - r.left) / r.width) * W - m.l) / ancho)
          setHover(i >= 0 && i < semanas.length ? i : null)
        }}>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={C.grid} />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={C.texto}>{mm(v)}</text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const op = s.real ? 1 : 0.45
          return (
            <g key={s.desde} opacity={hover == null || hover === i ? op : op * 0.6}>
              {s.ingresos > 0 && <rect x={x(i) + 1} y={y(s.ingresos * crece(i))} width={Math.max(1, ancho - 2)} height={y(0) - y(s.ingresos * crece(i))} fill={C.pv} />}
              {s.egresos > 0 && <rect x={x(i) + 1} y={y(0)} width={Math.max(1, ancho - 2)} height={y(-s.egresos * crece(i)) - y(0)} fill={C.ac} />}
            </g>
          )
        })}
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={C.eje} />
        {colchon > 0 && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={y(colchon)} y2={y(colchon)} stroke="#d97706" strokeDasharray="3 3" />
            <text x={W - m.r} y={y(colchon) - 4} textAnchor="end" fontSize="10" fill="#b45309">colchón</text>
          </g>
        )}
        <defs><clipPath id={clip}><rect x={0} y={0} width={x(0) + frente * ancho + 1} height={H} /></clipPath></defs>
        <g clipPath={anim.p < 1 ? `url(#${clip})` : undefined}>
          <path d={linea(real, 0)} fill="none" stroke={C.ev} strokeWidth={2.2} />
          <path d={linea(proy, Math.max(0, iHoy))} fill="none" stroke={C.ev} strokeWidth={2} strokeDasharray="5 4" />
        </g>
        {anim.p < 1 && (
          <g>
            <circle cx={x(iFrente) + ancho / 2} cy={y(semanas[iFrente].saldo)} r={4.5} fill={C.ev} stroke="white" strokeWidth={2} />
            <text x={Math.min(W - m.r - 4, x(iFrente) + ancho / 2 + 8)} y={y(semanas[iFrente].saldo) - 8} textAnchor={x(iFrente) > W - 160 ? 'end' : 'start'} fontSize="11" fontWeight="600" fill={semanas[iFrente].saldo < colchon ? '#b45309' : C.texto}>{mm(semanas[iFrente].saldo)}</text>
          </g>
        )}
        {iHoy >= 0 && (
          <g>
            <line x1={x(iHoy) + ancho} x2={x(iHoy) + ancho} y1={m.t} y2={H - m.b} stroke={C.eje} strokeDasharray="2 3" />
            <text x={x(iHoy) + ancho + 4} y={m.t + 10} fontSize="10" fill={C.texto}>hoy</text>
          </g>
        )}
        {semanas.map((s, i) => i % paso === 0 && (
          <text key={s.desde} x={x(i) + ancho / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={C.texto}>{fmtFechaCorta(s.desde)}</text>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-slate-900/90 px-2.5 py-1.5 text-xs text-white shadow">
          <div className="font-medium">Semana del {fmtFecha(h.desde)}{h.real ? '' : ' · proyectado'}</div>
          <div className="tabular">Cobros {mm(h.ingresos)} · Pagos {mm(h.egresos)}</div>
          <div className="tabular">Caja disponible {mm(h.saldo)}</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: C.pv }} />Cobros</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: C.ac }} />Pagos</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: C.ev }} />Caja disponible</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-slate-300 opacity-60" />Más claro = proyectado</span>
      </div>
    </div>
  )
}
