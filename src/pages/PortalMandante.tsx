// Portal Mandante / ITO (R11, v1.1 — 07 Portal Mandante, 19 §5): avance de la obra (curva S en %),
// estados de pago por aprobar con su respaldo e historial de cobros. Nunca muestra costos,
// márgenes, alertas internas ni observaciones de la revisión interna.
import { useMemo } from 'react'
import { Link } from 'react-router'
import { CurvaS } from '../components/graficos'
import { Card, Kpi, Titulo, Vacio } from '../components/ui'
import { etapaEP, indicadoresEP, pagadoHasta, presentadoEn, vigente } from '../domain/estadosPago'
import { serieCurvaS } from '../domain/evm'
import { fmtFecha, hoy } from '../domain/fechas'
import { mm, pct, pp } from '../domain/formato'
import { useCalc } from '../store/hooks'
import { EtapaBadge } from './EstadosPago'
import { EtapaOCBadge } from './OrdenesCambio'
import { DetalleRecepcion } from './Contrato'
import { etapaOC, montosOC, TIPOS_OC } from '../domain/ordenesCambio'

export default function PortalMandante() {
  const { d, c } = useCalc()
  const serie = useMemo(() => (c ? serieCurvaS(d, c.obra.id, c.corte) : []), [d, c])
  if (!c) return null
  const t = hoy()
  const eps = d.estadosPago.filter((e) => e.obraId === c.obra.id && vigente(e, t)).sort((a, b) => b.numero - a.numero)
  const porAprobar = eps.filter((e) => etapaEP(e, t) === 'presentado')
  // El mandante ve las órdenes desde que se le presentan
  const ocs = d.ordenesCambio.filter((o) => o.obraId === c.obra.id && o.presentada != null && o.presentada <= t).sort((a, b) => b.numero - a.numero)
  const ocsPorAprobar = ocs.filter((o) => etapaOC(o, t) === 'presentada')
  const recepciones = d.recepciones.filter((r) => r.obraId === c.obra.id && r.fecha <= t).sort((a, b) => a.fecha - b.fecha)
  const ind = indicadoresEP(eps, t)
  const aprobado = eps.filter((e) => e.aprobado != null && e.aprobado <= t).reduce((s, e) => s + e.neto, 0)
  const pagado = eps.reduce((s, e) => s + pagadoHasta(e, t), 0)
  const desvio = c.avanceReal - c.avancePlan

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.mandante} · inicio ${fmtFecha(c.obra.fechaInicio)} · término contractual ${fmtFecha(c.terminoContractual - 1)}`}>
        {c.obra.nombre}
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Avance real" valor={pct(c.avanceReal, 1)} sub={`programado ${pct(c.avancePlan, 1)} · ${pp(desvio)}`}
          estado={desvio >= -0.02 ? 'verde' : desvio >= -0.06 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Término proyectado" valor={fmtFecha(c.terminoProyectado - 1)}
          sub={c.atrasoProyectado > 0 ? `${c.atrasoProyectado} días después del contractual` : `${-c.atrasoProyectado} días antes del contractual`}
          estado={c.atrasoProyectado > 15 ? 'rojo' : c.atrasoProyectado > 0 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Por aprobar" valor={porAprobar.length + ocsPorAprobar.length}
          sub={porAprobar.length + ocsPorAprobar.length ? `${porAprobar.length} EP · ${ocsPorAprobar.length} órdenes de cambio` : 'al día'} />
        <Kpi etiqueta="Aprobado / pagado" valor={mm(aprobado)} sub={`pagado ${mm(pagado)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
        <Card titulo="Avance de la obra (programado vs real)">
          <CurvaS puntos={serie} corte={c.corte} modo="avance" />
        </Card>
        <Card titulo="Por aprobar">
          {ocsPorAprobar.map((o) => (
            <div key={o.id} className="mb-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Orden de cambio N° {o.numero}</span><span className="tabular font-semibold">{mm(montosOC(o).venta)}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{o.titulo}{o.diasPlazo ? ` · ${o.diasPlazo > 0 ? '+' : ''}${o.diasPlazo} días de plazo` : ''}</div>
              <Link to={`/ordenes-cambio/${o.id}`} className="mt-2 inline-block text-sm font-medium text-marca hover:underline">Revisar y aprobar o rechazar →</Link>
            </div>
          ))}
          {porAprobar.length === 0 ? (ocsPorAprobar.length === 0 && <p className="text-sm text-slate-500">No hay estados de pago ni órdenes de cambio esperando su aprobación.</p>) : (
            <ul className="space-y-3">
              {porAprobar.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">EP N° {e.numero}{e.version > 1 && <span className="ml-1 text-xs font-normal text-slate-500">versión {e.version}</span>}</span>
                    <span className="tabular font-semibold">{mm(e.neto)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">Corte {fmtFecha(e.fechaCorte)} · presentado {fmtFecha(e.presentaciones.at(-1)!)} · {e.lineas.length} partidas</div>
                  <Link to={`/estados-pago/${e.id}`} className="mt-2 inline-block text-sm font-medium text-marca hover:underline">Revisar y aprobar u observar →</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Tiempo promedio de aprobación: {ind.diasAprobacion != null ? `${Math.round(ind.diasAprobacion)} días` : '—'}
          </p>
        </Card>
      </div>

      {recepciones.length > 0 && (
        <Card titulo="Recepción de la obra">
          {recepciones.map((r) => <DetalleRecepcion key={r.id} r={r} t={t} />)}
          <p className="mt-2 text-xs text-slate-500">Cuando la constructora subsana una observación, usted da su V°B° para cerrarla.</p>
        </Card>
      )}

      <Card titulo="Órdenes de cambio">
        {ocs.length === 0 ? <p className="text-sm text-slate-500">Sin órdenes de cambio presentadas.</p> : (
          <ul className="space-y-2 text-sm">
            {ocs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/ordenes-cambio/${o.id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">N° {o.numero} · {o.titulo}</span>
                  <span className="ml-2 text-xs text-slate-500">{TIPOS_OC[o.tipo]}{o.diasPlazo ? ` · ${o.diasPlazo > 0 ? '+' : ''}${o.diasPlazo} días` : ''}</span>
                </Link>
                <span className="flex items-center gap-2"><span className="tabular">{mm(montosOC(o).venta)}</span><EtapaOCBadge oc={o} t={t} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Estados de pago">
        {eps.length === 0 ? <Vacio titulo="Sin estados de pago presentados" texto="Aquí aparecerán los estados de pago que presente la constructora." /> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">EP</th><th className="text-left font-medium">Presentado</th>
                  <th className="font-medium">Neto</th><th className="font-medium">Pagado</th><th className="text-left font-medium">Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {eps.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left font-medium">{e.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${e.numero}`}</td>
                    <td className="text-left">{fmtFecha(presentadoEn(e)!)}</td>
                    <td>{mm(e.neto)}</td><td>{mm(pagadoHasta(e, t))}</td>
                    <td className="text-left"><EtapaBadge ep={e} t={t} /></td>
                    <td><Link to={`/estados-pago/${e.id}`} className="text-marca hover:underline">Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
