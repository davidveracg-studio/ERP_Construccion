// Seguridad y salud en el trabajo (v1.3, 07 workspace R08, 10 §18, 14 KSE): indicadores preventivos y
// de resultado, charlas y ART del día, incidentes con clasificación, investigación, medidas y protocolo
// legal (RULE-802), observaciones preventivas, inspecciones y tareas críticas (RULE-803).
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import {
  ACCIONES_INCIDENTE, accionesIncidente, charlaDelDia, ESTADOS_INCIDENTE, estadoIncidente, esCTP, esGrave, medidaVencida, pasosPendientes, puedeCharla, puedeCumplirMedida,
  puedeGestionarSST, puedeMarcarCritica, puedeObservar, puedeReportarIncidente, TAREAS_CRITICAS, TEMAS_CHARLA, TIPOS_INCIDENTE, TONO_INCIDENTE, veDatosSalud, type AccionIncidente,
} from '../domain/seguridad'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { num, pct } from '../domain/formato'
import type { Incidente, MedidaCorrectiva, ObservacionPreventiva, TipoIncidente, TipoTareaCritica } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'


export default function Seguridad() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [params] = useSearchParams()
  const [reportar, setReportar] = useState(params.get('incidente') === '1')
  const [verInc, setVerInc] = useState<string | null>(null)
  if (!c) return null
  const t = hoy()
  const obraId = c.obra.id
  const k = c.seguridad
  const incs = d.incidentes.filter((i) => i.obraId === obraId && i.creado <= t).sort((a, b) => b.fecha - a.fecha || b.numero - a.numero)
  const medidas = d.medidasCorrectivas.filter((m) => m.obraId === obraId && m.creado <= t)
  const abiertas = medidas.filter((m) => !m.cumplida).sort((a, b) => a.plazo - b.plazo)
  const sel = incs.find((i) => i.id === verInc)
  const metaIF = d.config.umbrales.metaIF ?? 20

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · ${num(k.trabProm, 0)} trabajadores promedio · ${num(k.hhTrab30, 0)} HH en 30 días`}
        accion={puedeReportarIncidente(rol) ? <Boton variante="peligro" onClick={() => setReportar(true)}>⚠ Reportar incidente</Boton> : undefined}>
        Seguridad y salud en el trabajo
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Días sin accidentes CTP (KSE-09)" valor={k.diasSinCTP} sub={`${k.ctp} CTP · ${k.stp} sin tiempo perdido · ${k.incidentesMes} incidentes en 30 días`} estado={k.estado === 'na' ? undefined : k.graveMes ? 'rojo' : k.ctp > 0 ? 'amarillo' : 'verde'} ayuda="Doc 14 KSE-12: alerta ≥ 1 accidente con tiempo perdido · crítico grave o fatal" />
        <Kpi etiqueta="Tasa de frecuencia / gravedad" valor={`${k.if != null ? num(k.if, 1) : '—'} / ${k.ig != null ? num(k.ig, 0) : '—'}`} sub={`IF (KSE-01) e IG (KSE-02) del mes · meta IF ${metaIF}`} estado={k.if == null ? undefined : k.if <= metaIF ? 'verde' : k.if <= 2 * metaIF ? 'amarillo' : 'rojo'} ayuda={`Doc 14 KSE-01: meta ≤ ${metaIF} · alerta > ${metaIF} · crítico > ${2 * metaIF}`} />
        <Kpi etiqueta="Accidentabilidad (KSE-03)" valor={k.accidentabilidad != null ? pct(k.accidentabilidad / 100, 2) : '—'} sub={`siniestralidad ${k.siniestralidad != null ? num(k.siniestralidad, 1) : '—'} días/100 trab.`} />
        <Kpi etiqueta="Medidas correctivas (KSE-08)" valor={k.medidasAbiertas} sub={k.medidasVencidas ? `${k.medidasVencidas} vencida(s)` : 'abiertas, ninguna vencida'} estado={k.medidasVencidas30 > 0 ? 'rojo' : ek('KSE-08', k.medidasVencidas)} ayuda={ayudaKpi('KSE-08') + ', o alguna vencida hace más de 30 días'} />
        <Kpi etiqueta="Charlas diarias (KSE-05)" valor={k.charlas != null ? pct(k.charlas, 0) : '—'} sub="cuadrillas con charla, 7 días" estado={ek('KSE-05', k.charlas)} ayuda={ayudaKpi('KSE-05')} />
        <Kpi etiqueta="ART de tareas críticas (KSE-06)" valor={k.art != null ? pct(k.art, 0) : '—'} sub="tareas críticas con ART, 7 días" estado={ek('KSE-06', k.art)} ayuda={ayudaKpi('KSE-06')} />
        <Kpi etiqueta="Observaciones preventivas (KSE-11)" valor={k.observaciones} sub={`30 días · ${k.obsEnPlazo != null ? pct(k.obsEnPlazo, 0) : '—'} cerradas en plazo · ${k.cuasi != null ? num(k.cuasi, 1) : '—'} cuasi/100 trab.`} estado={ek('KSE-11', k.obsEnPlazo)} ayuda={ayudaKpi('KSE-11')} />
        <Kpi etiqueta="Inspecciones (KSE-10)" valor={k.inspecciones != null ? pct(k.inspecciones, 0) : '—'} sub="realizadas / programadas, 30 días" estado={ek('KSE-10', k.inspecciones)} ayuda={ayudaKpi('KSE-10')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <CharlasHoy obraId={obraId} />
        <Card titulo={`Medidas correctivas abiertas (${abiertas.length})`}>
          {abiertas.length === 0 ? <p className="text-sm text-slate-500">Sin medidas pendientes.</p> : <ListaMedidas medidas={abiertas} />}
        </Card>
      </div>

      <Card titulo="Incidentes">
        {incs.length === 0 ? <p className="text-sm text-slate-500">Sin incidentes reportados.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Incidente</th><th className="font-medium">Tipo</th><th className="font-medium">Fecha</th><th className="text-right font-medium">Días perdidos</th><th className="font-medium">Estado</th><th /></tr></thead>
              <tbody>
                {incs.map((i) => {
                  const e = estadoIncidente(i, t)!
                  const pend = e !== 'cerrado' ? pasosPendientes(i) : []
                  return (
                    <tr key={i.id} className="border-b border-slate-100">
                      <td className="py-2">N° {i.numero} · {i.descripcion}<div className="text-xs text-slate-500">{i.lugar} · {i.empresa}</div></td>
                      <td className="whitespace-nowrap"><span className={cx((esCTP(i) || esGrave(i)) && 'font-medium text-crit')}>{TIPOS_INCIDENTE[i.tipo]}</span></td>
                      <td className="whitespace-nowrap">{fmtFecha(i.fecha)}</td>
                      <td className="text-right">{i.diasPerdidos ?? '—'}</td>
                      <td className="whitespace-nowrap"><Badge tono={TONO_INCIDENTE[e]}>{ESTADOS_INCIDENTE[e]}</Badge>{pend.length > 0 && <Badge tono="rojo">RULE-802</Badge>}</td>
                      <td className="text-right"><button className="text-marca hover:underline" onClick={() => setVerInc(i.id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Observaciones obraId={obraId} jefeTerreno={c.obra.jefeTerreno} />
        <InspeccionesSeg obraId={obraId} />
      </div>
      <TareasCriticas obraId={obraId} />

      {reportar && <ReportarIncidente obraId={obraId} empresa={d.config.empresa || 'Constructora'} onCerrar={() => setReportar(false)} />}
      {sel && <DetalleIncidente i={sel} medidas={medidas.filter((m) => m.origen.tipo === 'incidente' && m.origen.id === sel.id)} jefeTerreno={c.obra.jefeTerreno} onCerrar={() => setVerInc(null)} />}
    </div>
  )
}

/** Charla del día de cada cuadrilla (RULE-801): registrada o pendiente, con registro rápido. */
export function CharlasHoy({ obraId, cuadrillaId }: { obraId: string; cuadrillaId?: string }) {
  const d = useDatosDominio()
  const ui = useStore((s) => s.ui)
  const registrar = useStore((s) => s.registrarCharla)
  const t = hoy()
  const cuadrillas = d.cuadrillas.filter((q) => q.obraId === obraId && (!cuadrillaId || q.id === cuadrillaId))
  const [abierta, setAbierta] = useState<string | null>(null)
  const [v, setV] = useState({ tema: TEMAS_CHARLA[t % TEMAS_CHARLA.length], asistentes: 0 })
  const [error, setError] = useState<string | null>(null)
  const artsHoy = d.arts.filter((a) => a.obraId === obraId && a.fecha === t && (!cuadrillaId || a.cuadrillaId === cuadrillaId))
  return (
    <Card titulo="Charla de seguridad de hoy">
      <ul className="divide-y divide-slate-100 text-sm">
        {cuadrillas.map((q) => {
          const ch = charlaDelDia(d, obraId, q.id, t)
          return (
            <li key={q.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{q.nombre}{ch && <span className="block text-xs font-normal text-slate-500">{ch.tema} · {ch.asistentes} asistentes · {ch.relator}</span>}</span>
                {ch ? <Badge tono="verde">Realizada</Badge> : puedeCharla(ui.rol)
                  ? <Boton variante="secundario" className="min-h-0 py-1" onClick={() => { setAbierta(q.id); setV({ ...v, asistentes: q.trabajadores }); setError(null) }}>Registrar charla</Boton>
                  : <Badge tono="ambar">Pendiente</Badge>}
              </div>
              {abierta === q.id && !ch && (
                <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_auto]">
                  <Campo etiqueta="Tema"><select className={inputCls} value={v.tema} onChange={(e) => setV({ ...v, tema: e.target.value })}>{TEMAS_CHARLA.map((x) => <option key={x}>{x}</option>)}</select></Campo>
                  <Campo etiqueta="Asistentes"><input type="number" className={inputCls} value={v.asistentes} onChange={(e) => setV({ ...v, asistentes: Number(e.target.value) })} /></Campo>
                  <div className="flex items-end"><Boton onClick={() => { const err = registrar({ obraId, fecha: t, cuadrillaId: q.id, tema: v.tema, relator: ui.usuario, asistentes: v.asistentes }); setError(err); if (!err) setAbierta(null) }}>Guardar</Boton></div>
                  {error && <p className="text-sm text-crit sm:col-span-3">{error}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">ART registrados hoy: {artsHoy.length}. {d.config.umbrales.charlaObligatoria !== false ? 'Sin la charla del día el reporte diario no se puede enviar (RULE-801).' : 'La charla faltante genera alerta (RULE-801).'}</p>
    </Card>
  )
}

function ListaMedidas({ medidas }: { medidas: MedidaCorrectiva[] }) {
  const rol = useStore((s) => s.ui.rol)
  const cumplir = useStore((s) => s.cumplirMedida)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ev, setEv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {medidas.map((m) => (
        <li key={m.id} className="py-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span>{m.descripcion}<span className={cx('block text-xs', medidaVencida(m, t) ? 'text-crit' : 'text-slate-500')}>{m.responsable} · plazo {fmtFecha(m.plazo)}{medidaVencida(m, t) ? ' · vencida (RULE-804)' : ''}</span></span>
            {m.cumplida ? <Badge tono="verde">Cumplida {fmtFecha(m.cumplida.fecha)}</Badge> : puedeCumplirMedida(rol) && <button className="text-xs text-marca hover:underline" onClick={() => { setAbierta(m.id); setEv(''); setError(null) }}>Registrar cumplimiento</button>}
          </div>
          {abierta === m.id && (
            <div className="mt-2 flex gap-2">
              <input className={cx(inputCls, 'py-1')} value={ev} onChange={(e) => setEv(e.target.value)} placeholder="Evidencia (foto, registro, verificación)" />
              <Boton className="min-h-0 py-1" onClick={() => { const err = cumplir(m.id, ev); setError(err); if (!err) setAbierta(null) }}>Guardar</Boton>
            </div>
          )}
          {abierta === m.id && error && <p className="text-xs text-crit">{error}</p>}
        </li>
      ))}
    </ul>
  )
}

const PASOS: [keyof NonNullable<Incidente['protocolo']>, string][] = [
  ['suspension', 'Faena afectada suspendida'], ['avisoInspeccion', 'Aviso a la Inspección del Trabajo'], ['avisoSeremi', 'Aviso a la SEREMI de Salud'], ['diat', 'Denuncia DIAT'], ['reanudacion', 'Reanudación autorizada'],
]

function DetalleIncidente({ i, medidas, jefeTerreno, onCerrar }: { i: Incidente; medidas: MedidaCorrectiva[]; jefeTerreno: string; onCerrar: () => void }) {
  const rol = useStore((s) => s.ui.rol)
  const accion = useStore((s) => s.accionIncidente)
  const paso = useStore((s) => s.pasoProtocolo)
  const crearMedida = useStore((s) => s.crearMedida)
  const t = hoy()
  const e = estadoIncidente(i, t)!
  const acciones = accionesIncidente(i, t, rol)
  const [v, setV] = useState({ tipo: i.tipo, potencial: i.potencial ?? 'bajo', diasPerdidos: String(i.diasPerdidos ?? 0), causas: i.causas ?? '' })
  const [m, setM] = useState({ descripcion: '', responsable: jefeTerreno, plazo: iso(t + 7) })
  const [error, setError] = useState<string | null>(null)
  const aplicables = PASOS.filter(([k]) => (k === 'diat' ? esCTP(i) : esGrave(i)))
  const ejecutar = (a: AccionIncidente) => {
    const err = accion(i.id, a, { tipo: v.tipo, potencial: v.tipo === 'cuasi' ? v.potencial : undefined, diasPerdidos: esCTP({ ...i, tipo: v.tipo }) ? Number(v.diasPerdidos || 0) : undefined, causas: v.causas })
    if (err) setError(err)
    else onCerrar()
  }
  return (
    <Modal abierto titulo={`Incidente N° ${i.numero} · ${TIPOS_INCIDENTE[i.tipo]}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2"><Badge tono={TONO_INCIDENTE[e]}>{ESTADOS_INCIDENTE[e]}</Badge>{i.potencial && <Badge tono="gris">Potencial {i.potencial}</Badge>}</div>
        <p className="font-medium">{i.descripcion}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
          <dt>Fecha y lugar</dt><dd>{fmtFecha(i.fecha)} · {i.lugar}</dd>
          <dt>Empresa</dt><dd>{i.empresa}</dd>
          <dt>Afectado</dt><dd>{i.afectado ? (veDatosSalud(rol) ? i.afectado : 'Reservado (Prevención y Gerencia)') : '—'}</dd>
          {i.diasPerdidos != null && <><dt>Días perdidos</dt><dd>{i.diasPerdidos}</dd></>}
          {i.causas && <><dt>Causas</dt><dd>{i.causas}</dd></>}
          <dt>Reportado por</dt><dd>{i.creadoPor}</dd>
        </dl>
        {aplicables.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className="mb-1 font-medium text-red-900">Protocolo legal (RULE-802, Ley 16.744)</div>
            <ul className="space-y-1">
              {aplicables.map(([k, txt]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{i.protocolo?.[k] != null ? '✓' : '○'} {txt}{i.protocolo?.[k] != null && <span className="text-xs text-slate-500"> · {fmtFecha(i.protocolo[k]!)}</span>}</span>
                  {i.protocolo?.[k] == null && (puedeGestionarSST(rol) || rol === 'R02') && (k !== 'reanudacion' || i.protocolo?.suspension != null) && <button className="text-xs text-marca hover:underline" onClick={() => setError(paso(i.id, k))}>Registrar hoy</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(medidas.length > 0 || (puedeGestionarSST(rol) && e !== 'cerrado')) && (
          <div>
            <div className="mb-1 font-medium">Medidas correctivas</div>
            {medidas.length > 0 ? <ListaMedidas medidas={medidas} /> : <p className="text-slate-500">Sin medidas.</p>}
            {puedeGestionarSST(rol) && (e === 'en_investigacion' || e === 'medidas_en_curso') && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <input className={inputCls} value={m.descripcion} onChange={(ev) => setM({ ...m, descripcion: ev.target.value })} placeholder="Nueva medida" />
                <input className={inputCls} value={m.responsable} onChange={(ev) => setM({ ...m, responsable: ev.target.value })} />
                <input type="date" className={inputCls} value={m.plazo} onChange={(ev) => setM({ ...m, plazo: ev.target.value })} />
                <Boton variante="secundario" onClick={() => { const err = crearMedida({ obraId: i.obraId, origen: { tipo: 'incidente', id: i.id }, descripcion: m.descripcion, responsable: m.responsable, plazo: dia(m.plazo) }); setError(err); if (!err) setM({ ...m, descripcion: '' }) }}>Agregar</Boton>
              </div>
            )}
          </div>
        )}
        {acciones.includes('clasificar') && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(ev) => setV({ ...v, tipo: ev.target.value as TipoIncidente })}>{(Object.keys(TIPOS_INCIDENTE) as TipoIncidente[]).map((x) => <option key={x} value={x}>{TIPOS_INCIDENTE[x]}</option>)}</select></Campo>
            {v.tipo === 'cuasi' && <Campo etiqueta="Potencial"><select className={inputCls} value={v.potencial} onChange={(ev) => setV({ ...v, potencial: ev.target.value as 'bajo' | 'alto' })}><option value="bajo">Bajo</option><option value="alto">Alto</option></select></Campo>}
            {esCTP({ ...i, tipo: v.tipo }) && <Campo etiqueta="Días perdidos estimados"><input type="number" className={inputCls} value={v.diasPerdidos} onChange={(ev) => setV({ ...v, diasPerdidos: ev.target.value })} /></Campo>}
          </div>
        )}
        {acciones.includes('medidas') && <Campo etiqueta="Causas (investigación)"><textarea className={inputCls} rows={2} value={v.causas} onChange={(ev) => setV({ ...v, causas: ev.target.value })} /></Campo>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {acciones.map((a) => <Boton key={a} variante={a === 'cerrar' ? 'secundario' : 'primario'} onClick={() => ejecutar(a)}>{ACCIONES_INCIDENTE[a]}</Boton>)}
      </div>
    </Modal>
  )
}

export function ReportarIncidente({ obraId, empresa, onCerrar }: { obraId: string; empresa: string; onCerrar: () => void }) {
  const reportar = useStore((s) => s.reportarIncidente)
  const [v, setV] = useState({ tipo: 'cuasi' as TipoIncidente, fecha: iso(hoy()), descripcion: '', lugar: '', afectado: '', empresa })
  const [error, setError] = useState<string | null>(null)
  const grave = v.tipo === 'grave' || v.tipo === 'fatal'
  return (
    <Modal abierto titulo="Reportar incidente" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="¿Qué pasó?"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoIncidente })}>{(Object.keys(TIPOS_INCIDENTE) as TipoIncidente[]).map((x) => <option key={x} value={x}>{TIPOS_INCIDENTE[x]}</option>)}</select></Campo>
        <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Descripción"><textarea className={inputCls} rows={2} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Qué ocurrió, con qué y cómo" /></Campo></div>
        <Campo etiqueta="Lugar"><input className={inputCls} value={v.lugar} onChange={(e) => setV({ ...v, lugar: e.target.value })} placeholder="Losa piso 3, eje B" /></Campo>
        <Campo etiqueta="Empresa del afectado"><input className={inputCls} value={v.empresa} onChange={(e) => setV({ ...v, empresa: e.target.value })} /></Campo>
        {v.tipo !== 'cuasi' && v.tipo !== 'danio_material' && <Campo etiqueta="Trabajador afectado"><input className={inputCls} value={v.afectado} onChange={(e) => setV({ ...v, afectado: e.target.value })} /></Campo>}
      </div>
      {grave && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">Accidente grave o fatal (RULE-802): suspender la faena afectada y avisar de inmediato a la Inspección del Trabajo y a la SEREMI de Salud. Prevención, el administrador y Gerencia quedan notificados.</p>}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" onClick={() => { const err = reportar({ obraId, fecha: dia(v.fecha), tipo: v.tipo, descripcion: v.descripcion, lugar: v.lugar, empresa: v.empresa, afectado: v.afectado }); if (err) setError(err); else onCerrar() }}>Reportar</Boton>
      </div>
    </Modal>
  )
}

function Observaciones({ obraId, jefeTerreno }: { obraId: string; jefeTerreno: string }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const registrar = useStore((s) => s.registrarObservacion)
  const cerrar = useStore((s) => s.cerrarObservacion)
  const t = hoy()
  const [nueva, setNueva] = useState(false)
  const [v, setV] = useState({ tipo: 'condicion' as ObservacionPreventiva['tipo'], segura: false, descripcion: '', responsable: jefeTerreno })
  const [error, setError] = useState<string | null>(null)
  const obs = d.observacionesPreventivas.filter((o) => o.obraId === obraId && o.fecha <= t).sort((a, b) => b.fecha - a.fecha).slice(0, 8)
  return (
    <Card titulo="Observaciones preventivas" accion={puedeObservar(rol) ? <button className="text-sm text-marca hover:underline" onClick={() => setNueva(!nueva)}>+ Registrar</button> : undefined}>
      {nueva && (
        <div className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as ObservacionPreventiva['tipo'] })}><option value="condicion">Condición</option><option value="conducta">Conducta</option></select></Campo>
          <Campo etiqueta="Resultado"><select className={inputCls} value={v.segura ? 's' : 'n'} onChange={(e) => setV({ ...v, segura: e.target.value === 's' })}><option value="n">Insegura (corregir)</option><option value="s">Segura (refuerzo)</option></select></Campo>
          <div className="sm:col-span-2"><Campo etiqueta="Observación"><input className={inputCls} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Campo></div>
          {!v.segura && <Campo etiqueta="Responsable de corregir"><input className={inputCls} value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>}
          <div className="flex items-end gap-2"><Boton onClick={() => { const err = registrar({ obraId, fecha: t, tipo: v.tipo, segura: v.segura, descripcion: v.descripcion, responsable: v.segura ? '' : v.responsable, plazo: t + 3 }); setError(err); if (!err) { setNueva(false); setV({ ...v, descripcion: '' }) } }}>Guardar</Boton>{error && <span className="text-sm text-crit">{error}</span>}</div>
        </div>
      )}
      {obs.length === 0 ? <p className="text-sm text-slate-500">Sin observaciones.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {obs.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <span>{o.descripcion}<span className="block text-xs text-slate-500">{fmtFecha(o.fecha)} · {o.tipo === 'conducta' ? 'Conducta' : 'Condición'}{o.segura ? ' segura' : ` insegura · ${o.responsable} · plazo ${fmtFecha(o.plazo)}`}</span></span>
              {o.segura ? <Badge tono="verde">Refuerzo</Badge> : o.cerrada != null ? <Badge tono="verde">Corregida</Badge>
                : puedeObservar(rol) ? <button className="text-xs text-marca hover:underline" onClick={() => setError(cerrar(o.id))}>Marcar corregida</button>
                  : <Badge tono={o.plazo < t ? 'rojo' : 'ambar'}>Abierta</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function InspeccionesSeg({ obraId }: { obraId: string }) {
  const d = useDatosDominio()
  const ui = useStore((s) => s.ui)
  const programar = useStore((s) => s.programarInspeccionSeg)
  const realizar = useStore((s) => s.realizarInspeccionSeg)
  const t = hoy()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [v, setV] = useState({ cumplimiento: '100', hallazgos: '' })
  const [error, setError] = useState<string | null>(null)
  const lista = d.inspeccionesSeguridad.filter((i) => i.obraId === obraId).sort((a, b) => b.programada - a.programada).slice(0, 6)
  const r08 = puedeGestionarSST(ui.rol)
  return (
    <Card titulo="Inspecciones de seguridad" accion={r08 ? <button className="text-sm text-marca hover:underline" onClick={() => setError(programar({ obraId, programada: t + 7, inspector: ui.usuario }))}>+ Programar en 7 días</button> : undefined}>
      <ul className="divide-y divide-slate-100 text-sm">
        {lista.map((i) => (
          <li key={i.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{fmtFecha(i.programada)} · {i.inspector}{i.realizada && <span className="block text-xs text-slate-500">{i.realizada.hallazgos}</span>}</span>
              {i.realizada ? <Badge tono={i.realizada.cumplimiento >= 0.9 ? 'verde' : 'ambar'}>{pct(i.realizada.cumplimiento, 0)} cumplimiento</Badge>
                : r08 && i.programada <= t ? <button className="text-xs text-marca hover:underline" onClick={() => setAbierta(i.id)}>Registrar</button>
                  : <Badge tono={i.programada < t ? 'rojo' : 'gris'}>{i.programada < t ? 'Atrasada' : 'Programada'}</Badge>}
            </div>
            {abierta === i.id && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input type="number" className={inputCls} value={v.cumplimiento} onChange={(e) => setV({ ...v, cumplimiento: e.target.value })} aria-label="Cumplimiento %" />
                <input className={inputCls} value={v.hallazgos} onChange={(e) => setV({ ...v, hallazgos: e.target.value })} placeholder="Hallazgos" />
                <Boton onClick={() => { const err = realizar(i.id, { cumplimiento: Number(v.cumplimiento) / 100, hallazgos: v.hallazgos }); setError(err); if (!err) setAbierta(null) }}>Guardar</Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
    </Card>
  )
}

function TareasCriticas({ obraId }: { obraId: string }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const marcar = useStore((s) => s.marcarTareaCritica)
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const criticas = partidas.filter((p) => p.tareaCritica)
  const edita = puedeMarcarCritica(rol)
  return (
    <Card titulo={`Tareas críticas (${criticas.length})`}>
      <p className="mb-2 text-sm text-slate-600">Para reportar avance en estas partidas la cuadrilla debe tener el ART del día firmado (RULE-803).</p>
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {(edita ? partidas : criticas).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1">
            <span>{p.codigo} {p.descripcion}</span>
            {edita ? (
              <select className={cx(inputCls, 'w-44 py-1')} value={p.tareaCritica ?? ''} onChange={(e) => marcar(p.id, (e.target.value || null) as TipoTareaCritica | null)}>
                <option value="">No crítica</option>
                {(Object.keys(TAREAS_CRITICAS) as TipoTareaCritica[]).map((k) => <option key={k} value={k}>{TAREAS_CRITICAS[k]}</option>)}
              </select>
            ) : <Badge tono="ambar">{TAREAS_CRITICAS[p.tareaCritica!]}</Badge>}
          </div>
        ))}
      </div>
    </Card>
  )
}
