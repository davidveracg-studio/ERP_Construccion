// Gestión documental (v1.1, 08 Dominio 9, 10 §26–27): planos y EETT con control de revisiones y
// confirmación de terreno (RULE-905), RFI con plazo de respuesta (RULE-903) y submittals.
// El mandante (R11) ve los RFI emitidos y los submittals enviados desde su portal.
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { abrirDocumento, subirDocumento, TIPOS_ACEPTADOS } from '../documentos/archivos'
import {
  ACCIONES_RFI, ACCIONES_SUBMITTAL, accionesRFI, accionesSubmittal, DESTINATARIOS_RFI, ESPECIALIDADES, estadoRFI, estadoSubmittal, ESTADOS_RFI,
  ESTADOS_SUBMITTAL, indicadoresDocumental, partidasCriticas, puedeConfirmarTerreno, puedeCrearRFI, puedeCrearSubmittal, puedePublicarDocumento,
  revisionVigente, revisionesA, rfiVencido, siguienteRevision, submittalVencido, terrenoDesactualizado, tiemposRFI, tocaCriticas, TIPOS_DOCUMENTO,
  TIPOS_SUBMITTAL, TONO_RFI, TONO_SUBMITTAL, type AccionRFI, type AccionSubmittal,
} from '../domain/documental'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { mm, num } from '../domain/formato'
import { etapaOC } from '../domain/ordenesCambio'
import { estadoRiesgo, puedeCrearRiesgo } from '../domain/riesgos'
import type { ArchivoDoc, Documento, Especialidad, RFI, Submittal, TipoDocumento, TipoSubmittal } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

type Pestana = 'planos' | 'rfi' | 'submittals'
const PESTANAS: Record<Pestana, string> = { planos: 'Planos y EETT', rfi: 'RFI', submittals: 'Submittals' }

export function EstadoRFIBadge({ r, t }: { r: RFI; t: number }) {
  const e = estadoRFI(r, t)
  if (!e) return null
  return rfiVencido(r, t) ? <Badge tono="rojo">Vencido</Badge> : <Badge tono={TONO_RFI[e]}>{ESTADOS_RFI[e]}</Badge>
}
export function EstadoSubmittalBadge({ s, t }: { s: Submittal; t: number }) {
  const e = estadoSubmittal(s, t)
  return e ? <Badge tono={TONO_SUBMITTAL[e]}>{ESTADOS_SUBMITTAL[e]}</Badge> : null
}

function BotonArchivo({ a }: { a?: ArchivoDoc }) {
  const [error, setError] = useState<string | null>(null)
  if (!a) return <span className="text-xs text-slate-400">Sin archivo</span>
  return (
    <span>
      <button className="text-sm text-marca hover:underline" onClick={() => abrirDocumento(a).catch((e: Error) => setError(e.message))}>{a.nombre}</button>
      {error && <span className="block text-xs text-crit">{error}</span>}
    </span>
  )
}

export default function Documentos() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [params, setParams] = useSearchParams()
  const pestana = (params.get('ver') as Pestana) in PESTANAS ? (params.get('ver') as Pestana) : 'planos'
  if (!c) return null
  const t = hoy()
  const de = <T extends { obraId: string }>(xs: T[]) => xs.filter((y) => y.obraId === c.obra.id)
  const ind = indicadoresDocumental({ rfis: de(d.rfis), submittals: de(d.submittals), folios: de(d.folios), documentos: de(d.documentos) }, c, d.config.diasHabiles, t)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · planos con control de revisiones, consultas técnicas y envíos a aprobación`}>Documentos de obra</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="RFI abiertos" valor={ind.rfiAbiertos} sub={ind.rfiVencidos ? `${ind.rfiVencidos} vencidos` : 'KDO-01 · sin vencidos'} estado={ind.estado.kdo01} />
        <Kpi etiqueta="Respuesta de RFI" valor={ind.diasRespuesta != null ? `${num(ind.diasRespuesta, 1)} días` : '—'} sub={ind.plazoRespuesta != null ? `KDO-02 · plazo ${num(ind.plazoRespuesta, 1)} días` : 'KDO-02'} estado={ind.estado.kdo02} />
        <Kpi etiqueta="Submittals pendientes" valor={ind.submittalsPendientes} sub={ind.submittalsVencidos ? `${ind.submittalsVencidos} pasados de la fecha requerida` : 'KDO-03'} estado={ind.estado.kdo03} />
        <Kpi etiqueta="Planos en terreno" valor={ind.planosDesactualizados ? `${ind.planosDesactualizados} superados` : 'Al día'} sub="RULE-905" estado={ind.estado.planos} />
        <Link to="/libro-obra" className="block"><Kpi etiqueta="Folios por responder" valor={ind.foliosPendientes} sub={ind.foliosVencidos ? `${ind.foliosVencidos} fuera de plazo` : 'Libro de Obra · RULE-902'} estado={ind.estado.folios} /></Link>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {(Object.keys(PESTANAS) as Pestana[]).map((p) => (
          <button key={p} role="tab" aria-selected={p === pestana} onClick={() => setParams({ ver: p }, { replace: true })}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', p === pestana ? 'border-marca text-marca' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {PESTANAS[p]}
          </button>
        ))}
      </div>
      {pestana === 'planos' && <Planos obraId={c.obra.id} rol={rol} />}
      {pestana === 'rfi' && <ListaRFI obraId={c.obra.id} rol={rol} />}
      {pestana === 'submittals' && <ListaSubmittals obraId={c.obra.id} rol={rol} />}
    </div>
  )
}

// ───────────────────────── Planos y EETT ─────────────────────────

function Planos({ obraId, rol }: { obraId: string; rol: string }) {
  const d = useDatosDominio()
  const confirmar = useStore((s) => s.confirmarTerreno)
  const [modal, setModal] = useState<null | 'nuevo' | { revision: Documento } | { historial: Documento }>(null)
  const t = hoy()
  const docs = d.documentos.filter((x) => x.obraId === obraId && x.creado <= t).sort((a, b) => a.codigo.localeCompare(b.codigo))
  const publica = puedePublicarDocumento(rol as never)
  const terreno = puedeConfirmarTerreno(rol as never)
  return (
    <Card titulo="Planos, EETT y memorias" accion={publica ? <Boton variante="secundario" onClick={() => setModal('nuevo')}>Nuevo documento</Boton> : undefined}>
      {docs.length === 0 ? <Vacio titulo="Sin documentos" texto="Registra los planos y EETT de la obra con su revisión vigente." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[900px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3 [&_td:first-child]:min-w-[240px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Documento</th><th className="font-medium">Especialidad</th><th className="font-medium">Revisión vigente</th>
                <th className="font-medium">Archivo</th><th className="font-medium">En terreno</th><th />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const vig = revisionVigente(doc, t)!
                const usada = terrenoDesactualizado(doc, t)
                const confirmado = doc.enTerreno && doc.enTerreno.fecha <= t
                return (
                  <tr key={doc.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">{doc.codigo} · {doc.titulo}</div><div className="text-xs text-slate-500">{TIPOS_DOCUMENTO[doc.tipo]}</div></td>
                    <td className="whitespace-nowrap">{ESPECIALIDADES[doc.especialidad]}</td>
                    <td className="whitespace-nowrap"><span className="font-semibold">Rev. {vig.revision}</span> · {fmtFecha(vig.fecha)}{vig.motivo && <div className="max-w-[220px] truncate text-xs text-slate-500" title={vig.motivo}>{vig.motivo}</div>}</td>
                    <td><BotonArchivo a={vig.archivo} /></td>
                    <td className="whitespace-nowrap">
                      {usada ? <Badge tono="rojo">Usa Rev. {usada.revision}</Badge> : confirmado ? <Badge tono="verde">Al día</Badge> : <Badge tono="gris">Sin confirmar</Badge>}
                      {terreno && (usada || !confirmado) && <button className="ml-2 text-xs text-marca hover:underline" onClick={() => confirmar(doc.id)}>Confirmar recepción</button>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="text-marca hover:underline" onClick={() => setModal({ historial: doc })}>{revisionesA(doc, t).length} rev.</button>
                      {publica && <button className="ml-3 text-marca hover:underline" onClick={() => setModal({ revision: doc })}>Nueva revisión</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal === 'nuevo' && <NuevaRevision obraId={obraId} onCerrar={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'revision' in modal && <NuevaRevision obraId={obraId} doc={modal.revision} onCerrar={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'historial' in modal && (
        <Modal abierto titulo={`${modal.historial.codigo} · revisiones`} onCerrar={() => setModal(null)}>
          <ol className="space-y-2 text-sm">
            {[...revisionesA(modal.historial, t)].reverse().map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <span className="font-semibold">Rev. {r.revision}</span> <Badge tono={i === 0 ? 'verde' : 'gris'}>{i === 0 ? 'Vigente' : 'Superada'}</Badge>
                  <div className="text-xs text-slate-500">{fmtFecha(r.fecha)} · {r.publicadaPor}{r.motivo ? ` · ${r.motivo}` : ''}</div>
                </div>
                <BotonArchivo a={r.archivo} />
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </Card>
  )
}

function NuevaRevision({ obraId, doc, onCerrar }: { obraId: string; doc?: Documento; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearDocumento)
  const publicar = useStore((s) => s.publicarRevision)
  const d = useDatosDominio()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const [v, setV] = useState({ codigo: '', titulo: '', tipo: 'plano' as TipoDocumento, especialidad: 'arquitectura' as Especialidad, partidaId: '', revision: doc ? siguienteRevision(doc) : '0', motivo: '' })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const guardar = async () => {
    setError(null)
    setSubiendo(true)
    try {
      const adj = archivo ? await subirDocumento(obraId, archivo) : undefined
      const rev = { revision: v.revision, motivo: v.motivo.trim() || undefined, archivo: adj }
      const err = doc ? publicar(doc.id, rev) : crear({ obraId, codigo: v.codigo, titulo: v.titulo, tipo: v.tipo, especialidad: v.especialidad, partidaIds: v.partidaId ? [v.partidaId] : [] }, rev)
      if (err) setError(err)
      else onCerrar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubiendo(false)
    }
  }
  return (
    <Modal abierto titulo={doc ? `Nueva revisión · ${doc.codigo}` : 'Nuevo documento'} onCerrar={onCerrar}>
      {doc && <p className="mb-3 text-sm text-slate-600">La revisión vigente (Rev. {doc.revisiones.at(-1)?.revision}) quedará superada y terreno deberá confirmar que recibió la nueva.</p>}
      <div className="space-y-3">
        {!doc && <>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Campo etiqueta="Código"><input className={inputCls} value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value })} placeholder="E-201" /></Campo>
            <Campo etiqueta="Título"><input className={inputCls} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Planta de losas" /></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Tipo">
              <select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoDocumento })}>
                {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map((k) => <option key={k} value={k}>{TIPOS_DOCUMENTO[k]}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Especialidad">
              <select className={inputCls} value={v.especialidad} onChange={(e) => setV({ ...v, especialidad: e.target.value as Especialidad })}>
                {(Object.keys(ESPECIALIDADES) as Especialidad[]).map((k) => <option key={k} value={k}>{ESPECIALIDADES[k]}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Partida asociada (opcional)">
            <select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}>
              <option value="">Ninguna</option>
              {partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}
            </select>
          </Campo>
        </>}
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Campo etiqueta="Revisión"><input className={inputCls} value={v.revision} onChange={(e) => setV({ ...v, revision: e.target.value })} /></Campo>
          <Campo etiqueta="Motivo"><input className={inputCls} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} placeholder={doc ? 'Qué cambió' : 'Emitido para construcción'} /></Campo>
        </div>
        <Campo etiqueta="Archivo (PDF, imagen o DWG, máx. 15 MB)">
          <input type="file" accept={TIPOS_ACEPTADOS} className="block w-full text-sm" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={subiendo} onClick={guardar}>{subiendo ? 'Subiendo…' : doc ? 'Publicar revisión' : 'Registrar'}</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── RFI ─────────────────────────

function ListaRFI({ obraId, rol }: { obraId: string; rol: string }) {
  const d = useDatosDominio()
  const [nuevo, setNuevo] = useState(false)
  const t = hoy()
  const lista = d.rfis.filter((r) => r.obraId === obraId && r.creado <= t).sort((a, b) => b.numero - a.numero)
  return (
    <Card titulo="Consultas técnicas (RFI)" accion={puedeCrearRFI(rol as never) ? <Boton variante="secundario" onClick={() => setNuevo(true)}>Nuevo RFI</Boton> : undefined}>
      {lista.length === 0 ? <Vacio titulo="Sin RFI" texto="Registra las consultas al mandante o al proyectista con su fecha límite de respuesta." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">RFI</th><th className="font-medium">Destinatario</th><th className="font-medium">Fecha límite</th><th className="font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => {
                const e = estadoRFI(r, t)
                return (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">N° {r.numero} · {r.asunto}</div><div className="text-xs text-slate-500">{ESPECIALIDADES[r.disciplina]}{r.impacto ? ` · impacto ${mm(r.impacto.monto)}, ${r.impacto.dias} d` : ''}</div></td>
                    <td>{DESTINATARIOS_RFI[r.destinatario]}</td>
                    <td>{r.fechaLimite != null ? fmtFecha(r.fechaLimite) : '—'}{e === 'emitido' && r.fechaLimite != null && <div className="text-xs text-slate-500">{r.fechaLimite >= t ? `en ${r.fechaLimite - t} días` : `hace ${t - r.fechaLimite} días`}</div>}</td>
                    <td><EstadoRFIBadge r={r} t={t} /></td>
                    <td className="text-right"><Link to={`/rfi/${r.id}`} className="text-marca hover:underline">Ver</Link></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && <NuevoRFI obraId={obraId} onCerrar={() => setNuevo(false)} />}
    </Card>
  )
}

function NuevoRFI({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearRFI)
  const d = useDatosDominio()
  const nav = useNavigate()
  const t = hoy()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const docs = d.documentos.filter((x) => x.obraId === obraId)
  const [v, setV] = useState({ asunto: '', pregunta: '', disciplina: 'arquitectura' as Especialidad, destinatario: 'mandante' as RFI['destinatario'], limite: iso(t + 7), monto: '', dias: '', partidaId: '', documentoId: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal abierto titulo="Nuevo RFI" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Asunto"><input className={inputCls} value={v.asunto} onChange={set('asunto')} placeholder="Ej.: Nivel de sello de fundación" /></Campo>
        <Campo etiqueta="Consulta"><textarea rows={3} className={inputCls} value={v.pregunta} onChange={set('pregunta')} /></Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Disciplina">
            <select className={inputCls} value={v.disciplina} onChange={set('disciplina')}>{(Object.keys(ESPECIALIDADES) as Especialidad[]).map((k) => <option key={k} value={k}>{ESPECIALIDADES[k]}</option>)}</select>
          </Campo>
          <Campo etiqueta="Destinatario">
            <select className={inputCls} value={v.destinatario} onChange={set('destinatario')}>{(Object.keys(DESTINATARIOS_RFI) as RFI['destinatario'][]).map((k) => <option key={k} value={k}>{DESTINATARIOS_RFI[k]}</option>)}</select>
          </Campo>
          <Campo etiqueta="Fecha límite"><input type="date" className={inputCls} value={v.limite} onChange={set('limite')} /></Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Impacto potencial (MM$)"><input type="number" min={0} step="0.1" className={inputCls} value={v.monto} onChange={set('monto')} /></Campo>
          <Campo etiqueta="Impacto potencial (días)"><input type="number" min={0} className={inputCls} value={v.dias} onChange={set('dias')} /></Campo>
          <Campo etiqueta="Partida afectada">
            <select className={inputCls} value={v.partidaId} onChange={set('partidaId')}><option value="">Ninguna</option>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select>
          </Campo>
          <Campo etiqueta="Plano relacionado">
            <select className={inputCls} value={v.documentoId} onChange={set('documentoId')}><option value="">Ninguno</option>{docs.map((x) => <option key={x.id} value={x.id}>{x.codigo} {x.titulo}</option>)}</select>
          </Campo>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const impacto = v.monto !== '' || v.dias !== '' ? { monto: Math.round(Number(v.monto || 0) * 1e6), dias: Math.round(Number(v.dias || 0)) } : undefined
          const r = crear({
            obraId, asunto: v.asunto, pregunta: v.pregunta.trim(), disciplina: v.disciplina, destinatario: v.destinatario, fechaLimite: v.limite ? dia(v.limite) : undefined,
            impacto, partidaIds: v.partidaId ? [v.partidaId] : [], documentoId: v.documentoId || undefined,
          })
          if (r.error) setError(r.error)
          else { onCerrar(); nav(`/rfi/${r.id}`) }
        }}>Guardar borrador</Boton>
      </div>
    </Modal>
  )
}

export function DetalleRFI() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const crearRiesgo = useStore((s) => s.crearRiesgo)
  const vincular = useStore((s) => s.vincularRFI)
  const nav = useNavigate()
  const [accion, setAccion] = useState<AccionRFI | null>(null)
  const r = d.rfis.find((x) => x.id === id)
  const mandante = rol === 'R11'
  if (!r || (mandante && estadoRFI(r, hoy()) === 'borrador')) return <Vacio titulo="RFI no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to={mandante ? '/mandante' : '/documentos?ver=rfi'} className="text-marca">Volver</Link>} />
  const t = hoy()
  const obra = d.obras.find((o) => o.id === r.obraId)!
  const acciones = accionesRFI(r, t, rol)
  const c = calcularObra(d, obra.id, t)
  const critico = tocaCriticas(r.partidaIds, partidasCriticas(c))
  const partidas = r.partidaIds.map((pid) => d.partidas.find((p) => p.id === pid)).filter((p) => !!p)
  const documento = d.documentos.find((x) => x.id === r.documentoId)
  const oc = d.ordenesCambio.find((x) => x.id === r.ordenCambioId)
  const riesgo = d.riesgos.find((x) => x.id === r.riesgoId)
  const { emision, respuesta } = tiemposRFI(r)
  const registrarRiesgo = () => {
    const res = crearRiesgo({
      obraId: obra.id, titulo: `Demora en la respuesta del RFI N° ${r.numero}: ${r.asunto}`, categoria: 'tecnico', partidaIds: r.partidaIds, responsable: obra.oficinaTecnica,
      causa: `El ${DESTINATARIOS_RFI[r.destinatario].toLowerCase()} no ha respondido el RFI N° ${r.numero}${r.fechaLimite != null ? ` (plazo ${fmtFecha(r.fechaLimite)})` : ''}.`,
    })
    if (res.id) { vincular(r.id, { riesgoId: res.id }); nav(`/riesgos/${res.id}`) }
  }

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${ESPECIALIDADES[r.disciplina]} · para ${DESTINATARIOS_RFI[r.destinatario].toLowerCase()}`}
        accion={acciones.length ? <>{acciones.map((a) => <Boton key={a} variante={a === 'anular' || a === 'repreguntar' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_RFI[a]}</Boton>)}</> : undefined}>
        <span className="flex flex-wrap items-center gap-2">RFI N° {r.numero} · {r.asunto}<EstadoRFIBadge r={r} t={t} /></span>
      </Titulo>
      <Link to={mandante ? '/mandante' : '/documentos?ver=rfi'} className="text-sm text-marca">← {mandante ? 'Portal del mandante' : 'RFI de la obra'}</Link>
      {rfiVencido(r, t) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <span>RULE-903: sin respuesta hace {t - r.fechaLimite!} días.{critico ? ' Afecta la ruta crítica: es causa imputable al mandante y respaldo para un aumento de plazo.' : ''}</span>
          {!mandante && !riesgo && puedeCrearRiesgo(rol) && <Boton variante="secundario" className="min-h-0 py-1" onClick={registrarRiesgo}>Registrar como riesgo</Boton>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="Consulta">
          <p className="whitespace-pre-line text-sm text-slate-800">{r.pregunta}</p>
          {(partidas.length > 0 || documento) && (
            <dl className="mt-3 space-y-1 text-sm">
              {documento && <div><dt className="inline text-slate-500">Plano: </dt><dd className="inline">{documento.codigo} {documento.titulo} (Rev. {revisionVigente(documento, t)?.revision})</dd></div>}
              {partidas.length > 0 && <div><dt className="inline text-slate-500">Partidas: </dt><dd className="inline">{partidas.map((p) => `${p.codigo} ${p.descripcion}`).join(' · ')}{critico && !mandante && <Badge tono="rojo">Ruta crítica</Badge>}</dd></div>}
            </dl>
          )}
        </Card>
        <Card titulo="Plazos e impacto">
          <dl className="tabular space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Emitido</dt><dd>{emision != null && emision <= t ? fmtFecha(emision) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Fecha límite</dt><dd>{r.fechaLimite != null ? fmtFecha(r.fechaLimite) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Respondido</dt><dd>{respuesta != null && respuesta <= t ? `${fmtFecha(respuesta)} (${respuesta - emision!} días)` : '—'}</dd></div>
            {r.impacto && !mandante && <div className="flex justify-between border-t border-slate-200 pt-1"><dt className="text-slate-600">Impacto potencial</dt><dd>{mm(r.impacto.monto)} · {r.impacto.dias} días</dd></div>}
            {oc && <div className="flex justify-between"><dt className="text-slate-600">Orden de cambio</dt><dd><Link to={`/ordenes-cambio/${oc.id}`} className="text-marca hover:underline">N° {oc.numero}</Link></dd></div>}
            {riesgo && !mandante && <div className="flex justify-between"><dt className="text-slate-600">Riesgo</dt><dd><Link to={`/riesgos/${riesgo.id}`} className="text-marca hover:underline">R-{String(riesgo.numero).padStart(3, '0')}</Link></dd></div>}
          </dl>
        </Card>
      </div>

      <Card titulo="Historial">
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3"><span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(r.creado)}</span><span>Borrador · {r.creadoPor}</span></li>
          {r.historial.filter((p) => p.fecha <= t).map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(p.fecha)}</span>
              <span>{p.estado === 'emitido' && i > 0 ? 'Repregunta' : ESTADOS_RFI[p.estado]} · {p.por}{p.texto && <span className={cx('mt-1 block rounded-lg p-2', p.estado === 'respondido' ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-700')}>{p.texto}</span>}</span>
            </li>
          ))}
        </ol>
      </Card>
      {accion && <AccionRFIModal r={r} accion={accion} onCerrar={() => setAccion(null)} />}
    </div>
  )
}

function AccionRFIModal({ r, accion, onCerrar }: { r: RFI; accion: AccionRFI; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionRFI)
  const d = useDatosDominio()
  const t = hoy()
  const [texto, setTexto] = useState('')
  const [oc, setOc] = useState(r.ordenCambioId ?? '')
  const [riesgo, setRiesgo] = useState(r.riesgoId ?? '')
  const [error, setError] = useState<string | null>(null)
  const ocs = d.ordenesCambio.filter((o) => o.obraId === r.obraId && etapaOC(o, t))
  const riesgos = d.riesgos.filter((x) => x.obraId === r.obraId && estadoRiesgo(x, t))
  const etiqueta: Partial<Record<AccionRFI, string>> = { responder: 'Respuesta', repreguntar: 'Qué falta en la respuesta', anular: 'Motivo', cerrar: 'Nota (opcional)' }
  const ayuda: Partial<Record<AccionRFI, string>> = {
    emitir: `Se envía al ${DESTINATARIOS_RFI[r.destinatario].toLowerCase()} con plazo al ${r.fechaLimite != null ? fmtFecha(r.fechaLimite) : '—'}. Desde ahora corre el contador de la RULE-903.`,
    cerrar: 'Si la respuesta tiene impacto, vincula la orden de cambio o el riesgo que originó.',
  }
  return (
    <Modal abierto titulo={`${ACCIONES_RFI[accion]} · RFI N° ${r.numero}`} onCerrar={onCerrar}>
      {ayuda[accion] && <p className="mb-3 text-sm text-slate-600">{ayuda[accion]}</p>}
      <div className="space-y-3">
        {accion === 'cerrar' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Orden de cambio"><select className={inputCls} value={oc} onChange={(e) => setOc(e.target.value)}><option value="">Ninguna</option>{ocs.map((o) => <option key={o.id} value={o.id}>N° {o.numero} {o.titulo}</option>)}</select></Campo>
            <Campo etiqueta="Riesgo"><select className={inputCls} value={riesgo} onChange={(e) => setRiesgo(e.target.value)}><option value="">Ninguno</option>{riesgos.map((x) => <option key={x.id} value={x.id}>R-{String(x.numero).padStart(3, '0')} {x.titulo}</option>)}</select></Campo>
          </div>
        )}
        {etiqueta[accion] && <Campo etiqueta={etiqueta[accion]!}><textarea rows={3} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={accion === 'anular' ? 'peligro' : 'primario'} onClick={() => {
          const err = ejecutar(r.id, accion, { texto, ordenCambioId: oc || undefined, riesgoId: riesgo || undefined })
          if (err) setError(err)
          else onCerrar()
        }}>{ACCIONES_RFI[accion]}</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Submittals ─────────────────────────

function ListaSubmittals({ obraId, rol }: { obraId: string; rol: string }) {
  const d = useDatosDominio()
  const [nuevo, setNuevo] = useState(false)
  const t = hoy()
  const lista = d.submittals.filter((s) => s.obraId === obraId && s.creado <= t).sort((a, b) => b.numero - a.numero || b.revision - a.revision)
  return (
    <Card titulo="Envíos a aprobación (submittals)" accion={puedeCrearSubmittal(rol as never) ? <Boton variante="secundario" onClick={() => setNuevo(true)}>Nuevo submittal</Boton> : undefined}>
      {lista.length === 0 ? <Vacio titulo="Sin submittals" texto="Somete a aprobación del mandante fichas técnicas, muestras y planos de taller." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Submittal</th><th className="font-medium">Tipo</th><th className="font-medium">Se requiere</th><th className="font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2"><div className="font-medium">N° {s.numero} rev. {s.revision} · {s.titulo}</div>{s.proveedor && <div className="text-xs text-slate-500">{s.proveedor}</div>}</td>
                  <td>{TIPOS_SUBMITTAL[s.tipo]}</td>
                  <td className={cx(submittalVencido(s, t) && 'font-medium text-crit')}>{s.fechaRequerida != null ? fmtFecha(s.fechaRequerida) : '—'}</td>
                  <td><EstadoSubmittalBadge s={s} t={t} /></td>
                  <td className="text-right"><Link to={`/submittals/${s.id}`} className="text-marca hover:underline">Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && <NuevoSubmittal obraId={obraId} onCerrar={() => setNuevo(false)} />}
    </Card>
  )
}

function NuevoSubmittal({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearSubmittal)
  const d = useDatosDominio()
  const nav = useNavigate()
  const t = hoy()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const [v, setV] = useState({ titulo: '', tipo: 'ficha_tecnica' as TipoSubmittal, descripcion: '', proveedor: '', requerida: iso(t + 14), partidaId: '' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal abierto titulo="Nuevo submittal" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Qué se somete a aprobación"><input className={inputCls} value={v.titulo} onChange={set('titulo')} placeholder="Ej.: Ficha técnica de ventanas de PVC" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={set('tipo')}>{(Object.keys(TIPOS_SUBMITTAL) as TipoSubmittal[]).map((k) => <option key={k} value={k}>{TIPOS_SUBMITTAL[k]}</option>)}</select></Campo>
          <Campo etiqueta="Proveedor"><input className={inputCls} value={v.proveedor} onChange={set('proveedor')} /></Campo>
          <Campo etiqueta="Se requiere aprobado el" ayuda="Para la compra o el inicio de la actividad."><input type="date" className={inputCls} value={v.requerida} onChange={set('requerida')} /></Campo>
          <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={set('partidaId')}><option value="">Ninguna</option>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea rows={2} className={inputCls} value={v.descripcion} onChange={set('descripcion')} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const r = crear({ obraId, titulo: v.titulo, tipo: v.tipo, descripcion: v.descripcion.trim(), proveedor: v.proveedor.trim() || undefined, partidaIds: v.partidaId ? [v.partidaId] : [], fechaRequerida: v.requerida ? dia(v.requerida) : undefined })
          if (r.error) setError(r.error)
          else { onCerrar(); nav(`/submittals/${r.id}`) }
        }}>Guardar borrador</Boton>
      </div>
    </Modal>
  )
}

export function DetalleSubmittal() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const ejecutar = useStore((s) => s.accionSubmittal)
  const nav = useNavigate()
  const [accion, setAccion] = useState<AccionSubmittal | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const s = d.submittals.find((x) => x.id === id)
  const mandante = rol === 'R11'
  if (!s || (mandante && estadoSubmittal(s, hoy()) === 'borrador')) return <Vacio titulo="Submittal no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to={mandante ? '/mandante' : '/documentos?ver=submittals'} className="text-marca">Volver</Link>} />
  const t = hoy()
  const obra = d.obras.find((o) => o.id === s.obraId)!
  const acciones = accionesSubmittal(s, t, rol)
  const revisiones = d.submittals.filter((x) => x.obraId === s.obraId && x.numero === s.numero && x.creado <= t).sort((a, b) => a.revision - b.revision)
  const partidas = s.partidaIds.map((pid) => d.partidas.find((p) => p.id === pid)).filter((p) => !!p)
  const conTexto = accion === 'aprobar_con_observaciones' || accion === 'rechazar' || accion === 'anular'

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${TIPOS_SUBMITTAL[s.tipo]}${s.proveedor ? ` · ${s.proveedor}` : ''}`}
        accion={acciones.length ? <>{acciones.map((a) => <Boton key={a} variante={a === 'rechazar' || a === 'anular' ? 'secundario' : 'primario'} onClick={() => { setAccion(a); setTexto(''); setError(null) }}>{ACCIONES_SUBMITTAL[a]}</Boton>)}</> : undefined}>
        <span className="flex flex-wrap items-center gap-2">Submittal N° {s.numero} rev. {s.revision} · {s.titulo}<EstadoSubmittalBadge s={s} t={t} /></span>
      </Titulo>
      <Link to={mandante ? '/mandante' : '/documentos?ver=submittals'} className="text-sm text-marca">← {mandante ? 'Portal del mandante' : 'Submittals de la obra'}</Link>
      {submittalVencido(s, t) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Se necesitaba aprobado el {fmtFecha(s.fechaRequerida!)}: la compra o la actividad asociada está detenida.</p>}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="Descripción">
          <p className="text-sm text-slate-800">{s.descripcion || 'Sin descripción.'}</p>
          {partidas.length > 0 && <p className="mt-2 text-sm"><span className="text-slate-500">Partidas: </span>{partidas.map((p) => `${p.codigo} ${p.descripcion}`).join(' · ')}</p>}
          <p className="mt-2 text-sm"><span className="text-slate-500">Se requiere aprobado: </span>{s.fechaRequerida != null ? fmtFecha(s.fechaRequerida) : '—'}</p>
        </Card>
        <Card titulo="Revisiones">
          <ol className="space-y-1 text-sm">
            {revisiones.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2">
                {x.id === s.id ? <span className="font-semibold">Rev. {x.revision}</span> : <Link to={`/submittals/${x.id}`} className="text-marca hover:underline">Rev. {x.revision}</Link>}
                <EstadoSubmittalBadge s={x} t={t} />
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Card titulo="Historial">
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3"><span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(s.creado)}</span><span>Borrador · {s.creadoPor}</span></li>
          {s.historial.filter((p) => p.fecha <= t).map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(p.fecha)}</span>
              <span>{ESTADOS_SUBMITTAL[p.estado]} · {p.por}{p.texto && <span className="mt-1 block rounded-lg bg-slate-50 p-2 text-slate-700">{p.texto}</span>}</span>
            </li>
          ))}
        </ol>
      </Card>
      {accion && (
        <Modal abierto titulo={`${ACCIONES_SUBMITTAL[accion]} · N° ${s.numero} rev. ${s.revision}`} onCerrar={() => setAccion(null)}>
          {accion === 'rechazar' && <p className="mb-3 text-sm text-slate-600">Se creará la revisión {s.revision + 1} en borrador para corregir y reenviar.</p>}
          {conTexto && <Campo etiqueta={accion === 'aprobar_con_observaciones' ? 'Observaciones' : 'Motivo'}><textarea rows={3} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
          {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton>
            <Boton variante={accion === 'rechazar' || accion === 'anular' ? 'peligro' : 'primario'} onClick={() => {
              const r = ejecutar(s.id, accion, { texto })
              if (r.error) return setError(r.error)
              setAccion(null)
              if (r.nuevaRevision && !mandante) nav(`/submittals/${r.nuevaRevision}`)
            }}>{ACCIONES_SUBMITTAL[accion]}</Boton>
          </div>
        </Modal>
      )}
    </div>
  )
}
