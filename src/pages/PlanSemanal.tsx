// Plan semanal Last Planner (v1.1, RF-PLA-08, 10 §8, KPL-04): tareas por cuadrilla con meta de la
// semana, restricciones (las de RFI y submittal se liberan solas), compromiso en la reunión semanal,
// cierre con lo logrado según los RDO y causa de no cumplimiento, PPC por semana y Pareto de causas.
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import FiguraPPC from '../components/iso/FiguraPPC'
import { suave, useProgreso } from '../components/animacion'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { num, pct } from '../domain/formato'
import {
  ACCIONES_TAREA, accionesTarea, avanceReportado, CAUSAS_CNC, estadoPPC, estadoTarea, ESTADOS_TAREA, indicadoresLP, liberacion, lunesDe, META_PPC,
  ppcSemana, semanaCerrada, puedeGestionarRestricciones, puedePlanificar, restriccionesAbiertas, restriccionUrgente, tareaCritica, TIPOS_RESTRICCION, TONO_TAREA,
  PPC_ROJO, type AccionTarea, type Contexto, type SemanaPPC,
} from '../domain/lastPlanner'
import type { CausaNoCumplimiento, TareaSemanal, TipoRestriccion } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const fmtSemana = (lunes: number) => `${fmtFecha(lunes)} al ${fmtFecha(lunes + 4)}`

export default function PlanSemanal() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const t = hoy()
  // Desde el sábado la semana ya cerró: se muestra la siguiente
  const enCurso = semanaCerrada(lunesDe(t), t) ? lunesDe(t) + 7 : lunesDe(t)
  const [semana, setSemana] = useState(enCurso)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  if (!c) return null
  const ctx: Contexto = { rfis: d.rfis, submittals: d.submittals }
  const tareas = d.tareasSemanales.filter((x) => x.obraId === c.obra.id && x.creado <= t)
  const ind = indicadoresLP(tareas, ctx, t)
  const delaSemana = tareas.filter((x) => x.semana === semana).sort((a, b) => a.inicio - b.inicio || a.descripcion.localeCompare(b.descripcion))
  const ppc = ppcSemana(tareas, semana, t)
  const sel = detalle ? tareas.find((x) => x.id === detalle) : undefined
  const maxCausa = Math.max(1, ...ind.causas.map((x) => x.n))
  const etiquetaSemana = semana === enCurso ? (enCurso > t ? 'Próxima semana' : 'Semana en curso') : semana === enCurso + 7 ? 'Semana siguiente' : semana > enCurso ? 'Planificación anticipada' : 'Semana anterior'

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · plan de corto plazo por cuadrilla, restricciones y cumplimiento`}
        accion={puedePlanificar(rol) ? <Boton onClick={() => setNueva(true)}>Nueva tarea</Boton> : undefined}>
        Plan semanal (Last Planner)
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="PPC última semana" valor={ind.ultima?.ppc != null ? pct(ind.ultima.ppc, 0) : '—'} estado={ind.estado}
          sub={ind.ultima ? `KPL-04 · ${ind.ultima.cumplidas} de ${ind.ultima.comprometidas} · meta ${pct(META_PPC, 0)}` : 'KPL-04'} />
        <Kpi etiqueta="PPC 8 semanas" valor={ind.ppcPromedio != null ? pct(ind.ppcPromedio, 0) : '—'} estado={estadoPPC(ind.ppcPromedio)} sub={`${ind.serie.filter((s) => s.cerrada).length} semanas cerradas`} />
        <Kpi etiqueta="Restricciones abiertas" valor={ind.restriccionesAbiertas} sub={ind.restriccionesVencidas ? `${ind.restriccionesVencidas} pasadas de su fecha` : 'en tareas por ejecutar'}
          estado={ind.restriccionesVencidas ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Por iniciar con restricción" valor={ind.urgentes} sub="en las próximas 48 h · RULE-114" estado={ind.urgentes ? 'rojo' : 'verde'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="PPC por semana" accion={<span className="text-xs text-slate-500">Elige una semana para ver sus tareas</span>}>
          {ind.serie.length === 0 ? <p className="text-sm text-slate-500">Aún no hay semanas comprometidas.</p> : (
            <div className="grid items-center gap-4 2xl:grid-cols-2 [&>*]:min-w-0">
              <GraficoPPC serie={ind.serie} semana={semana} onSemana={setSemana} />
              <div className="mx-auto w-full max-w-md"><FiguraPPC serie={ind.serie} semana={semana} onSemana={setSemana} /></div>
            </div>
          )}
        </Card>
        <Card titulo="Causas de no cumplimiento (8 semanas)">
          {ind.causas.length === 0 ? <p className="text-sm text-slate-500">Sin tareas no cumplidas.</p> : (
            <ul className="space-y-2 text-sm">
              {ind.causas.map((x) => (
                <li key={x.causa}>
                  <div className="flex justify-between"><span>{CAUSAS_CNC[x.causa]}</span><span className="tabular text-slate-500">{x.n}</span></div>
                  <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-amber-400" style={{ width: `${(x.n / maxCausa) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card titulo={
        <span className="flex flex-wrap items-center gap-2">
          <button className="rounded px-2 text-lg text-marca hover:bg-blue-50" onClick={() => setSemana(semana - 7)} aria-label="Semana anterior">‹</button>
          <span>{etiquetaSemana} · {fmtSemana(semana)}</span>
          <button className="rounded px-2 text-lg text-marca hover:bg-blue-50" onClick={() => setSemana(semana + 7)} aria-label="Semana siguiente">›</button>
          {ppc.cerrada && ppc.ppc != null && <Badge tono={estadoPPC(ppc.ppc) === 'verde' ? 'verde' : estadoPPC(ppc.ppc) === 'amarillo' ? 'ambar' : 'rojo'}>PPC {pct(ppc.ppc, 0)}</Badge>}
        </span>
      } accion={semana !== enCurso ? <button className="text-sm text-marca" onClick={() => setSemana(enCurso)}>Ir a la semana actual</button> : undefined}>
        {delaSemana.length === 0 ? <Vacio titulo="Sin tareas" texto="Propón las tareas de la semana por cuadrilla, con su meta y restricciones." /> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Tarea</th><th className="font-medium">Días</th><th className="text-right font-medium">Meta</th>
                  <th className="text-right font-medium">Logrado</th><th className="font-medium">Restricciones</th><th className="font-medium">Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {delaSemana.map((x) => {
                  const e = estadoTarea(x, t)!
                  const p = d.partidas.find((y) => y.id === x.partidaId)
                  const logrado = x.logrado ?? (e === 'en_ejecucion' ? avanceReportado(x, d.rdos, t) : null)
                  const abiertas = restriccionesAbiertas(x, ctx, t).length
                  return (
                    <tr key={x.id} className="border-b border-slate-100">
                      <td className="py-2"><div className="font-medium">{x.descripcion}</div><div className="text-xs text-slate-500">{x.responsable}{x.reemplazaA ? ' · replanificada' : ''}</div></td>
                      <td>{fmtFecha(x.inicio).slice(0, 5)}–{fmtFecha(x.fin).slice(0, 5)}</td>
                      <td className="text-right">{num(x.meta, x.meta % 1 ? 1 : 0)} {p?.unidad}</td>
                      <td className={cx('text-right', logrado != null && logrado < x.meta && e !== 'en_ejecucion' && 'text-crit')}>{logrado != null ? `${num(logrado, logrado % 1 ? 1 : 0)} ${p?.unidad ?? ''}` : '—'}</td>
                      <td>{x.restricciones.length === 0 ? <span className="text-xs text-slate-400">—</span> : abiertas ? <Badge tono={restriccionUrgente(x, ctx, t) ? 'rojo' : 'ambar'}>{abiertas} abierta(s)</Badge> : <Badge tono="verde">Liberadas</Badge>}</td>
                      <td><Badge tono={TONO_TAREA[e]}>{ESTADOS_TAREA[e]}</Badge>{x.causa && <div className="text-xs text-slate-500">{CAUSAS_CNC[x.causa]}</div>}</td>
                      <td className="text-right"><button className="text-marca hover:underline" onClick={() => setDetalle(x.id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel && <DetalleTarea x={sel} ctx={ctx} onCerrar={() => setDetalle(null)} />}
      {nueva && <NuevaTarea obraId={c.obra.id} semana={semana >= enCurso ? semana : enCurso} onCerrar={() => setNueva(false)} />}
    </div>
  )
}

function NuevaTarea({ obraId, semana, onCerrar }: { obraId: string; semana: number; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearTarea)
  const d = useDatosDominio()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const cuadrillas = d.cuadrillas.filter((c) => c.obraId === obraId)
  const [v, setV] = useState({ descripcion: '', partidaId: partidas[0]?.id ?? '', cuadrillaId: cuadrillas[0]?.id ?? '', responsable: cuadrillas[0]?.capataz ?? '', meta: '', inicio: iso(semana), fin: iso(semana + 4) })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const unidad = partidas.find((p) => p.id === v.partidaId)?.unidad
  return (
    <Modal abierto titulo={`Nueva tarea · semana del ${fmtFecha(semana)}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Partida">
          <select className={inputCls} value={v.partidaId} onChange={set('partidaId')}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select>
        </Campo>
        <Campo etiqueta="Tarea (opcional)" ayuda="Si se deja vacía, se usa el nombre de la partida y la cuadrilla."><input className={inputCls} value={v.descripcion} onChange={set('descripcion')} placeholder="Ej.: Losa del piso 5, sector A" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cuadrilla">
            <select className={inputCls} value={v.cuadrillaId} onChange={(e) => setV({ ...v, cuadrillaId: e.target.value, responsable: cuadrillas.find((c) => c.id === e.target.value)?.capataz ?? v.responsable })}>
              {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Responsable"><input className={inputCls} value={v.responsable} onChange={set('responsable')} /></Campo>
          <Campo etiqueta={`Meta de la semana${unidad ? ` (${unidad})` : ''}`}><input type="number" min={0} className={inputCls} value={v.meta} onChange={set('meta')} /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Inicio"><input type="date" className={inputCls} value={v.inicio} min={iso(semana)} max={iso(semana + 6)} onChange={set('inicio')} /></Campo>
            <Campo etiqueta="Término"><input type="date" className={inputCls} value={v.fin} min={iso(semana)} max={iso(semana + 6)} onChange={set('fin')} /></Campo>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const p = partidas.find((x) => x.id === v.partidaId)
          const cq = cuadrillas.find((x) => x.id === v.cuadrillaId)
          const err = crear({
            obraId, semana, partidaId: v.partidaId || undefined, cuadrillaId: v.cuadrillaId || undefined, responsable: v.responsable, meta: Number(v.meta || 0),
            descripcion: v.descripcion.trim() || `${p?.descripcion ?? 'Tarea'}${cq ? ` · ${cq.nombre}` : ''}`, inicio: dia(v.inicio), fin: dia(v.fin),
          })
          if (err) setError(err)
          else onCerrar()
        }}>Proponer</Boton>
      </div>
    </Modal>
  )
}

function DetalleTarea({ x, ctx, onCerrar }: { x: TareaSemanal; ctx: Contexto; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const ejecutar = useStore((s) => s.accionTarea)
  const agregar = useStore((s) => s.agregarRestriccion)
  const liberar = useStore((s) => s.liberarRestriccion)
  const replanificar = useStore((s) => s.replanificarTarea)
  const t = hoy()
  const e = estadoTarea(x, t)!
  const p = d.partidas.find((y) => y.id === x.partidaId)
  const reportado = t > x.inicio ? avanceReportado(x, d.rdos, t) : null
  const acciones = accionesTarea(x, t, rol)
  const critica = tareaCritica(x, calcularObra(d, x.obraId, t))
  const [cierre, setCierre] = useState<AccionTarea | null>(null)
  const [logrado, setLogrado] = useState(String(reportado ?? ''))
  const [causa, setCausa] = useState<CausaNoCumplimiento | ''>('')
  const [nota, setNota] = useState('')
  const [rx, setRx] = useState<null | { tipo: TipoRestriccion; descripcion: string; responsable: string; fecha: string; rfiId: string; submittalId: string }>(null)
  const [error, setError] = useState<string | null>(null)
  const rfis = d.rfis.filter((r) => r.obraId === x.obraId && r.historial.length)
  const subs = d.submittals.filter((s) => s.obraId === x.obraId && s.historial.length)
  const obra = d.obras.find((o) => o.id === x.obraId)!
  const correr = (err: string | null) => (err ? setError(err) : (setError(null), setCierre(null)))
  const gestiona = puedeGestionarRestricciones(rol) && (e === 'propuesta' || e === 'comprometida')
  const yaReplanificada = d.tareasSemanales.some((y) => y.reemplazaA === x.id)

  return (
    <Modal abierto titulo={x.descripcion} onCerrar={onCerrar}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tono={TONO_TAREA[e]}>{ESTADOS_TAREA[e]}</Badge>
          {critica && <Badge tono="rojo">Ruta crítica</Badge>}
          <span className="text-slate-500">{x.responsable} · {fmtFecha(x.inicio)} al {fmtFecha(x.fin)}</span>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <div><dt className="text-xs text-slate-500">Meta</dt><dd className="font-semibold">{num(x.meta, x.meta % 1 ? 1 : 0)} {p?.unidad}</dd></div>
          <div><dt className="text-xs text-slate-500">Reportado en RDO</dt><dd className="font-semibold">{reportado != null ? `${num(reportado, reportado % 1 ? 1 : 0)} ${p?.unidad ?? ''}` : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Logrado al cierre</dt><dd className="font-semibold">{x.logrado != null ? `${num(x.logrado, x.logrado % 1 ? 1 : 0)} ${p?.unidad ?? ''}` : '—'}</dd></div>
        </dl>
        {x.causa && <p className="rounded-lg bg-red-50 p-2 text-red-900">No cumplida por <b>{CAUSAS_CNC[x.causa]}</b>.</p>}

        <div>
          <div className="mb-1 flex items-center justify-between"><h4 className="font-medium">Restricciones</h4>{gestiona && !rx && <button className="text-marca hover:underline" onClick={() => setRx({ tipo: 'material', descripcion: '', responsable: obra.administrador, fecha: iso(Math.max(t + 1, x.inicio - 2)), rfiId: '', submittalId: '' })}>+ Agregar</button>}</div>
          {x.restricciones.length === 0 && !rx && <p className="text-slate-500">Sin restricciones.</p>}
          <ul className="divide-y divide-slate-100">
            {x.restricciones.map((r) => {
              const lib = liberacion(r, ctx, t)
              const vinculo = r.rfiId ? d.rfis.find((q) => q.id === r.rfiId) : undefined
              const sub = r.submittalId ? d.submittals.find((q) => q.id === r.submittalId) : undefined
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <div>
                    <Badge tono="gris">{TIPOS_RESTRICCION[r.tipo]}</Badge> {r.descripcion}
                    <div className="text-xs text-slate-500">
                      {r.responsable} · comprometida al {fmtFecha(r.fechaCompromiso)}
                      {vinculo && <> · <Link to={`/rfi/${vinculo.id}`} className="text-marca hover:underline">RFI N° {vinculo.numero}</Link></>}
                      {sub && <> · <Link to={`/submittals/${sub.id}`} className="text-marca hover:underline">Submittal N° {sub.numero}</Link></>}
                    </div>
                  </div>
                  {lib != null ? <Badge tono="verde">Liberada {fmtFecha(lib)}</Badge>
                    : <span className="flex items-center gap-2"><Badge tono={r.fechaCompromiso < t ? 'rojo' : 'ambar'}>Abierta</Badge>{gestiona && !r.rfiId && !r.submittalId && <button className="text-xs text-marca hover:underline" onClick={() => correr(liberar(x.id, r.id))}>Liberar</button>}</span>}
                </li>
              )
            })}
          </ul>
          {rx && (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo etiqueta="Tipo"><select className={inputCls} value={rx.tipo} onChange={(ev) => setRx({ ...rx, tipo: ev.target.value as TipoRestriccion })}>{(Object.keys(TIPOS_RESTRICCION) as TipoRestriccion[]).map((k) => <option key={k} value={k}>{TIPOS_RESTRICCION[k]}</option>)}</select></Campo>
                <Campo etiqueta="Liberar a más tardar"><input type="date" className={inputCls} value={rx.fecha} onChange={(ev) => setRx({ ...rx, fecha: ev.target.value })} /></Campo>
              </div>
              {rx.tipo === 'rfi' && <Campo etiqueta="RFI (se libera al responderse)"><select className={inputCls} value={rx.rfiId} onChange={(ev) => setRx({ ...rx, rfiId: ev.target.value })}><option value="">Elegir…</option>{rfis.map((q) => <option key={q.id} value={q.id}>N° {q.numero} {q.asunto}</option>)}</select></Campo>}
              {rx.tipo === 'submittal' && <Campo etiqueta="Submittal (se libera al aprobarse)"><select className={inputCls} value={rx.submittalId} onChange={(ev) => setRx({ ...rx, submittalId: ev.target.value })}><option value="">Elegir…</option>{subs.map((q) => <option key={q.id} value={q.id}>N° {q.numero} rev. {q.revision} {q.titulo}</option>)}</select></Campo>}
              <Campo etiqueta="Restricción"><input className={inputCls} value={rx.descripcion} onChange={(ev) => setRx({ ...rx, descripcion: ev.target.value })} placeholder="Ej.: Llegada de moldaje adicional" /></Campo>
              <Campo etiqueta="Quién la libera"><input className={inputCls} value={rx.responsable} onChange={(ev) => setRx({ ...rx, responsable: ev.target.value })} /></Campo>
              <div className="flex justify-end gap-2">
                <Boton variante="secundario" onClick={() => setRx(null)}>Cancelar</Boton>
                <Boton onClick={() => {
                  const q = rfis.find((y) => y.id === rx.rfiId)
                  const s = subs.find((y) => y.id === rx.submittalId)
                  const err = agregar(x.id, {
                    tipo: rx.tipo, responsable: rx.responsable, fechaCompromiso: dia(rx.fecha), rfiId: rx.rfiId || undefined, submittalId: rx.submittalId || undefined,
                    descripcion: rx.descripcion.trim() || (q ? `Respuesta del RFI N° ${q.numero}` : s ? `Aprobación del submittal N° ${s.numero}` : ''),
                  })
                  if (err) setError(err)
                  else { setRx(null); setError(null) }
                }}>Agregar</Boton>
              </div>
            </div>
          )}
        </div>

        {cierre && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <Campo etiqueta={`Logrado${p ? ` (${p.unidad})` : ''}`} ayuda={reportado != null ? `Los RDO de la tarea suman ${num(reportado, reportado % 1 ? 1 : 0)}.` : undefined}>
              <input type="number" min={0} className={inputCls} value={logrado} onChange={(ev) => setLogrado(ev.target.value)} />
            </Campo>
            {cierre === 'no_cumplir' && (
              <Campo etiqueta="Causa de no cumplimiento">
                <select className={inputCls} value={causa} onChange={(ev) => setCausa(ev.target.value as CausaNoCumplimiento)}><option value="">Elegir…</option>{(Object.keys(CAUSAS_CNC) as CausaNoCumplimiento[]).map((k) => <option key={k} value={k}>{CAUSAS_CNC[k]}</option>)}</select>
              </Campo>
            )}
            <Campo etiqueta="Nota (opcional)"><input className={inputCls} value={nota} onChange={(ev) => setNota(ev.target.value)} /></Campo>
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setCierre(null)}>Cancelar</Boton>
              <Boton variante={cierre === 'no_cumplir' ? 'peligro' : 'primario'} onClick={() => correr(ejecutar(x.id, cierre, { logrado: logrado === '' ? undefined : Number(logrado), causa: causa || undefined, nota }))}>{ACCIONES_TAREA[cierre]}</Boton>
            </div>
          </div>
        )}

        {x.historial.length > 0 && (
          <ol className="space-y-1 text-xs text-slate-600">
            {x.historial.filter((h) => h.fecha <= t).map((h, i) => <li key={i}>{fmtFecha(h.fecha)} · {ESTADOS_TAREA[h.estado]} · {h.por}{h.texto ? ` · “${h.texto}”` : ''}</li>)}
          </ol>
        )}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {e === 'no_cumplida' && puedePlanificar(rol) && !yaReplanificada && <Boton variante="secundario" onClick={() => correr(replanificar(x.id))}>Replanificar lo que faltó</Boton>}
        {!cierre && acciones.map((a) => (
          <Boton key={a} variante={a === 'no_cumplir' ? 'secundario' : 'primario'}
            onClick={() => (a === 'cumplir' || a === 'no_cumplir' ? setCierre(a) : correr(ejecutar(x.id, a)))}>{ACCIONES_TAREA[a]}</Boton>
        ))}
      </div>
    </Modal>
  )
}

// PPC por semana: las barras suben una tras otra; líneas de meta (80 %) y de alerta roja (60 %)
function GraficoPPC({ serie, semana, onSemana }: { serie: SemanaPPC[]; semana: number; onSemana: (lunes: number) => void }) {
  const anim = useProgreso<HTMLDivElement>(1800, serie.map((s) => s.ppc).join())
  const crece = (i: number) => suave(Math.min(1, Math.max(0, anim.p * (serie.length + 2) - i) / 2))
  return (
    <div ref={anim.ref}>
      <div className="relative flex h-36 items-end gap-2 border-b border-slate-200">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500" style={{ bottom: `${META_PPC * 100}%` }}>
          <span className="absolute -top-4 right-0 z-10 rounded bg-white px-1 text-[10px] text-emerald-700">meta {pct(META_PPC, 0)}</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-red-400" style={{ bottom: `${PPC_ROJO * 100}%` }}>
          <span className="absolute -top-4 right-0 z-10 rounded bg-white px-1 text-[10px] text-red-600">alerta {pct(PPC_ROJO, 0)}</span>
        </div>
        {serie.map((s, i) => {
          const alto = (s.cerrada ? Math.max(2, (s.ppc ?? 0) * 100) : 100) * crece(i)
          return (
            <button key={s.lunes} onClick={() => onSemana(s.lunes)} title={`${fmtSemana(s.lunes)}: ${s.cumplidas}/${s.comprometidas}`}
              className={cx('relative flex h-full min-w-0 flex-1 items-end justify-center', s.lunes === semana && 'rounded-t bg-blue-50')}>
              <span className={cx('relative w-full max-w-10 rounded-t', !s.cerrada ? 'bg-slate-200' : estadoPPC(s.ppc) === 'verde' ? 'bg-emerald-500' : estadoPPC(s.ppc) === 'amarillo' ? 'bg-amber-400' : 'bg-red-500')}
                style={{ height: `${alto}%` }}>
                <span className="tabular absolute inset-x-0 top-1 text-center text-[11px] font-medium text-white" style={{ opacity: crece(i) }}>{s.cerrada && s.ppc != null ? pct(s.ppc, 0) : ''}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {serie.map((s) => <span key={s.lunes} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">{s.cerrada ? fmtFecha(s.lunes).slice(0, 5) : 'en curso'}</span>)}
      </div>
    </div>
  )
}
