// Workspace de Finanzas (v1.3, 07 R09, 17 §2.6): caja consolidada, cobranza de EP con su factura
// electrónica (DTE), cuentas por cobrar y por pagar por antigüedad, pagos programados con el semáforo de
// cumplimiento laboral (RULE-701), libro de documentos tributarios y pendientes de garantías y rendiciones.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Boton, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import { consolidarCaja } from '../domain/caja'
import { estadoRendicion } from '../domain/cajaChica'
import { estadoGarantia } from '../domain/contrato'
import { calcularObra } from '../domain/evm'
import { fmtFecha, hoy } from '../domain/fechas'
import {
  codigoDTE, cuentasPorCobrar, cuentasPorPagar, ESTADOS_DTE, estadoDTE, puedeAnularConNC, puedeFacturar, puedeTesoreria, siguienteFolio, TIPOS_DTE, TONO_DTE, TRAMOS_CXC, TRAMOS_CXP,
} from '../domain/finanzas'
import { clp, mm, num, pct } from '../domain/formato'
import type { DocumentoTributario, EstadoSemaforo } from '../domain/types'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi } from '../store/umbralesUI'

export default function Finanzas() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const accionEP = useStore((s) => s.accionEstadoPago)
  const accionEPSub = useStore((s) => s.accionEPSub)
  const pagarCosto = useStore((s) => s.pagarCosto)
  const [error, setError] = useState<string | null>(null)
  const [cobro, setCobro] = useState<{ id: string; monto: string } | null>(null)
  const [verDte, setVerDte] = useState<string | null>(null)
  const [todosPagos, setTodosPagos] = useState(false)
  const t = hoy()
  const obras = d.obras
  const ids = obras.map((o) => o.id)
  const caja = useMemo(() => consolidarCaja(d.obras.map((o) => calcularObra(d, o.id, t).caja), t), [d, t])
  const cxc = cuentasPorCobrar(d, ids, t)
  const cxp = cuentasPorPagar(d, ids, t)
  const nombreObra = (id: string) => obras.find((o) => o.id === id)?.nombre ?? id
  const dtes = d.documentosTributarios.filter((x) => x.creado <= t).sort((a, b) => b.fecha - a.fecha || b.folio - a.folio)
  const porRespuesta = dtes.filter((x) => estadoDTE(x, t) === 'emitido').length
  const garantias = d.garantias.filter((g) => ['por_vencer', 'vencida'].includes(estadoGarantia(g, d.garantias, t) ?? '')).length
  const rendiciones = d.rendiciones.filter((r) => estadoRendicion(r, t) === 'presentada').length
  const pagos = cxp.items.filter((i) => todosPagos || i.vence <= t + 30)
  const run = (f: () => string | null) => setError(f())

  return (
    <div className="space-y-4">
      <Titulo sub={`Todas las obras · ${obras.length} obras · montos netos de IVA salvo los documentos tributarios`}>Finanzas</Titulo>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Caja mínima 60 días (KFI-06)" valor={mm(caja.minimo60)} estado={caja.estado as EstadoSemaforo} sub={`hoy ${mm(caja.disponibleHoy)} · el mínimo el ${fmtFecha(caja.fechaMinimo60)}`} />
        <Kpi etiqueta="Por cobrar facturado (KFI-11)" valor={mm(cxc.total)} sub={`por facturar ${mm(cxc.montoPorFacturar)} · retenciones ${mm(cxc.retenciones)}`} />
        <Kpi etiqueta="EP vencidos (KFI-09)" valor={mm(cxc.vencidos)} estado={cxc.vencidos > 0 ? (cxc.items.some((i) => (i.vencidoHace ?? 0) > 30) ? 'rojo' : 'amarillo') : 'verde'} sub={`días de cobro promedio (KFI-03): ${cxc.dso != null ? num(cxc.dso, 0) : '—'}`}
          ayuda={`Doc 14 KFI-09: alerta con EP vencidos · crítico si alguno lleva más de 30 días. ${ayudaKpi('KFI-03')}`} />
        <Kpi etiqueta="Por pagar (KFI-13)" valor={mm(cxp.total)} estado={cxp.vencidas > 0 ? (cxp.tramos[2] > 0 ? 'rojo' : 'amarillo') : 'verde'} sub={`${mm(cxp.proximos30)} en 30 días · ${cxp.vencidas ? `vencido ${mm(cxp.vencidas)}` : 'nada vencido'}${cxp.retenidos ? ` · retenido RULE-701 ${mm(cxp.retenidos)}` : ''}`} />
      </div>
      {(porRespuesta > 0 || garantias > 0 || rendiciones > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {porRespuesta > 0 && <Badge tono="azul">{porRespuesta} DTE esperando respuesta del SII</Badge>}
          {garantias > 0 && <Link to="/contrato"><Badge tono="ambar">{garantias} garantía(s) por vencer o vencidas</Badge></Link>}
          {rendiciones > 0 && <Link to="/caja-chica"><Badge tono="ambar">{rendiciones} rendición(es) por revisar</Badge></Link>}
        </div>
      )}

      <Card titulo="Cobranza de estados de pago">
        {cxc.porFacturar.length === 0 && cxc.items.length === 0 ? <p className="text-sm text-slate-500">Sin EP por facturar ni por cobrar.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Obra · EP</th><th className="font-medium">Factura</th><th className="text-right font-medium">Por cobrar</th><th className="font-medium">Vence</th><th className="font-medium">Estado</th><th /></tr></thead>
              <tbody>
                {cxc.porFacturar.map((ep) => (
                  <tr key={ep.id} className="border-b border-slate-100">
                    <td className="py-2">{nombreObra(ep.obraId)} · {ep.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${ep.numero}`}<div className="text-xs text-slate-500">aprobado el {fmtFecha(ep.aprobado!)}</div></td>
                    <td className="text-slate-500">—</td>
                    <td className="text-right">{clp(ep.neto)}</td>
                    <td>—</td>
                    <td><Badge tono="azul">Por facturar</Badge></td>
                    <td className="text-right">{puedeFacturar(rol) && <Boton className="min-h-0 py-1" onClick={() => run(() => accionEP(ep.id, 'facturar'))}>Emitir F-{siguienteFolio(d.documentosTributarios, 'factura')}</Boton>}</td>
                  </tr>
                ))}
                {cxc.items.map(({ ep, saldo, vencidoHace }) => (
                  <tr key={ep.id} className="border-b border-slate-100">
                    <td className="py-2">{nombreObra(ep.obraId)} · {ep.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${ep.numero}`}<div className="text-xs text-slate-500">facturado el {fmtFecha(ep.facturado!)}</div></td>
                    <td>{ep.factura}</td>
                    <td className="text-right">{clp(saldo)}</td>
                    <td className={cx('whitespace-nowrap', vencidoHace != null && 'font-medium text-crit')}>{fmtFecha(ep.vencimiento!)}</td>
                    <td className="whitespace-nowrap">{vencidoHace != null
                      ? <><Badge tono={vencidoHace > 30 ? 'rojo' : 'ambar'}>Vencido hace {vencidoHace} días</Badge><span className="block text-xs text-slate-500">RULE-402 · {vencidoHace >= 30 ? 'escalado a Gerencia' : vencidoHace >= 15 ? 'escalado al administrador' : 'recordatorio al mandante'}</span></>
                      : <Badge tono="gris">Por vencer</Badge>}</td>
                    <td className="text-right">{puedeFacturar(rol) && <button className="text-marca hover:underline" onClick={() => setCobro({ id: ep.id, monto: String(saldo) })}>Registrar cobro</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Cuentas por cobrar por antigüedad (KFI-12)">
          <Antiguedad tramos={TRAMOS_CXC} filas={obras.map((o) => ({ nombre: o.nombre, tramos: cuentasPorCobrar(d, [o.id], t).tramos }))} total={cxc.tramos} alerta={[2, 3]} />
          <p className="mt-2 text-xs text-slate-500">Días desde la emisión de la factura. Alerta si lo de más de 60 días supera el 10 % ({pct(cxc.sobre60, 0)} hoy).</p>
        </Card>
        <Card titulo="Cuentas por pagar por vencimiento (KFI-13)">
          <Antiguedad tramos={TRAMOS_CXP} filas={obras.map((o) => ({ nombre: o.nombre, tramos: cuentasPorPagar(d, [o.id], t).tramos }))} total={cxp.tramos} alerta={[1, 2]} />
          <p className="mt-2 text-xs text-slate-500">Facturas de proveedores y EP de subcontratos aprobados. Los costos importados de la contabilidad que vencieron se consideran pagados por ella.</p>
        </Card>
      </div>

      <Card titulo="Pagos programados" accion={<button className="text-sm text-marca hover:underline" onClick={() => setTodosPagos(!todosPagos)}>{todosPagos ? 'Próximos 30 días' : `Ver todos (${cxp.items.length})`}</button>}>
        {pagos.length === 0 ? <p className="text-sm text-slate-500">Sin pagos en los próximos 30 días.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Vence</th><th className="font-medium">Proveedor / subcontratista</th><th className="font-medium">Documento</th><th className="text-right font-medium">Monto</th><th className="font-medium">Cumplimiento laboral</th><th /></tr></thead>
              <tbody>
                {pagos.slice(0, todosPagos ? undefined : 15).map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className={cx('whitespace-nowrap py-2', i.atraso > 0 && !i.bloqueado && 'font-medium text-crit')}>{fmtFecha(i.vence)}</td>
                    <td>{i.contraparte}<div className="text-xs text-slate-500">{nombreObra(i.obraId)}</div></td>
                    <td>{i.documento}</td>
                    <td className="text-right">{clp(i.monto)}</td>
                    <td>{i.fuente === 'ep_subcontrato' ? (i.bloqueado ? <Badge tono="rojo">Sin F30-1: no pagar (RULE-701)</Badge> : <Badge tono="verde">F30-1 vigente</Badge>) : <span className="text-xs text-slate-400">No aplica</span>}</td>
                    <td className="text-right">{puedeTesoreria(rol) && !i.bloqueado && <button className="text-marca hover:underline" onClick={() => run(() => (i.fuente === 'costo' ? pagarCosto(i.id) : accionEPSub(i.id, 'pagar')))}>Registrar pago</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Documentos tributarios electrónicos">
        <p className="mb-2 text-xs text-slate-500">Integración con el SII simulada: Finanzas registra la respuesta (aceptado o rechazado). Una factura rechazada deja el EP por facturar.</p>
        {dtes.length === 0 ? <p className="text-sm text-slate-500">Sin documentos emitidos.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Folio</th><th className="font-medium">Fecha</th><th className="font-medium">Receptor · glosa</th><th className="text-right font-medium">Total</th><th className="font-medium">Estado</th><th /></tr></thead>
              <tbody>
                {dtes.slice(0, 12).map((x) => {
                  const e = estadoDTE(x, t)!
                  return (
                    <tr key={x.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap py-2">{codigoDTE(x)}<div className="text-xs text-slate-500">{TIPOS_DTE[x.tipo].nombre} ({TIPOS_DTE[x.tipo].codigo})</div></td>
                      <td className="whitespace-nowrap">{fmtFecha(x.fecha)}</td>
                      <td>{x.receptor}<div className="text-xs text-slate-500">{x.glosa}</div></td>
                      <td className="text-right">{clp(x.total)}</td>
                      <td><Badge tono={TONO_DTE[e]}>{ESTADOS_DTE[e]}</Badge></td>
                      <td className="text-right"><button className="text-marca hover:underline" onClick={() => setVerDte(x.id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {cobro && (() => {
        const ep = d.estadosPago.find((x) => x.id === cobro.id)!
        return (
          <Modal abierto titulo={`Registrar cobro · ${nombreObra(ep.obraId)} · ${ep.factura}`} onCerrar={() => setCobro(null)}>
            <label className="block text-sm"><span className="text-slate-600">Monto cobrado (neto)</span><input type="number" className={cx(inputCls, 'mt-1')} value={cobro.monto} onChange={(e) => setCobro({ ...cobro, monto: e.target.value })} /></label>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setCobro(null)}>Cancelar</Boton>
              <Boton onClick={() => { const err = accionEP(ep.id, 'pagar', { monto: Number(cobro.monto || 0) }); setError(err); if (!err) setCobro(null) }}>Registrar</Boton>
            </div>
          </Modal>
        )
      })()}
      {verDte && <DetalleDTE x={d.documentosTributarios.find((y) => y.id === verDte)!} onCerrar={() => setVerDte(null)} />}
    </div>
  )
}

function Antiguedad({ tramos, filas, total, alerta }: { tramos: readonly string[]; filas: { nombre: string; tramos: number[] }[]; total: number[]; alerta: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[440px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
        <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Obra</th>{tramos.map((x) => <th key={x} className="font-medium">{x}</th>)}</tr></thead>
        <tbody>
          {filas.filter((f) => f.tramos.some((x) => x > 0)).map((f) => (
            <tr key={f.nombre} className="border-b border-slate-100 text-right">
              <td className="py-1.5 text-left">{f.nombre}</td>
              {f.tramos.map((x, k) => <td key={k} className={cx(x > 0 && alerta.includes(k) && 'text-crit')}>{x ? mm(x) : '—'}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="text-right font-semibold"><td className="py-1.5 text-left">Total</td>{total.map((x, k) => <td key={k}>{x ? mm(x) : '—'}</td>)}</tr></tfoot>
      </table>
    </div>
  )
}

function DetalleDTE({ x, onCerrar }: { x: DocumentoTributario; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const respuesta = useStore((s) => s.respuestaSII)
  const anular = useStore((s) => s.anularConNotaCredito)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const e = estadoDTE(x, t)!
  const ep = d.estadosPago.find((y) => y.id === x.epId)
  const ref = d.documentosTributarios.find((y) => y.id === x.referenciaId)
  const fin = (err: string | null) => { if (err) setError(err); else onCerrar() }
  return (
    <Modal abierto titulo={`${TIPOS_DTE[x.tipo].nombre} ${codigoDTE(x)}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <Badge tono={TONO_DTE[e]}>{ESTADOS_DTE[e]}</Badge>
        <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-slate-600">Receptor</dt><dd>{x.receptor}</dd>
          <dt className="text-slate-600">Fecha de emisión</dt><dd>{fmtFecha(x.fecha)}</dd>
          <dt className="text-slate-600">Glosa</dt><dd>{x.glosa}</dd>
          {ref && <><dt className="text-slate-600">Referencia</dt><dd>{codigoDTE(ref)}</dd></>}
          <dt className="text-slate-600">Neto</dt><dd>{clp(x.neto)}</dd>
          <dt className="text-slate-600">IVA (19 %)</dt><dd>{clp(x.iva)}</dd>
          <dt className="text-slate-600 font-medium">Total</dt><dd className="font-semibold">{clp(x.total)}</dd>
        </dl>
        <ul className="text-xs text-slate-500">{x.historial.map((h, k) => <li key={k}>{fmtFecha(h.fecha)} · {ESTADOS_DTE[h.estado]} · {h.por}{h.texto ? ` · ${h.texto}` : ''}</li>)}</ul>
        {puedeFacturar(rol) && (e === 'emitido' || puedeAnularConNC(x, ep, t)) && <input className={inputCls} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={e === 'emitido' ? 'Motivo del rechazo del SII (si corresponde)' : 'Motivo de la nota de crédito'} />}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {puedeFacturar(rol) && e === 'emitido' && <>
          <Boton variante="secundario" onClick={() => fin(respuesta(x.id, false, motivo))}>Rechazado por el SII</Boton>
          <Boton onClick={() => fin(respuesta(x.id, true))}>Aceptado por el SII</Boton>
        </>}
        {puedeFacturar(rol) && puedeAnularConNC(x, ep, t) && <Boton variante="peligro" onClick={() => fin(anular(x.id, motivo))}>Anular con nota de crédito</Boton>}
      </div>
    </Modal>
  )
}
