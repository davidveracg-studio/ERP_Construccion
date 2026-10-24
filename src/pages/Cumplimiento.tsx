// Cumplimiento laboral (v1.2, RF-SUB-02): documentación del subcontratista y de sus trabajadores con su
// vigencia (10 §19), acreditación (RULE-702) y bloqueo del pago por F30-1 (RULE-701). El mismo bloque
// lo usa el administrador de obra (valida) y el subcontratista en su portal (carga).
// Portal Subcontratista (R10, 07): sus subcontratos, documentación y estados de pago, sin costos de la
// constructora ni precios de venta (19 §5).
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { subirDocumento, TIPOS_ACEPTADOS } from '../documentos/archivos'
import {
  acreditacion, DOCS_TRABAJADOR, ESTADOS_DOC, estadoDoc, estadoEPConDocs, estadoTrabajador, f301Vigente, periodo, periodoAnterior, puedeCargarDocumentos,
  puedeRevisarDocumentos, subcontratistaDeR10, TIPOS_DOC_LABORAL, TONO_DOC, trabajadoresActivos, ultimoDoc,
} from '../domain/cumplimiento'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct } from '../domain/formato'
import {
  ACCIONES_EPSUB, accionesEPSub, avanceValidado, cobradoPartida, epsDe, ESTADOS_EPSUB, estadoSub, ESTADOS_SUB, montosEPSub, TONO_EPSUB, TONO_SUB,
} from '../domain/subcontratos'
import type { DocumentoLaboral, EPSubcontrato, Subcontrato, TipoDocLaboral } from '../domain/types'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { DetallePostventa, TablaPostventa } from './Postventa'

const q = (n: number) => num(n, Math.abs(n % 1) > 0.0001 ? 2 : 0)

export function EstadoEPDocsBadge({ ep, sc }: { ep: EPSubcontrato; sc: Subcontrato }) {
  const d = useDatosDominio()
  const e = estadoEPConDocs(ep, sc, d.documentosLaborales, hoy())
  return e ? <Badge tono={TONO_EPSUB[e]}>{ESTADOS_EPSUB[e]}{e === 'bloqueado' ? ' · F30-1' : ''}</Badge> : null
}

function DocBadge({ doc, onRevisar }: { doc?: DocumentoLaboral; onRevisar?: (d: DocumentoLaboral) => void }) {
  const t = hoy()
  const e = estadoDoc(doc, t)
  const motivo = doc?.historial.find((h) => h.estado === 'rechazado')?.texto
  return (
    <span className="inline-flex items-center gap-1" title={motivo ?? (doc?.vencimiento != null ? `Vence ${fmtFecha(doc.vencimiento)}` : undefined)}>
      <Badge tono={TONO_DOC[e]}>{ESTADOS_DOC[e]}</Badge>
      {e === 'cargado' && onRevisar && doc && <button className="text-xs text-marca hover:underline" onClick={() => onRevisar(doc)}>Revisar</button>}
    </span>
  )
}

/** Documentación laboral del subcontratista en la obra de un subcontrato. */
export function DocumentacionLaboral({ sc }: { sc: Subcontrato }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const [cargar, setCargar] = useState<{ tipo: TipoDocLaboral; trabajadorId?: string; periodo?: string } | null>(null)
  const [revisar, setRevisar] = useState<DocumentoLaboral | null>(null)
  const [nuevoTrab, setNuevoTrab] = useState(false)
  const t = hoy()
  const a = acreditacion(sc, d.trabajadores, d.documentosLaborales, t)
  const base = { obraId: sc.obraId, subcontratistaId: sc.subcontratistaId }
  const f30 = ultimoDoc(d.documentosLaborales, { ...base, tipo: 'f30' }, t)
  // Meses del F30-1: los que exigen sus EP por pagar y los últimos del período trabajado
  const estado = estadoSub(sc, t)
  const termino = sc.historial.find((h) => h.estado === 'terminado')?.fecha
  const per = periodo(Math.min(t, termino ?? t))
  const porPagar = epsDe(d.epsSubcontrato, sc.id).filter((e) => ['aprobado', 'validado', 'presentado'].includes(estadoEPConDocs(e, sc, d.documentosLaborales, t) ?? '') || estadoEPConDocs(e, sc, d.documentosLaborales, t) === 'bloqueado')
  const meses = [...new Set([...porPagar.flatMap((e) => [periodoAnterior(periodo(e.fechaCorte)), periodo(e.fechaCorte)]), periodoAnterior(periodoAnterior(per)), periodoAnterior(per), per])].sort()
  const vigenteSc = estado === 'vigente' || estado === 'en_acreditacion' || estado === 'suspendido'
  const activos = trabajadoresActivos(d.trabajadores, sc.obraId, sc.subcontratistaId, t)
  const revisa = puedeRevisarDocumentos(rol) ? setRevisar : undefined
  const carga = puedeCargarDocumentos(rol)

  return (
    <Card titulo="Documentación laboral" accion={vigenteSc
      ? <Badge tono={a.alDia ? 'verde' : a.ok ? 'ambar' : 'rojo'}>{a.alDia ? 'Al día' : a.ok ? 'Acreditado · F30-1 pendiente' : 'No acreditado (RULE-702)'}</Badge>
      : <Badge tono="gris">Subcontrato {estado ? ESTADOS_SUB[estado].toLowerCase() : ''}: se revisa el F30-1 de los pagos pendientes</Badge>}>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <h4 className="mb-2 text-sm font-medium">Empresa</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>{TIPOS_DOC_LABORAL.f30}{f30?.vencimiento != null && <span className="text-xs text-slate-500"> · vence {fmtFecha(f30.vencimiento)}</span>}</span>
              <span className="flex items-center gap-2"><DocBadge doc={f30} onRevisar={revisa} />{carga && <button className="text-xs text-marca hover:underline" onClick={() => setCargar({ tipo: 'f30' })}>Cargar</button>}</span>
            </li>
            {meses.map((m) => {
              const doc = ultimoDoc(d.documentosLaborales, { ...base, tipo: 'f30_1', periodo: m }, t)
              return (
                <li key={m} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>F30-1 · {m}</span>
                  <span className="flex items-center gap-2"><DocBadge doc={doc} onRevisar={revisa} />{carga && <button className="text-xs text-marca hover:underline" onClick={() => setCargar({ tipo: 'f30_1', periodo: m })}>Cargar</button>}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">RULE-701: un EP aprobado se paga solo con el F30-1 validado del mes de su corte o del anterior.</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-medium">Trabajadores ({a.acreditados} de {a.trabajadores} acreditados)</h4>{carga && <button className="text-xs text-marca hover:underline" onClick={() => setNuevoTrab(true)}>+ Registrar</button>}</div>
          {activos.length === 0 ? <p className="text-sm text-slate-500">Sin trabajadores registrados.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm [&_td+td]:pl-2 [&_th+th]:pl-2">
                <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1 font-medium">Trabajador</th>{DOCS_TRABAJADOR.map((x) => <th key={x} className="font-medium">{x === 'contrato' ? 'Contrato' : x === 'epp' ? 'EPP' : 'DS 44'}</th>)}</tr></thead>
                <tbody>
                  {activos.map((w) => {
                    const est = estadoTrabajador(w, d.documentosLaborales, t)
                    return (
                      <tr key={w.id} className="border-b border-slate-100">
                        <td className="py-1.5"><div className="font-medium">{w.nombre}</div><div className="text-xs text-slate-500">{w.oficio} · {w.rut}</div></td>
                        {est.req.map((r) => {
                          const doc = ultimoDoc(d.documentosLaborales, { ...base, trabajadorId: w.id, tipo: r.tipo }, t)
                          return <td key={r.tipo} className="whitespace-nowrap"><DocBadge doc={doc} onRevisar={revisa} />{carga && r.estado !== 'validado' && r.estado !== 'cargado' && <button className="ml-1 text-xs text-marca hover:underline" onClick={() => setCargar({ tipo: r.tipo, trabajadorId: w.id })}>Cargar</button>}</td>
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {cargar && <CargarDocumento sc={sc} {...cargar} onCerrar={() => setCargar(null)} />}
      {revisar && <RevisarDocumento doc={revisar} onCerrar={() => setRevisar(null)} />}
      {nuevoTrab && <NuevoTrabajador sc={sc} onCerrar={() => setNuevoTrab(false)} />}
    </Card>
  )
}

function CargarDocumento({ sc, tipo, trabajadorId, periodo: per, onCerrar }: { sc: Subcontrato; tipo: TipoDocLaboral; trabajadorId?: string; periodo?: string; onCerrar: () => void }) {
  const cargar = useStore((s) => s.cargarDocumento)
  const d = useDatosDominio()
  const t = hoy()
  const w = d.trabajadores.find((x) => x.id === trabajadorId)
  const [venc, setVenc] = useState(tipo === 'f30' ? iso(t + 30) : '')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  return (
    <Modal abierto titulo={`Cargar ${TIPOS_DOC_LABORAL[tipo]}${per ? ` · ${per}` : ''}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        {w && <p className="text-sm text-slate-600">Trabajador: {w.nombre} ({w.rut})</p>}
        <Campo etiqueta="Archivo (PDF o imagen)"><input type="file" accept={TIPOS_ACEPTADOS} className="block w-full text-sm" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></Campo>
        {tipo === 'f30' && <Campo etiqueta="Vigente hasta"><input type="date" className={inputCls} value={venc} onChange={(e) => setVenc(e.target.value)} /></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={subiendo} onClick={async () => {
          setSubiendo(true)
          try {
            const adj = archivo ? await subirDocumento(sc.obraId, archivo) : undefined
            const err = cargar({ obraId: sc.obraId, subcontratistaId: sc.subcontratistaId, trabajadorId, tipo, periodo: per, vencimiento: venc ? dia(venc) : undefined, archivo: adj })
            if (err) setError(err)
            else onCerrar()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setSubiendo(false)
          }
        }}>{subiendo ? 'Subiendo…' : 'Cargar'}</Boton>
      </div>
    </Modal>
  )
}

function RevisarDocumento({ doc, onCerrar }: { doc: DocumentoLaboral; onCerrar: () => void }) {
  const revisar = useStore((s) => s.revisarDocumento)
  const d = useDatosDominio()
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const w = d.trabajadores.find((x) => x.id === doc.trabajadorId)
  const correr = (r: 'validado' | 'rechazado') => { const err = revisar(doc.id, r, motivo); if (err) setError(err); else onCerrar() }
  return (
    <Modal abierto titulo={`Revisar ${TIPOS_DOC_LABORAL[doc.tipo]}${doc.periodo ? ` · ${doc.periodo}` : ''}`} onCerrar={onCerrar}>
      <p className="text-sm text-slate-600">Cargado el {fmtFecha(doc.creado)} por {doc.creadoPor}{w ? ` · ${w.nombre}` : ''}{doc.archivo ? ` · ${doc.archivo.nombre}` : ' · sin archivo adjunto'}.</p>
      <div className="mt-3"><Campo etiqueta="Motivo (si se rechaza)"><input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo></div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={() => correr('rechazado')}>Rechazar</Boton>
        <Boton onClick={() => correr('validado')}>Validar</Boton>
      </div>
    </Modal>
  )
}

function NuevoTrabajador({ sc, onCerrar }: { sc: Subcontrato; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarTrabajador)
  const [v, setV] = useState({ rut: '', nombre: '', oficio: '', ingreso: iso(hoy()) })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal abierto titulo="Registrar trabajador" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Queda acreditado cuando se validan su contrato, la información de riesgos (DS 44) y la entrega de EPP.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="RUT"><input className={inputCls} value={v.rut} onChange={set('rut')} /></Campo>
        <Campo etiqueta="Nombre"><input className={inputCls} value={v.nombre} onChange={set('nombre')} /></Campo>
        <Campo etiqueta="Oficio"><input className={inputCls} value={v.oficio} onChange={set('oficio')} /></Campo>
        <Campo etiqueta="Ingreso a la obra"><input type="date" className={inputCls} value={v.ingreso} onChange={set('ingreso')} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = registrar({ obraId: sc.obraId, subcontratistaId: sc.subcontratistaId, rut: v.rut, nombre: v.nombre, oficio: v.oficio, ingreso: dia(v.ingreso) }); if (err) setError(err); else onCerrar() }}>Registrar</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Portal Subcontratista (R10) ─────────────────────────

export default function PortalSubcontratista() {
  const d = useDatosDominio()
  const crearEP = useStore((s) => s.crearEPSub)
  const ejecutar = useStore((s) => s.accionEPSub)
  const [sel, setSel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const yo = subcontratistaDeR10(d.proveedores)
  const mios = d.subcontratos.filter((s) => s.subcontratistaId === yo?.id && s.creado <= t)
  if (!yo) return <Vacio titulo="Sin empresa asociada" texto="Tu usuario no está asociado a un subcontratista." />
  const actual = mios.find((s) => s.id === sel) ?? mios.find((s) => estadoSub(s, t) === 'vigente') ?? mios[0]
  const eps = actual ? epsDe(d.epsSubcontrato, actual.id).sort((a, b) => b.numero - a.numero) : []
  const bloqueados = mios.reduce((s, sc) => s + epsDe(d.epsSubcontrato, sc.id).filter((e) => estadoEPConDocs(e, sc, d.documentosLaborales, t) === 'bloqueado').length, 0)

  return (
    <div className="space-y-4">
      <Titulo sub={`${yo.rut} · ${yo.especialidad ?? yo.rubro}`}>{yo.nombre}</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Subcontratos" valor={mios.length} sub={`${mios.filter((s) => estadoSub(s, t) === 'vigente').length} vigentes`} />
        <Kpi etiqueta="Por cobrar (bruto)" valor={mm(mios.reduce((s, sc) => s + sc.lineas.reduce((x, l) => x + Math.max(0, Math.min(l.cantidad, avanceValidado(d.rdos, sc.obraId, l.partidaId, t)) - cobradoPartida(d.epsSubcontrato, sc.id, l.partidaId, t)) * l.pu, 0), 0))} sub="avance validado no cobrado" />
        <Kpi etiqueta="EP bloqueados" valor={bloqueados} sub="KSU-02 · falta el F30-1 del período" estado={bloqueados ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Documentos al día" valor={`${mios.filter((sc) => acreditacion(sc, d.trabajadores, d.documentosLaborales, t).alDia).length} de ${mios.length}`} sub="F30, F30-1 y trabajadores" />
      </div>
      {mios.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {mios.map((sc) => {
            const obra = d.obras.find((o) => o.id === sc.obraId)
            return <button key={sc.id} onClick={() => setSel(sc.id)} className={cx('rounded-lg border px-3 py-1.5 text-sm', sc.id === actual?.id ? 'border-marca bg-blue-50 text-marca' : 'border-slate-300 text-slate-700')}>{sc.codigo} · {obra?.nombre}</button>
          })}
        </div>
      )}
      {actual && (
        <>
          <Card titulo={<span className="flex flex-wrap items-center gap-2">{actual.codigo} · {actual.descripcion}<Badge tono={TONO_SUB[estadoSub(actual, t)!]}>{ESTADOS_SUB[estadoSub(actual, t)!]}</Badge></span>}
            accion={estadoSub(actual, t) === 'vigente' ? <Boton onClick={() => { const r = crearEP(actual.id, t - 1); if (r.error) setError(r.error); else { setError(null); const err = ejecutar(r.id!, 'presentar'); if (err) setError(err) } }}>Preparar y presentar EP</Boton> : undefined}>
            {error && <p className="mb-2 text-sm text-crit">{error}</p>}
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[620px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Partida</th><th className="font-medium">Contratado</th><th className="font-medium">PU</th><th className="font-medium">Validado</th><th className="font-medium">Cobrado</th><th className="font-medium">Por cobrar</th></tr></thead>
                <tbody>
                  {actual.lineas.map((l) => {
                    const p = d.partidas.find((x) => x.id === l.partidaId)
                    const val = Math.min(l.cantidad, avanceValidado(d.rdos, actual.obraId, l.partidaId, t))
                    const cob = cobradoPartida(d.epsSubcontrato, actual.id, l.partidaId, t)
                    return <tr key={l.partidaId} className="border-b border-slate-100 text-right"><td className="py-2 text-left">{p?.descripcion}</td><td>{q(l.cantidad)} {p?.unidad}</td><td>{clp(l.pu)}</td><td>{q(val)}</td><td>{q(cob)}</td><td className="font-medium">{q(Math.max(0, val - cob))}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Se cobra lo validado por el jefe de terreno en los reportes diarios. Retención {pct(actual.retencion, 0)} de cada EP, devuelta al cierre.</p>
          </Card>
          <Card titulo="Mis estados de pago">
            {eps.length === 0 ? <p className="text-sm text-slate-500">Aún no hay estados de pago.</p> : (
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[620px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                  <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">EP</th><th className="font-medium">Bruto</th><th className="font-medium">Retención</th><th className="font-medium">Neto</th><th className="text-left font-medium">Estado</th><th /></tr></thead>
                  <tbody>
                    {eps.map((ep) => {
                      const m = montosEPSub(ep, actual)
                      const e = estadoEPConDocs(ep, actual, d.documentosLaborales, t)
                      const motivo = e === 'bloqueado' ? `Falta el F30-1 validado de ${periodo(ep.fechaCorte)} o ${periodoAnterior(periodo(ep.fechaCorte))}` : ep.historial.find((h) => h.estado === 'rechazado')?.texto
                      const acc = accionesEPSub(ep, t, 'R10')
                      return (
                        <tr key={ep.id} className="border-b border-slate-100 text-right">
                          <td className="py-2 text-left">N° {ep.numero} · corte {fmtFecha(ep.fechaCorte)}</td><td>{mm(m.bruto)}</td><td>{mm(m.retencion)}</td><td className="font-medium">{mm(m.neto)}</td>
                          <td className="text-left"><EstadoEPDocsBadge ep={ep} sc={actual} />{motivo && <div className="max-w-[260px] whitespace-normal text-xs text-slate-500">{motivo}</div>}</td>
                          <td>{acc.includes('presentar') && <button className="text-marca hover:underline" onClick={() => setError(ejecutar(ep.id, 'presentar'))}>{ACCIONES_EPSUB.presentar}</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <DocumentacionLaboral sc={actual} />
        </>
      )}
      {f301Vigente(d.documentosLaborales, actual?.obraId ?? '', yo.id, t, t) ? null : <p className="text-xs text-slate-500">Carga el F30-1 de cada mes en la documentación laboral para no bloquear tus pagos.</p>}
      <PostventaAsignada subcontratistaId={yo.id} />
    </div>
  )
}

/** RULE-503: solicitudes de postventa de las partidas del subcontratista (las repara y las da por resueltas). */
function PostventaAsignada({ subcontratistaId }: { subcontratistaId: string }) {
  const d = useDatosDominio()
  const [ver, setVer] = useState<string | null>(null)
  const t = hoy()
  const ss = d.solicitudesPostventa.filter((s) => s.subcontratistaId === subcontratistaId && s.creado <= t).sort((a, b) => b.fecha - a.fecha)
  if (!ss.length) return null
  return (
    <Card titulo="Postventa asignada (garantía)">
      <TablaPostventa ss={ss} onVer={setVer} conObra />
      {ver && <DetallePostventa s={ss.find((s) => s.id === ver)!} onCerrar={() => setVer(null)} />}
    </Card>
  )
}
