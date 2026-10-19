// Comercial (v2, 07/17 workspace R06, 10 §2–4, 14 KCM): pipeline de oportunidades, clientes, visitas
// técnicas y propuestas. El editor de la propuesta arma el itemizado con el APU de los rendimientos
// reales de las obras; Gerencia da el V°B° antes de enviar y la adjudicación crea la obra.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import {
  ACCIONES_PROPUESTA, accionesPropuesta, alertasComerciales, clienteObservado, ESTADOS_LEAD, ESTADOS_PROPUESTA, estadoLead, estadoPropuesta, indicadoresComercial, margenBajo,
  META_HIT_RATE, mejorFuente, MOTIVOS_RECHAZO, ORIGENES_LEAD, propuestaVencida, puCostoLinea, puedeComercial, puedeVisita, rendimientosReales, TONO_LEAD, TONO_PROPUESTA, totalesPropuesta,
  type AccionPropuesta,
} from '../domain/comercial'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct, uid } from '../domain/formato'
import type { Cliente, EstadoLead, Lead, LineaPropuesta, Propuesta } from '../domain/types'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const COLUMNAS: EstadoLead[] = ['nuevo', 'en_estudio', 'propuesta_enviada', 'ganado']

export default function Comercial() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const [verLead, setVerLead] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<'lead' | 'cliente' | null>(null)
  const t = hoy()
  const k = indicadoresComercial(d, t)
  const alertas = alertasComerciales(d, t)
  const cliente = (id: string) => d.clientes.find((c) => c.id === id)
  const leads = [...d.leads].filter((l) => l.creado <= t).sort((a, b) => b.creado - a.creado)
  const cerrados = leads.filter((l) => ['perdido', 'descartado'].includes(estadoLead(l, t) ?? ''))
  const sel = leads.find((l) => l.id === verLead)
  const montoLead = (l: Lead) => {
    const ps = d.propuestas.filter((p) => p.leadId === l.id && estadoPropuesta(p, t) !== 'anulada')
    return ps.length ? totalesPropuesta(ps[ps.length - 1]).precio : l.montoEstimado
  }

  return (
    <div className="space-y-4">
      <Titulo sub="Oportunidades, visitas técnicas y propuestas con el APU de los rendimientos reales de las obras" accion={puedeComercial(rol) ? <>
        <Boton onClick={() => setNuevo('lead')}>Nuevo lead</Boton>
        <Boton variante="secundario" onClick={() => setNuevo('cliente')}>Nuevo cliente</Boton>
      </> : undefined}>
        Comercial
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Pipeline (KCM-01)" valor={mm(k.pipeline)} sub={`${k.enviadas} propuesta(s) enviadas vigentes`} />
        <Kpi etiqueta="Tasa de adjudicación (KCM-02)" valor={k.hitRate != null ? pct(k.hitRate, 0) : '—'} sub={`${k.resueltas90} resueltas en 90 días · meta ${pct(META_HIT_RATE, 0)}`} estado={k.hitRate == null ? undefined : k.hitRate >= META_HIT_RATE ? 'verde' : k.hitRate >= 0.1 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Adjudicado por monto (KCM-03)" valor={k.hitMonto != null ? pct(k.hitMonto, 0) : '—'} sub="del monto ofertado resuelto, 12 meses" />
        <Kpi etiqueta="Margen ofertado (KCM-04)" valor={k.margenPromedio != null ? pct(k.margenPromedio, 1) : '—'} sub={`ponderado, 12 meses · mínimo ${pct(d.config.umbrales.margenMinimo, 0)}`} estado={k.margenPromedio == null ? undefined : k.margenPromedio >= d.config.umbrales.margenMinimo ? 'verde' : 'amarillo'} />
        <Kpi etiqueta="Clientes recurrentes (KCM-06)" valor={k.recurrentes != null ? pct(k.recurrentes, 0) : '—'} sub={`${k.leadsAbiertos} leads abiertos`} />
      </div>
      {alertas.length > 0 && (
        <Card titulo="Alertas comerciales">
          <ul className="space-y-2 text-sm">
            {alertas.map((a, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2">
                <span><Badge tono={a.severidad === 'alta' ? 'rojo' : 'ambar'}>{a.regla}</Badge> <span className="font-medium">{a.titulo}</span><span className="block text-xs text-slate-600">{a.detalle}</span></span>
                {a.leadId && <button className="text-xs text-marca hover:underline" onClick={() => setVerLead(a.leadId!)}>Ver lead</button>}
                {a.propuestaId && <Link className="text-xs text-marca hover:underline" to={`/comercial/propuesta/${a.propuestaId}`}>Ver propuesta</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map((col) => {
          const items = leads.filter((l) => estadoLead(l, t) === col)
          return (
            <div key={col} className="rounded-xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium text-slate-700"><span>{ESTADOS_LEAD[col]}</span><span className="tabular text-xs text-slate-500">{items.length} · {mm(items.reduce((s, l) => s + montoLead(l), 0))}</span></div>
              <div className="space-y-2">
                {items.map((l) => (
                  <button key={l.id} onClick={() => setVerLead(l.id)} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-left text-sm hover:border-marca">
                    <div className="font-medium">{l.nombre}</div>
                    <div className="text-xs text-slate-500">{cliente(l.clienteId)?.nombre} · {ORIGENES_LEAD[l.origen]}</div>
                    <div className="tabular mt-1 flex justify-between text-xs"><span>{mm(montoLead(l))}</span>{l.fechaCierre != null && col === 'nuevo' && <span className={cx(l.fechaCierre - t <= 5 && 'font-medium text-amber-700')}>cierra {fmtFecha(l.fechaCierre)}</span>}</div>
                  </button>
                ))}
                {items.length === 0 && <p className="px-1 text-xs text-slate-400">—</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo={`Perdidos y descartados (${cerrados.length})`}>
          {cerrados.length === 0 ? <p className="text-sm text-slate-500">Ninguno.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {cerrados.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 py-2">
                  <button className="text-left hover:underline" onClick={() => setVerLead(l.id)}>{l.nombre}<span className="block text-xs text-slate-500">{cliente(l.clienteId)?.nombre} · {l.motivo}</span></button>
                  <Badge tono={TONO_LEAD[estadoLead(l, t)!]}>{ESTADOS_LEAD[estadoLead(l, t)!]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Clientes />
      </div>

      {sel && <DetalleLead l={sel} onCerrar={() => setVerLead(null)} />}
      {nuevo === 'lead' && <NuevoLead onCerrar={() => setNuevo(null)} />}
      {nuevo === 'cliente' && <EditarCliente onCerrar={() => setNuevo(null)} />}
    </div>
  )
}

function Clientes() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const [editar, setEditar] = useState<Cliente | null>(null)
  const t = hoy()
  return (
    <Card titulo={`Clientes (${d.clientes.length})`}>
      <ul className="divide-y divide-slate-100 text-sm">
        {d.clientes.map((c) => {
          const obs = clienteObservado(d, c.id, t)
          const obras = d.obras.filter((o) => o.mandante === c.nombre).length
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span>{c.nombre}<span className="block text-xs text-slate-500">{{ persona: 'Persona natural', empresa: 'Empresa', inmobiliaria: 'Inmobiliaria', publico: 'Organismo público' }[c.tipo]}{c.rut ? ` · ${c.rut}` : ''} · {obras} obra(s)</span></span>
              <span className="flex items-center gap-2">{obs ? <Badge tono="rojo">{obs}</Badge> : <Badge tono="verde">Activo</Badge>}{puedeComercial(rol) && <button className="text-xs text-marca hover:underline" onClick={() => setEditar(c)}>Editar</button>}</span>
            </li>
          )
        })}
      </ul>
      {editar && <EditarCliente c={editar} onCerrar={() => setEditar(null)} />}
    </Card>
  )
}

function EditarCliente({ c, onCerrar }: { c?: Cliente; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarCliente)
  const rol = useStore((s) => s.ui.rol)
  const [v, setV] = useState({ nombre: c?.nombre ?? '', rut: c?.rut ?? '', tipo: c?.tipo ?? 'empresa', estado: c?.estado ?? 'activo', contacto: c?.contacto ?? '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={c ? 'Editar cliente' : 'Nuevo cliente'} onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre o razón social"><input className={inputCls} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="RUT"><input className={inputCls} value={v.rut} onChange={(e) => setV({ ...v, rut: e.target.value })} /></Campo>
        <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as Cliente['tipo'] })}><option value="empresa">Empresa</option><option value="inmobiliaria">Inmobiliaria</option><option value="publico">Organismo público</option><option value="persona">Persona natural</option></select></Campo>
        <Campo etiqueta="Contacto"><input className={inputCls} value={v.contacto} onChange={(e) => setV({ ...v, contacto: e.target.value })} /></Campo>
        {rol === 'R01' && <Campo etiqueta="Estado (RULE-004)"><select className={inputCls} value={v.estado} onChange={(e) => setV({ ...v, estado: e.target.value as Cliente['estado'] })}><option value="activo">Activo</option><option value="bloqueado">Bloqueado</option></select></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = guardar({ ...(c ? { id: c.id } : {}), nombre: v.nombre, tipo: v.tipo, estado: v.estado, ...(v.rut.trim() ? { rut: v.rut.trim() } : {}), ...(v.contacto.trim() ? { contacto: v.contacto.trim() } : {}) }); if (err) setError(err); else onCerrar() }}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function NuevoLead({ onCerrar }: { onCerrar: () => void }) {
  const d = useDatosDominio()
  const crear = useStore((s) => s.crearLead)
  const [v, setV] = useState({ clienteId: d.clientes[0]?.id ?? '', nombre: '', origen: 'solicitud' as Lead['origen'], lineaNegocio: 'Edificación', ubicacion: '', montoEstimado: '', fechaCierre: '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo="Nuevo lead" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Proyecto"><input className={inputCls} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Cliente"><select className={inputCls} value={v.clienteId} onChange={(e) => setV({ ...v, clienteId: e.target.value })}>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Origen"><select className={inputCls} value={v.origen} onChange={(e) => setV({ ...v, origen: e.target.value as Lead['origen'] })}>{(Object.keys(ORIGENES_LEAD) as Lead['origen'][]).map((o) => <option key={o} value={o}>{ORIGENES_LEAD[o]}</option>)}</select></Campo>
        <Campo etiqueta="Línea de negocio"><input className={inputCls} value={v.lineaNegocio} onChange={(e) => setV({ ...v, lineaNegocio: e.target.value })} /></Campo>
        <Campo etiqueta="Ubicación"><input className={inputCls} value={v.ubicacion} onChange={(e) => setV({ ...v, ubicacion: e.target.value })} /></Campo>
        <Campo etiqueta="Monto estimado"><input type="number" className={inputCls} value={v.montoEstimado} onChange={(e) => setV({ ...v, montoEstimado: e.target.value })} /></Campo>
        <Campo etiqueta="Cierre de la licitación (opcional)"><input type="date" className={inputCls} value={v.fechaCierre} onChange={(e) => setV({ ...v, fechaCierre: e.target.value })} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = crear({ clienteId: v.clienteId, nombre: v.nombre, origen: v.origen, lineaNegocio: v.lineaNegocio, ubicacion: v.ubicacion, montoEstimado: Number(v.montoEstimado || 0), ...(v.fechaCierre ? { fechaCierre: dia(v.fechaCierre) } : {}) }); if (err) setError(err); else onCerrar() }}>Crear</Boton>
      </div>
    </Modal>
  )
}

function DetalleLead({ l, onCerrar }: { l: Lead; onCerrar: () => void }) {
  const d = useDatosDominio()
  const ui = useStore((s) => s.ui)
  const accion = useStore((s) => s.accionLead)
  const agendar = useStore((s) => s.agendarVisita)
  const cerrarVisita = useStore((s) => s.cerrarVisita)
  const crearPropuesta = useStore((s) => s.crearPropuesta)
  const navigate = useNavigate()
  const t = hoy()
  const e = estadoLead(l, t)!
  const [txt, setTxt] = useState('')
  const [visita, setVisita] = useState({ fecha: iso(t + 2), responsable: ui.usuario })
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const ps = d.propuestas.filter((p) => p.leadId === l.id).sort((a, b) => b.creado - a.creado)
  const vs = d.visitasTecnicas.filter((v) => v.leadId === l.id).sort((a, b) => a.fecha - b.fecha)
  const abierto = e === 'nuevo' || e === 'en_estudio' || e === 'propuesta_enviada'
  const ed = puedeComercial(ui.rol)
  return (
    <Modal abierto titulo={`Lead N° ${l.numero} · ${l.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2"><Badge tono={TONO_LEAD[e]}>{ESTADOS_LEAD[e]}</Badge><Badge tono="gris">{ORIGENES_LEAD[l.origen]}</Badge></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
          <dt>Cliente</dt><dd>{d.clientes.find((c) => c.id === l.clienteId)?.nombre}</dd>
          <dt>Línea · ubicación</dt><dd>{l.lineaNegocio} · {l.ubicacion || '—'}</dd>
          <dt>Monto estimado</dt><dd>{mm(l.montoEstimado)}</dd>
          {l.fechaCierre != null && <><dt>Cierre</dt><dd>{fmtFecha(l.fechaCierre)}</dd></>}
          <dt>Responsable</dt><dd>{l.responsable ?? 'sin asignar'}</dd>
          {l.motivo && <><dt>Motivo</dt><dd>{l.motivo}</dd></>}
        </dl>
        <div>
          <div className="mb-1 font-medium">Propuestas</div>
          {ps.length === 0 ? <p className="text-slate-500">Sin propuestas.</p> : (
            <ul className="divide-y divide-slate-100">
              {ps.map((p) => { const ep = estadoPropuesta(p, t)!; return (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link className="text-marca hover:underline" to={`/comercial/propuesta/${p.id}`}>N° {p.numero}{p.version > 1 ? ` v${p.version}` : ''} · {mm(totalesPropuesta(p).precio)}</Link>
                  <span><Badge tono={TONO_PROPUESTA[ep]}>{ESTADOS_PROPUESTA[ep]}</Badge>{propuestaVencida(p, t) && <Badge tono="rojo">Vencida</Badge>}</span>
                </li>
              ) })}
            </ul>
          )}
          {ed && (e === 'nuevo' || e === 'en_estudio') && !ps.some((p) => ['borrador', 'en_revision', 'enviada'].includes(estadoPropuesta(p, t) ?? '')) && (
            <Boton variante="secundario" className="mt-2" onClick={() => { const r = crearPropuesta(l.id); if (r.error) setError(r.error); else navigate(`/comercial/propuesta/${r.id}`) }}>Preparar propuesta</Boton>
          )}
        </div>
        <div>
          <div className="mb-1 font-medium">Visitas técnicas</div>
          {vs.length === 0 && <p className="text-slate-500">Sin visitas.</p>}
          <ul className="space-y-1">
            {vs.map((v) => (
              <li key={v.id}>
                <span>{fmtFecha(v.fecha)} · {v.responsable} · <Badge tono={v.estado === 'realizada' ? 'verde' : v.estado === 'cancelada' ? 'gris' : 'azul'}>{{ agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' }[v.estado]}</Badge></span>
                {v.notas && <span className="block text-xs text-slate-500">{v.notas}</span>}
                {v.estado === 'agendada' && puedeVisita(ui.rol) && (
                  <span className="mt-1 flex gap-2">
                    <input className={cx(inputCls, 'py-1')} placeholder="Notas del levantamiento" value={notas[v.id] ?? ''} onChange={(ev) => setNotas({ ...notas, [v.id]: ev.target.value })} />
                    <Boton className="min-h-0 py-1" onClick={() => setError(cerrarVisita(v.id, 'realizada', notas[v.id] ?? ''))}>Realizada</Boton>
                    <Boton variante="secundario" className="min-h-0 py-1" onClick={() => setError(cerrarVisita(v.id, 'cancelada', notas[v.id] ?? ''))}>Cancelar</Boton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {abierto && puedeVisita(ui.rol) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input type="date" className={cx(inputCls, 'w-40 py-1')} value={visita.fecha} onChange={(ev) => setVisita({ ...visita, fecha: ev.target.value })} />
              <input className={cx(inputCls, 'w-48 py-1')} value={visita.responsable} onChange={(ev) => setVisita({ ...visita, responsable: ev.target.value })} />
              <Boton variante="secundario" className="min-h-0 py-1" onClick={() => setError(agendar({ leadId: l.id, fecha: dia(visita.fecha), responsable: visita.responsable }))}>Agendar visita</Boton>
            </div>
          )}
        </div>
        {ed && abierto && <Campo etiqueta="Responsable (para estudiar) o motivo (para perder o descartar)"><input className={inputCls} value={txt} onChange={(ev) => setTxt(ev.target.value)} /></Campo>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      {ed && abierto && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {e === 'nuevo' && <Boton onClick={() => setError(accion(l.id, 'estudiar', { responsable: txt || ui.usuario }))}>Estudiar</Boton>}
          {(e === 'nuevo' || e === 'en_estudio') && <Boton variante="secundario" onClick={() => setError(accion(l.id, 'descartar', { motivo: txt }))}>Descartar</Boton>}
          <Boton variante="peligro" onClick={() => setError(accion(l.id, 'perder', { motivo: txt }))}>Perdido</Boton>
        </div>
      )}
    </Modal>
  )
}

// ───────────────────────── Editor de la propuesta ─────────────────────────

export function PropuestaDetalle() {
  const { id } = useParams()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const editar = useStore((s) => s.editarPropuesta)
  const accion = useStore((s) => s.accionPropuesta)
  const crear = useStore((s) => s.crearPropuesta)
  const setObra = useStore((s) => s.setObra)
  const navigate = useNavigate()
  const t = hoy()
  const p = d.propuestas.find((x) => x.id === id)
  const catalogo = useMemo(() => rendimientosReales(d, t - 1), [d, t])
  const [modal, setModal] = useState<AccionPropuesta | null>(null)
  const [catalogoAbierto, setCatalogoAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!p) return <Vacio titulo="Propuesta no encontrada" texto="Vuelve al pipeline comercial." accion={<Link to="/comercial" className="text-marca">Ir a Comercial</Link>} />
  const lead = d.leads.find((l) => l.id === p.leadId)!
  const cliente = d.clientes.find((c) => c.id === lead.clienteId)
  const e = estadoPropuesta(p, t)!
  const tot = totalesPropuesta(p)
  const editable = e === 'borrador' && puedeComercial(rol)
  const acciones = accionesPropuesta(p, t, rol)
  const minimo = d.config.umbrales.margenMinimo
  const observado = clienteObservado(d, lead.clienteId, t)
  const setLineas = (lineas: LineaPropuesta[]) => setError(editar(p.id, { lineas }))
  const obra = d.obras.find((o) => o.id === p.obraId)

  return (
    <div className="space-y-4">
      <Titulo sub={`${cliente?.nombre ?? ''} · ${lead.nombre} · creada el ${fmtFecha(p.creado)} por ${p.creadoPor}`} accion={<Link to="/comercial" className="text-sm text-marca hover:underline">← Pipeline</Link>}>
        Propuesta N° {p.numero}{p.version > 1 ? ` v${p.version}` : ''}
      </Titulo>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={TONO_PROPUESTA[e]}>{ESTADOS_PROPUESTA[e]}</Badge>
        {propuestaVencida(p, t) && <Badge tono="rojo">Validez vencida</Badge>}
        {p.aprobacion && <Badge tono="verde">V°B° Gerencia {fmtFecha(p.aprobacion.fecha)}{p.aprobacion.justificacion ? ` · ${p.aprobacion.justificacion}` : ''}</Badge>}
        {p.motivoRechazo && <Badge tono="rojo">Rechazo: {MOTIVOS_RECHAZO[p.motivoRechazo]}</Badge>}
        {obra && <button className="text-sm text-marca hover:underline" onClick={() => { setObra(obra.id); navigate('/obra') }}>Ver obra creada: {obra.nombre} →</button>}
        <span className="flex-1" />
        {acciones.map((a) => <Boton key={a} variante={a === 'anular' || a === 'devolver' || a === 'rechazar' || a === 'desierta' ? 'secundario' : 'primario'} onClick={() => { setError(null); setModal(a) }}>{ACCIONES_PROPUESTA[a]}</Boton>)}
        {(propuestaVencida(p, t) || e === 'rechazada') && puedeComercial(rol) && ['nuevo', 'en_estudio', 'propuesta_enviada'].includes(estadoLead(lead, t) ?? '') && (
          <Boton variante="secundario" onClick={() => { const r = crear(lead.id, p.id); if (r.error) setError(r.error); else navigate(`/comercial/propuesta/${r.id}`) }}>Nueva versión</Boton>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {(margenBajo(p, minimo) || observado) && e !== 'adjudicada' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {margenBajo(p, minimo) && `Margen de ${pct(p.margen, 1)} bajo el mínimo de ${pct(minimo, 0)} (RULE-005). `}{observado && `${observado} (RULE-004). `}El V°B° de Gerencia requiere justificación.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Costo directo" valor={mm(tot.cd)} sub={`${p.lineas.length} partidas`} />
        <Kpi etiqueta="Gastos generales" valor={mm(tot.gg)} sub={tot.cd > 0 ? `${pct(tot.gg / tot.cd, 1)} del costo directo` : ''} />
        <Kpi etiqueta="Utilidad" valor={mm(tot.utilidad)} sub={`margen ${pct(p.margen, 1)}`} estado={margenBajo(p, minimo) ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Precio de la oferta" valor={mm(tot.precio)} sub="neto, sin IVA" />
        <Kpi etiqueta="Plazo y validez" valor={`${p.plazoDias} días`} sub={`válida hasta el ${fmtFecha(p.validezHasta)}`} />
      </div>

      {editable && (
        <Card titulo="Parámetros de la oferta">
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Gastos generales ($)"><input type="number" className={inputCls} defaultValue={p.gg} onBlur={(ev) => setError(editar(p.id, { gg: Number(ev.target.value || 0) }))} /></Campo>
            <Campo etiqueta="Margen objetivo (%)"><input type="number" step="0.5" className={inputCls} defaultValue={Math.round(p.margen * 1000) / 10} onBlur={(ev) => setError(editar(p.id, { margen: Number(ev.target.value || 0) / 100 }))} /></Campo>
            <Campo etiqueta="Plazo (días)"><input type="number" className={inputCls} defaultValue={p.plazoDias} onBlur={(ev) => setError(editar(p.id, { plazoDias: Number(ev.target.value || 0) }))} /></Campo>
            <Campo etiqueta="Validez hasta"><input type="date" className={inputCls} defaultValue={iso(p.validezHasta)} onBlur={(ev) => ev.target.value && setError(editar(p.id, { validezHasta: dia(ev.target.value) }))} /></Campo>
            <div className="sm:col-span-4"><Campo etiqueta="Exclusiones"><input className={inputCls} defaultValue={p.exclusiones} onBlur={(ev) => setError(editar(p.id, { exclusiones: ev.target.value }))} /></Campo></div>
          </div>
        </Card>
      )}

      <Card titulo="Itemizado y APU" accion={editable ? <Boton variante="secundario" onClick={() => setCatalogoAbierto(!catalogoAbierto)}>{catalogoAbierto ? 'Cerrar catálogo' : '+ Desde rendimientos reales'}</Boton> : undefined}>
        {catalogoAbierto && editable && <Catalogo catalogo={catalogo} onAgregar={(l) => setLineas([...p.lineas, l])} siguiente={`${p.lineas.length + 1}.1`} />}
        {p.lineas.length === 0 ? <p className="text-sm text-slate-500">Agrega partidas desde el catálogo de rendimientos reales o a mano.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[820px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Ítem</th><th className="text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">PU costo</th><th className="font-medium">PU venta</th><th className="font-medium">Total venta</th><th className="text-left font-medium">APU</th><th /></tr></thead>
              <tbody>
                {p.lineas.map((l) => {
                  const pu = puCostoLinea(l)
                  return (
                    <tr key={l.id} className="border-b border-slate-100 text-right align-top">
                      <td className="py-2 text-left">{l.codigo}</td>
                      <td className="text-left">{l.descripcion}<div className="text-xs text-slate-500">{l.capitulo}</div></td>
                      <td className="whitespace-nowrap">{editable ? <input type="number" className={cx(inputCls, 'w-28 py-1 text-right')} defaultValue={l.cantidad} onBlur={(ev) => setLineas(p.lineas.map((x) => (x.id === l.id ? { ...x, cantidad: Number(ev.target.value || 0) } : x)))} /> : num(l.cantidad, 1)} {l.unidad}</td>
                      <td>{clp(pu)}</td>
                      <td>{clp(Math.round(pu * tot.factor))}</td>
                      <td>{clp(Math.round(pu * tot.factor * l.cantidad))}</td>
                      <td className="text-left text-xs text-slate-500">{l.recursos.map((r) => `${r.tipo} ${num(r.cantPorUnidad, 3)} ${r.unidad} × ${clp(r.precio)}`).join(' · ')}{l.fuente && <div className={cx(l.fuente.startsWith('Real') ? 'text-emerald-700' : 'text-slate-500')}>{l.fuente}</div>}</td>
                      <td>{editable && <button className="text-xs text-slate-500 hover:text-crit" onClick={() => setLineas(p.lineas.filter((x) => x.id !== l.id))}>Quitar</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="text-right font-semibold"><td colSpan={5} className="py-2">Precio de la oferta (incluye GG y utilidad prorrateados)</td><td>{clp(tot.precio)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        )}
        {editable && <LineaManual onAgregar={(l) => setLineas([...p.lineas, l])} siguiente={`${p.lineas.length + 1}.1`} />}
        <p className="mt-2 text-xs text-slate-500">Exclusiones: {p.exclusiones || '—'}</p>
      </Card>

      {modal && <ModalAccion p={p} accion={modal} onCerrar={() => setModal(null)} onAccion={(x) => { const err = accion(p.id, modal, x); if (err) return err; setModal(null); return null }} />}
    </div>
  )
}

function Catalogo({ catalogo, onAgregar, siguiente }: { catalogo: ReturnType<typeof rendimientosReales>; onAgregar: (l: LineaPropuesta) => void; siguiente: string }) {
  const [filtro, setFiltro] = useState('')
  const [cant, setCant] = useState<Record<string, string>>({})
  const lista = catalogo.filter((r) => r.descripcion.toLowerCase().includes(filtro.toLowerCase()))
  return (
    <div className="mb-3 rounded-lg border border-slate-200 p-3">
      <input className={cx(inputCls, 'mb-2')} placeholder="Buscar partida (ej.: hormigón, tabiquería)" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <div className="max-h-80 overflow-auto">
        <table className="tabular w-full text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
          <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-1 text-left font-medium">Partida</th><th className="font-medium">PU presupuestado</th><th className="font-medium">PU real</th><th className="font-medium">HH/u pres. → real</th><th className="text-left font-medium">Fuente</th><th /></tr></thead>
          <tbody>
            {lista.map((r) => {
              const f = mejorFuente(r) ?? r.fuentes[0]
              const real = f.puReal != null
              return (
                <tr key={r.clave} className="border-b border-slate-100 text-right">
                  <td className="py-1.5 text-left">{r.descripcion}<div className="text-xs text-slate-500">{r.unidad}</div></td>
                  <td>{clp(f.puPres)}</td>
                  <td className={cx(real && f.puReal! > f.puPres * 1.03 && 'text-crit', real && f.puReal! < f.puPres * 0.97 && 'text-emerald-700')}>{real ? clp(f.puReal!) : '—'}</td>
                  <td>{f.hhPres != null ? `${num(f.hhPres, 2)} → ${f.hhReal != null ? num(f.hhReal, 2) : '—'}` : '—'}</td>
                  <td className="text-left text-xs text-slate-500">{f.obra} · {pct(f.avance, 0)} ejecutado{r.fuentes.length > 1 ? ` · +${r.fuentes.length - 1} obra(s)` : ''}</td>
                  <td className="whitespace-nowrap">
                    <input type="number" className={cx(inputCls, 'w-24 py-1 text-right')} placeholder="Cantidad" value={cant[r.clave] ?? ''} onChange={(e) => setCant({ ...cant, [r.clave]: e.target.value })} />
                    <button className="ml-2 text-xs text-marca hover:underline" onClick={() => {
                      const base = r.fuentes[0]
                      onAgregar({
                        id: uid('lp'), codigo: siguiente, capitulo: r.capitulo, descripcion: r.descripcion, unidad: r.unidad, cantidad: Number(cant[r.clave] || 1),
                        recursos: real ? f.recursosReales : [{ tipo: 'OTRO', descripcion: r.descripcion, cantPorUnidad: 1, unidad: r.unidad, precio: base.puPres }], fuente: real ? `Real · ${f.obra}` : `Presupuesto · ${base.obra}`,
                      })
                      setCant({ ...cant, [r.clave]: '' })
                    }}>Agregar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">PU real = costo registrado / cantidad ejecutada en partidas con al menos 20 % de avance; las HH reales salen de los RDO. Rojo: el real supera al presupuestado en más de 3 %.</p>
    </div>
  )
}

function LineaManual({ onAgregar, siguiente }: { onAgregar: (l: LineaPropuesta) => void; siguiente: string }) {
  const [v, setV] = useState({ descripcion: '', unidad: 'gl', cantidad: '1', pu: '' })
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-[3fr_1fr_1fr_1fr_auto]">
      <input className={inputCls} placeholder="Partida a mano (ej.: Aseo final de obra)" value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} />
      <input className={inputCls} placeholder="Unidad" value={v.unidad} onChange={(e) => setV({ ...v, unidad: e.target.value })} />
      <input type="number" className={inputCls} placeholder="Cantidad" value={v.cantidad} onChange={(e) => setV({ ...v, cantidad: e.target.value })} />
      <input type="number" className={inputCls} placeholder="PU costo" value={v.pu} onChange={(e) => setV({ ...v, pu: e.target.value })} />
      <Boton variante="secundario" onClick={() => {
        if (!v.descripcion.trim() || !(Number(v.pu) > 0)) return
        onAgregar({ id: uid('lp'), codigo: siguiente, capitulo: 'Otros', descripcion: v.descripcion.trim(), unidad: v.unidad, cantidad: Number(v.cantidad || 1), recursos: [{ tipo: 'OTRO', descripcion: v.descripcion.trim(), cantPorUnidad: 1, unidad: v.unidad, precio: Number(v.pu) }], fuente: 'Manual' })
        setV({ descripcion: '', unidad: 'gl', cantidad: '1', pu: '' })
      }}>Agregar</Boton>
    </div>
  )
}

function ModalAccion({ p, accion, onCerrar, onAccion }: { p: Propuesta; accion: AccionPropuesta; onCerrar: () => void; onAccion: (x: { texto?: string; motivo?: Propuesta['motivoRechazo']; fechaInicio?: number }) => string | null }) {
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState<NonNullable<Propuesta['motivoRechazo']>>('precio')
  const [inicio, setInicio] = useState(iso(hoy() + 14))
  const [error, setError] = useState<string | null>(null)
  const ayuda: Partial<Record<AccionPropuesta, string>> = {
    enviar_revision: 'Gerencia revisa la oferta y da su V°B° para enviarla.',
    aprobar: 'Si el margen está bajo el mínimo o el cliente está observado, la justificación es obligatoria.',
    enviar: 'Queda enviada al mandante; inicia el seguimiento (RULE-003).',
    adjudicar: `Se crea la obra en planificación con este itemizado como presupuesto (${p.lineas.length} partidas), el margen y el plazo de la oferta. Luego Oficina Técnica arma la Carta Gantt y se asigna el equipo.`,
    rechazar: 'El lead queda perdido con el motivo del rechazo.',
    desierta: 'El lead queda perdido (licitación desierta).',
  }
  return (
    <Modal abierto titulo={ACCIONES_PROPUESTA[accion]} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        {ayuda[accion] && <p className="text-slate-600">{ayuda[accion]}</p>}
        {accion === 'rechazar' && <Campo etiqueta="Motivo"><select className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)}>{(Object.keys(MOTIVOS_RECHAZO) as (typeof motivo)[]).map((m) => <option key={m} value={m}>{MOTIVOS_RECHAZO[m]}</option>)}</select></Campo>}
        {accion === 'adjudicar' && <Campo etiqueta="Inicio de obra"><input type="date" className={inputCls} value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>}
        {['aprobar', 'devolver', 'anular'].includes(accion) && <Campo etiqueta={accion === 'aprobar' ? 'Justificación (si corresponde)' : 'Motivo'}><input className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => setError(onAccion({ texto, motivo: accion === 'rechazar' ? motivo : undefined, fechaInicio: accion === 'adjudicar' ? dia(inicio) : undefined }))}>{ACCIONES_PROPUESTA[accion]}</Boton>
      </div>
    </Modal>
  )
}
