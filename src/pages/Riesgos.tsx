// Registro de riesgos (v1.1, 08 Riesgo, 10 §25, RF-CTL-08): indicadores KRI, matriz probabilidad ×
// impacto y listado; el detalle muestra evaluaciones, plan de mitigación e historial con las
// transiciones que permite el rol.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { mm, num, pct, uid } from '../domain/formato'
import {
  ACCIONES_RIESGO, accionesRiesgo, accionVencida, CATEGORIAS_RIESGO, diasSinPlan, DIAS_PLAN_CRITICO, ESCALA, estadoRiesgo, ESTADOS_RIESGO,
  evaluacionVigente, exigePlan, exposicionRiesgo, indicadoresRiesgo, nivelRiesgo, NIVELES, PROBABILIDAD_PCT, puedeCrearRiesgo, revisionVencida,
  riesgoActivo, TONO_ESTADO_RIESGO, TONO_NIVEL, type AccionRiesgo, type NivelRiesgo,
} from '../domain/riesgos'
import type { CategoriaRiesgo, Escala5, Riesgo } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const codigo = (r: Riesgo) => `R-${String(r.numero).padStart(3, '0')}`
const ESCALAS: Escala5[] = [1, 2, 3, 4, 5]
const COLOR_CELDA: Record<NivelRiesgo, string> = {
  bajo: 'bg-emerald-50 text-emerald-900', medio: 'bg-amber-50 text-amber-900', alto: 'bg-orange-100 text-orange-900', critico: 'bg-red-100 text-red-900',
}

export function EstadoRiesgoBadge({ r, t }: { r: Riesgo; t: number }) {
  const e = estadoRiesgo(r, t)
  return e ? <Badge tono={TONO_ESTADO_RIESGO[e]}>{ESTADOS_RIESGO[e]}</Badge> : null
}

function NivelBadge({ r, t }: { r: Riesgo; t: number }) {
  const x = exposicionRiesgo(r, t)
  return x ? <Badge tono={TONO_NIVEL[x.nivel]}>{NIVELES[x.nivel]}</Badge> : <span className="text-xs text-slate-400">Sin evaluar</span>
}

export default function Riesgos() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [nuevo, setNuevo] = useState(false)
  const [verCerrados, setVerCerrados] = useState(false)
  const [celda, setCelda] = useState<[Escala5, Escala5] | null>(null)
  if (!c) return null
  const t = hoy()
  const propios = d.riesgos.filter((r) => r.obraId === c.obra.id && estadoRiesgo(r, t))
  const kri = indicadoresRiesgo(propios, c, d.config, t)
  const enMatriz = propios.filter((r) => { const e = estadoRiesgo(r, t); return e === 'abierto' || e === 'en_mitigacion' })
  const evalDe = (r: Riesgo) => evaluacionVigente(r, t)
  // Primero los vivos (por exposición), luego los sin evaluar y al final los cerrados
  const rango = (r: Riesgo) => { const e = estadoRiesgo(r, t); return e === 'cerrado' ? 2 : e === 'identificado' || e === 'en_analisis' ? 1 : 0 }
  const lista = propios
    .filter((r) => verCerrados || riesgoActivo(r, t) || estadoRiesgo(r, t) === 'materializado')
    .filter((r) => !celda || (enMatriz.includes(r) && evalDe(r)?.probabilidad === celda[0] && evalDe(r)?.impacto === celda[1]))
    .sort((a, b) => rango(a) - rango(b) || (exposicionRiesgo(b, t)?.puntaje ?? 0) - (exposicionRiesgo(a, t)?.puntaje ?? 0) || b.numero - a.numero)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · probabilidad, impacto, exposición, responsable y plan de mitigación`}
        accion={puedeCrearRiesgo(rol) ? <Boton onClick={() => setNuevo(true)}>Nuevo riesgo</Boton> : undefined}>
        Registro de riesgos
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi etiqueta="Riesgos abiertos" valor={kri.abiertos} sub="KRI-01 · en análisis, abiertos o en mitigación" />
        <Kpi etiqueta="Riesgos críticos" valor={kri.criticos} sub={kri.criticosSinPlan ? `${kri.criticosSinPlan} sin plan` : 'KRI-02'} estado={kri.estado.kri02} />
        <Kpi etiqueta="Revisiones vencidas" valor={kri.vencidos} sub="KRI-03 · RULE-611" estado={kri.estado.kri03} />
        <Kpi etiqueta="Exposición económica" valor={mm(kri.exposicionMonto)} sub={`KRI-04 · contingencia ${mm(kri.contingencia)}`} estado={kri.estado.kri04}
          ayuda="Σ probabilidad × impacto en dinero. Contingencia disponible = margen proyectado por sobre el margen mínimo de la empresa." />
        <Kpi etiqueta="Exposición por plazo" valor={`${num(kri.exposicionDias, 1)} días`} sub={`KRI-05 · holgura ${kri.holgura} días`} estado={kri.estado.kri05}
          ayuda="Σ probabilidad × impacto en días, contra los días de adelanto proyectados al término contractual." />
        <Kpi etiqueta="Materializados" valor={kri.tasaMaterializacion != null ? pct(kri.tasaMaterializacion, 0) : '—'} sub={`KRI-06 · ${kri.materializados} de ${kri.cerrados} cerrados`} estado={kri.estado.kri06} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_2fr] [&>*]:min-w-0">
        <Card titulo="Matriz de riesgos" accion={celda ? <button className="text-sm text-marca" onClick={() => setCelda(null)}>Quitar filtro</button> : undefined}>
          <div className="mx-auto flex max-w-xs gap-2">
            <div className="flex w-5 items-center justify-center"><span className="-rotate-90 whitespace-nowrap text-xs text-slate-500">Probabilidad</span></div>
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-1">
                {[...ESCALAS].reverse().map((p) => ESCALAS.map((i) => {
                  const n = enMatriz.filter((r) => evalDe(r)?.probabilidad === p && evalDe(r)?.impacto === i)
                  const sel = celda?.[0] === p && celda?.[1] === i
                  return (
                    <button key={`${p}${i}`} disabled={!n.length} onClick={() => setCelda(sel ? null : [p, i])} title={`${ESCALA[p]} × ${ESCALA[i]}: ${NIVELES[nivelRiesgo(p, i)]}`}
                      className={cx('flex aspect-square items-center justify-center rounded text-sm font-semibold', COLOR_CELDA[nivelRiesgo(p, i)], sel && 'ring-2 ring-marca', !n.length && 'cursor-default')}>
                      {n.length || ''}
                    </button>
                  )
                }))}
              </div>
              <div className="mt-1 text-center text-xs text-slate-500">Impacto</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Riesgos abiertos y en mitigación según su última evaluación. Toca una celda para filtrar la lista.</p>
        </Card>

        <Card titulo={celda ? `Riesgos ${ESCALA[celda[0]].toLowerCase()} × ${ESCALA[celda[1]].toLowerCase()}` : 'Riesgos'}
          accion={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />Ver cerrados</label>}>
          {lista.length === 0 ? <Vacio titulo="Sin riesgos" texto="Registra los riesgos de la obra para medir su exposición en dinero y en días." /> : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[760px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 font-medium">Riesgo</th><th className="font-medium">Responsable</th><th className="font-medium">Nivel</th>
                    <th className="text-right font-medium">Exposición</th><th className="font-medium">Estado</th><th className="font-medium">Revisión</th><th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => {
                    const x = exposicionRiesgo(r, t)
                    const e = estadoRiesgo(r, t)
                    const vivo = e === 'abierto' || e === 'en_mitigacion'
                    return (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2"><div className="font-medium">{codigo(r)} · {r.titulo}</div><div className="text-xs text-slate-500">{CATEGORIAS_RIESGO[r.categoria]}</div></td>
                        <td>{r.responsable ?? <span className="text-xs text-slate-400">Sin asignar</span>}</td>
                        <td><NivelBadge r={r} t={t} /></td>
                        <td className="text-right">{x && vivo ? <><div>{mm(x.monto)}</div><div className="text-xs text-slate-500">{num(x.dias, 1)} días</div></> : '—'}</td>
                        <td><EstadoRiesgoBadge r={r} t={t} />{exigePlan(r, t) && <div className="text-xs text-crit">Sin plan</div>}</td>
                        <td>{vivo ? <span className={cx(revisionVencida(r, t) && 'font-medium text-crit')}>{r.fechaRevision != null ? fmtFecha(r.fechaRevision) : 'Sin fecha'}</span> : '—'}</td>
                        <td className="text-right"><Link to={`/riesgos/${r.id}`} className="text-marca hover:underline">Ver</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {nuevo && <NuevoRiesgo obraId={c.obra.id} onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function NuevoRiesgo({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearRiesgo)
  const d = useDatosDominio()
  const nav = useNavigate()
  const obra = d.obras.find((o) => o.id === obraId)!
  const partidas = d.partidas.filter((p) => p.obraId === obraId)
  const [v, setV] = useState({ titulo: '', causa: '', categoria: 'plazo' as CategoriaRiesgo, responsable: '', partidaId: '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo="Nuevo riesgo" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Riesgo"><input className={inputCls} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ej.: Atraso del proveedor de ventanas" /></Campo>
        <Campo etiqueta="Causa"><textarea rows={2} className={inputCls} value={v.causa} onChange={(e) => setV({ ...v, causa: e.target.value })} placeholder="Ej.: Quiebre de stock del perfil especificado" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <select className={inputCls} value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value as CategoriaRiesgo })}>
              {(Object.keys(CATEGORIAS_RIESGO) as CategoriaRiesgo[]).map((k) => <option key={k} value={k}>{CATEGORIAS_RIESGO[k]}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Responsable" ayuda="Con responsable pasa a análisis.">
            <input className={inputCls} list="responsables-riesgo" value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} />
            <datalist id="responsables-riesgo">{[obra.administrador, obra.jefeTerreno, obra.oficinaTecnica].map((n) => <option key={n} value={n} />)}</datalist>
          </Campo>
        </div>
        <Campo etiqueta="Partida afectada (opcional)">
          <select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}>
            <option value="">Ninguna</option>
            {partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}
          </select>
        </Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const r = crear({ obraId, titulo: v.titulo, causa: v.causa, categoria: v.categoria, responsable: v.responsable, partidaIds: v.partidaId ? [v.partidaId] : [] })
          if (r.error) setError(r.error)
          else { onCerrar(); nav(`/riesgos/${r.id}`) }
        }}>Registrar</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Detalle ─────────────────────────

export function DetalleRiesgo() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const ejecutar = useStore((s) => s.accionRiesgo)
  const [accion, setAccion] = useState<AccionRiesgo | null>(null)
  const r = d.riesgos.find((x) => x.id === id)
  if (!r) return <Vacio titulo="Riesgo no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/riesgos" className="text-marca">Volver</Link>} />
  const t = hoy()
  const obra = d.obras.find((o) => o.id === r.obraId)!
  const e = estadoRiesgo(r, t)
  const x = exposicionRiesgo(r, t)
  const ev = evaluacionVigente(r, t)
  const acciones = accionesRiesgo(r, t, rol).filter((a) => a !== 'cumplir_accion')
  const puedeCumplir = accionesRiesgo(r, t, rol).includes('cumplir_accion')
  const partidas = r.partidaIds.map((pid) => d.partidas.find((p) => p.id === pid)).filter((p) => !!p)
  const sinPlan = diasSinPlan(r, t)
  const venta = e === 'materializado' ? calcularObra(d, obra.id, t).venta : 0

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${CATEGORIAS_RIESGO[r.categoria]}${r.origen === 'motor' ? ' · sugerido por el Motor de Riesgos' : ''}`}
        accion={acciones.length ? <>{acciones.map((a) => (
          <Boton key={a} variante={a === 'cerrar' || a === 'reabrir' || a === 'materializar' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_RIESGO[a]}</Boton>
        ))}</> : undefined}>
        <span className="flex flex-wrap items-center gap-2">{codigo(r)} · {r.titulo}<EstadoRiesgoBadge r={r} t={t} /></span>
      </Titulo>
      <Link to="/riesgos" className="text-sm text-marca">← Registro de riesgos</Link>
      {sinPlan >= DIAS_PLAN_CRITICO && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">RULE-610: riesgo {x ? NIVELES[x.nivel].toLowerCase() : ''} sin plan de mitigación hace {sinPlan} días.</p>}
      {revisionVencida(r, t) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">RULE-611: la revisión {r.fechaRevision != null ? `venció el ${fmtFecha(r.fechaRevision)}` : 'no tiene fecha'}. Reevalúa el riesgo para fijar la próxima.</p>}
      {e === 'materializado' && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          El riesgo se materializó{r.impactoReal ? ` con un impacto de ${mm(r.impactoReal.monto)} y ${r.impactoReal.dias} días` : ''}{venta > 0 && r.impactoReal ? ` (${pct(r.impactoReal.monto / venta, 1)} de la venta)` : ''}.
          {' '}Ajusta el forecast en <Link to="/costos" className="font-medium underline">Control de costos</Link> o, si es imputable al mandante, crea una <Link to="/ordenes-cambio" className="font-medium underline">orden de cambio</Link>.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="Descripción y causa">
          <p className="text-sm text-slate-700">{r.causa}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">Responsable</dt><dd className="font-medium">{r.responsable ?? 'Sin asignar'}</dd></div>
            <div><dt className="text-xs text-slate-500">Identificado</dt><dd>{fmtFecha(r.creado)} · {r.creadoPor}</dd></div>
            <div><dt className="text-xs text-slate-500">Próxima revisión</dt><dd>{r.fechaRevision != null ? fmtFecha(r.fechaRevision) : '—'}</dd></div>
            {partidas.length > 0 && <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-slate-500">Partidas afectadas</dt><dd>{partidas.map((p) => <Link key={p.id} to={`/partida/${p.id}`} className="mr-3 text-marca hover:underline">{p.codigo} {p.descripcion}</Link>)}</dd></div>}
          </dl>
        </Card>
        <Card titulo="Exposición">
          {ev && x ? (
            <dl className="tabular space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Probabilidad</dt><dd>{ESCALA[ev.probabilidad]} ({pct(PROBABILIDAD_PCT[ev.probabilidad], 0)})</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Impacto</dt><dd>{ESCALA[ev.impacto]} · {mm(ev.impactoMonto)} · {ev.impactoDias} días</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Nivel</dt><dd><Badge tono={TONO_NIVEL[x.nivel]}>{NIVELES[x.nivel]} ({x.puntaje})</Badge></dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Exposición</dt><dd>{mm(x.monto)} · {num(x.dias, 1)} días</dd></div>
              {r.impactoReal && <div className="flex justify-between text-crit"><dt>Impacto real</dt><dd>{mm(r.impactoReal.monto)} · {r.impactoReal.dias} días</dd></div>}
            </dl>
          ) : <p className="text-sm text-slate-500">Sin evaluar: el responsable debe estimar probabilidad e impacto.</p>}
        </Card>
      </div>

      <Card titulo="Plan de mitigación">
        {r.plan.length === 0 ? <p className="text-sm text-slate-500">Sin acciones registradas.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {r.plan.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{a.descripcion}</div><div className="text-xs text-slate-500">{a.responsable} · compromiso {fmtFecha(a.fecha)}</div></div>
                {a.cumplida != null ? <Badge tono="verde">Cumplida {fmtFecha(a.cumplida)}</Badge>
                  : accionVencida(a, t) ? <span className="flex items-center gap-2"><Badge tono="rojo">Vencida</Badge>{puedeCumplir && <Boton variante="secundario" className="min-h-0 py-1" onClick={() => ejecutar(r.id, 'cumplir_accion', { accionId: a.id })}>Cumplir</Boton>}</span>
                    : <span className="flex items-center gap-2"><Badge tono="azul">En curso</Badge>{puedeCumplir && <Boton variante="secundario" className="min-h-0 py-1" onClick={() => ejecutar(r.id, 'cumplir_accion', { accionId: a.id })}>Cumplir</Boton>}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Evaluaciones">
          {r.evaluaciones.length === 0 ? <p className="text-sm text-slate-500">Sin evaluaciones.</p> : (
            <ol className="space-y-1.5 text-sm">
              {[...r.evaluaciones].filter((v) => v.fecha <= t).reverse().map((v, i) => (
                <li key={i} className="flex gap-3">
                  <span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(v.fecha)}</span>
                  <span>{ESCALA[v.probabilidad]} × {ESCALA[v.impacto]} → <b>{NIVELES[nivelRiesgo(v.probabilidad, v.impacto)]}</b> · {mm(v.impactoMonto)} · {v.impactoDias} días<span className="text-slate-500"> · {v.autor}</span>{v.nota && <span className="block text-slate-600">“{v.nota}”</span>}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card titulo="Historial">
          <ol className="space-y-1.5 text-sm">
            {r.historial.filter((p) => p.fecha <= t).map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="tabular w-24 shrink-0 text-slate-500">{fmtFecha(p.fecha)}</span>
                <span>{ESTADOS_RIESGO[p.estado]} · {p.por}{p.nota && <span className="block text-slate-600">“{p.nota}”</span>}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {accion && <AccionRiesgoModal r={r} accion={accion} onCerrar={() => setAccion(null)} />}
    </div>
  )
}

function AccionRiesgoModal({ r, accion, onCerrar }: { r: Riesgo; accion: AccionRiesgo; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionRiesgo)
  const obra = useDatosDominio().obras.find((o) => o.id === r.obraId)!
  const t = hoy()
  const ev = evaluacionVigente(r, t)
  const materializado = estadoRiesgo(r, t) === 'materializado'
  const [v, setV] = useState({
    responsable: r.responsable ?? '', nota: '', probabilidad: ev?.probabilidad ?? 3, impacto: ev?.impacto ?? 3,
    monto: ev ? String(ev.impactoMonto / 1e6) : '', dias: ev ? String(ev.impactoDias) : '', revision: iso(t + 14),
    descripcion: '', responsableAccion: r.responsable ?? '', fechaAccion: iso(t + 7),
    montoReal: r.impactoReal ? String(r.impactoReal.monto / 1e6) : '', diasReal: r.impactoReal ? String(r.impactoReal.dias) : '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const nivel = nivelRiesgo(v.probabilidad as Escala5, v.impacto as Escala5)
  const ayuda: Partial<Record<AccionRiesgo, string>> = {
    evaluar: 'La exposición es la probabilidad (en %) por el impacto estimado. Toda reevaluación queda en el historial.',
    registrar_plan: 'Con su primera acción el riesgo pasa a mitigación.',
    reabrir: 'Úsalo si las acciones vencieron o no fueron efectivas.',
    materializar: 'El riesgo ocurrió: se genera una alerta para ajustar forecast o gestionar una orden de cambio.',
    cerrar: materializado ? 'Registra el impacto real para comparar con lo estimado (KRI-06).' : 'El riesgo ya no aplica o quedó mitigado.',
  }
  const responsables = <datalist id="resp-accion">{[obra.administrador, obra.jefeTerreno, obra.oficinaTecnica].map((n) => <option key={n} value={n} />)}</datalist>
  const confirmar = () => {
    const real = v.montoReal !== '' || v.diasReal !== '' ? { monto: Math.round(Number(v.montoReal || 0) * 1e6), dias: Math.round(Number(v.diasReal || 0)) } : undefined
    const err = ejecutar(r.id, accion, {
      nota: v.nota, responsable: v.responsable,
      evaluacion: accion === 'evaluar' ? { probabilidad: v.probabilidad as Escala5, impacto: v.impacto as Escala5, impactoMonto: Math.round(Number(v.monto || 0) * 1e6), impactoDias: Math.round(Number(v.dias || 0)), ...(v.nota.trim() ? { nota: v.nota.trim() } : {}) } : undefined,
      fechaRevision: accion === 'evaluar' || accion === 'registrar_plan' ? dia(v.revision) : undefined,
      accion: accion === 'registrar_plan' ? { id: uid('ac'), descripcion: v.descripcion, responsable: v.responsableAccion, fecha: dia(v.fechaAccion) } : undefined,
      impactoReal: real,
    })
    if (err) setError(err)
    else onCerrar()
  }
  return (
    <Modal abierto titulo={`${ACCIONES_RIESGO[accion]} · ${codigo(r)}`} onCerrar={onCerrar}>
      {ayuda[accion] && <p className="mb-3 text-sm text-slate-600">{ayuda[accion]}</p>}
      {responsables}
      <div className="space-y-3">
        {accion === 'asignar' && <Campo etiqueta="Responsable"><input className={inputCls} list="resp-accion" value={v.responsable} onChange={set('responsable')} /></Campo>}
        {accion === 'evaluar' && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Probabilidad">
              <select className={inputCls} value={v.probabilidad} onChange={(e) => setV({ ...v, probabilidad: Number(e.target.value) as Escala5 })}>
                {ESCALAS.map((k) => <option key={k} value={k}>{k} · {ESCALA[k]} ({pct(PROBABILIDAD_PCT[k], 0)})</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Impacto">
              <select className={inputCls} value={v.impacto} onChange={(e) => setV({ ...v, impacto: Number(e.target.value) as Escala5 })}>
                {ESCALAS.map((k) => <option key={k} value={k}>{k} · {ESCALA[k]}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Impacto en dinero (MM$)"><input type="number" min={0} step="0.1" className={inputCls} value={v.monto} onChange={set('monto')} /></Campo>
            <Campo etiqueta="Impacto en plazo (días)"><input type="number" min={0} className={inputCls} value={v.dias} onChange={set('dias')} /></Campo>
          </div>
          <p className="text-sm">Nivel: <Badge tono={TONO_NIVEL[nivel]}>{NIVELES[nivel]}</Badge> · exposición {mm(PROBABILIDAD_PCT[v.probabilidad as Escala5] * Number(v.monto || 0) * 1e6)} y {num(PROBABILIDAD_PCT[v.probabilidad as Escala5] * Number(v.dias || 0), 1)} días</p>
          <Campo etiqueta="Próxima revisión"><input type="date" className={inputCls} value={v.revision} onChange={set('revision')} /></Campo>
        </>}
        {accion === 'registrar_plan' && <>
          <Campo etiqueta="Acción"><textarea rows={2} className={inputCls} value={v.descripcion} onChange={set('descripcion')} placeholder="Ej.: Cotizar proveedor alternativo" /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Responsable"><input className={inputCls} list="resp-accion" value={v.responsableAccion} onChange={set('responsableAccion')} /></Campo>
            <Campo etiqueta="Fecha compromiso"><input type="date" className={inputCls} value={v.fechaAccion} onChange={set('fechaAccion')} /></Campo>
          </div>
          <Campo etiqueta="Próxima revisión del riesgo"><input type="date" className={inputCls} value={v.revision} onChange={set('revision')} /></Campo>
        </>}
        {(accion === 'materializar' || (accion === 'cerrar' && materializado)) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Impacto real (MM$)"><input type="number" min={0} step="0.1" className={inputCls} value={v.montoReal} onChange={set('montoReal')} /></Campo>
            <Campo etiqueta="Impacto real (días)"><input type="number" min={0} className={inputCls} value={v.diasReal} onChange={set('diasReal')} /></Campo>
          </div>
        )}
        {accion !== 'asignar' && accion !== 'registrar_plan' && (
          <Campo etiqueta={accion === 'cerrar' && !materializado ? 'Motivo del cierre' : accion === 'reabrir' ? 'Por qué el plan no es efectivo' : 'Nota (opcional)'}>
            <textarea rows={2} className={inputCls} value={v.nota} onChange={set('nota')} />
          </Campo>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={accion === 'materializar' ? 'peligro' : 'primario'} onClick={confirmar}>{ACCIONES_RIESGO[accion]}</Boton>
      </div>
    </Modal>
  )
}
