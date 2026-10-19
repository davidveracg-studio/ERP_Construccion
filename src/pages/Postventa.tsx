// Postventa (v2, 12 RULE-503, 14 KCA-06): solicitudes de las obras recibidas, clasificadas según el
// art. 18 LGUC (estructura 10 años, instalaciones 5, terminaciones 3) con su vigencia, asignadas al
// subcontratista de la partida o a la constructora, con plazos de evaluación (3 días) y solución (30).
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { subcontratistaDeR10 } from '../domain/cumplimiento'
import { fmtFecha, hoy } from '../domain/fechas'
import { clp, num, pct } from '../domain/formato'
import {
  ACCIONES_POSTVENTA, accionesPostventa, CATEGORIAS_POSTVENTA, DIAS_EVALUACION, DIAS_SOLUCION, enGarantia, ESTADOS_POSTVENTA, estadoPostventa, finGarantia, indicadoresPostventa,
  inicioGarantia, obrasEnGarantia, puedeIngresarPostventa, TONO_POSTVENTA, vencidaPostventa, type AccionPostventa,
} from '../domain/postventa'
import type { CategoriaPostventa, SolicitudPostventa } from '../domain/types'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

export default function Postventa() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const [ver, setVer] = useState<string | null>(null)
  const [nueva, setNueva] = useState<string | null>(null)
  const t = hoy()
  const obras = obrasEnGarantia(d, t)
  if (!obras.length) return <Vacio titulo="Sin obras en garantía" texto="La garantía postventa corre desde la recepción de la obra." />
  const ids = obras.map((o) => o.id)
  const k = indicadoresPostventa(d, ids, t)
  const ss = d.solicitudesPostventa.filter((s) => ids.includes(s.obraId) && s.creado <= t).sort((a, b) => b.fecha - a.fecha)
  const sel = ss.find((s) => s.id === ver)

  return (
    <div className="space-y-4">
      <Titulo sub={`Garantía del art. 18 LGUC · ${obras.length} obra(s) recibida(s) · evaluar en ${DIAS_EVALUACION} días y resolver en ${DIAS_SOLUCION}`}>Postventa</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Solicitudes abiertas" valor={k.abiertas} sub={k.fueraDePlazo ? `${k.fueraDePlazo} fuera de plazo (RULE-503)` : 'todas en plazo'} estado={k.fueraDePlazo ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Postventa por obra (KCA-06)" valor={k.porMUF != null ? num(k.porMUF, 1) : '—'} sub={`${k.total} solicitudes por cada 1.000 UF entregadas`} />
        <Kpi etiqueta="Días a la visita" valor={k.diasEvaluacion != null ? num(k.diasEvaluacion, 1) : '—'} sub={`promedio · plazo ${DIAS_EVALUACION} días`} estado={k.diasEvaluacion == null ? undefined : k.diasEvaluacion <= DIAS_EVALUACION ? 'verde' : 'amarillo'} />
        <Kpi etiqueta="Días a la solución" valor={k.diasSolucion != null ? num(k.diasSolucion, 0) : '—'} sub={`${k.enPlazo != null ? pct(k.enPlazo, 0) : '—'} dentro de ${DIAS_SOLUCION} días`} />
        <Kpi etiqueta="Costo de postventa" valor={clp(k.costo)} sub={`${clp(k.cargoSubcontratistas)} asumido por subcontratistas`} />
      </div>

      <Card titulo="Garantías vigentes por obra">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Obra</th><th className="font-medium">Recepción</th>{(Object.keys(CATEGORIAS_POSTVENTA) as CategoriaPostventa[]).map((c) => <th key={c} className="font-medium">{CATEGORIAS_POSTVENTA[c].nombre} ({CATEGORIAS_POSTVENTA[c].anos} años)</th>)}<th /></tr></thead>
            <tbody>
              {obras.map((o) => {
                const ini = inicioGarantia(d, o.id, t)!
                return (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2">{o.nombre}<div className="text-xs text-slate-500">{o.mandante}</div></td>
                    <td className="whitespace-nowrap">{fmtFecha(ini)}</td>
                    {(Object.keys(CATEGORIAS_POSTVENTA) as CategoriaPostventa[]).map((c) => <td key={c} className="whitespace-nowrap">hasta {fmtFecha(finGarantia(ini, c))}</td>)}
                    <td className="text-right">{puedeIngresarPostventa(rol) && <button className="text-marca hover:underline" onClick={() => setNueva(o.id)}>Ingresar solicitud</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card titulo={`Solicitudes (${ss.length})`}>
        {ss.length === 0 ? <p className="text-sm text-slate-500">Sin solicitudes.</p> : <TablaPostventa ss={ss} onVer={setVer} conObra />}
      </Card>
      {sel && <DetallePostventa s={sel} onCerrar={() => setVer(null)} />}
      {nueva && <NuevaSolicitud obraId={nueva} onCerrar={() => setNueva(null)} />}
    </div>
  )
}

export function TablaPostventa({ ss, onVer, conObra }: { ss: SolicitudPostventa[]; onVer: (id: string) => void; conObra?: boolean }) {
  const d = useDatosDominio()
  const t = hoy()
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
        <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Solicitud</th><th className="font-medium">Categoría</th><th className="font-medium">Responsable</th><th className="font-medium">Ingresada</th><th className="font-medium">Estado</th><th /></tr></thead>
        <tbody>
          {ss.map((s) => {
            const e = estadoPostventa(s, t)!
            return (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-2">N° {s.numero} · {s.descripcion}<div className="text-xs text-slate-500">{conObra ? `${d.obras.find((o) => o.id === s.obraId)?.nombre} · ` : ''}{s.ubicacion}</div></td>
                <td className="whitespace-nowrap">{CATEGORIAS_POSTVENTA[s.categoria].nombre}{!enGarantia(d, s.obraId, s.categoria, s.fecha) && <div className="text-xs text-crit">fuera de garantía</div>}</td>
                <td>{s.responsable}{s.subcontratistaId && <div className="text-xs text-slate-500">subcontratista notificado</div>}</td>
                <td className="whitespace-nowrap">{fmtFecha(s.fecha)}</td>
                <td className="whitespace-nowrap"><Badge tono={TONO_POSTVENTA[e]}>{ESTADOS_POSTVENTA[e]}</Badge>{vencidaPostventa(s, t) && <Badge tono="rojo">Fuera de plazo</Badge>}</td>
                <td className="text-right"><button className="text-marca hover:underline" onClick={() => onVer(s.id)}>Ver</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function DetallePostventa({ s, onCerrar }: { s: SolicitudPostventa; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((st) => st.ui.rol)
  const accion = useStore((st) => st.accionPostventa)
  const t = hoy()
  const e = estadoPostventa(s, t)!
  const esSuya = s.subcontratistaId != null && subcontratistaDeR10(d.proveedores)?.id === s.subcontratistaId
  const acciones = accionesPostventa(s, t, rol, esSuya)
  const partida = d.partidas.find((p) => p.id === s.partidaId)
  const vigente = enGarantia(d, s.obraId, s.categoria, s.fecha)
  const [v, setV] = useState({ diagnostico: '', categoria: s.categoria, motivo: vigente ? '' : 'Fuera del plazo legal de garantía', costo: '', cargo: !!s.subcontratistaId })
  const [error, setError] = useState<string | null>(null)
  const ejecutar = (a: AccionPostventa) => {
    const err = accion(s.id, a, { diagnostico: v.diagnostico, categoria: v.categoria, motivo: v.motivo, costo: Number(v.costo || 0), cargoSubcontratista: v.cargo })
    if (err) setError(err)
    else onCerrar()
  }
  return (
    <Modal abierto titulo={`Postventa N° ${s.numero} · ${ESTADOS_POSTVENTA[e]}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <p className="font-medium">{s.descripcion}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
          <dt>Obra · ubicación</dt><dd>{d.obras.find((o) => o.id === s.obraId)?.nombre} · {s.ubicacion}</dd>
          <dt>Solicitante</dt><dd>{s.solicitante} · {fmtFecha(s.fecha)}</dd>
          <dt>Categoría (art. 18)</dt><dd>{CATEGORIAS_POSTVENTA[s.categoria].nombre}, {CATEGORIAS_POSTVENTA[s.categoria].anos} años · <span className={vigente ? 'text-emerald-700' : 'text-crit'}>{vigente ? 'en garantía' : 'fuera de garantía'}</span></dd>
          {partida && <><dt>Partida</dt><dd>{partida.codigo} {partida.descripcion}</dd></>}
          <dt>Responsable</dt><dd>{s.responsable}{s.subcontratistaId ? ' (subcontratista)' : ''}</dd>
          {s.diagnostico && <><dt>Diagnóstico</dt><dd>{s.diagnostico}</dd></>}
          {s.motivoRechazo && <><dt>Motivo del rechazo</dt><dd>{s.motivoRechazo}</dd></>}
          {s.costoReparacion != null && <><dt>Costo de reparación</dt><dd>{clp(s.costoReparacion)}{s.cargoSubcontratista ? ' · a cargo del subcontratista' : ''}</dd></>}
        </dl>
        <ul className="text-xs text-slate-500">{s.historial.map((h, i) => <li key={i}>{fmtFecha(h.fecha)} · {ESTADOS_POSTVENTA[h.estado]} · {h.por}</li>)}</ul>
        {acciones.includes('evaluar') && <>
          <Campo etiqueta="Diagnóstico de la visita"><input className={inputCls} value={v.diagnostico} onChange={(ev) => setV({ ...v, diagnostico: ev.target.value })} /></Campo>
          <Campo etiqueta="Categoría"><select className={inputCls} value={v.categoria} onChange={(ev) => setV({ ...v, categoria: ev.target.value as CategoriaPostventa })}>{(Object.keys(CATEGORIAS_POSTVENTA) as CategoriaPostventa[]).map((c) => <option key={c} value={c}>{CATEGORIAS_POSTVENTA[c].nombre} ({CATEGORIAS_POSTVENTA[c].anos} años)</option>)}</select></Campo>
        </>}
        {acciones.includes('rechazar') && <Campo etiqueta="Motivo (para rechazar)"><input className={inputCls} value={v.motivo} onChange={(ev) => setV({ ...v, motivo: ev.target.value })} /></Campo>}
        {acciones.includes('resolver') && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo etiqueta="Costo de la reparación"><input type="number" className={inputCls} value={v.costo} onChange={(ev) => setV({ ...v, costo: ev.target.value })} /></Campo>
            {rol !== 'R10' && s.subcontratistaId && <label className="flex items-end gap-2"><input type="checkbox" checked={v.cargo} onChange={(ev) => setV({ ...v, cargo: ev.target.checked })} /> A cargo del subcontratista</label>}
          </div>
        )}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {acciones.map((a) => <Boton key={a} variante={a === 'rechazar' ? 'secundario' : 'primario'} onClick={() => ejecutar(a)}>{ACCIONES_POSTVENTA[a]}</Boton>)}
      </div>
    </Modal>
  )
}

export function NuevaSolicitud({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const d = useDatosDominio()
  const ui = useStore((s) => s.ui)
  const ingresar = useStore((s) => s.ingresarPostventa)
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const [v, setV] = useState({ ubicacion: '', descripcion: '', categoria: 'terminaciones' as CategoriaPostventa, partidaId: '', solicitante: ui.rol === 'R11' ? ui.usuario : '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={`Solicitud de postventa · ${d.obras.find((o) => o.id === obraId)?.nombre}`} onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo etiqueta="¿Qué falla?"><input className={inputCls} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej.: filtración en el cielo del baño" /></Campo></div>
        <Campo etiqueta="Ubicación"><input className={inputCls} value={v.ubicacion} onChange={(e) => setV({ ...v, ubicacion: e.target.value })} placeholder="Depto. 402, bodega 3…" /></Campo>
        <Campo etiqueta="Solicitante"><input className={inputCls} value={v.solicitante} onChange={(e) => setV({ ...v, solicitante: e.target.value })} /></Campo>
        <Campo etiqueta="Tipo de falla"><select className={cx(inputCls)} value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value as CategoriaPostventa })}>{(Object.keys(CATEGORIAS_POSTVENTA) as CategoriaPostventa[]).map((c) => <option key={c} value={c}>{CATEGORIAS_POSTVENTA[c].nombre} ({CATEGORIAS_POSTVENTA[c].ejemplo})</option>)}</select></Campo>
        {ui.rol !== 'R11' && <Campo etiqueta="Partida (asigna al subcontratista)"><select className={inputCls} value={v.partidaId} onChange={(e) => setV({ ...v, partidaId: e.target.value })}><option value="">Sin partida (constructora)</option>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = ingresar({ obraId, ubicacion: v.ubicacion, descripcion: v.descripcion, categoria: v.categoria, solicitante: v.solicitante, ...(v.partidaId ? { partidaId: v.partidaId } : {}) }); if (err) setError(err); else onCerrar() }}>Ingresar</Boton>
      </div>
    </Modal>
  )
}
