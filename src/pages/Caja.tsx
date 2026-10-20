// Flujo de caja (v1.3, 07 Workspace Financiero): caja disponible por obra y consolidada,
// estados de pago al mandante y próximos cobros y pagos.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FlujoCaja } from '../components/graficos'
import { Boton, Campo, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import GuiaFigura from '../components/GuiaFigura'
import { EtapaBadge } from './EstadosPago'
import { condicionesDe, consolidarCaja, TIPOS_MOVIMIENTO, type Movimiento } from '../domain/caja'
import { etapaEP } from '../domain/estadosPago'
import { calcularObra } from '../domain/evm'
import { fmtFecha, hoy } from '../domain/fechas'
import { mm, pct } from '../domain/formato'
import type { CondicionesPago, EstadoSemaforo } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

export default function Caja() {
  const { c } = useCalc()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const [vista, setVista] = useState<'obra' | 'cartera'>(rol === 'R01' ? 'cartera' : 'obra')
  const [condiciones, setCondiciones] = useState(false)
  const cartera = useMemo(() => {
    if (vista !== 'cartera') return null
    const t = hoy()
    const obras = d.obras.map((o) => calcularObra(d, o.id, t))
    return { obras, total: consolidarCaja(obras.map((x) => x.caja), t) }
  }, [vista, d])
  if (!c) return null

  const k = cartera ? cartera.total : c.caja
  const corte = c.corte

  return (
    <div className="space-y-4">
      <Titulo sub="Caja disponible = capital de trabajo asignado + cobros − pagos. Real hasta hoy; después, lo comprometido y lo estimado según el avance proyectado. Montos netos, sin IVA."
        accion={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="radiogroup" aria-label="Vista">
              {(['obra', 'cartera'] as const).map((v) => (
                <button key={v} role="radio" aria-checked={vista === v} onClick={() => setVista(v)}
                  className={cx('px-3 py-1.5', vista === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')}>
                  {v === 'obra' ? c.obra.nombre : 'Toda la cartera'}
                </button>
              ))}
            </div>
            {vista === 'obra' && (rol === 'R01' || rol === 'R05') && <Boton variante="secundario" onClick={() => setCondiciones(true)}>Condiciones de pago</Boton>}
          </div>
        }>
        Flujo de caja
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Caja disponible hoy" valor={mm(k.disponibleHoy)} sub={`capital ${mm(k.capital)} · flujo neto ${mm(k.saldoHoy)}`} />
        <Kpi etiqueta="Mínimo próximos 60 días" valor={mm(k.minimo60)} estado={k.estado as EstadoSemaforo}
          sub={`el ${fmtFecha(k.fechaMinimo60)} · colchón ${mm(k.colchon)}`}
          ayuda="KFI-06: caja disponible proyectada mínima en 60 días. Verde sobre el colchón, amarillo entre 0 y el colchón, rojo bajo 0." />
        <Kpi etiqueta="Por cobrar (facturado)" valor={mm(k.cxc)} estado={k.cxcVencida > 0 ? 'amarillo' : 'verde'}
          sub={k.cxcVencida > 0 ? `vencido ${mm(k.cxcVencida)}` : 'sin EP vencidos'} />
        <Kpi etiqueta="Avance por cobrar" valor={mm(k.avanceNoCobrado)} sub="ejecutado y validado sin EP aprobado" ayuda="KFI-04" />
        <Kpi etiqueta="Por pagar 30 días" valor={mm(k.porPagar30)} sub="proveedores, subcontratos y remuneraciones" />
      </div>

      <Card titulo={`Flujo semanal · ${cartera ? 'cartera' : c.obra.nombre}`} accion={<GuiaFigura compacto figura="caja" titulo="Cómo se lee la caja de la obra" texto="Un estanque que se llena con los cobros de EP (40 días después del corte) y se vacía con cada pago; el 5 % retenido espera en un estanque aparte hasta después de la recepción. El punto más bajo es el capital de trabajo que la obra necesita." />}>
        <FlujoCaja semanas={k.semanas} corte={corte} colchon={k.colchon} />
      </Card>

      {cartera ? (
        <Card titulo="Caja por obra">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Obra</th><th className="font-medium">Capital</th><th className="font-medium">Disponible hoy</th>
                  <th className="font-medium">Mínimo 60 días</th><th className="font-medium">Por cobrar</th><th className="font-medium">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {cartera.obras.map((x) => (
                  <tr key={x.obra.id} className="border-b border-slate-100 text-right">
                    <td className="py-1.5 text-left">{x.obra.nombre}</td>
                    <td>{mm(x.caja.capital)}</td><td>{mm(x.caja.disponibleHoy)}</td>
                    <td><span className="inline-flex items-center gap-1.5"><EstadoPunto e={x.caja.estado} />{mm(x.caja.minimo60)}</span></td>
                    <td>{mm(x.caja.cxc)}</td><td className={x.caja.cxcVencida > 0 ? 'text-crit' : ''}>{mm(x.caja.cxcVencida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr] [&>*]:min-w-0">
          <ResumenEP obraId={c.obra.id} corte={corte} />
          <Proximos movimientos={k.movimientos} corte={corte} />
        </div>
      )}
      {!cartera && <CondicionesResumen cond={condicionesDe(c.obra)} />}
      {condiciones && <EditorCondiciones obraId={c.obra.id} cond={condicionesDe(c.obra)} onCerrar={() => setCondiciones(false)} />}
    </div>
  )
}

function EstadoPunto({ e }: { e: EstadoSemaforo }) {
  return <span className={cx('h-2.5 w-2.5 rounded-full', e === 'verde' ? 'bg-ok' : e === 'amarillo' ? 'bg-warn' : e === 'rojo' ? 'bg-crit' : 'bg-na')} />
}

function ResumenEP({ obraId, corte }: { obraId: string; corte: number }) {
  const d = useDatosDominio()
  const eps = d.estadosPago.filter((e) => e.obraId === obraId && etapaEP(e, corte) !== 'anulado').sort((a, b) => b.numero - a.numero).slice(0, 6)
  return (
    <Card titulo="Estados de pago al mandante" accion={<Link to="/estados-pago" className="text-sm text-marca">Ver todos →</Link>}>
      {eps.length === 0 ? <p className="text-sm text-slate-500">Aún no hay estados de pago.</p> : (
        <ul className="space-y-2 text-sm">
          {eps.map((e) => {
            const etapa = etapaEP(e, corte)
            return (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <Link to={`/estados-pago/${e.id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{e.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${e.numero}`}</span>
                  <span className="ml-2 text-xs text-slate-500">{etapa === 'pagado' ? `pagado ${fmtFecha(e.pagado!)}` : e.vencimiento ? `vence ${fmtFecha(e.vencimiento)}` : `corte ${fmtFecha(e.fechaCorte)}`}</span>
                </Link>
                <span className="flex shrink-0 items-center gap-2"><span className="tabular">{mm(e.neto)}</span><EtapaBadge ep={e} t={corte} /></span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Proximos({ movimientos, corte }: { movimientos: Movimiento[]; corte: number }) {
  const prox = movimientos.filter((m) => m.origen !== 'real' && m.fecha <= corte + 60)
  return (
    <Card titulo="Próximos 60 días" accion={<Link to="/alertas" className="text-sm text-marca">Alertas →</Link>}>
      {prox.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos proyectados.</p> : (
        <ul className="max-h-[420px] space-y-1.5 overflow-auto pr-1 text-sm">
          {prox.map((m, i) => (
            <li key={i} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate">{m.detalle}</div>
                <div className="text-xs text-slate-500">{fmtFecha(m.fecha)} · {TIPOS_MOVIMIENTO[m.tipo]} · {m.origen === 'comprometido' ? 'comprometido' : 'estimado'}</div>
              </div>
              <span className={cx('tabular shrink-0 font-medium', m.monto >= 0 ? 'text-ok' : 'text-slate-800')}>{m.monto >= 0 ? '+' : '−'}{mm(Math.abs(m.monto))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function CondicionesResumen({ cond }: { cond: CondicionesPago }) {
  const items: [string, string][] = [
    ['Capital de trabajo', pct(cond.capitalTrabajo, 0)], ['Anticipo', pct(cond.anticipo, 0)], ['Retención', pct(cond.retencion, 0)],
    ['Aprobación del EP', `${cond.diasAprobacion} días`], ['Pago del mandante', `${cond.diasPago} días`],
    ['Pago a proveedores', `${cond.diasPagoProveedores} días`], ['Devolución de retenciones', `${cond.diasDevolucionRetencion} días tras el término`],
  ]
  return (
    <Card titulo="Condiciones de pago de la obra">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        {items.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="tabular font-medium">{v}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-slate-500">Los subcontratos se pagan contra pago: unos días después de cobrar al mandante el EP del mismo período.</p>
    </Card>
  )
}

function EditorCondiciones({ obraId, cond, onCerrar }: { obraId: string; cond: CondicionesPago; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarCondicionesPago)
  const [v, setV] = useState(cond)
  const porcentaje = (k: 'capitalTrabajo' | 'anticipo' | 'retencion', etiqueta: string) => (
    <Campo etiqueta={`${etiqueta} (%)`}>
      <input type="number" min={0} max={100} className={inputCls} value={Math.round(v[k] * 1000) / 10} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) / 100 })} />
    </Campo>
  )
  const dias = (k: 'diasAprobacion' | 'diasPago' | 'diasPagoProveedores' | 'diasDevolucionRetencion', etiqueta: string) => (
    <Campo etiqueta={`${etiqueta} (días)`}>
      <input type="number" min={0} max={365} className={inputCls} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.round(Number(e.target.value)) })} />
    </Campo>
  )
  const ok = [v.capitalTrabajo, v.anticipo, v.retencion].every((x) => x >= 0 && x <= 1) && [v.diasAprobacion, v.diasPago, v.diasPagoProveedores, v.diasDevolucionRetencion].every((x) => x >= 0)
  return (
    <Modal abierto titulo="Condiciones de pago" onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-3">
        {porcentaje('capitalTrabajo', 'Capital de trabajo')}
        {porcentaje('anticipo', 'Anticipo')}
        {porcentaje('retencion', 'Retención')}
        {dias('diasAprobacion', 'Aprobación del EP')}
        {dias('diasPago', 'Pago del mandante')}
        {dias('diasPagoProveedores', 'Pago a proveedores')}
        {dias('diasDevolucionRetencion', 'Devolución de retenciones')}
      </div>
      <p className="mt-3 text-xs text-slate-500">El capital de trabajo es el financiamiento que la empresa asigna a la obra, como fracción de la venta.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!ok} onClick={() => { guardar(obraId, v); onCerrar() }}>Guardar</Boton>
      </div>
    </Modal>
  )
}
