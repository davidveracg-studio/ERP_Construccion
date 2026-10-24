// Detalle de partida: cantidades, APU vs real, EVM, descomposición y rendimientos
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BarrasRendimiento, Cascada, Sparkline } from '../components/graficos'
import { Boton, Card, Kpi, Titulo, Vacio } from '../components/ui'
import { rendimientosPorCuadrilla } from '../domain/evm'
import { desglosePartida } from '../domain/explicacion'
import { fmtFecha } from '../domain/fechas'
import { clp, idx, mm, num, pct } from '../domain/formato'
import { periodosDe } from '../domain/periodos'
import { puCosto } from '../domain/presupuesto'
import { TIPOS_RECURSO } from '../domain/types'
import { umbral } from '../domain/umbrales'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

export default function PartidaDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const partida = useStore((s) => s.partidas.find((p) => p.id === id))
  const { d, c } = useCalc(partida?.obraId)
  const cp = c?.partidas.find((p) => p.p.id === id)
  const tendencia = useMemo(() => (partida ? periodosDe(d, partida.obraId).slice(-10).map((pe) => pe.partidas.find((x) => x.partidaId === id)?.cpi ?? null) : []), [d, partida, id])
  if (!partida || !cp || !c) return <Vacio titulo="Partida no encontrada" texto="" />
  const p = partida
  const comps = desglosePartida(cp)
  const rend = rendimientosPorCuadrilla(d, p.obraId, p.obraId ? c.obra.fechaInicio : 0, c.corte).filter((r) => r.partidaId === p.id)
  const costos = d.costos.filter((k) => k.partidaId === p.id).sort((a, b) => b.fecha - a.fecha)
  const avances = d.rdos.filter((r) => r.obraId === p.obraId && r.avances.some((a) => a.partidaId === p.id)).sort((a, b) => b.fecha - a.fecha).slice(0, 10)

  return (
    <div className="space-y-4">
      <Titulo sub={`${p.capitulo} · ${num(p.cantidad, 2)} ${p.unidad} · PU venta ${clp(p.puVenta)} · PU costo ${clp(puCosto(p))}`}
        accion={<Boton variante="secundario" onClick={() => nav(-1)}>← Volver</Boton>}>{p.codigo} {p.descripcion}</Titulo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi etiqueta="Avance" valor={pct(cp.avance, 0)} sub={`${num(cp.cantEjec, 1)} de ${num(p.cantidad, 1)} ${p.unidad}`} />
        <Kpi etiqueta="Programado a hoy" valor={pct(cp.avanceProg, 0)} sub={`${num(cp.cantProg, 1)} ${p.unidad}`} />
        <Kpi etiqueta="BAC" valor={mm(cp.bac)} />
        <Kpi etiqueta="AC" valor={mm(cp.ac)} sub={cp.provisionSub ? `incl. provisión ${mm(cp.provisionSub)}` : undefined} />
        <Kpi etiqueta="EV" valor={mm(cp.ev)} />
        <Kpi etiqueta="CPI" valor={idx(cp.cpi)} estado={cp.cpi == null ? 'na' : ek('KCO-03', cp.cpi)} ayuda={ayudaKpi('KCO-03')} />
        <Kpi etiqueta="EAC" valor={mm(cp.eac)} sub={cp.ajuste ? 'ajuste manual' : 'calculado'} />
        <Kpi etiqueta="VAC" valor={mm(cp.vac)} estado={ek('KCO-14', cp.bac > 0 ? cp.vac / cp.bac : null)} ayuda={ayudaKpi('KCO-14') + ' (VAC / BAC)'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="APU: presupuestado vs real">
          <table className="tabular w-full text-sm">
            <thead><tr className="border-b text-right text-xs text-slate-500"><th className="py-1.5 text-left font-medium">Recurso</th><th className="font-medium">Consumo/unidad</th><th className="font-medium">Precio</th><th className="font-medium">Real para el avance</th></tr></thead>
            <tbody>
              {p.recursos.map((r, i) => {
                const q = r.tipo === 'MO' ? cp.hhReal : cp.qPorTipo[r.tipo]
                const qPres = cp.cantEjec * r.cantPorUnidad
                return (
                  <tr key={i} className="border-b border-slate-100 text-right">
                    <td className="py-1.5 text-left">{r.descripcion} <span className="text-xs text-slate-400">({TIPOS_RECURSO[r.tipo]})</span></td>
                    <td>{num(r.cantPorUnidad, 3)} {r.unidad}/{p.unidad}</td>
                    <td>{clp(r.precio)}</td>
                    <td>{q != null && cp.cantEjec > 0 ? <>{num(q / cp.cantEjec, 3)} <span className={q > qPres * 1.03 ? 'text-crit' : 'text-slate-400'}>({q >= qPres ? '+' : ''}{pct(qPres ? q / qPres - 1 : 0, 0)})</span></> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tendencia.some((v) => v != null) && (
            <div className="mt-4">
              <div className="text-xs text-slate-500">CPI de la partida, últimos cierres</div>
              <Sparkline valores={tendencia} umbral={umbral(d.config, 'KCO-03').alerta} />
            </div>
          )}
        </Card>
        <Card titulo="Descomposición de la desviación (AC − EV)">
          {comps.length === 0 ? <p className="text-sm text-slate-500">Sin desviación relevante.</p> : <>
            <Cascada items={comps} total={cp.ac - cp.ev} />
            <ul className="mt-2 space-y-1 text-xs text-slate-500">{comps.filter((x) => x.detalle).map((x) => <li key={x.etiqueta}><span className="font-medium text-slate-700">{x.etiqueta}:</span> {x.detalle}</li>)}</ul>
          </>}
        </Card>
      </div>

      {rend.length > 0 && (
        <Card titulo="Rendimiento de mano de obra por cuadrilla (acumulado)">
          <BarrasRendimiento items={rend.filter((r) => r.rendReal != null).map((r) => ({ etiqueta: d.cuadrillas.find((q) => q.id === r.cuadrillaId)?.nombre ?? '', real: r.rendReal!, pres: r.rendPres!, unidad: p.unidad }))} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Últimos avances (RDO)">
          <table className="tabular w-full text-sm"><tbody>
            {avances.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5">{fmtFecha(r.fecha)}</td>
                <td>{d.cuadrillas.find((q) => q.id === r.cuadrillaId)?.nombre}</td>
                <td className="text-right">{num(r.avances.find((a) => a.partidaId === p.id)!.cantidad, 2)} {p.unidad}</td>
                <td className="text-right text-xs text-slate-500">{r.estado}</td>
              </tr>
            ))}
          </tbody></table>
        </Card>
        <Card titulo={`Costos registrados (${costos.length})`}>
          <div className="max-h-72 overflow-auto">
            <table className="tabular w-full text-sm"><tbody>
              {costos.slice(0, 40).map((k) => (
                <tr key={k.id} className="border-b border-slate-100">
                  <td className="py-1.5">{fmtFecha(k.fecha)}</td>
                  <td>{k.descripcion}<div className="text-xs text-slate-500">{k.proveedor} {k.documento && `· ${k.documento}`}</div></td>
                  <td className="text-right">{k.cantidad != null ? `${num(k.cantidad, 1)} × ${clp(k.precio ?? 0)}` : ''}</td>
                  <td className="text-right font-medium">{mm(k.monto)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </Card>
      </div>
    </div>
  )
}
