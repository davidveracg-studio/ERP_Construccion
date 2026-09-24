// Onboarding de la primera obra (21 §3B): contrato → itemizado + APU → Carta Gantt → cuadrillas
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton, Campo, Card, Titulo, cx, inputCls } from '../components/ui'
import { dia, hoy, iso } from '../domain/fechas'
import { mm, uid } from '../domain/formato'
import { importarItemizado, importarPrograma, validarVinculos } from '../domain/importar'
import { bacPartida, ventaPartida } from '../domain/presupuesto'
import type { Cuadrilla, Obra } from '../domain/types'
import { useStore } from '../store/store'

const PASOS = ['Contrato', 'Itemizado y APU', 'Carta Gantt', 'Cuadrillas']

export default function NuevaObra() {
  const crear = useStore((s) => s.crearObra)
  const nav = useNavigate()
  const [paso, setPaso] = useState(0)
  const [id] = useState(() => uid('obra'))
  const [o, setO] = useState({
    nombre: '', mandante: '', lineaNegocio: 'Edificación', administrador: '', jefeTerreno: '', oficinaTecnica: '',
    fechaInicio: iso(hoy()), plazoDias: '180', multaDiaria: '500000', margenOfertado: '10', ggPresupuesto: '',
  })
  const [item, setItem] = useState('')
  const [prog, setProg] = useState('')
  const [cuadrillas, setCuadrillas] = useState<Omit<Cuadrilla, 'obraId'>[]>([{ id: uid('cq'), nombre: 'Cuadrilla 1', capataz: '', trabajadores: 8, costoHH: 9300 }])

  const obra: Obra = {
    id, nombre: o.nombre, mandante: o.mandante, lineaNegocio: o.lineaNegocio, administrador: o.administrador,
    jefeTerreno: o.jefeTerreno, oficinaTecnica: o.oficinaTecnica, moneda: 'CLP', fechaInicio: dia(o.fechaInicio),
    plazoDias: Number(o.plazoDias) || 0, multaDiaria: Number(o.multaDiaria) || 0, margenOfertado: (Number(o.margenOfertado) || 0) / 100,
    ggPresupuesto: Number(o.ggPresupuesto.replace(/\./g, '')) || 0, estado: 'en_ejecucion',
  }
  const resItem = useMemo(() => (item.trim() ? importarItemizado(item, id) : null), [item, id])
  const resProg = useMemo(() => (prog.trim() && resItem ? importarPrograma(prog, obra, resItem.items) : null), [prog, resItem]) // eslint-disable-line react-hooks/exhaustive-deps
  const venta = resItem?.items.reduce((s, p) => s + ventaPartida(p), 0) ?? 0
  const costo = resItem?.items.reduce((s, p) => s + bacPartida(p), 0) ?? 0
  const valido = [
    !!o.nombre && !!o.administrador && obra.plazoDias > 0,
    !!resItem && resItem.items.length > 0 && resItem.errores.length === 0,
    !resProg || resProg.errores.length === 0,
    cuadrillas.every((q) => q.nombre && q.costoHH > 0),
  ]
  const set = (k: keyof typeof o) => (e: { target: { value: string } }) => setO({ ...o, [k]: e.target.value })

  return (
    <div className="max-w-3xl space-y-4">
      <Titulo sub="Objetivo: obra con línea base, presupuesto de costo y equipo en menos de un día de trabajo">Nueva obra</Titulo>
      <ol className="flex gap-2 text-sm">
        {PASOS.map((p, i) => (
          <li key={p} className={cx('flex-1 rounded-lg border px-3 py-2', i === paso ? 'border-marca bg-blue-50 font-medium text-marca' : i < paso ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500')}>
            {i + 1}. {p}
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <Card titulo="Contrato">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre de la obra *"><input className={inputCls} value={o.nombre} onChange={set('nombre')} /></Campo>
            <Campo etiqueta="Mandante"><input className={inputCls} value={o.mandante} onChange={set('mandante')} /></Campo>
            <Campo etiqueta="Línea de negocio"><select className={inputCls} value={o.lineaNegocio} onChange={set('lineaNegocio')}>{['Edificación', 'Obras civiles', 'Remodelaciones', 'Especialidades', 'Mantención', 'Montaje'].map((x) => <option key={x}>{x}</option>)}</select></Campo>
            <Campo etiqueta="Fecha de inicio (entrega de terreno)"><input type="date" className={inputCls} value={o.fechaInicio} onChange={set('fechaInicio')} /></Campo>
            <Campo etiqueta="Plazo (días corridos) *"><input className={inputCls} inputMode="numeric" value={o.plazoDias} onChange={set('plazoDias')} /></Campo>
            <Campo etiqueta="Multa por día de atraso ($)"><input className={inputCls} inputMode="numeric" value={o.multaDiaria} onChange={set('multaDiaria')} /></Campo>
            <Campo etiqueta="Margen ofertado (%)"><input className={inputCls} inputMode="decimal" value={o.margenOfertado} onChange={set('margenOfertado')} /></Campo>
            <Campo etiqueta="Presupuesto de gastos generales ($)"><input className={inputCls} inputMode="numeric" value={o.ggPresupuesto} onChange={set('ggPresupuesto')} /></Campo>
            <Campo etiqueta="Administrador de obra *"><input className={inputCls} value={o.administrador} onChange={set('administrador')} /></Campo>
            <Campo etiqueta="Jefe de terreno"><input className={inputCls} value={o.jefeTerreno} onChange={set('jefeTerreno')} /></Campo>
            <Campo etiqueta="Oficina técnica / control"><input className={inputCls} value={o.oficinaTecnica} onChange={set('oficinaTecnica')} /></Campo>
          </div>
        </Card>
      )}

      {paso === 1 && (
        <Card titulo="Itemizado y APU (pega desde Excel)">
          <p className="mb-2 text-xs text-slate-500">Columnas: codigo, descripcion, unidad, cantidad, pu · opcionales APU: hh_unidad, costo_hh, mat_cantidad, mat_precio, eq_cantidad, eq_precio, sub_precio. Ver ejemplo en Importar datos.</p>
          <textarea className={cx(inputCls, 'font-mono text-xs')} rows={10} value={item} onChange={(e) => setItem(e.target.value)} />
          {resItem && (
            <div className="mt-3 text-sm">
              {resItem.errores.map((e) => <p key={e} className="text-crit">✕ {e}</p>)}
              {resItem.avisos.slice(0, 5).map((e) => <p key={e} className="text-amber-700">⚠ {e}</p>)}
              <p className="tabular mt-1">{resItem.items.length} partidas · venta {mm(venta)} · costo directo {mm(costo)} · margen directo {venta ? ((1 - costo / venta) * 100).toFixed(1) : '—'}%</p>
            </div>
          )}
        </Card>
      )}

      {paso === 2 && (
        <Card titulo="Carta Gantt (opcional ahora)">
          <p className="mb-2 text-xs text-slate-500">Columnas: codigo, nombre, duracion, predecesoras (A1;A2FC+2), partidas (1.1;2.1:300), hito, contractual. Se aprueba como línea base inicial. Sin programa, las partidas se programan linealmente en el plazo.</p>
          <textarea className={cx(inputCls, 'font-mono text-xs')} rows={10} value={prog} onChange={(e) => setProg(e.target.value)} />
          {resProg && (
            <div className="mt-3 text-sm">
              {resProg.errores.map((e) => <p key={e} className="text-crit">✕ {e}</p>)}
              {resProg.items.length > 0 && resItem && validarVinculos(resProg.items, resItem.items).map((v) => <p key={v} className="text-xs text-slate-500">• {v}</p>)}
              <p className="mt-1">{resProg.items.length} actividades · término programado día {resProg.items.length ? Math.max(...resProg.items.map((a) => a.fin)) - obra.fechaInicio : 0} de {obra.plazoDias}</p>
            </div>
          )}
        </Card>
      )}

      {paso === 3 && (
        <Card titulo="Cuadrillas">
          <div className="space-y-2">
            {cuadrillas.map((q, i) => (
              <div key={q.id} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input className={inputCls} placeholder="Nombre" value={q.nombre} onChange={(e) => setCuadrillas(cuadrillas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                <input className={inputCls} placeholder="Capataz" value={q.capataz} onChange={(e) => setCuadrillas(cuadrillas.map((x, j) => (j === i ? { ...x, capataz: e.target.value } : x)))} />
                <input className={inputCls} inputMode="numeric" placeholder="Trabajadores" value={q.trabajadores} onChange={(e) => setCuadrillas(cuadrillas.map((x, j) => (j === i ? { ...x, trabajadores: Number(e.target.value) || 0 } : x)))} />
                <input className={inputCls} inputMode="numeric" placeholder="Costo HH" value={q.costoHH} onChange={(e) => setCuadrillas(cuadrillas.map((x, j) => (j === i ? { ...x, costoHH: Number(e.target.value) || 0 } : x)))} />
              </div>
            ))}
          </div>
          <Boton variante="fantasma" className="mt-2" onClick={() => setCuadrillas([...cuadrillas, { id: uid('cq'), nombre: `Cuadrilla ${cuadrillas.length + 1}`, capataz: '', trabajadores: 8, costoHH: 9300 }])}>+ Agregar cuadrilla</Boton>
        </Card>
      )}

      <div className="flex justify-between">
        <Boton variante="secundario" disabled={paso === 0} onClick={() => setPaso(paso - 1)}>Anterior</Boton>
        {paso < 3 ? <Boton disabled={!valido[paso]} onClick={() => setPaso(paso + 1)}>Siguiente</Boton> : (
          <Boton disabled={!valido.every(Boolean)} onClick={() => {
            crear(obra, resItem!.items, resProg?.items ?? [], cuadrillas.map((q) => ({ ...q, obraId: id })))
            nav('/obra')
          }}>Crear obra</Boton>
        )}
      </div>
    </div>
  )
}
