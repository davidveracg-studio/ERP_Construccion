// Órdenes de cambio (v1.1, 10 §10): listado con indicadores y detalle con valorización, aprobación
// interna (Gerencia sobre el 5 % del contrato) y del mandante. El mandante (R11) ve el mismo detalle
// sin costos ni márgenes.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { calcularObra } from '../domain/evm'
import { fmtFecha, hoy } from '../domain/fechas'
import { clp, mm, num, pct } from '../domain/formato'
import {
  ACCIONES_OC, accionesOC, CAUSAS_OC, editableOC, ETAPAS_OC, etapaOC, indicadoresOC, lineaExistente, montosOC, requiereGerencia,
  TIPOS_OC, TONO_ETAPA_OC, UMBRAL_GERENCIA_OC, type AccionOC,
} from '../domain/ordenesCambio'
import { puCosto } from '../domain/presupuesto'
import { TIPOS_RECURSO, type LineaOrdenCambio, type OrdenCambio, type TipoOrdenCambio, type TipoRecurso } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

export function EtapaOCBadge({ oc, t }: { oc: OrdenCambio; t: number }) {
  const e = etapaOC(oc, t)
  return e ? <Badge tono={TONO_ETAPA_OC[e]}>{ETAPAS_OC[e]}</Badge> : null
}

export default function OrdenesCambio() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [nueva, setNueva] = useState(false)
  if (!c) return null
  const t = hoy()
  const ocs = d.ordenesCambio.filter((o) => o.obraId === c.obra.id).sort((a, b) => b.numero - a.numero)
  const ind = indicadoresOC(ocs, t, c.venta)
  const riesgo = c.extraNoAprobado.reduce((s, x) => s + x.monto, 0)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.mandante} · adicionales, obras extraordinarias, deductivos y aumentos de plazo, con su valorización y aprobación`}
        accion={rol === 'R05' || rol === 'R02' ? <Boton onClick={() => setNueva(true)}>Nueva orden de cambio</Boton> : undefined}>
        Órdenes de cambio
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Aprobadas por el mandante" valor={mm(ind.montoAprobado)} sub={`${ind.aprobadas} órdenes · ${ind.fraccionContrato != null ? pct(ind.fraccionContrato, 1) : '—'} del contrato`} />
        <Kpi etiqueta="Esperando al mandante" valor={mm(ind.montoPendiente)} sub={`${ind.pendientesMandante} órdenes`} estado={ind.pendientesMandante > 0 ? 'amarillo' : undefined} />
        <Kpi etiqueta="Días de aprobación del mandante" valor={ind.diasAprobacionMandante != null ? num(ind.diasAprobacionMandante, 0) : '—'} />
        <Kpi etiqueta="Plazo aprobado" valor={`${ind.diasPlazoAprobados > 0 ? '+' : ''}${ind.diasPlazoAprobados} días`} sub={`término contractual ${fmtFecha(c.terminoContractual - 1)}`} />
        <Kpi etiqueta="Trabajo en riesgo de no pago" valor={mm(riesgo)} estado={riesgo > 0 ? 'rojo' : 'verde'} ayuda="RULE-105: avance en partidas extraordinarias sin orden aprobada por el mandante" />
      </div>

      <Card>
        {ocs.length === 0 ? <Vacio titulo="Sin órdenes de cambio" texto="Registra adicionales, deductivos o aumentos de plazo del contrato." /> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Orden</th><th className="text-left font-medium">Tipo</th>
                  <th className="font-medium">Venta</th><th className="font-medium">Plazo</th><th className="text-left font-medium">Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {ocs.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left"><div className="font-medium">N° {o.numero} · {o.titulo}</div><div className="text-xs text-slate-500">{CAUSAS_OC[o.causa]}</div></td>
                    <td className="text-left">{TIPOS_OC[o.tipo]}</td>
                    <td>{mm(montosOC(o).venta)}</td><td>{o.diasPlazo ? `${o.diasPlazo > 0 ? '+' : ''}${o.diasPlazo} d` : '—'}</td>
                    <td className="text-left"><EtapaOCBadge oc={o} t={t} /></td>
                    <td><Link to={`/ordenes-cambio/${o.id}`} className="text-marca hover:underline">Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {nueva && <NuevaOC obraId={c.obra.id} onCerrar={() => setNueva(false)} />}
    </div>
  )
}

function NuevaOC({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearOrdenCambio)
  const nav = useNavigate()
  const [v, setV] = useState<Pick<OrdenCambio, 'tipo' | 'titulo' | 'causa' | 'descripcion'>>({ tipo: 'aumento', titulo: '', causa: 'mandante', descripcion: '' })
  return (
    <Modal abierto titulo="Nueva orden de cambio" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Título"><input className={inputCls} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ej.: Mayor obra de excavación en sector norte" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo">
            <select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoOrdenCambio })}>
              {(Object.keys(TIPOS_OC) as TipoOrdenCambio[]).map((k) => <option key={k} value={k}>{TIPOS_OC[k]}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Causa">
            <select className={inputCls} value={v.causa} onChange={(e) => setV({ ...v, causa: e.target.value as OrdenCambio['causa'] })}>
              {(Object.keys(CAUSAS_OC) as OrdenCambio['causa'][]).map((k) => <option key={k} value={k}>{CAUSAS_OC[k]}</option>)}
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea rows={3} className={inputCls} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Campo>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!v.titulo.trim()} onClick={() => { const oc = crear(obraId, { ...v, titulo: v.titulo.trim() }); onCerrar(); nav(`/ordenes-cambio/${oc.id}`) }}>Crear borrador</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Detalle ─────────────────────────

export function DetalleOC() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const editar = useStore((s) => s.editarOrdenCambio)
  const [accion, setAccion] = useState<AccionOC | null>(null)
  const oc = d.ordenesCambio.find((o) => o.id === id)
  if (!oc) return <Vacio titulo="Orden de cambio no encontrada" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/ordenes-cambio" className="text-marca">Volver</Link>} />
  const t = hoy()
  const mandante = rol === 'R11'
  const obra = d.obras.find((o) => o.id === oc.obraId)!
  const venta = calcularObra(d, obra.id, t).venta
  const m = montosOC(oc)
  const puedeEditar = editableOC(oc, t) && (rol === 'R05' || rol === 'R02')
  const acciones = accionesOC(oc, t, rol, venta)
  const gerencia = requiereGerencia(oc, venta)
  const partidas = d.partidas.filter((p) => p.obraId === obra.id && !p.ordenCambioId)
  const setLinea = (i: number, l: LineaOrdenCambio) => editar(oc.id, { lineas: oc.lineas.map((x, j) => (j === i ? l : x)) })
  const historial = [
    { fecha: oc.creada, texto: 'Creada en borrador' },
    ...oc.devoluciones.filter(() => !mandante).map((x) => ({ fecha: x.fecha, texto: `Devuelta a borrador · ${x.autor}: “${x.texto}”` })),
    ...(oc.valorizada != null ? [{ fecha: oc.valorizada, texto: 'Valorizada por Oficina Técnica' }] : []),
    ...(oc.aprobadaInterna != null && !mandante ? [{ fecha: oc.aprobadaInterna, texto: `Aprobada internamente por ${oc.aprobadaInternaPor ?? ''}` }] : []),
    ...(oc.presentada != null ? [{ fecha: oc.presentada, texto: 'Presentada al mandante' }] : []),
    ...(oc.aprobadaMandante != null ? [{ fecha: oc.aprobadaMandante, texto: 'Aprobada por el mandante: cantidades, venta y plazo del contrato actualizados' }] : []),
    ...(oc.rechazada != null ? [{ fecha: oc.rechazada, texto: `Rechazada por el mandante: “${oc.motivoRechazo ?? ''}”` }] : []),
    ...(oc.anulada != null ? [{ fecha: oc.anulada, texto: `Anulada: “${oc.motivoAnulacion ?? ''}”` }] : []),
  ].filter((h) => h.fecha <= t).sort((a, b) => a.fecha - b.fecha)

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${TIPOS_OC[oc.tipo]} · ${CAUSAS_OC[oc.causa]}`}
        accion={acciones.length ? <>{acciones.map((a) => (
          <Boton key={a} variante={a === 'anular' || a === 'rechazar' || a === 'devolver' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_OC[a]}</Boton>
        ))}</> : undefined}>
        <span className="flex flex-wrap items-center gap-2">Orden de cambio N° {oc.numero}<EtapaOCBadge oc={oc} t={t} /></span>
      </Titulo>
      <Link to={mandante ? '/mandante' : '/ordenes-cambio'} className="text-sm text-marca">← {mandante ? 'Portal del mandante' : 'Órdenes de cambio'}</Link>
      {!mandante && gerencia && etapaOC(oc, t) === 'valorizada' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Supera el {pct(UMBRAL_GERENCIA_OC, 0)} del contrato ({pct(Math.abs(m.venta) / venta, 1)}): la aprobación interna la da Gerencia (RN-P04).</p>
      )}

      <div className="grid gap-4 xl:grid-cols-[3fr_1fr] [&>*]:min-w-0">
        <Card titulo={puedeEditar ? <input className={cx(inputCls, 'py-1 font-semibold')} defaultValue={oc.titulo} onBlur={(e) => e.target.value.trim() && editar(oc.id, { titulo: e.target.value.trim() })} aria-label="Título" /> : oc.titulo}>
          {puedeEditar
            ? <textarea rows={2} className={inputCls} defaultValue={oc.descripcion} onBlur={(e) => editar(oc.id, { descripcion: e.target.value })} aria-label="Descripción" />
            : <p className="text-sm text-slate-700">{oc.descripcion}</p>}

          {oc.tipo !== 'plazo' && (
            <div className="mt-4 overflow-x-auto">
              <table className="tabular w-full min-w-[640px] text-sm [&_td+td]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">PU venta</th>
                    {!mandante && <th className="font-medium">PU costo</th>}<th className="font-medium">Venta</th>{puedeEditar && <th />}
                  </tr>
                </thead>
                <tbody>
                  {oc.lineas.map((l, i) => {
                    const p = l.partidaId ? d.partidas.find((x) => x.id === l.partidaId) : undefined
                    const unidad = p?.unidad ?? l.nueva?.unidad ?? ''
                    return (
                      <tr key={i} className="border-b border-slate-100 text-right align-top">
                        <td className="py-1.5 text-left">
                          {l.nueva ? (puedeEditar ? (
                            <div className="grid grid-cols-[70px_1fr_60px] gap-1">
                              <input className={cx(inputCls, 'py-1 text-xs')} value={l.nueva.codigo} onChange={(e) => setLinea(i, { ...l, nueva: { ...l.nueva!, codigo: e.target.value } })} aria-label="Código" />
                              <input className={cx(inputCls, 'py-1 text-xs')} value={l.nueva.descripcion} onChange={(e) => setLinea(i, { ...l, nueva: { ...l.nueva!, descripcion: e.target.value } })} placeholder="Descripción" aria-label="Descripción" />
                              <input className={cx(inputCls, 'py-1 text-xs')} value={l.nueva.unidad} onChange={(e) => setLinea(i, { ...l, nueva: { ...l.nueva!, unidad: e.target.value } })} placeholder="Unidad" aria-label="Unidad" />
                              <select className={cx(inputCls, 'col-span-3 py-1 text-xs')} value={l.nueva.tipoCosto} onChange={(e) => setLinea(i, { ...l, nueva: { ...l.nueva!, tipoCosto: e.target.value as TipoRecurso } })} aria-label="Tipo de costo">
                                {(Object.keys(TIPOS_RECURSO) as TipoRecurso[]).map((k) => <option key={k} value={k}>Costo: {TIPOS_RECURSO[k]}</option>)}
                              </select>
                            </div>
                          ) : <><span className="font-medium">{l.nueva.codigo}</span> {l.nueva.descripcion} <Badge tono="azul">Nueva</Badge></>)
                            : <>{p?.codigo} {p?.descripcion}</>}
                        </td>
                        <td>
                          {puedeEditar ? <input type="number" step="any" className={cx(inputCls, 'ml-auto w-24 py-1 text-right')} value={l.cantidad} onChange={(e) => setLinea(i, { ...l, cantidad: Number(e.target.value) })} aria-label="Cantidad" />
                            : num(l.cantidad, 2)} <span className="text-xs text-slate-500">{unidad}</span>
                        </td>
                        <td>{puedeEditar && l.nueva ? <input type="number" className={cx(inputCls, 'ml-auto w-28 py-1 text-right')} value={l.puVenta} onChange={(e) => setLinea(i, { ...l, puVenta: Number(e.target.value) })} aria-label="PU venta" /> : clp(l.puVenta)}</td>
                        {!mandante && <td>{puedeEditar ? <input type="number" className={cx(inputCls, 'ml-auto w-28 py-1 text-right')} value={l.puCosto} onChange={(e) => setLinea(i, { ...l, puCosto: Number(e.target.value) })} aria-label="PU costo" /> : clp(l.puCosto)}</td>}
                        <td>{mm(l.cantidad * l.puVenta)}</td>
                        {puedeEditar && <td><button onClick={() => editar(oc.id, { lineas: oc.lineas.filter((_, j) => j !== i) })} className="px-1 text-xs text-crit" aria-label="Quitar línea">✕</button></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {puedeEditar && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <select className={cx(inputCls, 'w-auto py-1.5')} value="" aria-label="Agregar partida existente"
                    onChange={(e) => { const p = partidas.find((x) => x.id === e.target.value); if (p) editar(oc.id, { lineas: [...oc.lineas, lineaExistente(p, puCosto(p), oc.tipo === 'disminucion' ? -1 : 1)] }) }}>
                    <option value="">+ Ajustar partida existente…</option>
                    {partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}
                  </select>
                  <Boton variante="secundario" className="min-h-0 py-1.5" onClick={() => editar(oc.id, {
                    lineas: [...oc.lineas, { nueva: { codigo: `OC${oc.numero}.${oc.lineas.filter((x) => x.nueva).length + 1}`, descripcion: '', unidad: 'gl', tipoCosto: 'SUB' }, cantidad: 1, puVenta: 0, puCosto: 0 }],
                  })}>+ Partida nueva</Boton>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card titulo="Valorización">
          <dl className="tabular space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Venta</dt><dd className="font-semibold">{mm(m.venta)}</dd></div>
            {!mandante && <div className="flex justify-between"><dt className="text-slate-600">Costo</dt><dd>{mm(m.costo)}</dd></div>}
            {!mandante && <div className="flex justify-between"><dt className="text-slate-600">Margen</dt><dd>{m.margen != null ? pct(m.margen, 1) : '—'}</dd></div>}
            <div className="flex justify-between"><dt className="text-slate-600">Del contrato</dt><dd>{venta > 0 ? pct(m.venta / venta, 1) : '—'}</dd></div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1">
              <dt className="text-slate-600">Plazo</dt>
              <dd>{puedeEditar ? <input type="number" className={cx(inputCls, 'w-20 py-0.5 text-right')} value={oc.diasPlazo} onChange={(e) => editar(oc.id, { diasPlazo: Math.round(Number(e.target.value)) })} aria-label="Días de plazo" /> : `${oc.diasPlazo > 0 ? '+' : ''}${oc.diasPlazo}`} días</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card titulo="Historial">
        <ol className="space-y-1.5 text-sm">
          {historial.map((h, i) => <li key={i} className="flex gap-3"><span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(h.fecha)}</span><span>{h.texto}</span></li>)}
        </ol>
      </Card>
      {accion && <AccionOCModal oc={oc} accion={accion} onCerrar={() => setAccion(null)} />}
    </div>
  )
}

function AccionOCModal({ oc, accion, onCerrar }: { oc: OrdenCambio; accion: AccionOC; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionOrdenCambio)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const conTexto = accion === 'devolver' || accion === 'rechazar' || accion === 'anular'
  const ayuda: Partial<Record<AccionOC, string>> = {
    valorizar: 'Fija la valorización con los precios unitarios de contrato o los acordados. Queda lista para la aprobación interna.',
    aprobar_interna: 'Las partidas nuevas quedan creadas para que terreno pueda reportarlas, pero no cuentan en el presupuesto ni se cobran hasta que el mandante apruebe.',
    presentar: 'El mandante la verá en su portal para aprobarla o rechazarla.',
    aprobar_mandante: 'Se actualizan las cantidades vigentes, la venta y el plazo del contrato; las partidas nuevas pasan a cobrarse en los estados de pago.',
    rechazar: 'Si ya hay avance en las partidas nuevas, su costo queda como no recuperable.',
    anular: 'Las partidas nuevas sin avance ni costo se eliminan.',
  }
  return (
    <Modal abierto titulo={`${ACCIONES_OC[accion]} · OC N° ${oc.numero}`} onCerrar={onCerrar}>
      {ayuda[accion] && <p className="mb-3 text-sm text-slate-600">{ayuda[accion]}</p>}
      {conTexto && <Campo etiqueta={accion === 'devolver' ? 'Qué hay que corregir' : 'Motivo'}><textarea rows={3} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={accion === 'anular' || accion === 'rechazar' ? 'peligro' : 'primario'} onClick={() => {
          const err = ejecutar(oc.id, accion, { texto })
          if (err) setError(err)
          else onCerrar()
        }}>{ACCIONES_OC[accion]}</Boton>
      </div>
    </Modal>
  )
}
