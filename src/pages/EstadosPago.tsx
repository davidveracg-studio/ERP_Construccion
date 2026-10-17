// Estados de pago al mandante (v1.1, 10 §9): listado con indicadores KFI-01/02/10 y detalle con
// cubicación, generadores, reajuste, descuentos, historial y acciones según el rol. El mismo
// detalle se usa en el portal del mandante (R11), que no ve observaciones internas.
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { condicionesDe } from '../domain/caja'
import {
  ACCIONES_EP, accionesEP, ajustarLinea, editable, epAtrasado, epVencido, ETAPAS_EP, etapaEP, indicadoresEP, lineasEP, pagadoHasta,
  pendientePorPartida, presentadoEn, TONO_ETAPA_EP, type AccionEP,
} from '../domain/estadosPago'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct } from '../domain/formato'
import type { EstadoPago, EstadoSemaforo, Generador, LineaEP } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const IVA = 0.19
const nombreEP = (e: EstadoPago) => (e.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${e.numero}`)
const nivel = (v: number | null, [ok, alerta]: [number, number]): EstadoSemaforo | undefined => (v == null ? undefined : v <= ok ? 'verde' : v <= alerta ? 'amarillo' : 'rojo')

export function EtapaBadge({ ep, t }: { ep: EstadoPago; t: number }) {
  const e = etapaEP(ep, t)
  if (!e) return null
  return epVencido(ep, t) ? <Badge tono="rojo">Vencido</Badge> : <Badge tono={TONO_ETAPA_EP[e]}>{ETAPAS_EP[e]}</Badge>
}

export default function EstadosPago() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [generar, setGenerar] = useState(false)
  if (!c) return null
  const t = hoy()
  const eps = d.estadosPago.filter((e) => e.obraId === c.obra.id).sort((a, b) => b.numero - a.numero)
  const ind = indicadoresEP(eps, t)
  const atrasado = epAtrasado(d, c.obra.id, t)
  const puedeGenerar = rol === 'R02' || rol === 'R05'

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.mandante} · cubicación desde el avance validado, revisión interna, presentación al ITO, aprobación, factura y pago`}
        accion={puedeGenerar ? <Boton onClick={() => setGenerar(true)}>Generar EP</Boton> : undefined}>
        Estados de pago
      </Titulo>

      {atrasado != null && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          El avance validado al corte del {fmtFecha(atrasado)} lleva {t - atrasado} días sin estado de pago presentado (RULE-403).
          {puedeGenerar && <button onClick={() => setGenerar(true)} className="ml-2 font-medium underline">Generar ahora</button>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Por aprobar del mandante" valor={ind.porAprobar} />
        <Kpi etiqueta="Días de preparación" valor={ind.diasPreparacion != null ? num(ind.diasPreparacion, 1) : '—'} estado={nivel(ind.diasPreparacion, [3, 7])} sub="corte → presentación" ayuda="KFI-01: objetivo ≤ 1 día, alerta > 3, crítico > 7" />
        <Kpi etiqueta="Días de aprobación" valor={ind.diasAprobacion != null ? num(ind.diasAprobacion, 1) : '—'} estado={nivel(ind.diasAprobacion, [15, 30])} sub="presentación → aprobación" ayuda="KFI-02: objetivo ≤ 7 días, alerta > 15, crítico > 30" />
        <Kpi etiqueta="EP observados" valor={ind.observados != null ? pct(ind.observados, 0) : '—'} estado={nivel(ind.observados, [0.25, 0.5])} ayuda="KFI-10: objetivo ≤ 10 %, alerta > 25 %, crítico > 50 %" />
        <Kpi etiqueta="Avance por cobrar" valor={mm(c.caja.avanceNoCobrado)} sub="validado sin EP aprobado" />
      </div>

      <Card>
        {eps.length === 0 ? <Vacio titulo="Sin estados de pago" texto="Genera el primero con el avance validado en los RDO." /> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">EP</th><th className="text-left font-medium">Corte</th>
                  <th className="font-medium">Bruto</th><th className="font-medium">Neto</th><th className="text-left font-medium">Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {eps.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left font-medium">{nombreEP(e)}{e.version > 1 && <span className="ml-1 text-xs text-slate-500">v{e.version}</span>}</td>
                    <td className="text-left">{fmtFecha(e.fechaCorte)}</td>
                    <td>{mm(e.bruto)}</td><td>{mm(e.neto)}</td>
                    <td className="text-left"><EtapaBadge ep={e} t={t} /></td>
                    <td><Link to={`/estados-pago/${e.id}`} className="text-marca hover:underline">Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {generar && <GenerarEP obraId={c.obra.id} onCerrar={() => setGenerar(false)} />}
    </div>
  )
}

function GenerarEP({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const d = useDatosDominio()
  const generar = useStore((s) => s.generarEstadoPago)
  const nav = useNavigate()
  const obra = d.obras.find((o) => o.id === obraId)!
  const cond = condicionesDe(obra)
  const [corte, setCorte] = useState(iso(hoy()))
  const [indice, setIndice] = useState('')
  const lineas = useMemo(() => lineasEP(d, obraId, dia(corte)), [d, obraId, corte])
  const bruto = lineas.reduce((s, l) => s + l.monto, 0)
  const faltaIndice = !!cond.reajuste && !(Number(indice.replace(',', '.')) > 0)
  return (
    <Modal abierto titulo="Generar estado de pago" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Se crea en borrador con el avance validado hasta el corte que aún no está en otro EP, a precio de venta. Después puedes ajustar la cubicación y sus generadores antes de enviarlo a revisión.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha de corte"><input type="date" className={inputCls} value={corte} max={iso(hoy())} onChange={(e) => setCorte(e.target.value)} /></Campo>
        {cond.reajuste && (
          <Campo etiqueta={`Índice ${cond.reajuste.indice} del período`} ayuda={`Base del contrato: ${num(cond.reajuste.base, 2)}`}>
            <input className={inputCls} inputMode="decimal" value={indice} onChange={(e) => setIndice(e.target.value)} placeholder={num(cond.reajuste.base, 2)} />
          </Campo>
        )}
      </div>
      <p className="mt-3 text-sm">{lineas.length === 0 ? 'No hay avance validado pendiente de cobro a esa fecha.' : <>{lineas.length} partidas · bruto <span className="tabular font-medium">{mm(bruto)}</span></>}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={lineas.length === 0 || faltaIndice} onClick={() => {
          const ep = generar(obraId, dia(corte), cond.reajuste ? Number(indice.replace(',', '.')) : undefined)
          onCerrar()
          if (ep) nav(`/estados-pago/${ep.id}`)
        }}>Crear borrador</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Detalle ─────────────────────────

export function DetalleEP() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const editar = useStore((s) => s.editarEstadoPago)
  const [accion, setAccion] = useState<AccionEP | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const ep = d.estadosPago.find((e) => e.id === id)
  if (!ep) return <Vacio titulo="Estado de pago no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/estados-pago" className="text-marca">Volver</Link>} />
  const t = hoy()
  const mandante = rol === 'R11'
  const obra = d.obras.find((o) => o.id === ep.obraId)!
  const cond = condicionesDe(obra)
  const partidas = new Map(d.partidas.map((p) => [p.id, p]))
  const puedeEditar = editable(ep, t) && (rol === 'R02' || rol === 'R05')
  const acciones = accionesEP(ep, t, rol)
  // Máximo cubicable por partida: lo pendiente de validar sin este EP
  const pendiente = puedeEditar ? pendientePorPartida(d, ep.obraId, ep.fechaCorte, ep.id) : new Map<string, number>()
  const descuentos = ep.descuentos.reduce((s, x) => s + x.monto, 0)
  const neto = ep.neto
  const pagado = pagadoHasta(ep, t)
  const setLinea = (i: number, l: LineaEP) => editar(ep.id, { lineas: ep.lineas.map((x, j) => (j === i ? l : x)) })
  const historial = [
    { fecha: ep.creado, texto: 'Creado en borrador' },
    ...(ep.enRevision != null ? [{ fecha: ep.enRevision, texto: 'Enviado a revisión interna' }] : []),
    ...(mandante ? [] : ep.observaciones.filter((o) => o.origen === 'interna').map((o) => ({ fecha: o.fecha, texto: `Devuelto en revisión interna · ${o.autor}: “${o.texto}”` }))),
    // Cada presentación seguida de la observación del mandante que la respondió (mismo día incluido)
    ...ep.presentaciones.flatMap((f, i) => [
      { fecha: f, texto: i === 0 ? 'Presentado al mandante' : `Reingresado (versión ${i + 1})` },
      ...ep.observaciones.filter((o) => o.origen === 'mandante' && o.version === i + 1).map((o) => ({
        fecha: o.fecha, texto: `Observado por el mandante (v${o.version}) · ${o.autor}: “${o.texto}”`,
      })),
    ]),
    ...(ep.aprobado != null ? [{ fecha: ep.aprobado, texto: 'Aprobado por el mandante' }] : []),
    ...(ep.facturado != null ? [{ fecha: ep.facturado, texto: `Facturado ${ep.factura ?? ''} · vence ${fmtFecha(ep.vencimiento!)}` }] : []),
    ...ep.pagos.map((p) => ({ fecha: p.fecha, texto: `Pago recibido ${mm(p.monto)}` })),
    ...(ep.anulado != null ? [{ fecha: ep.anulado, texto: `Anulado: ${ep.motivoAnulacion ?? ''}` }] : []),
  // El orden es estable: los eventos del mismo día mantienen su secuencia lógica
  ].filter((h) => h.fecha <= t).sort((a, b) => a.fecha - b.fecha)

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${obra.mandante} · corte ${fmtFecha(ep.fechaCorte)}${presentadoEn(ep) != null ? ` · presentado ${fmtFecha(presentadoEn(ep)!)}` : ''}`}
        accion={acciones.length ? <>{acciones.map((a) => (
          <Boton key={a} variante={a === 'anular' || a === 'observar' || a === 'devolver' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_EP[a]}</Boton>
        ))}</> : undefined}>
        <span className="flex flex-wrap items-center gap-2">
          {nombreEP(ep)}{ep.version > 1 && <span className="text-base font-normal text-slate-500">versión {ep.version}</span>}
          <EtapaBadge ep={ep} t={t} />
        </span>
      </Titulo>
      <Link to={mandante ? '/mandante' : '/estados-pago'} className="text-sm text-marca">← {mandante ? 'Portal del mandante' : 'Estados de pago'}</Link>

      <div className="grid gap-4 xl:grid-cols-[3fr_1fr] [&>*]:min-w-0">
        <Card titulo="Cubicación del período">
          {ep.tipo === 'anticipo' ? <p className="text-sm text-slate-600">Anticipo de {pct(cond.anticipo, 0)} de la venta, amortizado en cada EP.</p> : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">PU contrato</th>
                    <th className="font-medium">Monto</th><th className="font-medium">Generadores</th>
                  </tr>
                </thead>
                <tbody>
                  {ep.lineas.map((l, i) => {
                    const p = partidas.get(l.partidaId)
                    const gen = l.generadores ?? []
                    const sumaGen = gen.reduce((s, g) => s + g.cantidad, 0)
                    const cuadra = gen.length === 0 || Math.abs(sumaGen - l.cantidad) <= Math.max(0.01, l.cantidad * 0.001)
                    const max = (pendiente.get(l.partidaId) ?? 0)
                    return [
                      <tr key={l.partidaId} className="border-b border-slate-100 text-right">
                        <td className="py-1.5 text-left">{p?.codigo} {p?.descripcion}</td>
                        <td>
                          {puedeEditar ? (
                            <input type="number" min={0} max={max} step="any" className={cx(inputCls, 'ml-auto w-28 py-1 text-right')} value={l.cantidad}
                              title={`Máximo validado pendiente: ${num(max, 2)} ${p?.unidad}`}
                              onChange={(e) => setLinea(i, ajustarLinea(l, Number(e.target.value), p?.puVenta ?? 0, max))} />
                          ) : num(l.cantidad, 2)} <span className="text-xs text-slate-500">{p?.unidad}</span>
                        </td>
                        <td>{clp(p?.puVenta ?? 0)}</td><td>{mm(l.monto)}</td>
                        <td>
                          <button onClick={() => setAbierta(abierta === l.partidaId ? null : l.partidaId)} className={cx('text-sm hover:underline', cuadra ? 'text-marca' : 'text-crit')}>
                            {gen.length} {cuadra ? '' : '· no cuadra'}
                          </button>
                        </td>
                      </tr>,
                      abierta === l.partidaId && (
                        <tr key={`${l.partidaId}-g`} className="bg-slate-50">
                          <td colSpan={5} className="p-3">
                            <Generadores generadores={gen} unidad={p?.unidad ?? ''} total={l.cantidad} editable={puedeEditar}
                              onCambiar={(g) => setLinea(i, { ...l, generadores: g })} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card titulo="Resumen">
          <dl className="tabular space-y-1 text-sm">
            <Fila k="Avance del período (bruto)" v={mm(ep.bruto)} />
            {cond.reajuste && ep.tipo === 'avance' && (
              <Fila k={<>Reajuste {cond.reajuste.indice}{puedeEditar ? (
                <input className={cx(inputCls, 'ml-1 inline-block w-20 py-0.5 text-right')} inputMode="decimal" defaultValue={ep.indiceReajuste ?? ''}
                  onBlur={(e) => editar(ep.id, { indiceReajuste: Number(e.target.value.replace(',', '.')) || undefined })} aria-label="Índice del período" />
              ) : ep.indiceReajuste ? ` (${num(ep.indiceReajuste, 2)} / ${num(cond.reajuste.base, 2)})` : ''}</>} v={mm(ep.reajuste)} />
            )}
            <Fila k={`Retención (${pct(cond.retencion, 0)})`} v={`−${mm(ep.retencion)}`} />
            {ep.amortizacion > 0 && <Fila k="Amortización del anticipo" v={`−${mm(ep.amortizacion)}`} />}
            {ep.descuentos.map((x, i) => (
              <Fila key={i} k={<>{x.concepto}{puedeEditar && <button onClick={() => editar(ep.id, { descuentos: ep.descuentos.filter((_, j) => j !== i) })} className="ml-1 text-xs text-crit">quitar</button>}</>} v={`−${mm(x.monto)}`} />
            ))}
            {puedeEditar && <NuevoDescuento onAgregar={(x) => editar(ep.id, { descuentos: [...ep.descuentos, x] })} />}
            <div className="border-t border-slate-200 pt-1"><Fila k={<b>Neto a cobrar</b>} v={<b>{mm(neto)}</b>} /></div>
            <Fila k={`IVA (${pct(IVA, 0)})`} v={mm(neto * IVA)} />
            <Fila k="Total con IVA" v={mm(neto * (1 + IVA))} />
            {pagado > 0 && <Fila k="Pagado" v={mm(pagado)} />}
            {descuentos > 0 && <p className="pt-1 text-xs text-slate-500">Incluye descuentos y multas por {mm(descuentos)}.</p>}
          </dl>
        </Card>
      </div>

      <Card titulo="Historial">
        <ol className="space-y-1.5 text-sm">
          {historial.map((h, i) => <li key={i} className="flex gap-3"><span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(h.fecha)}</span><span>{h.texto}</span></li>)}
        </ol>
      </Card>
      {accion && <AccionModal ep={ep} accion={accion} onCerrar={() => setAccion(null)} />}
    </div>
  )
}

function Fila({ k, v }: { k: ReactNode; v: ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-slate-600">{k}</dt><dd>{v}</dd></div>
}

function NuevoDescuento({ onAgregar }: { onAgregar: (x: { concepto: string; monto: number }) => void }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const m = Number(monto.replace(/\./g, '').replace(',', '.'))
  return (
    <div className="flex gap-1 pt-1">
      <input className={cx(inputCls, 'py-1 text-xs')} placeholder="Descuento o multa" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
      <input className={cx(inputCls, 'w-28 py-1 text-xs')} placeholder="Monto $" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} />
      <Boton variante="secundario" className="min-h-0 px-2 py-1 text-xs" disabled={!concepto.trim() || !(m > 0)} onClick={() => { onAgregar({ concepto: concepto.trim(), monto: Math.round(m) }); setConcepto(''); setMonto('') }}>+</Boton>
    </div>
  )
}

function Generadores({ generadores, unidad, total, editable, onCambiar }: { generadores: Generador[]; unidad: string; total: number; editable: boolean; onCambiar: (g: Generador[]) => void }) {
  const suma = generadores.reduce((s, g) => s + g.cantidad, 0)
  const set = (i: number, cambios: Partial<Generador>) => onCambiar(generadores.map((g, j) => (j === i ? { ...g, ...cambios } : g)))
  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs font-medium text-slate-500">Respaldo de cantidades (generadores) · suma {num(suma, 2)} de {num(total, 2)} {unidad}</div>
      {generadores.length === 0 && <p className="text-xs text-slate-500">Sin generadores.</p>}
      {generadores.map((g, i) => (
        <div key={g.id} className="grid grid-cols-[1.4fr_1.4fr_1fr_90px_auto] items-center gap-1.5">
          {editable ? (
            <>
              <input className={cx(inputCls, 'py-1 text-xs')} value={g.ubicacion} onChange={(e) => set(i, { ubicacion: e.target.value })} placeholder="Eje, nivel o recinto" aria-label="Ubicación" />
              <input className={cx(inputCls, 'py-1 text-xs')} value={g.descripcion} onChange={(e) => set(i, { descripcion: e.target.value })} placeholder="Elemento" aria-label="Descripción" />
              <input className={cx(inputCls, 'py-1 text-xs')} value={g.formula ?? ''} onChange={(e) => set(i, { formula: e.target.value || undefined })} placeholder="Fórmula" aria-label="Fórmula" />
              <input type="number" step="any" className={cx(inputCls, 'py-1 text-right text-xs')} value={g.cantidad} onChange={(e) => set(i, { cantidad: Number(e.target.value) })} aria-label="Cantidad" />
              <button onClick={() => onCambiar(generadores.filter((_, j) => j !== i))} className="px-1 text-xs text-crit" aria-label="Quitar generador">✕</button>
            </>
          ) : (
            <><span>{g.ubicacion}</span><span className="text-slate-600">{g.descripcion}</span><span className="tabular text-slate-500">{g.formula}</span><span className="tabular text-right">{num(g.cantidad, 2)}</span><span /></>
          )}
        </div>
      ))}
      {editable && (
        <button className="text-xs text-marca hover:underline"
          onClick={() => onCambiar([...generadores, { id: `gen_${Date.now().toString(36)}`, ubicacion: '', descripcion: '', cantidad: Math.max(0, Math.round((total - suma) * 100) / 100) }])}>
          + Agregar generador
        </button>
      )}
    </div>
  )
}

function AccionModal({ ep, accion, onCerrar }: { ep: EstadoPago; accion: AccionEP; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionEstadoPago)
  const [texto, setTexto] = useState('')
  const [factura, setFactura] = useState('')
  const saldo = ep.neto - pagadoHasta(ep, Infinity)
  const [monto, setMonto] = useState(String(Math.round(saldo)))
  const [error, setError] = useState<string | null>(null)
  const conTexto = accion === 'observar' || accion === 'devolver' || accion === 'anular'
  const ayuda: Partial<Record<AccionEP, string>> = {
    enviar_revision: 'Oficina Técnica lo envía al administrador de obra para revisarlo antes de presentarlo.',
    presentar: etapaEP(ep, hoy()) === 'observado' ? `Se reingresa como versión ${ep.version + 1} con las correcciones.` : 'Desde la presentación las líneas no se pueden editar.',
    aprobar: 'Queda listo para facturar.',
    observar: 'El EP vuelve a la constructora para corregirlo y reingresarlo como una versión nueva.',
    devolver: 'Vuelve a borrador para corregirlo.',
    facturar: 'El vencimiento se calcula con los días de pago del contrato.',
    anular: 'El avance incluido queda disponible para otro EP.',
  }
  return (
    <Modal abierto titulo={`${ACCIONES_EP[accion]} · ${nombreEP(ep)}`} onCerrar={onCerrar}>
      {ayuda[accion] && <p className="mb-3 text-sm text-slate-600">{ayuda[accion]}</p>}
      {conTexto && <Campo etiqueta={accion === 'anular' ? 'Motivo' : 'Observaciones'}><textarea rows={3} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
      {accion === 'facturar' && <Campo etiqueta="N° de factura"><input className={inputCls} value={factura} onChange={(e) => setFactura(e.target.value)} placeholder="Ej.: F-1234" /></Campo>}
      {accion === 'pagar' && (
        <Campo etiqueta="Monto recibido ($)" ayuda={`Saldo por cobrar: ${mm(saldo)}. Un monto menor queda como pago parcial.`}>
          <input className={inputCls} inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
      )}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={accion === 'anular' ? 'peligro' : 'primario'} onClick={() => {
          const err = ejecutar(ep.id, accion, { texto, factura, monto: accion === 'pagar' ? Number(monto.replace(/\./g, '').replace(',', '.')) : undefined })
          if (err) setError(err)
          else onCerrar()
        }}>{ACCIONES_EP[accion]}</Boton>
      </div>
    </Modal>
  )
}
