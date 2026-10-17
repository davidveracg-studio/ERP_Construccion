// Explicación de desviaciones en 3 niveles (13 §8, 17 §4.3)
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AlertaCard } from '../components/AlertaCard'
import { BarrasRendimiento, Cascada, Pareto, Sparkline } from '../components/graficos'
import { Card, Luz, Titulo, cx } from '../components/ui'
import { rutaDimension, valorCelda } from '../components/Semaforo'
import {
  causasNoProductivas, desgloseObra, paretoActividades, paretoCuadrillas, paretoPartidas, paretoProveedores,
} from '../domain/explicacion'
import { idx, mm, num, pct, pp, signoPct } from '../domain/formato'
import { periodosDe } from '../domain/periodos'
import type { Dimension } from '../domain/semaforo'
import { CAUSAS_NP, type CausaNoProductiva } from '../domain/types'
import { useCalc } from '../store/hooks'

const REGLAS_DIM: Record<string, string[]> = {
  costos: ['RULE-605', 'RULE-602', 'RULE-608', 'RULE-601', 'RULE-304', 'RULE-607'],
  plazo: ['RULE-106', 'RULE-107', 'RULE-108'],
  avance: ['RULE-109', 'RULE-106', 'RULE-108'],
  productividad: ['RULE-606', 'RULE-110'],
}

export default function Explicacion() {
  const { dim = 'costos' } = useParams<{ dim: Dimension }>()
  const { d, c, sem } = useCalc()
  const nav = useNavigate()
  const [dimPareto, setDimPareto] = useState<'partidas' | 'cuadrillas' | 'proveedores'>('partidas')
  const periodos = useMemo(() => (c ? periodosDe(d, c.obra.id).slice(-8) : []), [d, c])
  if (!c) return null
  const celda = sem.find((s) => s.dim === dim)!
  const u = d.config.umbrales
  const alertas = d.alertas.filter((a) => a.obraId === c.obra.id && REGLAS_DIM[dim]?.includes(a.regla) && ['activa', 'reconocida', 'en_accion'].includes(a.estado))

  const serie = periodos.map((p) =>
    dim === 'costos' ? p.obra.cpi : dim === 'plazo' ? p.obra.spi : dim === 'avance' ? p.obra.avanceReal - p.obra.avancePlan : p.obra.productividadDesv,
  )
  const umbral = dim === 'costos' ? u.cpi[0] : dim === 'plazo' ? u.spi[0] : dim === 'avance' ? u.avancePp[0] : u.productividad[0]
  const fmt = dim === 'avance' ? pp : dim === 'productividad' ? signoPct : idx
  const porQue = {
    costos: `CPI ${idx(c.cpi)}: por cada $1 gastado se ha ganado $${idx(c.cpi)} de valor presupuestado. Umbral verde ≥ ${idx(u.cpi[0])}, rojo < ${idx(u.cpi[1])}.`,
    plazo: `SPI ${idx(c.spi)}: se ha ejecutado ${pct(c.spi)} de lo que la línea base indicaba a la fecha. Umbral verde ≥ ${idx(u.spi[0])}, rojo < ${idx(u.spi[1])}.`,
    avance: `Avance real ${pct(c.avanceReal)} vs planificado ${pct(c.avancePlan)} (${pp(c.desvAvance)}). Rojo bajo ${pp(u.avancePp[1])}.`,
    productividad: `Las HH usadas superan en ${signoPct(c.productividadDesv)} a las presupuestadas en el APU para el avance logrado. Rojo sobre ${pct(u.productividad[1], 0)}.`,
  }[dim as 'costos']

  return (
    <div className="space-y-5">
      <Titulo sub={c.obra.nombre} accion={<button onClick={() => nav(-1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">← Volver</button>}>
        <span className="inline-flex items-center gap-3"><Luz estado={celda.estado} tam="lg" /> {celda.nombre}: {valorCelda(celda)}</span>
      </Titulo>

      <div className="flex flex-wrap gap-2">
        {sem.filter((s) => s.estado !== 'na').map((s) => (
          <Link key={s.dim} to={rutaDimension(s.dim)} className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm', s.dim === dim ? 'border-marca bg-blue-50 text-marca' : 'border-slate-200 bg-white')}>
            <Luz estado={s.estado} tam="sm" /> {s.nombre}
          </Link>
        ))}
      </div>

      <Card titulo="1 · ¿Por qué está en este color?">
        <div className="flex flex-wrap items-center gap-6">
          <p className="max-w-2xl text-sm text-slate-700">{porQue}</p>
          <div>
            <div className="text-xs text-slate-500">Tendencia últimos {periodos.length} cierres</div>
            <Sparkline valores={serie} umbral={umbral} formato={fmt} />
            <div className="tabular text-xs text-slate-500">{serie.map((v) => (v == null ? '—' : fmt(v))).join(' → ')}</div>
          </div>
        </div>
      </Card>

      {dim === 'costos' && <Costos c={c} d={d} dimPareto={dimPareto} setDimPareto={setDimPareto} nav={nav} />}
      {(dim === 'plazo' || dim === 'avance') && <Plazo c={c} d={d} nav={nav} />}
      {dim === 'productividad' && <Productividad c={c} d={d} />}

      <Card titulo={`Alertas relacionadas (${alertas.length})`}>
        {alertas.length === 0 ? <p className="text-sm text-slate-500">Sin alertas abiertas para esta dimensión.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">{alertas.map((a) => <AlertaCard key={a.id} a={a} />)}</div>
        )}
      </Card>
    </div>
  )
}

type P = { c: NonNullable<ReturnType<typeof useCalc>['c']>; d: ReturnType<typeof useCalc>['d'] }

function Costos({ c, d, dimPareto, setDimPareto, nav }: P & { dimPareto: string; setDimPareto: (x: 'partidas' | 'cuadrillas' | 'proveedores') => void; nav: (s: string) => void }) {
  const comps = desgloseObra(c)
  const items = dimPareto === 'partidas' ? paretoPartidas(c) : dimPareto === 'cuadrillas' ? paretoCuadrillas(d, c, c.obra.fechaInicio) : paretoProveedores(d, c)
  return (
    <>
      <Card titulo="2 · ¿Qué está provocando la desviación?">
        <p className="mb-3 text-sm text-slate-600">Desviación de costo a la fecha (AC − EV = {mm(c.ac - c.ev)}) descompuesta en rendimiento, consumo y precio por tipo de recurso. Rojo = sobrecosto, verde = ahorro.</p>
        <Cascada items={comps} total={c.ac - c.ev} />
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {comps.filter((x) => x.detalle).slice(0, 5).map((x) => <li key={x.etiqueta}><span className="font-medium text-slate-700">{x.etiqueta}:</span> {x.detalle}</li>)}
        </ul>
      </Card>
      <Card titulo="3 · ¿Qué lo explica?" accion={
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(['partidas', 'cuadrillas', 'proveedores'] as const).map((k) => (
            <button key={k} onClick={() => setDimPareto(k)} className={cx('rounded-md px-2.5 py-1 capitalize', dimPareto === k ? 'bg-slate-800 text-white' : 'text-slate-600')}>{k}</button>
          ))}
        </div>}>
        <p className="mb-3 text-sm text-slate-600">
          {dimPareto === 'partidas' ? 'Partidas con sobrecosto a la fecha (AC − EV), de mayor a menor.' : dimPareto === 'cuadrillas' ? 'Costo de las HH sobre el rendimiento del APU, por cuadrilla.' : 'Mayor precio pagado sobre el APU, por proveedor.'}
        </p>
        {items.length === 0 ? <p className="text-sm text-slate-500">Nada que explicar en esta dimensión.</p> : (
          <Pareto items={items.slice(0, 10)} onClick={dimPareto === 'partidas' ? (id) => nav(`/partida/${id}`) : undefined} />
        )}
      </Card>
    </>
  )
}

function Plazo({ c, d, nav }: P & { nav: (s: string) => void }) {
  const acts = paretoActividades(c)
  const causas = causasNoProductivas(d, c.obra.id, c.obra.fechaInicio, c.corte)
  const svPartidas = c.partidas
    .map((p) => ({ id: p.p.id, etiqueta: `${p.p.codigo} ${p.p.descripcion}`, monto: p.pv - p.ev, detalle: `ejecutado ${pct(p.avance, 0)} vs programado ${pct(p.avanceProg, 0)}` }))
    .filter((x) => x.monto > 0).sort((a, b) => b.monto - a.monto)
  return (
    <>
      <Card titulo="2 · ¿Qué está provocando el atraso?">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Actividades atrasadas vs línea base</h3>
            {acts.length === 0 ? <p className="text-sm text-slate-500">Ninguna actividad proyecta atraso.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {acts.slice(0, 8).map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="py-1.5">{a.etiqueta}{a.critica && <span className="ml-2 rounded bg-red-50 px-1.5 text-xs text-red-700">ruta crítica</span>}</td>
                      <td className="tabular text-right font-medium text-crit">+{a.atraso} d</td>
                      <td className="tabular pl-3 text-right text-xs text-slate-500">holgura {a.holgura ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-slate-500">Término proyectado con atraso de {c.atrasoProyectado} días respecto del contractual.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Causas registradas en terreno</h3>
            <ul className="space-y-1 text-sm">
              <li>Días con lluvia: <span className="font-medium">{causas.diasLluvia}</span></li>
              {[...causas.hhPorCausa].map(([k, v]) => <li key={k}>{CAUSAS_NP[k as CausaNoProductiva]}: <span className="tabular font-medium">{num(v)} HH</span></li>)}
              <li>Productividad MO: <span className="font-medium">{signoPct(c.productividadDesv)}</span> sobre el APU</li>
            </ul>
          </div>
        </div>
      </Card>
      <Card titulo="3 · ¿Qué partidas lo explican?">
        <p className="mb-3 text-sm text-slate-600">Valor planificado no ejecutado (PV − EV) por partida.</p>
        <Pareto items={svPartidas.slice(0, 10)} onClick={(id) => nav(`/partida/${id}`)} />
      </Card>
    </>
  )
}

function Productividad({ c, d }: P) {
  const causas = causasNoProductivas(d, c.obra.id, c.obra.fechaInicio, c.corte)
  const rend = c.partidas.filter((p) => p.rendReal != null && p.rendPres).map((p) => ({ etiqueta: `${p.p.codigo} ${p.p.descripcion}`, real: p.rendReal!, pres: p.rendPres!, unidad: p.p.unidad }))
  const cuad = paretoCuadrillas(d, c, c.corte - 27)
  return (
    <>
      <Card titulo="2 · ¿Qué lo provoca?">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Rendimiento real vs APU por partida (acumulado)</h3>
            <BarrasRendimiento items={rend} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">HH no productivas</h3>
            <p className="text-sm">{num(c.hhNoProd)} HH de {num(c.hhTotal)} ({pct(c.hhTotal ? c.hhNoProd / c.hhTotal : 0)}) · costo {mm(c.acNoProd)}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {[...causas.hhPorCausa].map(([k, v]) => <li key={k}>{CAUSAS_NP[k as CausaNoProductiva]}: <span className="tabular font-medium">{num(v)} HH</span></li>)}
            </ul>
            <p className="mt-3 text-sm">HH extraordinarias: <span className="tabular font-medium">{num(c.hhExtra)}</span> ({pct(c.hhTotal ? c.hhExtra / c.hhTotal : 0)})</p>
          </div>
        </div>
      </Card>
      <Card titulo="3 · ¿Qué cuadrillas lo explican? (últimas 4 semanas)">
        <Pareto items={cuad} />
      </Card>
    </>
  )
}
