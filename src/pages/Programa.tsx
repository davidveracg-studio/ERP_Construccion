// Carta Gantt: línea base vs actualizado, ruta crítica, holguras, re-baseline (RF-PLA)
import { useState } from 'react'
import { Link } from 'react-router'
import { Gantt } from '../components/Gantt'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, inputCls } from '../components/ui'
import GuiaFigura from '../components/GuiaFigura'
import { dia, fmtFecha, iso } from '../domain/fechas'
import { pct } from '../domain/formato'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

export default function Programa() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const { actualizarActividad, solicitarRebaseline, resolverRebaseline } = useStore()
  const [sel, setSel] = useState<string>()
  const [modal, setModal] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!c) return null
  const acts = c.actualizado?.actividades ?? []
  if (acts.length === 0) return <Vacio titulo="Esta obra no tiene programa" texto="Importa la Carta Gantt (Excel o exportación de MS Project) para calcular la línea base y la ruta crítica." accion={<Link to="/importar" className="text-marca">Importar programa</Link>} />
  const lbMap = new Map((c.lb?.actividades ?? []).map((a) => [a.id, a]))
  const pendiente = d.programas.find((p) => p.obraId === c.obra.id && p.tipo === 'lineaBase' && p.estado === 'en_aprobacion')
  const versiones = d.programas.filter((p) => p.obraId === c.obra.id && p.tipo === 'lineaBase').sort((a, b) => b.version - a.version)
  const noHitos = acts.filter((a) => !a.esHito)
  const iniciadasODebian = noHitos.filter((a) => a.inicioReal != null || (lbMap.get(a.id)?.inicio ?? Infinity) <= c.corte)
  const atrasadas = iniciadasODebian.filter((a) => (c.cpm.get(a.id)?.ef ?? 0) > (lbMap.get(a.id)?.fin ?? Infinity))
  const criticasAtrasadas = atrasadas.filter((a) => c.cpm.get(a.id)?.critica)
  const a = acts.find((x) => x.id === sel)
  const r = a ? c.cpm.get(a.id) : undefined
  const b = a ? lbMap.get(a.id) : undefined
  const editable = rol === 'R03' || rol === 'R05' || rol === 'R02'

  return (
    <div className="space-y-4">
      <Titulo sub={`Línea base v${c.lb?.version ?? '—'} (${c.lb?.motivo ?? ''}) · barras grises = línea base, color = proyectado, rojo = ruta crítica`}
        accion={<><GuiaFigura figura="ruta-critica" titulo="Cómo se lee la ruta crítica" texto="Dos varillas empujan la fecha de término: la crítica la mueve con cada día de atraso; la otra tiene holgura y avanza en vacío hasta consumirla." />{(rol === 'R05' || rol === 'R02') && <Boton variante="secundario" onClick={() => setModal(true)}>Solicitar re-baseline</Boton>}</>}>
        Carta Gantt
      </Titulo>

      {pendiente && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <span>Nueva línea base v{pendiente.version} pendiente de aprobación · “{pendiente.motivo}” · solicitada por {pendiente.creadoPor}.</span>
          {rol === 'R01' ? (
            <span className="ml-auto flex gap-2">
              <Boton onClick={() => resolverRebaseline(pendiente.id, true)}>Aprobar</Boton>
              <Boton variante="secundario" onClick={() => resolverRebaseline(pendiente.id, false)}>Rechazar</Boton>
            </span>
          ) : <span className="ml-auto text-xs text-amber-800">Solo Gerencia (R01) aprueba un re-baseline (10 §23).</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi etiqueta="Holgura mínima" valor={`${c.holguraMin ?? '—'} días`} estado={c.holguraMin == null ? 'na' : ek('KPL-14', c.holguraMin)} ayuda={ayudaKpi('KPL-14')} />
        <Kpi etiqueta="Atraso proyectado" valor={`${c.atrasoProyectado > 0 ? '+' : ''}${c.atrasoProyectado} días`} estado={ek('KPL-06', c.atrasoProyectado)} ayuda={ayudaKpi('KPL-06')} />
        <Kpi etiqueta="Actividades atrasadas" valor={pct(iniciadasODebian.length ? atrasadas.length / iniciadasODebian.length : 0, 0)} sub={`${atrasadas.length} de ${iniciadasODebian.length}`} estado={ek('KPL-10', iniciadasODebian.length ? atrasadas.length / iniciadasODebian.length : null)} ayuda={ayudaKpi('KPL-10')} />
        <Kpi etiqueta="Críticas atrasadas" valor={criticasAtrasadas.length} estado={ek('KPL-15', criticasAtrasadas.length)} ayuda={ayudaKpi('KPL-15')} />
        <Kpi etiqueta="Término proyectado" valor={fmtFecha(c.terminoProyectado - 1)} sub={`contractual ${fmtFecha(c.terminoContractual - 1)}`} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Gantt actividades={acts} lb={lbMap} cpm={c.cpm} avance={c.avanceAct} corte={c.corte} inicio={c.obra.fechaInicio}
            termino={c.terminoProyectado} contractual={c.terminoContractual} onSelect={setSel} seleccion={sel} />
        </div>
      </Card>

      {a && (
        <Card titulo={`${a.codigo} ${a.nombre}`} accion={<button onClick={() => setSel(undefined)} className="text-sm text-slate-500">Cerrar</button>}>
          <div className="grid gap-4 md:grid-cols-3">
            <dl className="tabular space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Línea base</dt><dd>{b ? `${fmtFecha(b.inicio)} → ${fmtFecha(Math.max(b.inicio, b.fin - 1))}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Proyectado</dt><dd>{r ? `${fmtFecha(r.es)} → ${fmtFecha(Math.max(r.es, r.ef - 1))}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Holgura total / libre</dt><dd>{r?.holgura ?? '—'} / {r?.holguraLibre ?? '—'} días</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Avance</dt><dd>{pct(c.avanceAct.get(a.id) ?? 0, 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd>{r?.terminada ? <Badge tono="verde">Terminada</Badge> : r?.critica ? <Badge tono="rojo">Ruta crítica</Badge> : <Badge>Con holgura</Badge>}</dd></div>
            </dl>
            <div className="text-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Predecesoras</div>
              {a.predecesoras.length === 0 ? <p className="text-slate-500">Ninguna</p> : (
                <ul className="space-y-0.5">{a.predecesoras.map((p) => { const x = acts.find((y) => y.id === p.actividadId); return <li key={p.actividadId}>{x?.codigo} {x?.nombre} <span className="text-xs text-slate-500">{p.tipo}{p.desfase ? (p.desfase > 0 ? `+${p.desfase}` : p.desfase) : ''}</span></li> })}</ul>
              )}
              <div className="mb-1 mt-3 text-xs font-medium text-slate-500">Partidas (avance derivado)</div>
              <ul className="space-y-0.5">{a.partidas.map((ap) => { const p = d.partidas.find((x) => x.id === ap.partidaId); return <li key={ap.partidaId}><Link to={`/partida/${ap.partidaId}`} className="text-marca">{p?.codigo} {p?.descripcion}</Link> · {ap.cantidad} {p?.unidad}</li> })}</ul>
            </div>
            {editable && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500">Actualizar fechas reales</div>
                <Campo etiqueta="Inicio real"><input type="date" className={inputCls} value={a.inicioReal != null ? iso(a.inicioReal) : ''} onChange={(e) => actualizarActividad(a.id, { inicioReal: e.target.value ? dia(e.target.value) : undefined })} /></Campo>
                <Campo etiqueta="Término real"><input type="date" className={inputCls} value={a.finReal != null ? iso(a.finReal - 1) : ''} onChange={(e) => actualizarActividad(a.id, { finReal: e.target.value ? dia(e.target.value) + 1 : undefined })} /></Campo>
                {a.partidas.length === 0 && !a.esHito && (
                  <Campo etiqueta="Avance manual (%)"><input type="number" min={0} max={100} className={inputCls} value={Math.round((a.avanceManual ?? 0) * 100)} onChange={(e) => actualizarActividad(a.id, { avanceManual: Number(e.target.value) / 100 })} /></Campo>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card titulo="Versiones de línea base">
        <ul className="space-y-1 text-sm">
          {versiones.map((v) => (
            <li key={v.id} className="flex flex-wrap gap-2">
              <span className="font-medium">v{v.version}</span>
              <Badge tono={v.estado === 'vigente' ? 'verde' : v.estado === 'en_aprobacion' ? 'ambar' : 'gris'}>{v.estado.replace('_', ' ')}</Badge>
              <span className="text-slate-600">{fmtFecha(v.fecha)} · {v.creadoPor} · {v.motivo}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">El SPI y el PV se miden siempre contra la línea base vigente. Los períodos cerrados conservan el SPI de su momento.</p>
      </Card>

      <Modal abierto={modal} titulo="Solicitar re-baseline" onCerrar={() => setModal(false)}>
        <p className="mb-3 text-sm text-slate-600">Se propone como nueva línea base el programa actualizado con las fechas proyectadas hoy. Requiere aprobación de Gerencia.</p>
        <Campo etiqueta="Motivo (obligatorio)"><textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: aumento de plazo aprobado por orden de cambio OC-05" /></Campo>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
          <Boton disabled={!motivo.trim()} onClick={() => { solicitarRebaseline(motivo.trim()); setModal(false); setMotivo('') }}>Solicitar</Boton>
        </div>
      </Modal>
    </div>
  )
}
