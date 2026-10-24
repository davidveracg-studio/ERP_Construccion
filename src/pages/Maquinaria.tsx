// Maquinaria (v1.2, RF-MAQ-01/02): equipos de la obra con utilización, horas improductivas, costo hora real
// vs presupuestado, consumo y disponibilidad (KMQ); parte diario por equipo con validación de terreno (el
// validado es costo real de equipo por partida), mantenciones (KMQ-06) y rendimiento por partida (KMQ-07).
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct, signoPct } from '../domain/formato'
import {
  accionesParte, CAUSAS_IMPRODUCTIVAS, costoFijo, equiposDeObra, estadoParte, horasImproductivas, horasTrabajadas, indicadoresEquipo, MODALIDAD, PROPIEDAD,
  puedeEditarEquipos, puedeRegistrarParte, rendimientoEquipo,
} from '../domain/maquinaria'
import type { CausaImproductiva, Equipo } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

const h = (n: number) => `${num(n, n % 1 ? 1 : 0)} h`
const TONO_PARTE = { enviado: 'ambar', validado: 'verde', corregido: 'rojo' } as const
const ESTADO_PARTE = { enviado: 'Por validar', validado: 'Validado', corregido: 'Devuelto' } as const

export default function Maquinaria() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [todos, setTodos] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  if (!c) return null
  const t = hoy()
  const activos = equiposDeObra(d.equipos, c.obra.id, t)
  const lista = todos ? d.equipos.filter((e) => e.obraId === c.obra.id && e.asignado <= t) : activos
  const inds = activos.map((e) => indicadoresEquipo(e, d.partesMaquinaria, t))
  const disp = inds.reduce((s, k) => s + k.disponibles, 0)
  const trab = inds.reduce((s, k) => s + k.trabajadas, 0)
  const imp = inds.reduce((s, k) => s + k.improductivas, 0)
  const porValidar = d.partesMaquinaria.filter((p) => p.obraId === c.obra.id && estadoParte(p, t) === 'enviado').length

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · equipos, partes diarios, utilización y costo hora (últimos 7 días)`}
        accion={puedeEditarEquipos(rol) ? <Boton onClick={() => setNuevo(true)}>Nuevo equipo</Boton> : undefined}>
        Maquinaria
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Equipos en obra" valor={activos.length} sub={`${activos.filter(costoFijo).length} de costo fijo`} />
        <Kpi etiqueta="Utilización" valor={disp ? pct(trab / disp, 0) : '—'} sub={`KMQ-01 · ${h(trab)} de ${h(disp)}`} estado={ek('KMQ-01', disp ? trab / disp : null)} ayuda={ayudaKpi('KMQ-01')} />
        <Kpi etiqueta="Horas improductivas" valor={disp ? pct(imp / disp, 0) : '—'} sub="KMQ-02 · RULE-206 sobre la alerta" estado={ek('KMQ-02', disp ? imp / disp : null)} ayuda={ayudaKpi('KMQ-02')} />
        <Kpi etiqueta="Partes por validar" valor={porValidar} sub="los valida el jefe de terreno" estado={porValidar > 3 ? 'amarillo' : 'verde'} />
      </div>
      <Card titulo="Equipos" accion={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Incluir liberados</label>}>
        {lista.length === 0 ? <Vacio titulo="Sin equipos" texto="Registra los equipos asignados a la obra con su tarifa." /> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[820px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Equipo</th><th className="font-medium">Tarifa</th><th className="font-medium">Utilización</th><th className="font-medium">Improductivas</th>
                  <th className="font-medium">Costo hora</th><th className="font-medium">Consumo</th><th className="font-medium">Disponibilidad</th><th />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const k = indicadoresEquipo(e, d.partesMaquinaria, t)
                  const liberado = e.liberado != null && e.liberado <= t
                  return (
                    <tr key={e.id} className="border-b border-slate-100 text-right">
                      <td className="py-2 text-left"><div className="font-medium">{e.codigo} · {e.nombre}</div><div className="text-xs text-slate-500">{PROPIEDAD[e.propiedad]}{liberado ? ` · liberado ${fmtFecha(e.liberado!)}` : ''}</div></td>
                      <td>{clp(e.tarifa.monto)} {MODALIDAD[e.tarifa.modalidad]}</td>
                      <td className={cx(ek('KMQ-01', k.utilizacion) === 'rojo' && 'text-crit')}>{k.utilizacion != null ? pct(k.utilizacion, 0) : '—'}</td>
                      <td>{k.improductividad != null ? pct(k.improductividad, 0) : '—'}</td>
                      <td>{k.costoHoraReal != null ? clp(Math.round(k.costoHoraReal)) : '—'}{k.desvioCostoHora != null && <div className={cx('text-xs', k.desvioCostoHora > 0.1 ? 'text-crit' : 'text-slate-500')}>{signoPct(k.desvioCostoHora)} vs presup.</div>}</td>
                      <td>{k.consumo != null && e.consumoEstandar ? `${num(k.consumo, 1)} l/h` : '—'}</td>
                      <td>{k.disponibilidad != null ? pct(k.disponibilidad, 0) : '—'}</td>
                      <td><Link to={`/maquinaria/${e.id}`} className="text-marca hover:underline">Ver</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {nuevo && <NuevoEquipo obraId={c.obra.id} onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function NuevoEquipo({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarEquipo)
  const [v, setV] = useState({ codigo: '', nombre: '', tipo: '', propiedad: 'arrendado' as Equipo['propiedad'], modalidad: 'hora' as Equipo['tarifa']['modalidad'], monto: '', presupuesto: '', consumo: '', asignado: iso(hoy()) })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal abierto titulo="Nuevo equipo" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Código"><input className={inputCls} value={v.codigo} onChange={set('codigo')} placeholder="EQ-05" /></Campo>
        <Campo etiqueta="Nombre"><input className={inputCls} value={v.nombre} onChange={set('nombre')} placeholder="Retroexcavadora JCB 3CX" /></Campo>
        <Campo etiqueta="Propiedad"><select className={inputCls} value={v.propiedad} onChange={set('propiedad')}>{(Object.keys(PROPIEDAD) as Equipo['propiedad'][]).map((k) => <option key={k} value={k}>{PROPIEDAD[k]}</option>)}</select></Campo>
        <Campo etiqueta="Asignado a la obra desde"><input type="date" className={inputCls} value={v.asignado} onChange={set('asignado')} /></Campo>
        <Campo etiqueta="Tarifa"><input type="number" className={inputCls} value={v.monto} onChange={set('monto')} /></Campo>
        <Campo etiqueta="Modalidad" ayuda="Día o mes = costo fijo (RULE-205)."><select className={inputCls} value={v.modalidad} onChange={set('modalidad')}><option value="hora">Por hora trabajada</option><option value="dia">Por día</option><option value="mes">Por mes</option></select></Campo>
        <Campo etiqueta="Costo hora del presupuesto"><input type="number" className={inputCls} value={v.presupuesto} onChange={set('presupuesto')} /></Campo>
        <Campo etiqueta="Consumo estándar (l/h)"><input type="number" className={inputCls} value={v.consumo} onChange={set('consumo')} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = guardar({
            codigo: v.codigo, nombre: v.nombre, tipo: v.tipo || v.nombre.split(' ')[0], propiedad: v.propiedad, tarifa: { modalidad: v.modalidad, monto: Number(v.monto || 0) },
            costoHoraPresupuesto: Number(v.presupuesto) || undefined, consumoEstandar: Number(v.consumo) || undefined, obraId, asignado: dia(v.asignado),
          })
          if (err) setError(err)
          else onCerrar()
        }}>Guardar</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Detalle del equipo ─────────────────────────

export function DetalleEquipo() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const accion = useStore((s) => s.accionParte)
  const programar = useStore((s) => s.programarMantencion)
  const realizar = useStore((s) => s.realizarMantencion)
  const [nuevoParte, setNuevoParte] = useState(false)
  const [devolver, setDevolver] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [mant, setMant] = useState<{ descripcion: string; fecha: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const e = d.equipos.find((x) => x.id === id)
  if (!e) return <Vacio titulo="Equipo no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/maquinaria" className="text-marca">Volver</Link>} />
  const t = hoy()
  const k = indicadoresEquipo(e, d.partesMaquinaria, t)
  const k30 = indicadoresEquipo(e, d.partesMaquinaria, t, 30)
  const partes = d.partesMaquinaria.filter((p) => p.equipoId === e.id && p.fecha <= t).sort((a, b) => b.fecha - a.fecha).slice(0, 30)
  const c = e.obraId ? calcularObra(d, e.obraId, t) : null
  const partidasEq = [...new Set(d.partesMaquinaria.filter((p) => p.equipoId === e.id).flatMap((p) => p.trabajos.map((x) => x.partidaId)))]
  const gestionaMant = puedeEditarEquipos(rol) || rol === 'R03'

  return (
    <div className="space-y-4">
      <Titulo sub={`${PROPIEDAD[e.propiedad]} · ${clp(e.tarifa.monto)} ${MODALIDAD[e.tarifa.modalidad]}${e.liberado != null && e.liberado <= t ? ` · liberado ${fmtFecha(e.liberado)}` : ''}`}
        accion={puedeRegistrarParte(rol) && !(e.liberado != null && e.liberado <= t) ? <Boton onClick={() => setNuevoParte(true)}>Nuevo parte diario</Boton> : undefined}>
        {e.codigo} · {e.nombre}
      </Titulo>
      <Link to="/maquinaria" className="text-sm text-marca">← Maquinaria</Link>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi etiqueta="Utilización (7 días)" valor={k.utilizacion != null ? pct(k.utilizacion, 0) : '—'} sub={`KMQ-01 · 30 días: ${k30.utilizacion != null ? pct(k30.utilizacion, 0) : '—'}`} estado={ek('KMQ-01', k.utilizacion)} ayuda={ayudaKpi('KMQ-01')} />
        <Kpi etiqueta="Improductivas" valor={k.improductividad != null ? pct(k.improductividad, 0) : '—'} sub={k.porCausa[0] ? `KMQ-02 · ${CAUSAS_IMPRODUCTIVAS[k.porCausa[0].causa]}` : 'KMQ-02'} estado={ek('KMQ-02', k.improductividad)} ayuda={ayudaKpi('KMQ-02')} />
        <Kpi etiqueta="Costo hora real" valor={k30.costoHoraReal != null ? clp(Math.round(k30.costoHoraReal)) : '—'} sub={k30.desvioCostoHora != null ? `KMQ-03 · ${signoPct(k30.desvioCostoHora)} vs ${clp(e.costoHoraPresupuesto!)}` : 'KMQ-03'}
          estado={ek('KMQ-03', k30.desvioCostoHora)} ayuda={ayudaKpi('KMQ-03')} />
        <Kpi etiqueta="Consumo" valor={k30.consumo != null && e.consumoEstandar ? `${num(k30.consumo, 1)} l/h` : '—'} sub={e.consumoEstandar ? `KMQ-04 · estándar ${e.consumoEstandar} l/h` : 'KMQ-04 · sin combustible'} estado={ek('KMQ-04', k30.desvioConsumo)} ayuda={ayudaKpi('KMQ-04')} />
        <Kpi etiqueta="Disponibilidad mecánica" valor={k30.disponibilidad != null ? pct(k30.disponibilidad, 0) : '—'} sub="KMQ-05 · 30 días" estado={ek('KMQ-05', k30.disponibilidad)} ayuda={ayudaKpi('KMQ-05')} />
        <Kpi etiqueta="Ocioso (7 días)" valor={costoFijo(e) ? mm(k.costoOcioso) : '—'} sub={costoFijo(e) ? 'costo de horas no trabajadas' : 'se paga por hora trabajada'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="Partes diarios (últimos 30)">
          {partes.length === 0 ? <p className="text-sm text-slate-500">Sin partes.</p> : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-1.5 text-left font-medium">Fecha</th><th className="font-medium">Disponibles</th><th className="font-medium">Trabajadas</th><th className="font-medium">Improductivas</th><th className="font-medium">Combustible</th><th className="text-left font-medium">Estado</th><th /></tr></thead>
                <tbody>
                  {partes.map((p) => {
                    const est = estadoParte(p, t)!
                    const acc = accionesParte(p, t, rol)
                    return (
                      <tr key={p.id} className="border-b border-slate-100 text-right">
                        <td className="py-1.5 text-left">{fmtFecha(p.fecha)}<div className="text-xs text-slate-500">{p.operador}</div></td>
                        <td>{h(p.horasDisponibles)}{p.horasMantencion ? <div className="text-xs text-slate-500">+{h(p.horasMantencion)} mant.</div> : null}</td>
                        <td>{h(horasTrabajadas(p))}</td>
                        <td>{horasImproductivas(p) ? <span title={p.improductivas.map((x) => CAUSAS_IMPRODUCTIVAS[x.causa]).join(', ')}>{h(horasImproductivas(p))}</span> : '—'}</td>
                        <td>{p.combustible ? `${num(p.combustible, 0)} l` : '—'}</td>
                        <td className="text-left"><Badge tono={TONO_PARTE[est]}>{ESTADO_PARTE[est]}</Badge>{est === 'corregido' && <div className="max-w-[200px] truncate text-xs text-slate-500">{p.historial.at(-1)?.texto}</div>}</td>
                        <td>{acc.length > 0 && est !== 'corregido' && <span className="flex justify-end gap-3 text-xs"><button className="text-marca hover:underline" onClick={() => setError(accion(p.id, 'validar'))}>Validar</button><button className="text-slate-500 hover:text-crit" onClick={() => { setDevolver(p.id); setTexto('') }}>Devolver</button></span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">Al validarse, las horas trabajadas son costo real de equipo de cada partida ({e.tarifa.modalidad === 'hora' ? 'horas × tarifa' : 'costo del día repartido según las horas'}).</p>
        </Card>
        <div className="space-y-4">
          <Card titulo="Rendimiento por partida (KMQ-07)">
            {!c || partidasEq.length === 0 ? <p className="text-sm text-slate-500">Sin horas imputadas.</p> : (
              <ul className="space-y-2 text-sm">
                {partidasEq.map((pid) => {
                  const p = d.partidas.find((x) => x.id === pid)!
                  const cp = c.partidas.find((x) => x.p.id === pid)
                  const r = rendimientoEquipo(d.partesMaquinaria, e.id, p, cp?.cantEjec ?? 0, t)
                  return (
                    <li key={pid} className="flex justify-between gap-2">
                      <span>{p.codigo} {p.descripcion}<span className="block text-xs text-slate-500">{h(r.horas)} validadas</span></span>
                      <span className="tabular text-right">{r.presupuesto ? <>{r.real != null ? `${num(r.real, 1)} ${p.unidad}/h` : '—'}<span className="block text-xs text-slate-500">presup. {num(r.presupuesto, 1)}</span></> : <span className="text-xs text-slate-500">sin estándar en el presupuesto</span>}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <Card titulo="Mantenciones (KMQ-06)" accion={gestionaMant ? <button className="text-sm text-marca hover:underline" onClick={() => setMant({ descripcion: '', fecha: iso(t + 7) })}>+ Programar</button> : undefined}>
            {e.mantenciones.length === 0 ? <p className="text-sm text-slate-500">Sin plan de mantenciones.</p> : (
              <ul className="space-y-1.5 text-sm">
                {[...e.mantenciones].sort((a, b) => b.programada - a.programada).slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span>{fmtFecha(m.programada)}<span className="block text-xs text-slate-500">{m.descripcion}</span></span>
                    {m.realizada != null ? <Badge tono={m.realizada <= m.programada ? 'verde' : 'ambar'}>Realizada {fmtFecha(m.realizada)}</Badge>
                      : m.programada < t ? <span className="flex items-center gap-2"><Badge tono="rojo">Atrasada</Badge>{gestionaMant && <button className="text-xs text-marca hover:underline" onClick={() => setError(realizar(e.id, m.id))}>Realizada</button>}</span>
                        : <span className="flex items-center gap-2"><Badge tono="gris">Programada</Badge>{gestionaMant && m.programada <= t + 2 && <button className="text-xs text-marca hover:underline" onClick={() => setError(realizar(e.id, m.id))}>Realizada</button>}</span>}
                  </li>
                ))}
              </ul>
            )}
            {k30.mantencionesEnFecha != null && <p className="mt-2 text-xs text-slate-500">En fecha: {pct(k30.mantencionesEnFecha, 0)}</p>}
          </Card>
        </div>
      </div>
      {nuevoParte && e.obraId && <NuevoParte equipo={e} onCerrar={() => setNuevoParte(false)} />}
      {devolver && (
        <Modal abierto titulo="Devolver parte para corrección" onCerrar={() => setDevolver(null)}>
          <Campo etiqueta="Qué corregir"><input className={inputCls} value={texto} onChange={(ev) => setTexto(ev.target.value)} /></Campo>
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setDevolver(null)}>Cancelar</Boton>
            <Boton variante="peligro" onClick={() => { const err = accion(devolver, 'corregir', texto); if (err) setError(err); setDevolver(null) }}>Devolver</Boton>
          </div>
        </Modal>
      )}
      {mant && (
        <Modal abierto titulo="Programar mantención" onCerrar={() => setMant(null)}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo etiqueta="Mantención"><input className={inputCls} value={mant.descripcion} onChange={(ev) => setMant({ ...mant, descripcion: ev.target.value })} /></Campo>
            <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={mant.fecha} onChange={(ev) => setMant({ ...mant, fecha: ev.target.value })} /></Campo>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setMant(null)}>Cancelar</Boton>
            <Boton onClick={() => { const err = programar(e.id, mant.descripcion, dia(mant.fecha)); if (err) setError(err); setMant(null) }}>Programar</Boton>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NuevoParte({ equipo, onCerrar }: { equipo: Equipo; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarParte)
  const d = useDatosDominio()
  const t = hoy()
  const partidas = d.partidas.filter((p) => p.obraId === equipo.obraId && !p.ordenCambioId)
  const previo = d.partesMaquinaria.filter((p) => p.equipoId === equipo.id).sort((a, b) => b.fecha - a.fecha)[0]
  const [v, setV] = useState({
    fecha: iso(t), operador: previo?.operador ?? '', inicial: String(previo?.horometroFinal ?? 0), final: '', disponibles: '9', partidaId: previo?.trabajos[0]?.partidaId ?? partidas[0]?.id ?? '',
    trabajadas: '', improductivas: '', causa: 'espera_frente' as CausaImproductiva, mantencion: '0', combustible: '0',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (ev: { target: { value: string } }) => setV({ ...v, [k]: ev.target.value })
  return (
    <Modal abierto titulo={`Parte diario · ${equipo.codigo}`} onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={v.fecha} onChange={set('fecha')} /></Campo>
        <Campo etiqueta="Operador"><input className={inputCls} value={v.operador} onChange={set('operador')} /></Campo>
        <Campo etiqueta="Horómetro inicial"><input type="number" className={inputCls} value={v.inicial} onChange={set('inicial')} /></Campo>
        <Campo etiqueta="Horómetro final"><input type="number" className={inputCls} value={v.final} onChange={set('final')} /></Campo>
        <Campo etiqueta="Horas disponibles"><input type="number" className={inputCls} value={v.disponibles} onChange={set('disponibles')} /></Campo>
        <Campo etiqueta="Horas en mantención o falla"><input type="number" className={inputCls} value={v.mantencion} onChange={set('mantencion')} /></Campo>
        <Campo etiqueta="Horas trabajadas"><input type="number" className={inputCls} value={v.trabajadas} onChange={set('trabajadas')} /></Campo>
        <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={set('partidaId')}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        <Campo etiqueta="Horas improductivas"><input type="number" className={inputCls} value={v.improductivas} onChange={set('improductivas')} /></Campo>
        <Campo etiqueta="Causa"><select className={inputCls} value={v.causa} onChange={set('causa')}>{(Object.keys(CAUSAS_IMPRODUCTIVAS) as CausaImproductiva[]).map((k) => <option key={k} value={k}>{CAUSAS_IMPRODUCTIVAS[k]}</option>)}</select></Campo>
        <Campo etiqueta="Combustible (l)"><input type="number" className={inputCls} value={v.combustible} onChange={set('combustible')} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const imp = Number(v.improductivas || 0)
          const err = registrar({
            obraId: equipo.obraId!, equipoId: equipo.id, fecha: dia(v.fecha), operador: v.operador.trim() || 'Operador', horometroInicial: Number(v.inicial || 0), horometroFinal: Number(v.final || 0),
            horasDisponibles: Number(v.disponibles || 0), trabajos: [{ partidaId: v.partidaId, horas: Number(v.trabajadas || 0) }], improductivas: imp > 0 ? [{ horas: imp, causa: v.causa }] : [],
            horasMantencion: Number(v.mantencion || 0), combustible: Number(v.combustible || 0),
          })
          if (err) setError(err)
          else onCerrar()
        }}>Enviar parte</Boton>
      </div>
    </Modal>
  )
}
