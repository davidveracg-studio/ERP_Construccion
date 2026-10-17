// Flujo de caja (v1.3, 07 Workspace Financiero): caja disponible por obra y consolidada,
// estados de pago al mandante y próximos cobros y pagos.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FlujoCaja } from '../components/graficos'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import {
  condicionesDe, consolidarCaja, epVencido, ETAPAS_EP, etapaEP, lineasEP, TIPOS_MOVIMIENTO, type EtapaEP, type Movimiento,
} from '../domain/caja'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { mm, num, pct } from '../domain/formato'
import type { CondicionesPago, EstadoPago, EstadoSemaforo } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const TONO_ETAPA: Record<EtapaEP, 'gris' | 'azul' | 'ambar' | 'verde'> = { presentado: 'gris', aprobado: 'azul', facturado: 'ambar', pagado: 'verde' }

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

  const editable = rol === 'R01' || rol === 'R02' || rol === 'R05'
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

      <Card titulo={`Flujo semanal · ${cartera ? 'cartera' : c.obra.nombre}`}>
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
          <EstadosPago obraId={c.obra.id} corte={corte} editable={editable} />
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

function EstadosPago({ obraId, corte, editable }: { obraId: string; corte: number; editable: boolean }) {
  const d = useDatosDominio()
  const generar = useStore((s) => s.generarEstadoPago)
  const [generando, setGenerando] = useState(false)
  const [avance, setAvance] = useState<{ ep: EstadoPago; etapa: 'aprobado' | 'facturado' | 'pagado' } | null>(null)
  const eps = d.estadosPago.filter((e) => e.obraId === obraId).sort((a, b) => b.numero - a.numero)
  const siguiente = (e: EtapaEP | null) => (e === 'presentado' ? 'aprobado' : e === 'aprobado' ? 'facturado' : e === 'facturado' ? 'pagado' : null)
  const accion = { aprobado: 'Aprobar', facturado: 'Facturar', pagado: 'Registrar pago' } as const

  return (
    <Card titulo="Estados de pago al mandante" accion={editable ? <Boton variante="secundario" onClick={() => setGenerando(true)}>Generar EP</Boton> : undefined}>
      {eps.length === 0 ? <p className="text-sm text-slate-500">Aún no hay estados de pago. Genera el primero con el avance validado.</p> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                <th className="py-2 text-left font-medium">EP</th><th className="font-medium">Bruto</th><th className="font-medium">Neto a cobrar</th>
                <th className="text-left font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {eps.map((e) => {
                const etapa = etapaEP(e, corte)
                const prox = siguiente(etapa)
                const vencido = epVencido(e, corte)
                return (
                  <tr key={e.id} className="border-b border-slate-100 text-right align-top">
                    <td className="py-1.5 text-left">
                      <div className="font-medium">{e.tipo === 'anticipo' ? 'Anticipo' : `N° ${e.numero}`}</div>
                      <div className="text-xs text-slate-500">{e.tipo === 'anticipo' ? fmtFecha(e.presentado) : `corte ${fmtFecha(e.fechaCorte)}`}{e.factura ? ` · ${e.factura}` : ''}</div>
                    </td>
                    <td>{mm(e.bruto)}</td>
                    <td title={`Retención ${mm(e.retencion)} · amortización anticipo ${mm(e.amortizacion)}`}>{mm(e.neto)}</td>
                    <td className="text-left">
                      {etapa && <Badge tono={vencido ? 'rojo' : TONO_ETAPA[etapa]}>{vencido ? 'Vencido' : ETAPAS_EP[etapa]}</Badge>}
                      <div className="text-xs text-slate-500">
                        {etapa === 'pagado' ? `pagado ${fmtFecha(e.pagado!)}` : e.vencimiento ? `vence ${fmtFecha(e.vencimiento)}` : e.aprobado ? `aprobado ${fmtFecha(e.aprobado)}` : `presentado ${fmtFecha(e.presentado)}`}
                      </div>
                    </td>
                    <td>{editable && prox && <button onClick={() => setAvance({ ep: e, etapa: prox })} className="text-sm text-marca hover:underline">{accion[prox]}</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {generando && <GenerarEP obraId={obraId} onCerrar={() => setGenerando(false)} onGenerar={generar} />}
      {avance && <AvanzarEP {...avance} onCerrar={() => setAvance(null)} />}
    </Card>
  )
}

function GenerarEP({ obraId, onCerrar, onGenerar }: { obraId: string; onCerrar: () => void; onGenerar: (obraId: string, corte: number) => unknown }) {
  const d = useDatosDominio()
  const [corte, setCorte] = useState(iso(hoy()))
  const lineas = useMemo(() => lineasEP(d, obraId, dia(corte)), [d, obraId, corte])
  const obra = d.obras.find((o) => o.id === obraId)!
  const partidas = new Map(d.partidas.map((p) => [p.id, p]))
  const bruto = lineas.reduce((s, l) => s + l.monto, 0)
  const cond = condicionesDe(obra)
  return (
    <Modal abierto titulo="Generar estado de pago" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Incluye el avance validado en los RDO hasta el corte que aún no está en otro EP, valorizado a precio de venta. Se registra como presentado al mandante.</p>
      <Campo etiqueta="Fecha de corte"><input type="date" className={inputCls} value={corte} max={iso(hoy())} onChange={(e) => setCorte(e.target.value)} /></Campo>
      {lineas.length === 0 ? <p className="mt-3 text-sm text-slate-500">No hay avance validado pendiente de cobro a esa fecha.</p> : (
        <>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
            {lineas.map((l) => {
              const p = partidas.get(l.partidaId)
              return <li key={l.partidaId} className="tabular flex justify-between gap-2"><span className="truncate">{p?.codigo} {p?.descripcion} · {num(l.cantidad, 2)} {p?.unidad}</span><span>{mm(l.monto)}</span></li>
            })}
          </ul>
          <dl className="tabular mt-3 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
            <div className="flex justify-between"><dt>Bruto</dt><dd>{mm(bruto)}</dd></div>
            <div className="flex justify-between text-slate-500"><dt>Retención ({pct(cond.retencion, 0)})</dt><dd>−{mm(bruto * cond.retencion)}</dd></div>
            {cond.anticipo > 0 && <div className="flex justify-between text-slate-500"><dt>Amortización anticipo (hasta {pct(cond.anticipo, 0)})</dt><dd>se descuenta al generar</dd></div>}
          </dl>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={lineas.length === 0} onClick={() => { onGenerar(obraId, dia(corte)); onCerrar() }}>Generar y presentar</Boton>
      </div>
    </Modal>
  )
}

function AvanzarEP({ ep, etapa, onCerrar }: { ep: EstadoPago; etapa: 'aprobado' | 'facturado' | 'pagado'; onCerrar: () => void }) {
  const avanzar = useStore((s) => s.avanzarEstadoPago)
  const [fecha, setFecha] = useState(iso(hoy()))
  const [factura, setFactura] = useState('')
  const titulo = { aprobado: 'Registrar aprobación', facturado: 'Registrar factura', pagado: 'Registrar pago' }[etapa]
  return (
    <Modal abierto titulo={`${titulo} · ${ep.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${ep.numero}`}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={fecha} max={iso(hoy())} onChange={(e) => setFecha(e.target.value)} /></Campo>
        {etapa === 'facturado' && <Campo etiqueta="N° de factura"><input className={inputCls} value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="Ej.: F-1234" /></Campo>}
        {etapa === 'pagado' && <p className="text-sm text-slate-600">Monto recibido: <span className="tabular font-medium">{mm(ep.neto)}</span></p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!fecha || (etapa === 'facturado' && !factura.trim())} onClick={() => { avanzar(ep.id, etapa, dia(fecha), factura.trim() || undefined); onCerrar() }}>Guardar</Boton>
      </div>
    </Modal>
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
