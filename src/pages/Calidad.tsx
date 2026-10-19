// Calidad (v1.3, 10 §11 y §22, 14 KCA): protocolos por partida con checklist (los de liberación
// bloquean el avance hasta aprobarse; los obligatorios condicionan la recepción provisoria), NCR con
// acción correctiva y HH de retrabajo, inspecciones e indicadores de calidad.
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import {
  ACCIONES_NCR, ACCIONES_PROTOCOLO, accionesNCR, accionesProtocolo, ESTADOS_NCR, ESTADOS_PROTOCOLO, estadoNCR, estadoProtocolo, ncrAbierta, ncrVencida,
  ORIGENES_NCR, PLAZO_NCR, protocolosFaltantes, protocolosVigentes, puedeCrearNCR, puedeCrearProtocolo, puedeProgramarInspeccion, retrabajo, TONO_NCR, TONO_PROTOCOLO,
  type AccionNCR,
} from '../domain/calidad'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, num, pct } from '../domain/formato'
import type { NoConformidad, ProtocoloCalidad } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

function usePartidas(obraId: string) {
  const d = useDatosDominio()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  return { partidas, nombre: (id: string) => { const p = partidas.find((x) => x.id === id); return p ? `${p.codigo} ${p.descripcion}` : '—' } }
}

export default function Calidad() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [verP, setVerP] = useState<string | null>(null)
  const [verN, setVerN] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<'protocolo' | 'ncr' | 'inspeccion' | null>(null)
  const [todos, setTodos] = useState(false)
  if (!c) return null
  const t = hoy()
  const obraId = c.obra.id
  const k = c.calidad
  const ps = d.protocolosCalidad.filter((p) => p.obraId === obraId && p.creado <= t)
  const vigentes = protocolosVigentes(ps, t)
  const enCurso = vigentes.filter((p) => { const e = estadoProtocolo(p, t); return e === 'pendiente' || e === 'en_inspeccion' || (e === 'aprobado' && p.requiereITO) || e === 'rechazado' })
    .sort((a, b) => a.programado - b.programado)
  const historial = ps.filter((p) => !enCurso.includes(p)).sort((a, b) => b.programado - a.programado || b.numero - a.numero)
  const ncrs = d.noConformidades.filter((n) => n.obraId === obraId && n.creado <= t).sort((a, b) => b.numero - a.numero)
  const abiertas = ncrs.filter((n) => ncrAbierta(estadoNCR(n, t)))
  const insp = d.inspeccionesCalidad.filter((i) => i.obraId === obraId).sort((a, b) => b.programada - a.programada)
  const faltan = protocolosFaltantes(d, obraId, t)
  const selP = ps.find((p) => p.id === verP)
  const selN = ncrs.find((n) => n.id === verN)

  return (
    <div className="space-y-4">
      <Titulo sub={c.obra.nombre} accion={<>
        {puedeCrearProtocolo(rol) && <Boton onClick={() => setNuevo('protocolo')}>Nuevo protocolo</Boton>}
        {puedeCrearNCR(rol) && <Boton variante="secundario" onClick={() => setNuevo('ncr')}>Abrir NCR</Boton>}
        {puedeProgramarInspeccion(rol) && <Boton variante="secundario" onClick={() => setNuevo('inspeccion')}>Programar inspección</Boton>}
      </>}>
        Calidad
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="NCR abiertas (KCA-02)" valor={k.ncrAbiertas} sub={k.ncrVencidas ? `${k.ncrVencidas} vencida(s)` : k.ncrAbiertas ? `la más antigua: ${k.ncrAntiguedad} días` : 'ninguna'} estado={k.estado === 'na' ? undefined : k.estado} />
        <Kpi etiqueta="Rework rate (KCA-07)" valor={k.reworkRate != null ? pct(k.reworkRate, 1) : '—'} sub={`${num(k.hhRetrabajo7, 0)} HH de retrabajo en 7 días`} estado={k.reworkRate == null ? undefined : k.reworkRate > 0.06 ? 'rojo' : k.reworkRate > 0.03 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Aprobación a la primera (KCA-01)" valor={k.primera != null ? pct(k.primera, 0) : '—'} sub="protocolos de 90 días" estado={k.primera == null ? undefined : k.primera >= 0.9 ? 'verde' : k.primera >= 0.75 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Costo de no calidad (KCA-03)" valor={k.costoNoCalidad != null ? `${(k.costoNoCalidad * 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })} %` : '—'} sub={`${clp(k.costoRetrabajo)} en retrabajos`} estado={k.costoNoCalidad == null ? undefined : k.costoNoCalidad > 0.04 ? 'rojo' : k.costoNoCalidad > 0.02 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Inspecciones (KCA-09)" valor={k.inspecciones != null ? pct(k.inspecciones, 0) : '—'} sub={`30 días · ${k.ejecutados} protocolos, ${k.rechazados} rechazados`} estado={k.inspecciones == null ? undefined : k.inspecciones >= 1 ? 'verde' : k.inspecciones >= 0.75 ? 'amarillo' : 'rojo'} />
      </div>
      {c.obra.estado === 'en_ejecucion' && c.avanceReal >= 0.9 && faltan.length > 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Recepción provisoria (RULE-103): hoy faltan {faltan.length} protocolo(s) obligatorio(s) por aprobar.</p>
      )}

      <Card titulo={`Protocolos en curso (${enCurso.length})`}>
        {enCurso.length === 0 ? <p className="text-sm text-slate-500">Sin protocolos pendientes.</p> : <TablaProtocolos ps={enCurso} onVer={setVerP} />}
      </Card>

      <Card titulo={`No conformidades (${abiertas.length} abiertas)`}>
        {ncrs.length === 0 ? <p className="text-sm text-slate-500">Sin NCR registradas.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">NCR</th><th className="font-medium">Responsable</th><th className="font-medium">Plazo</th><th className="text-right font-medium">HH retrabajo</th><th className="font-medium">Estado</th><th /></tr></thead>
              <tbody>
                {ncrs.slice(0, todos ? undefined : 8).map((n) => {
                  const e = estadoNCR(n, t)!
                  const rt = retrabajo(d, obraId, n.creado, t).porNCR.get(n.id)
                  return (
                    <tr key={n.id} className="border-b border-slate-100">
                      <td className="py-2">N° {n.numero} · {n.descripcion}<div className="text-xs text-slate-500">{ORIGENES_NCR[n.origen]} · {fmtFecha(n.creado)}</div></td>
                      <td className="whitespace-nowrap">{n.responsable}</td>
                      <td className={cx('whitespace-nowrap', ncrVencida(n, t) && 'font-medium text-crit')}>{fmtFecha(n.plazo)}</td>
                      <td className="text-right">{rt ? num(rt.hh, 0) : '—'}</td>
                      <td className="whitespace-nowrap"><Badge tono={TONO_NCR[e]}>{ESTADOS_NCR[e]}</Badge>{ncrVencida(n, t) && <Badge tono="rojo">RULE-112</Badge>}</td>
                      <td className="text-right"><button className="text-marca hover:underline" onClick={() => setVerN(n.id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {ncrs.length > 8 && <button className="mt-2 text-sm text-marca" onClick={() => setTodos(!todos)}>{todos ? 'Ver menos' : `Ver las ${ncrs.length}`}</button>}
          </div>
        )}
      </Card>

      <Card titulo="Historial de protocolos">
        {historial.length === 0 ? <p className="text-sm text-slate-500">Sin protocolos cerrados.</p> : <TablaProtocolos ps={historial.slice(0, 12)} onVer={setVerP} />}
        {historial.length > 12 && <p className="mt-2 text-xs text-slate-500">Se muestran los 12 más recientes de {historial.length}.</p>}
      </Card>

      <Card titulo="Inspecciones de calidad">
        <Inspecciones lista={insp.slice(0, 8)} obraId={obraId} />
      </Card>

      {selP && <DetalleProtocolo p={selP} onCerrar={() => setVerP(null)} />}
      {selN && <DetalleNCR n={selN} onCerrar={() => setVerN(null)} />}
      {nuevo === 'protocolo' && <NuevoProtocolo obraId={obraId} onCerrar={() => setNuevo(null)} />}
      {nuevo === 'ncr' && <NuevaNCR obraId={obraId} onCerrar={() => setNuevo(null)} />}
      {nuevo === 'inspeccion' && <NuevaInspeccion obraId={obraId} inspector={c.obra.oficinaTecnica} onCerrar={() => setNuevo(null)} />}
    </div>
  )
}

function TablaProtocolos({ ps, onVer }: { ps: ProtocoloCalidad[]; onVer: (id: string) => void }) {
  const t = hoy()
  const { nombre } = usePartidas(ps[0]?.obraId ?? '')
  const reinspeccionados = new Set(useDatosDominio().protocolosCalidad.filter((x) => x.reinspeccionDe).map((x) => x.reinspeccionDe))
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
        <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Protocolo</th><th className="font-medium">Partida</th><th className="font-medium">Responsable</th><th className="font-medium">Programado</th><th className="font-medium">Estado</th><th /></tr></thead>
        <tbody>
          {ps.map((p) => {
            const e = estadoProtocolo(p, t)!
            return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2">N° {p.numero} · {p.nombre}<div className="text-xs text-slate-500">{p.ubicacion}{p.reinspeccionDe ? ' · reinspección' : ''}</div></td>
                <td className="whitespace-nowrap">{nombre(p.partidaId)}</td>
                <td className="whitespace-nowrap">{p.responsable}</td>
                <td className="whitespace-nowrap">{fmtFecha(p.programado)}</td>
                <td className="whitespace-nowrap">
                  <Badge tono={TONO_PROTOCOLO[e]}>{e === 'aprobado' && p.requiereITO ? 'Aprobado · falta V°B° ITO' : ESTADOS_PROTOCOLO[e]}</Badge>
                  {p.tipo === 'liberacion' && !reinspeccionados.has(p.id) && (e === 'pendiente' || e === 'en_inspeccion' || e === 'rechazado') && p.programado <= t && <Badge tono="ambar">Bloquea avance</Badge>}
                </td>
                <td className="text-right"><button className="text-marca hover:underline" onClick={() => onVer(p.id)}>Ver</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DetalleProtocolo({ p, onCerrar }: { p: ProtocoloCalidad; onCerrar: () => void }) {
  const rol = useStore((s) => s.ui.rol)
  const marcar = useStore((s) => s.marcarChecklist)
  const accion = useStore((s) => s.accionProtocolo)
  const { nombre } = usePartidas(p.obraId)
  const [obs, setObs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const e = estadoProtocolo(p, t)!
  const acciones = accionesProtocolo(p, t, rol)
  const editable = e === 'en_inspeccion' && (rol === 'R03' || rol === 'R04')
  return (
    <Modal abierto titulo={`Protocolo N° ${p.numero} · ${p.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tono={TONO_PROTOCOLO[e]}>{ESTADOS_PROTOCOLO[e]}</Badge>
          <Badge tono="gris">{p.tipo === 'liberacion' ? 'Liberación: bloquea el avance' : 'Control'}</Badge>
          {p.obligatorio && <Badge tono="gris">Obligatorio para recepción</Badge>}
          {p.requiereITO && <Badge tono="gris">Requiere V°B° ITO</Badge>}
        </div>
        <p className="text-slate-600">{nombre(p.partidaId)} · {p.ubicacion} · {p.responsable} · programado {fmtFecha(p.programado)}</p>
        <ul className="space-y-1 rounded-lg border border-slate-200 p-3">
          {p.checklist.map((i, k) => (
            <li key={k} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={!!i.ok} disabled={!editable} onChange={(ev) => marcar(p.id, k, ev.target.checked)} aria-label={i.texto} />
              <span className={cx(e === 'rechazado' && !i.ok && 'text-crit')}>{i.texto}</span>
            </li>
          ))}
        </ul>
        {p.observaciones && <p className="rounded-lg bg-red-50 p-2 text-red-900">Observaciones: {p.observaciones}</p>}
        <ul className="text-xs text-slate-500">{p.historial.map((h, k) => <li key={k}>{fmtFecha(h.fecha)} · {ESTADOS_PROTOCOLO[h.estado]} · {h.por}</li>)}</ul>
        {acciones.includes('rechazar') && <Campo etiqueta="Observaciones (obligatorias para rechazar)"><textarea className={inputCls} rows={2} value={obs} onChange={(ev) => setObs(ev.target.value)} /></Campo>}
        {acciones.includes('rechazar') && <p className="text-xs text-slate-500">Al rechazar se abre una NCR al responsable (plazo {PLAZO_NCR} días) y se programa la reinspección para mañana (RULE-104).</p>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {acciones.map((a) => (
          <Boton key={a} variante={a === 'rechazar' ? 'peligro' : 'primario'} onClick={() => { const err = accion(p.id, a, obs); if (err) setError(err); else onCerrar() }}>{ACCIONES_PROTOCOLO[a]}</Boton>
        ))}
      </div>
    </Modal>
  )
}

function DetalleNCR({ n, onCerrar }: { n: NoConformidad; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const accion = useStore((s) => s.accionNCR)
  const { nombre } = usePartidas(n.obraId)
  const t = hoy()
  const e = estadoNCR(n, t)!
  const [v, setV] = useState({ causa: n.causa ?? '', accionCorrectiva: n.accionCorrectiva ?? '', costoMateriales: '', texto: '' })
  const [error, setError] = useState<string | null>(null)
  const acciones = accionesNCR(n, t, rol)
  const rt = retrabajo(d, n.obraId, n.creado, t).porNCR.get(n.id)
  const ejecutar = (a: AccionNCR) => {
    const err = accion(n.id, a, { causa: v.causa, accionCorrectiva: v.accionCorrectiva, costoMateriales: Number(v.costoMateriales || 0), texto: v.texto })
    if (err) setError(err)
    else onCerrar()
  }
  return (
    <Modal abierto titulo={`NCR N° ${n.numero} · ${ESTADOS_NCR[e]}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <p className="font-medium">{n.descripcion}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
          <dt>Partida</dt><dd>{nombre(n.partidaId)}</dd>
          <dt>Origen</dt><dd>{ORIGENES_NCR[n.origen]}</dd>
          <dt>Responsable</dt><dd>{n.responsable}</dd>
          <dt>Plazo</dt><dd className={cx(ncrVencida(n, t) && 'text-crit')}>{fmtFecha(n.plazo)}</dd>
          {n.causa && <><dt>Causa</dt><dd>{n.causa}</dd></>}
          {n.accionCorrectiva && <><dt>Acción correctiva</dt><dd>{n.accionCorrectiva}</dd></>}
          <dt>HH de retrabajo</dt><dd>{rt ? `${num(rt.hh, 0)} HH · ${clp(rt.costo)}` : 'sin registrar'}</dd>
          {n.costoMateriales ? <><dt>Materiales</dt><dd>{clp(n.costoMateriales)}</dd></> : null}
        </dl>
        {(e === 'abierta' || e === 'en_correccion') && <p className="text-xs text-slate-500">Las HH de corrección se registran en el RDO como retrabajo de esta NCR.</p>}
        <ul className="text-xs text-slate-500">{n.historial.map((h, k) => <li key={k}>{fmtFecha(h.fecha)} · {ESTADOS_NCR[h.estado]} · {h.por}{h.texto ? ` · ${h.texto}` : ''}</li>)}</ul>
        {acciones.includes('corregir') && <>
          <Campo etiqueta="Causa"><input className={inputCls} value={v.causa} onChange={(ev) => setV({ ...v, causa: ev.target.value })} /></Campo>
          <Campo etiqueta="Acción correctiva"><input className={inputCls} value={v.accionCorrectiva} onChange={(ev) => setV({ ...v, accionCorrectiva: ev.target.value })} /></Campo>
        </>}
        {acciones.includes('cerrar') && <Campo etiqueta="Costo de materiales del retrabajo"><input type="number" className={inputCls} value={v.costoMateriales} onChange={(ev) => setV({ ...v, costoMateriales: ev.target.value })} placeholder="0" /></Campo>}
        {acciones.includes('anular') && <Campo etiqueta="Motivo (para anular)"><input className={inputCls} value={v.texto} onChange={(ev) => setV({ ...v, texto: ev.target.value })} /></Campo>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {acciones.map((a) => <Boton key={a} variante={a === 'anular' ? 'secundario' : 'primario'} onClick={() => ejecutar(a)}>{ACCIONES_NCR[a]}</Boton>)}
      </div>
    </Modal>
  )
}

function Inspecciones({ lista, obraId }: { lista: ReturnType<typeof useDatosDominio>['inspeccionesCalidad']; obraId: string }) {
  const rol = useStore((s) => s.ui.rol)
  const realizar = useStore((s) => s.realizarInspeccion)
  const { partidas, nombre } = usePartidas(obraId)
  const d = useDatosDominio()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [v, setV] = useState({ conforme: true, hallazgos: '', partidaId: '', responsable: '' })
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  if (!lista.length) return <p className="text-sm text-slate-500">Sin inspecciones.</p>
  const cuadrillas = d.cuadrillas.filter((q) => q.obraId === obraId)
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {lista.map((i) => (
        <li key={i.id} className="py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{fmtFecha(i.programada)} · {i.tipo === 'programada' ? 'Programada' : 'No programada'}</span>
              <span className="text-slate-500"> · {i.inspector}{i.partidaId ? ` · ${nombre(i.partidaId)}` : ''}</span>
              {i.realizada && <div className="text-xs text-slate-500">{i.realizada.hallazgos}</div>}
            </div>
            {i.realizada ? <Badge tono={i.realizada.conforme ? 'verde' : 'rojo'}>{i.realizada.conforme ? 'Conforme' : 'Con hallazgos'}</Badge>
              : i.programada <= t && (rol === 'R03' || rol === 'R02') ? <button className="text-marca hover:underline" onClick={() => { setAbierta(i.id); setV({ conforme: true, hallazgos: '', partidaId: i.partidaId ?? '', responsable: '' }) }}>Registrar</button>
                : <Badge tono="gris">{i.programada < t ? 'Atrasada' : 'Programada'}</Badge>}
          </div>
          {abierta === i.id && (
            <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
              <Campo etiqueta="Resultado"><select className={inputCls} value={v.conforme ? 's' : 'n'} onChange={(ev) => setV({ ...v, conforme: ev.target.value === 's' })}><option value="s">Conforme</option><option value="n">Con hallazgos (abre NCR)</option></select></Campo>
              <Campo etiqueta="Hallazgos"><input className={inputCls} value={v.hallazgos} onChange={(ev) => setV({ ...v, hallazgos: ev.target.value })} placeholder={v.conforme ? 'Sin observaciones' : 'Qué no cumple'} /></Campo>
              {!v.conforme && <>
                <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={(ev) => setV({ ...v, partidaId: ev.target.value })}><option value="">—</option>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
                <Campo etiqueta="Responsable de corregir"><input className={inputCls} list="resp-calidad" value={v.responsable} onChange={(ev) => setV({ ...v, responsable: ev.target.value })} /></Campo>
                <datalist id="resp-calidad">{cuadrillas.map((q) => <option key={q.id} value={q.nombre} />)}</datalist>
              </>}
              <div className="flex items-end gap-2 sm:col-span-2">
                <Boton onClick={() => { const err = realizar(i.id, { conforme: v.conforme, hallazgos: v.hallazgos || (v.conforme ? 'Sin observaciones' : ''), partidaId: v.partidaId || undefined, responsable: v.responsable }); setError(err); if (!err) setAbierta(null) }}>Guardar</Boton>
                <Boton variante="secundario" onClick={() => setAbierta(null)}>Cancelar</Boton>
                {error && <span className="text-crit">{error}</span>}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

const CHECKLIST_BASE: Record<string, string[]> = {
  liberacion: ['Enfierradura según plano, traslapos y recubrimientos', 'Moldaje aplomado, estanco y con desmoldante', 'Pasadas e insertos de instalaciones', 'Ejes y niveles verificados'],
  control: ['Dimensiones y niveles según plano', 'Materiales aprobados', 'Terminación sin defectos visibles'],
}

function NuevoProtocolo({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearProtocolo)
  const d = useDatosDominio()
  const { partidas } = usePartidas(obraId)
  const [v, setV] = useState({ nombre: '', partidaId: partidas[0]?.id ?? '', tipo: 'control' as ProtocoloCalidad['tipo'], obligatorio: false, requiereITO: false, responsable: '', ubicacion: '', programado: iso(hoy()), checklist: CHECKLIST_BASE.control.join('\n') })
  const [error, setError] = useState<string | null>(null)
  const cuadrillas = d.cuadrillas.filter((q) => q.obraId === obraId)
  return (
    <Modal abierto titulo="Nuevo protocolo de calidad" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Protocolo"><input className={inputCls} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Liberación antes de hormigonar" /></Campo>
        <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => { const tipo = e.target.value as ProtocoloCalidad['tipo']; setV({ ...v, tipo, checklist: CHECKLIST_BASE[tipo].join('\n') }) }}><option value="control">Control</option><option value="liberacion">Liberación (bloquea el avance)</option></select></Campo>
        <Campo etiqueta="Programado"><input type="date" className={inputCls} value={v.programado} onChange={(e) => setV({ ...v, programado: e.target.value })} /></Campo>
        <Campo etiqueta="Ubicación"><input className={inputCls} value={v.ubicacion} onChange={(e) => setV({ ...v, ubicacion: e.target.value })} placeholder="Losa piso 3, ejes A–D" /></Campo>
        <Campo etiqueta="Responsable"><input className={inputCls} list="resp-prot" value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
        <datalist id="resp-prot">{cuadrillas.map((q) => <option key={q.id} value={q.nombre} />)}</datalist>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.obligatorio} onChange={(e) => setV({ ...v, obligatorio: e.target.checked })} /> Obligatorio para la recepción provisoria</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.requiereITO} onChange={(e) => setV({ ...v, requiereITO: e.target.checked })} /> Requiere V°B° del ITO</label>
        <div className="sm:col-span-2"><Campo etiqueta="Checklist (un punto por línea)"><textarea className={inputCls} rows={4} value={v.checklist} onChange={(e) => setV({ ...v, checklist: e.target.value })} /></Campo></div>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = crear({
            obraId, partidaId: v.partidaId, nombre: v.nombre, tipo: v.tipo, obligatorio: v.obligatorio, requiereITO: v.requiereITO, responsable: v.responsable.trim() || 'Por asignar',
            ubicacion: v.ubicacion.trim() || '—', programado: dia(v.programado), checklist: v.checklist.split('\n').map((x) => x.trim()).filter(Boolean).map((texto) => ({ texto })),
          })
          if (err) setError(err)
          else onCerrar()
        }}>Crear</Boton>
      </div>
    </Modal>
  )
}

function NuevaNCR({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearNCR)
  const d = useDatosDominio()
  const { partidas } = usePartidas(obraId)
  const [v, setV] = useState({ partidaId: partidas[0]?.id ?? '', origen: 'hallazgo' as NoConformidad['origen'], descripcion: '', responsable: '', plazo: iso(hoy() + PLAZO_NCR) })
  const [error, setError] = useState<string | null>(null)
  const cuadrillas = d.cuadrillas.filter((q) => q.obraId === obraId)
  return (
    <Modal abierto titulo="Abrir no conformidad" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Partida"><select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        <Campo etiqueta="Origen"><select className={inputCls} value={v.origen} onChange={(e) => setV({ ...v, origen: e.target.value as NoConformidad['origen'] })}>{(['hallazgo', 'ito', 'inspeccion'] as const).map((o) => <option key={o} value={o}>{ORIGENES_NCR[o]}</option>)}</select></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Descripción"><input className={inputCls} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Nidos de hormigón en muro eje C" /></Campo></div>
        <Campo etiqueta="Responsable de corregir"><input className={inputCls} list="resp-ncr" value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
        <datalist id="resp-ncr">{cuadrillas.map((q) => <option key={q.id} value={q.nombre} />)}</datalist>
        <Campo etiqueta="Plazo de corrección"><input type="date" className={inputCls} value={v.plazo} onChange={(e) => setV({ ...v, plazo: e.target.value })} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = crear({ obraId, partidaId: v.partidaId, origen: v.origen, descripcion: v.descripcion, responsable: v.responsable, plazo: dia(v.plazo) }); if (err) setError(err); else onCerrar() }}>Abrir NCR</Boton>
      </div>
    </Modal>
  )
}

function NuevaInspeccion({ obraId, inspector, onCerrar }: { obraId: string; inspector: string; onCerrar: () => void }) {
  const programar = useStore((s) => s.programarInspeccion)
  const { partidas } = usePartidas(obraId)
  const [v, setV] = useState({ programada: iso(hoy() + 1), inspector, partidaId: '', tipo: 'programada' as 'programada' | 'no_programada' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo="Programar inspección de calidad" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={v.programada} onChange={(e) => setV({ ...v, programada: e.target.value })} /></Campo>
        <Campo etiqueta="Inspector"><input className={inputCls} value={v.inspector} onChange={(e) => setV({ ...v, inspector: e.target.value })} /></Campo>
        <Campo etiqueta="Partida (opcional)"><select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}><option value="">Toda la obra</option>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>
        <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as 'programada' | 'no_programada' })}><option value="programada">Programada</option><option value="no_programada">No programada</option></select></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = programar({ obraId, programada: dia(v.programada), inspector: v.inspector, partidaId: v.partidaId || null, tipo: v.tipo }); if (err) setError(err); else onCerrar() }}>Programar</Boton>
      </div>
    </Modal>
  )
}
