// Control Tower de obra (07 Workspace Administrador de Obra)
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertaCard } from '../components/AlertaCard'
import { BarrasAvance, HealthDesglose, CurvaS } from '../components/graficos'
import { SemaforoEjecutivo } from '../components/Semaforo'
import { Badge, Card, Kpi, Titulo, cx } from '../components/ui'
import GuiaFigura from '../components/GuiaFigura'
import { serieCurvaS } from '../domain/evm'
import { fmtFecha, hoy } from '../domain/fechas'
import { idx, mm, pct, pp } from '../domain/formato'
import { healthDetalle } from '../domain/semaforo'
import { useCalc } from '../store/hooks'

const ESTADO_HITO = {
  cumplido: ['Cumplido', 'verde'], cumplido_con_atraso: ['Cumplido con atraso', 'ambar'],
  en_riesgo: ['En riesgo', 'rojo'], vencido: ['Vencido', 'rojo'], a_tiempo: ['A tiempo', 'verde'],
} as const

export default function ObraTower() {
  const { d, c, sem } = useCalc()
  const [modo, setModo] = useState<'costo' | 'avance'>('costo')
  const serie = useMemo(() => (c ? serieCurvaS(d, c.obra.id, c.corte) : []), [d, c])
  if (!c) return null
  const o = c.obra
  const u = d.config.umbrales
  const health = healthDetalle(c, d.config)
  const score = health.score
  const alertas = d.alertas
    .filter((a) => a.obraId === o.id && ['activa', 'reconocida', 'en_accion'].includes(a.estado))
    .sort((a, b) => ['critica', 'alta', 'media', 'baja'].indexOf(a.severidad) - ['critica', 'alta', 'media', 'baja'].indexOf(b.severidad))
  const est = (v: number | null, uu: [number, number]) => (v == null ? 'na' : v >= uu[0] ? 'verde' : v >= uu[1] ? 'amarillo' : 'rojo') as 'verde'

  return (
    <div className="space-y-5">
      <Titulo sub={`${o.mandante} · Administrador: ${o.administrador} · inicio ${fmtFecha(o.fechaInicio)} · plazo ${o.plazoDias} días`}
        accion={<><Link to="/informe" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Informe semanal</Link><Link to="/cierre" className="rounded-lg bg-marca px-3 py-2 text-sm text-white">Cerrar semana</Link></>}>
        {o.nombre} {score != null && <span className="ml-2 align-middle"><Badge tono={score >= 80 ? 'verde' : score >= 60 ? 'ambar' : 'rojo'}>Health Score {Math.round(score)}</Badge></span>}
      </Titulo>

      <Card titulo="Semáforo ejecutivo" accion={<span className="text-xs text-slate-500">Toca una dimensión para ver por qué</span>}>
        <SemaforoEjecutivo celdas={sem} />
        {c.confianza !== 'alta' && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Confianza {c.confianza}: {c.diasSinRDO.length > 0 && `${c.diasSinRDO.length} día(s) sin RDO; `}{c.pctNoImputado > 0.1 && `${pct(c.pctNoImputado)} del costo sin imputar; `}{c.rdoPendientes > 0 && `${c.rdoPendientes} RDO sin validar.`}
          </p>
        )}
      </Card>

      {score != null && (
        <Card titulo="Health Score · cómo se compone" accion={<GuiaFigura compacto figura="health-score" titulo="Cómo se calcula el Health Score" texto="Siete tubos comunicantes, uno por dimensión y con el ancho de su peso. Al abrir la válvula el agua se nivela en el promedio ponderado; un accidente grave baja el tope a 59." />}>
          <HealthDesglose {...health} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card titulo="Avance de obra">
          <BarrasAvance plan={c.avancePlan} real={c.avanceReal} />
          <dl className="tabular mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Desviación</dt><dd className={cx('text-right font-semibold', c.desvAvance < u.avancePp[1] ? 'text-crit' : c.desvAvance < u.avancePp[0] ? 'text-warn' : 'text-ok')}>{pp(c.desvAvance)}</dd>
            <dt className="text-slate-500">Plazo consumido</dt><dd className="text-right font-medium">{pct(c.plazoConsumido)}</dd>
            <dt className="text-slate-500">Días transcurridos / restantes</dt><dd className="text-right">{c.diasTranscurridos} / {c.diasRestantes}</dd>
            <dt className="text-slate-500">Término contractual</dt><dd className="text-right">{fmtFecha(c.terminoContractual - 1)}</dd>
            <dt className="text-slate-500">Término proyectado</dt><dd className={cx('text-right font-medium', c.atrasoProyectado > 0 && 'text-crit')}>{fmtFecha(c.terminoProyectado - 1)}</dd>
            <dt className="text-slate-500">Atraso proyectado</dt><dd className={cx('text-right font-semibold', c.atrasoProyectado > 0 ? 'text-crit' : 'text-ok')}>{c.atrasoProyectado > 0 ? `+${c.atrasoProyectado}` : c.atrasoProyectado} días</dd>
          </dl>
        </Card>

        <Card titulo="Curva S" className="lg:col-span-2"
          accion={<div className="flex items-center gap-2">
            <GuiaFigura compacto figura="curva-s" titulo="Cómo se lee el valor ganado (EVM)" texto="Tres probetas: lo planificado (PV), lo ganado (EV, lo que vale lo construido) y lo gastado (AC). Mueve la semana y compara alturas: SPI = EV ÷ PV mide plazo y CPI = EV ÷ AC mide costo." />
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {(['costo', 'avance'] as const).map((m) => (
              <button key={m} onClick={() => setModo(m)} className={cx('rounded-md px-2.5 py-1', modo === m ? 'bg-slate-800 text-white' : 'text-slate-600')}>{m === 'costo' ? 'PV / EV / AC' : 'Avance %'}</button>
            ))}
            </div>
          </div>}>
          <CurvaS puntos={serie} corte={c.corte} eac={c.eac} terminoProyectado={c.terminoProyectado} modo={modo} />
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Valor ganado (EVM) y resultado</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Kpi etiqueta="CPI" valor={idx(c.cpi)} estado={est(c.cpi, u.cpi)} sub="EV / AC" ayuda="Índice de desempeño de costo" />
          <Kpi etiqueta="SPI" valor={idx(c.spi)} estado={est(c.spi, u.spi)} sub="EV / PV" ayuda="Índice de desempeño de plazo" />
          <Kpi etiqueta="CV" valor={mm(c.cv)} sub="EV − AC" />
          <Kpi etiqueta="SV" valor={mm(c.sv)} sub="EV − PV" />
          <Kpi etiqueta="BAC" valor={mm(c.bac)} sub="Presupuesto a término" />
          <Kpi etiqueta="EAC" valor={mm(c.eac)} sub={`ETC ${mm(c.etc)}`} ayuda="Costo estimado a término" />
          <Kpi etiqueta="VAC" valor={mm(c.vac)} estado={c.vac < -u.vac[1] * c.bac ? 'rojo' : c.vac < -u.vac[0] * c.bac ? 'amarillo' : 'verde'} sub="BAC − EAC" />
          <Kpi etiqueta="TCPI" valor={idx(c.tcpi)} sub="Eficiencia requerida" />
          <Kpi etiqueta="Margen directo proy." valor={pct(c.margenDirecto)} />
          <Kpi etiqueta="Margen proyectado" valor={pct(c.margenProyectado)} estado={c.margenProyectado < 0 ? 'rojo' : c.margenProyectado < u.margenMinimo ? 'amarillo' : 'verde'} sub={`Ofertado ${pct(o.margenOfertado, 0)}`} />
          <Kpi etiqueta="Resultado proyectado" valor={mm(c.resultado)} sub={`Venta ${mm(c.venta)}`} />
          <Kpi etiqueta="Productividad MO" valor={c.productividadDesv == null ? '—' : `${c.productividadDesv > 0 ? '+' : ''}${pct(c.productividadDesv)}`} sub="HH real vs APU" estado={sem.find((s) => s.dim === 'productividad')?.estado} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Hitos">
          {c.hitos.length === 0 ? <p className="text-sm text-slate-500">Sin hitos en el programa.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-2 font-medium">Hito</th><th className="pb-2 font-medium">Comprometido</th><th className="pb-2 font-medium">Proyectado</th><th className="pb-2 font-medium">Estado</th></tr></thead>
              <tbody>
                {c.hitos.map((h) => (
                  <tr key={h.act.id} className="border-t border-slate-100">
                    <td className="py-2">{h.act.nombre}{h.act.hitoContractual && <span className="ml-1 text-xs text-slate-500">(contractual)</span>}</td>
                    <td className="tabular">{fmtFecha(h.comprometida)}</td>
                    <td className="tabular">{fmtFecha(h.real ?? h.proyectada)}{h.atraso > 0 && <span className="ml-1 text-crit">+{h.atraso}d</span>}</td>
                    <td><Badge tono={ESTADO_HITO[h.estado][1]}>{ESTADO_HITO[h.estado][0]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.hitos.some((h) => h.act.hitoContractual && h.atraso > 0) && (
            <p className="mt-3 text-xs text-slate-600">Multa potencial por atraso: <span className="font-semibold text-crit">{mm(Math.max(...c.hitos.filter((h) => h.act.hitoContractual).map((h) => h.atraso)) * o.multaDiaria)}</span> ({mm(o.multaDiaria)}/día)</p>
          )}
        </Card>

        <Card titulo="Presupuesto → Comprometido → Ejecutado → Proyectado" accion={<Link to="/costos" className="text-xs text-marca">Ver por partida →</Link>}>
          <Flujo bac={c.bac} comprometido={c.comprometido} ac={c.ac} eac={c.eac} />
          <p className="mt-3 text-xs text-slate-500">Incluye gastos generales ({mm(c.ggBac)}), provisión de subcontratos devengados ({mm(c.provisionSub)}) y costo sin imputar ({mm(c.acSinImputar)}).</p>
        </Card>
      </div>

      <Card titulo={`Alertas abiertas (${alertas.length})`} accion={<Link to="/alertas" className="text-xs text-marca">Ver todas →</Link>}>
        {alertas.length === 0 ? <p className="text-sm text-slate-500">Sin alertas abiertas.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">{alertas.slice(0, 4).map((a) => <AlertaCard key={a.id} a={a} compacta />)}</div>
        )}
      </Card>
      <p className="text-xs text-slate-400">Calculado al {fmtFecha(hoy())} con RDO validados y costos importados.</p>
    </div>
  )
}

function Flujo({ bac, comprometido, ac, eac }: { bac: number; comprometido: number; ac: number; eac: number }) {
  const max = Math.max(bac, eac, ac + comprometido) * 1.02
  const filas: [string, number, string, number?][] = [
    ['Presupuesto (BAC)', bac, '#64748b'],
    ['Ejecutado + comprometido', ac, '#eb6834', comprometido],
    ['Proyectado (EAC)', eac, eac > bac ? '#dc2626' : '#059669'],
  ]
  return (
    <div className="space-y-3">
      {filas.map(([n, v, col, extra]) => (
        <div key={n}>
          <div className="flex justify-between text-sm"><span className="text-slate-600">{n}</span><span className="tabular font-semibold">{mm(v + (extra ?? 0))}</span></div>
          <div className="mt-1 flex h-3 gap-0.5 overflow-hidden rounded bg-slate-100">
            <div style={{ width: `${(v / max) * 100}%`, background: col }} className="h-full" title={`Ejecutado ${mm(v)}`} />
            {extra != null && <div style={{ width: `${(extra / max) * 100}%` }} className="h-full bg-amber-300" title={`Comprometido ${mm(extra)}`} />}
          </div>
          {extra != null && <div className="mt-0.5 text-xs text-slate-500">Ejecutado {mm(v)} · comprometido pendiente {mm(extra)}</div>}
        </div>
      ))}
    </div>
  )
}
