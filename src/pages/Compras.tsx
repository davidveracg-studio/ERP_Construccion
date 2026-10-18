// Abastecimiento (v1.2, RF-ABA-01/03, 10 §12–13): solicitudes de material desde terreno, órdenes de
// compra con aprobación por monto (RN-P04) y presupuesto (RULE-304), recepciones con guía que generan
// el costo real, proveedores (RULE-302) con su OTIF, y el catálogo de materiales.
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import {
  ACCIONES_OC, accionesOC, codigoOC, ESTADOS_OC, ESTADOS_SOLICITUD, estadoOC, estadoOTIF, estadoSolicitud, faltanCotizaciones, fechaCompleta,
  fechaPaso, indicadoresCompras, limiteAdmin, montoLinea, montoOC, otifProveedor, pendienteLinea, puedeComprar, puedeEditarCatalogo,
  puedeEditarProveedores, puedeRechazarSolicitud, puedeRecibir, puedeSolicitar, recibidoLinea, requiereGerencia, TONO_OC, TONO_SOLICITUD,
  umbralCotizaciones, type AccionOC,
} from '../domain/compras'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct } from '../domain/formato'
import type { Material, OrdenCompra, Proveedor, SolicitudMaterial, Urgencia } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

type Pestana = 'solicitudes' | 'ordenes' | 'proveedores' | 'catalogo'
const PESTANAS: Record<Pestana, string> = { solicitudes: 'Solicitudes', ordenes: 'Órdenes de compra', proveedores: 'Proveedores', catalogo: 'Catálogo de materiales' }

export function EstadoOCBadge({ oc, t }: { oc: OrdenCompra; t: number }) {
  const e = estadoOC(oc, t)
  return e ? <Badge tono={TONO_OC[e]}>{ESTADOS_OC[e]}</Badge> : null
}

export default function Compras() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [params, setParams] = useSearchParams()
  const pestana = (params.get('ver') as Pestana) in PESTANAS ? (params.get('ver') as Pestana) : 'ordenes'
  if (!c) return null
  const t = hoy()
  const ind = indicadoresCompras(d.ordenesCompra, d.solicitudesMaterial, c.obra.id, t)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · solicitudes de terreno, órdenes de compra, recepciones y proveedores`}>Compras y abastecimiento</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi etiqueta="OTIF (90 días)" valor={ind.otif != null ? pct(ind.otif, 0) : '—'} estado={ind.estado} sub={`KAB-06 · ${ind.otifN} entregas`} ayuda="Órdenes entregadas a tiempo y completas / órdenes con entrega debida" />
        <Kpi etiqueta="Entregas en fecha" valor={ind.enFecha != null ? pct(ind.enFecha, 0) : '—'} sub="KAB-01" />
        <Kpi etiqueta="Lead time" valor={ind.leadTime != null ? `${num(ind.leadTime, 1)} días` : '—'} sub="KAB-02 · solicitud → recepción" />
        <Kpi etiqueta="Compras urgentes" valor={ind.urgentes != null ? pct(ind.urgentes, 0) : '—'} sub="KAB-03 · RULE-306 sobre 20 %" estado={ind.urgentes == null ? undefined : ind.urgentes > 0.2 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Fuera de presupuesto" valor={ind.fueraPresupuesto != null ? pct(ind.fueraPresupuesto, 1) : '—'} sub="KAB-09" estado={ind.fueraPresupuesto == null ? undefined : ind.fueraPresupuesto > 0.05 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Comprado (90 días)" valor={mm(ind.montoComprado)} sub={`${ind.nOC} OC · ${ind.porAprobar} por aprobar`} />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {(Object.keys(PESTANAS) as Pestana[]).map((p) => (
          <button key={p} role="tab" aria-selected={p === pestana} onClick={() => setParams({ ver: p }, { replace: true })}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', p === pestana ? 'border-marca text-marca' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {PESTANAS[p]}{p === 'solicitudes' && ind.solicitudesPendientes > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{ind.solicitudesPendientes}</span>}
          </button>
        ))}
      </div>
      {pestana === 'solicitudes' && <Solicitudes obraId={c.obra.id} rol={rol} />}
      {pestana === 'ordenes' && <Ordenes obraId={c.obra.id} rol={rol} />}
      {pestana === 'proveedores' && <Proveedores rol={rol} />}
      {pestana === 'catalogo' && <Catalogo rol={rol} />}
    </div>
  )
}

// ───────────────────────── Solicitudes ─────────────────────────

function Solicitudes({ obraId, rol }: { obraId: string; rol: string }) {
  const d = useDatosDominio()
  const rechazar = useStore((s) => s.rechazarSolicitud)
  const [nueva, setNueva] = useState(false)
  const [oc, setOc] = useState(false)
  const [rechazo, setRechazo] = useState<SolicitudMaterial | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null)
  const t = hoy()
  const lista = d.solicitudesMaterial.filter((s) => s.obraId === obraId && s.creado <= t).sort((a, b) => b.creado - a.creado || b.numero - a.numero)
  const pendientes = lista.filter((s) => estadoSolicitud(s, d.ordenesCompra, t) === 'enviada')
  return (
    <Card titulo="Solicitudes de material" accion={<span className="flex gap-2">
      {puedeComprar(rol as never) && pendientes.length > 0 && <Boton variante="secundario" onClick={() => setOc(true)}>Generar OC ({pendientes.length})</Boton>}
      {puedeSolicitar(rol as never) && <Boton variante="secundario" onClick={() => setNueva(true)}>Nueva solicitud</Boton>}
    </span>}>
      {lista.length === 0 ? <Vacio titulo="Sin solicitudes" texto="Terreno pide aquí el material con su partida y fecha requerida." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Solicitud</th><th className="text-right font-medium">Cantidad</th><th className="font-medium">Partida</th>
                <th className="font-medium">Se requiere</th><th className="font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const e = estadoSolicitud(s, d.ordenesCompra, t)!
                const mat = d.materiales.find((m) => m.id === s.materialId)
                const p = d.partidas.find((x) => x.id === s.partidaId)
                const orden = d.ordenesCompra.find((o) => o.id === s.ordenCompraId)
                const motivo = s.historial.find((h) => h.estado === 'rechazada')?.texto
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">N° {s.numero} · {mat?.nombre}</div><div className="text-xs text-slate-500">{s.creadoPor} · {fmtFecha(s.creado)}{s.urgencia === 'urgente' ? ' · urgente' : ''}</div></td>
                    <td className="text-right">{num(s.cantidad, 0)} {mat?.unidad}</td>
                    <td>{p?.codigo} {p?.descripcion}</td>
                    <td className={cx(e === 'enviada' && s.fechaRequerida - t <= 3 && 'font-medium text-amber-700')}>{fmtFecha(s.fechaRequerida)}</td>
                    <td><Badge tono={TONO_SOLICITUD[e]}>{ESTADOS_SOLICITUD[e]}</Badge>{orden && <Link to={`/compras/oc/${orden.id}`} className="ml-2 text-xs text-marca hover:underline">{codigoOC(orden)}</Link>}{motivo && <div className="max-w-[220px] truncate text-xs text-slate-500" title={motivo}>{motivo}</div>}</td>
                    <td className="text-right">{e === 'enviada' && puedeRechazarSolicitud(rol as never) && <button className="text-xs text-slate-500 hover:text-crit" onClick={() => { setRechazo(s); setMotivo(''); setErrorRechazo(null) }}>Rechazar</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {nueva && <NuevaSolicitud obraId={obraId} onCerrar={() => setNueva(false)} />}
      {oc && <NuevaOC obraId={obraId} solicitudes={pendientes} onCerrar={() => setOc(false)} />}
      {rechazo && (
        <Modal abierto titulo={`Rechazar solicitud N° ${rechazo.numero}`} onCerrar={() => setRechazo(null)}>
          <Campo etiqueta="Motivo"><input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: hay stock en bodega central" /></Campo>
          {errorRechazo && <p className="mt-2 text-sm text-crit">{errorRechazo}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setRechazo(null)}>Cancelar</Boton>
            <Boton variante="peligro" onClick={() => { const err = rechazar(rechazo.id, motivo); if (err) setErrorRechazo(err); else setRechazo(null) }}>Rechazar</Boton>
          </div>
        </Modal>
      )}
    </Card>
  )
}

function NuevaSolicitud({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearSolicitud)
  const d = useDatosDominio()
  const t = hoy()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const [v, setV] = useState({ materialId: d.materiales[0]?.id ?? '', cantidad: '', partidaId: partidas[0]?.id ?? '', fecha: iso(t + 7), urgencia: 'planificada' as Urgencia, nota: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const mat = d.materiales.find((m) => m.id === v.materialId)
  return (
    <Modal abierto titulo="Nueva solicitud de material" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Material"><select className={inputCls} value={v.materialId} onChange={set('materialId')}>{d.materiales.map((m) => <option key={m.id} value={m.id}>{m.codigo} {m.nombre}</option>)}</select></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta={`Cantidad${mat ? ` (${mat.unidad})` : ''}`}><input type="number" min={0} className={inputCls} value={v.cantidad} onChange={set('cantidad')} /></Campo>
          <Campo etiqueta="Se requiere el"><input type="date" className={inputCls} value={v.fecha} onChange={set('fecha')} /></Campo>
        </div>
        <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={set('partidaId')}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        <Campo etiqueta="Urgencia" ayuda="Las urgentes cuentan en KAB-03: delatan falta de planificación.">
          <select className={inputCls} value={v.urgencia} onChange={set('urgencia')}><option value="planificada">Planificada</option><option value="urgente">Urgente</option></select>
        </Campo>
        <Campo etiqueta="Nota (opcional)"><input className={inputCls} value={v.nota} onChange={set('nota')} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = crear({ obraId, materialId: v.materialId, cantidad: Number(v.cantidad || 0), partidaId: v.partidaId, fechaRequerida: dia(v.fecha), urgencia: v.urgencia, nota: v.nota.trim() || undefined })
          if (err) setError(err)
          else onCerrar()
        }}>Enviar solicitud</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Órdenes de compra ─────────────────────────

function Ordenes({ obraId, rol }: { obraId: string; rol: string }) {
  const d = useDatosDominio()
  const [nueva, setNueva] = useState(false)
  const [todas, setTodas] = useState(false)
  const t = hoy()
  const lista = d.ordenesCompra.filter((o) => o.obraId === obraId && o.creado <= t).sort((a, b) => b.numero - a.numero)
  const vivas = lista.filter((o) => !['recibida', 'cerrada', 'anulada'].includes(estadoOC(o, t) ?? ''))
  const mostrar = todas ? lista : [...vivas, ...lista.filter((o) => !vivas.includes(o)).slice(0, 10)]
  return (
    <Card titulo="Órdenes de compra" accion={<span className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />Ver todas ({lista.length})</label>
      {puedeComprar(rol as never) && <Boton variante="secundario" onClick={() => setNueva(true)}>Nueva OC</Boton>}
    </span>}>
      {lista.length === 0 ? <Vacio titulo="Sin órdenes de compra" texto="Emite las OC desde las solicitudes de terreno o directamente." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Orden</th><th className="text-right font-medium">Monto</th><th className="font-medium">Entrega</th><th className="font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {mostrar.map((o) => {
                const prov = d.proveedores.find((p) => p.id === o.proveedorId)
                const mat = d.materiales.find((m) => m.id === o.lineas[0]?.materialId)
                const completa = fechaCompleta(o)
                const tarde = completa != null ? completa > o.fechaEntrega : o.fechaEntrega < t && ['enviada', 'recibida_parcial'].includes(estadoOC(o, t) ?? '')
                return (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">{codigoOC(o)} · {prov?.nombre}</div><div className="text-xs text-slate-500">{mat?.nombre}{o.lineas.length > 1 ? ` y ${o.lineas.length - 1} más` : ''}{o.urgente ? ' · urgente' : ''}</div></td>
                    <td className="text-right">{mm(montoOC(o))}</td>
                    <td className={cx(tarde && 'font-medium text-crit')}>{fmtFecha(o.fechaEntrega)}{completa != null && <div className="text-xs text-slate-500">recibida {fmtFecha(completa)}</div>}</td>
                    <td><EstadoOCBadge oc={o} t={t} /></td>
                    <td className="text-right"><Link to={`/compras/oc/${o.id}`} className="text-marca hover:underline">Ver</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {nueva && <NuevaOC obraId={obraId} solicitudes={[]} onCerrar={() => setNueva(false)} />}
    </Card>
  )
}

function NuevaOC({ obraId, solicitudes, onCerrar }: { obraId: string; solicitudes: SolicitudMaterial[]; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearOrdenCompra)
  const d = useDatosDominio()
  const nav = useNavigate()
  const t = hoy()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const precioDe = (partidaId: string) => d.partidas.find((p) => p.id === partidaId)?.recursos.find((r) => r.tipo === 'MAT')?.precio ?? 0
  const [elegidas, setElegidas] = useState<string[]>(solicitudes.map((s) => s.id))
  const [v, setV] = useState({
    proveedorId: d.proveedores.find((p) => p.estado === 'activo')?.id ?? '', entrega: iso(t + 5), cotizaciones: '3', justificacion: '', urgente: solicitudes.some((s) => s.urgencia === 'urgente'),
    materialId: d.materiales[0]?.id ?? '', partidaId: partidas[0]?.id ?? '', cantidad: '', precio: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const lineas = solicitudes.length
    ? solicitudes.filter((s) => elegidas.includes(s.id)).map((s) => ({ materialId: s.materialId, cantidad: s.cantidad, precio: precioDe(s.partidaId), partidaId: s.partidaId, solicitudId: s.id }))
    : v.cantidad ? [{ materialId: v.materialId, cantidad: Number(v.cantidad), precio: Number(v.precio || 0), partidaId: v.partidaId }] : []
  const monto = lineas.reduce((s, l) => s + Math.round(l.cantidad * l.precio), 0)
  const prov = d.proveedores.find((p) => p.id === v.proveedorId)
  return (
    <Modal abierto titulo={solicitudes.length ? 'Orden de compra desde solicitudes' : 'Nueva orden de compra'} onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Proveedor">
          <select className={inputCls} value={v.proveedorId} onChange={set('proveedorId')}>
            {d.proveedores.map((p) => <option key={p.id} value={p.id} disabled={p.estado !== 'activo'}>{p.nombre}{p.estado !== 'activo' ? ` (${p.estado})` : ''}</option>)}
          </select>
        </Campo>
        {solicitudes.length > 0 ? (
          <div className="rounded-lg border border-slate-200 p-2 text-sm">
            {solicitudes.map((s) => {
              const m = d.materiales.find((x) => x.id === s.materialId)
              return (
                <label key={s.id} className="flex items-center gap-2 py-1">
                  <input type="checkbox" checked={elegidas.includes(s.id)} onChange={(e) => setElegidas(e.target.checked ? [...elegidas, s.id] : elegidas.filter((x) => x !== s.id))} />
                  <span>N° {s.numero} · {num(s.cantidad, 0)} {m?.unidad} de {m?.nombre} · para el {fmtFecha(s.fechaRequerida)}</span>
                </label>
              )
            })}
            <p className="mt-1 text-xs text-slate-500">El precio se toma del presupuesto de la partida; se puede ajustar en el borrador.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Material"><select className={inputCls} value={v.materialId} onChange={set('materialId')}>{d.materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value, precio: String(precioDe(e.target.value) || '') })}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
            <Campo etiqueta="Cantidad"><input type="number" min={0} className={inputCls} value={v.cantidad} onChange={set('cantidad')} /></Campo>
            <Campo etiqueta="Precio unitario"><input type="number" min={0} className={inputCls} value={v.precio} onChange={set('precio')} /></Campo>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Entrega comprometida"><input type="date" className={inputCls} value={v.entrega} onChange={set('entrega')} /></Campo>
          <Campo etiqueta="Cotizaciones"><input type="number" min={0} className={inputCls} value={v.cotizaciones} onChange={set('cotizaciones')} /></Campo>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.urgente} onChange={(e) => setV({ ...v, urgente: e.target.checked })} />Urgente</label>
        </div>
        {monto > umbralCotizaciones(d.config) && Number(v.cotizaciones) < 3 && (
          <Campo etiqueta="Justificación (RULE-303)" ayuda="Sobre el umbral se piden 3 cotizaciones; si no, justifica (proveedor único, urgencia).">
            <input className={inputCls} value={v.justificacion} onChange={set('justificacion')} />
          </Campo>
        )}
        <p className="text-sm">Monto neto: <b>{clp(monto)}</b>{monto > limiteAdmin(d.config) && <span className="ml-2 text-amber-700">· sobre {clp(limiteAdmin(d.config))}: la aprueba Gerencia</span>}</p>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!lineas.length || !prov} onClick={() => {
          const r = crear({ obraId, proveedorId: v.proveedorId, fechaEntrega: dia(v.entrega), urgente: v.urgente, cotizaciones: Number(v.cotizaciones || 0), justificacion: v.justificacion.trim() || undefined, lineas })
          if (r.error) setError(r.error)
          else { onCerrar(); nav(`/compras/oc/${r.id}`) }
        }}>Crear borrador</Boton>
      </div>
    </Modal>
  )
}

export function DetalleOC() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const editar = useStore((s) => s.editarOrdenCompra)
  const [accion, setAccion] = useState<AccionOC | null>(null)
  const [recibir, setRecibir] = useState(false)
  const oc = d.ordenesCompra.find((o) => o.id === id)
  if (!oc) return <Vacio titulo="Orden de compra no encontrada" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/compras" className="text-marca">Volver</Link>} />
  const t = hoy()
  const e = estadoOC(oc, t)!
  const obra = d.obras.find((o) => o.id === oc.obraId)!
  const prov = d.proveedores.find((p) => p.id === oc.proveedorId)
  const acciones = accionesOC(oc, t, rol, d.config)
  const editable = e === 'borrador' && puedeComprar(rol)
  const gerencia = requiereGerencia(oc, d.config)
  const completa = fechaCompleta(oc)

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${prov?.nombre ?? 'Proveedor'}${oc.urgente ? ' · urgente' : ''}`}
        accion={<>
          {puedeRecibir(oc, t, rol) && <Boton onClick={() => setRecibir(true)}>Registrar recepción</Boton>}
          {acciones.map((a) => <Boton key={a} variante={a === 'anular' || a === 'devolver' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_OC[a]}</Boton>)}
        </>}>
        <span className="flex flex-wrap items-center gap-2">{codigoOC(oc)}<EstadoOCBadge oc={oc} t={t} /></span>
      </Titulo>
      <Link to="/compras?ver=ordenes" className="text-sm text-marca">← Órdenes de compra</Link>
      {e === 'por_aprobar' && gerencia && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{montoOC(oc) > limiteAdmin(d.config) ? `Supera el límite de ${clp(limiteAdmin(d.config))} del administrador de obra (RN-P04)` : 'Tiene líneas fuera del saldo de presupuesto de su partida (RULE-304)'}: la aprueba Gerencia (R01).</p>}
      {prov && prov.estado !== 'activo' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">RULE-302: el proveedor está {prov.estado}{prov.motivoBloqueo ? ` (${prov.motivoBloqueo})` : ''}.</p>}
      {faltanCotizaciones(oc, d.config) && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Sobre {clp(umbralCotizaciones(d.config))} con {oc.cotizaciones} cotización(es). Justificación: {oc.justificacion ?? '—'}</p>}

      <Card titulo="Líneas">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Material</th><th className="text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">Precio</th>
                <th className="font-medium">Monto</th><th className="font-medium">Recibido</th>
              </tr>
            </thead>
            <tbody>
              {oc.lineas.map((l) => {
                const m = d.materiales.find((x) => x.id === l.materialId)
                const p = d.partidas.find((x) => x.id === l.partidaId)
                const rec = recibidoLinea(oc, l.id, t)
                return (
                  <tr key={l.id} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left"><div className="font-medium">{m?.nombre}</div>{oc.fueraPresupuesto?.includes(l.id) && <Badge tono="ambar">Fuera de presupuesto</Badge>}</td>
                    <td className="text-left">{p?.codigo} {p?.descripcion}</td>
                    <td>{editable ? <input type="number" className={cx(inputCls, 'w-24 py-0.5 text-right')} defaultValue={l.cantidad} aria-label="Cantidad"
                      onBlur={(ev) => editar(oc.id, { lineas: oc.lineas.map((x) => (x.id === l.id ? { ...x, cantidad: Number(ev.target.value) } : x)) })} /> : `${num(l.cantidad, l.cantidad % 1 ? 1 : 0)} ${m?.unidad ?? ''}`}</td>
                    <td>{editable ? <input type="number" className={cx(inputCls, 'w-28 py-0.5 text-right')} defaultValue={l.precio} aria-label="Precio"
                      onBlur={(ev) => editar(oc.id, { lineas: oc.lineas.map((x) => (x.id === l.id ? { ...x, precio: Number(ev.target.value) } : x)) })} /> : clp(l.precio)}</td>
                    <td>{clp(montoLinea(l))}</td>
                    <td className={cx(rec > 0 && rec < l.cantidad && 'text-amber-700')}>{num(rec, rec % 1 ? 1 : 0)} / {num(l.cantidad, l.cantidad % 1 ? 1 : 0)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr className="text-right font-semibold"><td colSpan={4} className="py-2">Neto</td><td>{clp(montoOC(oc))}</td><td /></tr></tfoot>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Entrega">
          <dl className="tabular space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Comprometida</dt><dd>{fmtFecha(oc.fechaEntrega)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Recibida completa</dt><dd className={cx(completa != null && completa > oc.fechaEntrega && 'text-crit')}>{completa != null ? fmtFecha(completa) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Cotizaciones</dt><dd>{oc.cotizaciones}</dd></div>
            {oc.factura && <div className="flex justify-between"><dt className="text-slate-600">Factura</dt><dd>{oc.factura}</dd></div>}
          </dl>
          {oc.recepciones.filter((r) => r.fecha <= t).length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-sm">
              {oc.recepciones.filter((r) => r.fecha <= t).map((r) => <li key={r.id}>{fmtFecha(r.fecha)} · guía {r.guia} · {r.recibidoPor}</li>)}
            </ul>
          )}
        </Card>
        <Card titulo="Historial">
          <ol className="space-y-1 text-sm">
            <li>{fmtFecha(oc.creado)} · Borrador · {oc.creadoPor}</li>
            {oc.historial.filter((h) => h.fecha <= t).map((h, i) => <li key={i}>{fmtFecha(h.fecha)} · {ESTADOS_OC[h.estado]} · {h.por}{h.texto ? ` · “${h.texto}”` : ''}</li>)}
          </ol>
          {fechaPaso(oc, 'aprobada') != null && <p className="mt-2 text-xs text-slate-500">Al aprobarse, el saldo por recibir quedó comprometido en la partida; cada recepción lo convierte en costo real.</p>}
        </Card>
      </div>
      {accion && <AccionModal oc={oc} accion={accion} onCerrar={() => setAccion(null)} />}
      {recibir && <RecepcionModal oc={oc} onCerrar={() => setRecibir(false)} />}
    </div>
  )
}

function AccionModal({ oc, accion, onCerrar }: { oc: OrdenCompra; accion: AccionOC; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionOrdenCompra)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const conTexto = accion === 'devolver' || accion === 'anular' || accion === 'cerrar'
  return (
    <Modal abierto titulo={`${ACCIONES_OC[accion]} · ${codigoOC(oc)}`} onCerrar={onCerrar}>
      {accion === 'enviar_aprobacion' && <p className="mb-3 text-sm text-slate-600">Se revisa el proveedor (RULE-302), las cotizaciones (RULE-303) y el saldo de presupuesto de cada partida (RULE-304).</p>}
      {accion === 'aprobar' && <p className="mb-3 text-sm text-slate-600">El saldo por recibir queda comprometido en las partidas.</p>}
      {conTexto && <Campo etiqueta={accion === 'cerrar' ? 'N° de factura' : accion === 'devolver' ? 'Qué corregir' : 'Motivo'}><input className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={accion === 'anular' ? 'peligro' : 'primario'} onClick={() => { const err = ejecutar(oc.id, accion, texto); if (err) setError(err); else onCerrar() }}>{ACCIONES_OC[accion]}</Boton>
      </div>
    </Modal>
  )
}

function RecepcionModal({ oc, onCerrar }: { oc: OrdenCompra; onCerrar: () => void }) {
  const recibir = useStore((s) => s.recibirOrdenCompra)
  const d = useDatosDominio()
  const t = hoy()
  const [guia, setGuia] = useState('')
  const [cant, setCant] = useState<Record<string, string>>(Object.fromEntries(oc.lineas.map((l) => [l.id, String(pendienteLinea(oc, l, t))])))
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={`Recepción · ${codigoOC(oc)}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Cada línea recibida se registra como costo real de su partida.</p>
      <div className="space-y-3">
        <Campo etiqueta="N° de guía de despacho"><input className={inputCls} value={guia} onChange={(e) => setGuia(e.target.value)} /></Campo>
        {oc.lineas.map((l) => {
          const m = d.materiales.find((x) => x.id === l.materialId)
          return (
            <Campo key={l.id} etiqueta={`${m?.nombre} (pendiente ${num(pendienteLinea(oc, l, t), 0)} ${m?.unidad ?? ''})`}>
              <input type="number" min={0} className={inputCls} value={cant[l.id]} onChange={(e) => setCant({ ...cant, [l.id]: e.target.value })} />
            </Campo>
          )
        })}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = recibir(oc.id, { guia, cantidades: Object.fromEntries(Object.entries(cant).map(([k, q]) => [k, Number(q || 0)])) })
          if (err) setError(err)
          else onCerrar()
        }}>Registrar recepción</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Proveedores y catálogo ─────────────────────────

function Proveedores({ rol }: { rol: string }) {
  const d = useDatosDominio()
  const [editar, setEditar] = useState<Proveedor | 'nuevo' | null>(null)
  const t = hoy()
  return (
    <Card titulo="Proveedores" accion={puedeEditarProveedores(rol as never) ? <Boton variante="secundario" onClick={() => setEditar('nuevo')}>Nuevo proveedor</Boton> : undefined}>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 font-medium">Proveedor</th><th className="font-medium">RUT</th><th className="text-right font-medium">OTIF 90 días</th><th className="font-medium">Estado</th><th />
            </tr>
          </thead>
          <tbody>
            {[...d.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => {
              const o = otifProveedor(d.ordenesCompra, p.id, t)
              const est = estadoOTIF(o.valor)
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2"><div className="font-medium">{p.nombre}</div><div className="text-xs text-slate-500">{p.rubro}{p.contacto ? ` · ${p.contacto}` : ''}</div></td>
                  <td>{p.rut}</td>
                  <td className={cx('text-right', est === 'rojo' && 'text-crit', est === 'amarillo' && 'text-amber-700')}>{o.valor != null ? `${pct(o.valor, 0)} (${o.n})` : '—'}</td>
                  <td><Badge tono={p.estado === 'activo' ? 'verde' : p.estado === 'bloqueado' ? 'rojo' : 'gris'}>{p.estado === 'activo' ? 'Activo' : p.estado === 'bloqueado' ? 'Bloqueado' : 'Inactivo'}</Badge>{p.motivoBloqueo && <div className="max-w-[200px] truncate text-xs text-slate-500" title={p.motivoBloqueo}>{p.motivoBloqueo}</div>}</td>
                  <td className="text-right">{puedeEditarProveedores(rol as never) && <button className="text-marca hover:underline" onClick={() => setEditar(p)}>Editar</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editar && <EditarProveedor p={editar === 'nuevo' ? undefined : editar} onCerrar={() => setEditar(null)} />}
    </Card>
  )
}

function EditarProveedor({ p, onCerrar }: { p?: Proveedor; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarProveedor)
  const [v, setV] = useState<Omit<Proveedor, 'id'>>(p ?? { rut: '', nombre: '', rubro: '', estado: 'activo' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Omit<Proveedor, 'id'>) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal abierto titulo={p ? `Editar ${p.nombre}` : 'Nuevo proveedor'} onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre"><input className={inputCls} value={v.nombre} onChange={set('nombre')} /></Campo>
        <Campo etiqueta="RUT"><input className={inputCls} value={v.rut} onChange={set('rut')} /></Campo>
        <Campo etiqueta="Rubro"><input className={inputCls} value={v.rubro} onChange={set('rubro')} /></Campo>
        <Campo etiqueta="Contacto"><input className={inputCls} value={v.contacto ?? ''} onChange={set('contacto')} /></Campo>
        <Campo etiqueta="Estado"><select className={inputCls} value={v.estado} onChange={set('estado')}><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="bloqueado">Bloqueado</option></select></Campo>
        {v.estado === 'bloqueado' && <Campo etiqueta="Motivo del bloqueo"><input className={inputCls} value={v.motivoBloqueo ?? ''} onChange={set('motivoBloqueo')} /></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = guardar({ ...v, id: p?.id, motivoBloqueo: v.estado === 'bloqueado' ? v.motivoBloqueo : undefined }); if (err) setError(err); else onCerrar() }}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function Catalogo({ rol }: { rol: string }) {
  const d = useDatosDominio()
  const guardar = useStore((s) => s.guardarMaterial)
  const [nuevo, setNuevo] = useState<Omit<Material, 'id'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <Card titulo="Catálogo de materiales" accion={puedeEditarCatalogo(rol as never) ? <Boton variante="secundario" onClick={() => setNuevo({ codigo: '', nombre: '', unidad: '', categoria: '', critico: false })}>Nuevo material</Boton> : undefined}>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[560px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Código</th><th className="font-medium">Material</th><th className="font-medium">Unidad</th><th className="font-medium">Categoría</th><th /></tr></thead>
          <tbody>
            {[...d.materiales].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2">{m.codigo}</td><td className="font-medium">{m.nombre}</td><td>{m.unidad}</td><td>{m.categoria}</td>
                <td className="text-right">{m.critico && <Badge tono="rojo">Crítico</Badge>}{puedeEditarCatalogo(rol as never) && <button className="ml-2 text-xs text-slate-500 hover:text-marca" onClick={() => guardar({ ...m, critico: !m.critico })}>{m.critico ? 'Quitar crítico' : 'Marcar crítico'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nuevo && (
        <Modal abierto titulo="Nuevo material" onCerrar={() => setNuevo(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Código"><input className={inputCls} value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} /></Campo>
            <Campo etiqueta="Unidad"><input className={inputCls} value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })} placeholder="m³, m², kg, un" /></Campo>
            <Campo etiqueta="Nombre"><input className={inputCls} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Categoría"><input className={inputCls} value={nuevo.categoria} onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nuevo.critico} onChange={(e) => setNuevo({ ...nuevo, critico: e.target.checked })} />Material crítico</label>
          </div>
          {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setNuevo(null)}>Cancelar</Boton>
            <Boton onClick={() => { const err = guardar(nuevo); if (err) setError(err); else setNuevo(null) }}>Guardar</Boton>
          </div>
        </Modal>
      )}
    </Card>
  )
}
