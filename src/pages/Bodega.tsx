// Bodega de obra (v1.2, RF-ABA-02): stock valorizado a costo promedio, movimientos inmutables (entrada
// por recepción de OC, salida a partida, traspaso, merma, ajuste), cobertura de las tareas del plan
// semanal (RULE-201, KAB-13) y control de materiales por partida (KAB-11, RULE-202).
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import {
  controlMateriales, DIAS_COBERTURA, indicadoresBodega, puedeMoverStock, signo, stockMaterial, stockObra,
  TIPOS_MOVIMIENTO, TOLERANCIA_CONSUMO,
} from '../domain/bodega'
import { fmtFecha, hoy } from '../domain/fechas'
import { clp, mm, num, pct, signoPct } from '../domain/formato'
import type { TipoMovimiento } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

type Pestana = 'stock' | 'movimientos' | 'control'
const PESTANAS: Record<Pestana, string> = { stock: 'Stock', movimientos: 'Movimientos', control: 'Control por partida' }
const q = (n: number) => num(n, Math.abs(n % 1) > 0.001 ? 1 : 0)

export default function Bodega() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [params, setParams] = useSearchParams()
  const pestana = (params.get('ver') as Pestana) in PESTANAS ? (params.get('ver') as Pestana) : 'stock'
  const [mov, setMov] = useState<{ materialId?: string; tipo?: Exclude<TipoMovimiento, 'entrada'> } | null>(null)
  if (!c) return null
  const t = hoy()
  const ind = indicadoresBodega(d, c, t)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · stock, movimientos y consumo de materiales por partida`}
        accion={puedeMoverStock(rol) ? <Boton onClick={() => setMov({})}>Registrar movimiento</Boton> : undefined}>
        Bodega de obra
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Valor en bodega" valor={mm(ind.valorStock)} sub={`${ind.materialesConStock} materiales con stock`} />
        {/* KAB-05 se mide al cierre: durante la ejecución es normal tener una o dos semanas de stock */}
        <Kpi etiqueta="Material inmovilizado" valor={ind.inmovilizado != null ? pct(ind.inmovilizado, 1) : '—'}
          sub={c.obra.estado === 'en_ejecucion' ? 'KAB-05 · se evalúa al cierre de la obra' : 'KAB-05 · sobre el costo de materiales'}
          estado={ind.inmovilizado == null || c.obra.estado === 'en_ejecucion' ? undefined : ek('KAB-05', ind.inmovilizado)} ayuda={ayudaKpi('KAB-05')} />
        <Kpi etiqueta={`Sin cobertura (${DIAS_COBERTURA} días)`} valor={ind.faltantes.length} sub="RULE-201 · tareas del plan semanal" estado={ind.faltantes.length ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Críticos sin cobertura" valor={ind.criticosSinCobertura} sub="KAB-13" estado={ind.criticosSinCobertura ? 'rojo' : 'verde'} />
        <Kpi etiqueta="Consumo sobre presupuesto" valor={ind.sobreconsumo.length} sub={`RULE-202 · tolerancia ${pct(TOLERANCIA_CONSUMO, 0)}`} estado={ind.sobreconsumo.length ? 'amarillo' : 'verde'} />
      </div>
      {ind.faltantes.length > 0 && (
        <Card titulo="Material que falta para las tareas por iniciar">
          <ul className="divide-y divide-slate-100 text-sm">
            {ind.faltantes.map((f) => (
              <li key={f.material.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div><span className="font-medium">{f.material.nombre}</span>{f.critico && <Badge tono="rojo">Crítico</Badge>}<div className="text-xs text-slate-500">{f.tareas.map((x) => x.descripcion).join(' · ')}</div></div>
                <span className="tabular text-sm">requiere {q(f.requerido)} · stock {q(f.stock)} · en compra {q(f.enCompra)} {f.material.unidad}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Emite la OC en <Link to="/compras?ver=ordenes" className="text-marca hover:underline">Compras</Link> o traspasa stock desde otra obra.</p>
        </Card>
      )}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {(Object.keys(PESTANAS) as Pestana[]).map((p) => (
          <button key={p} role="tab" aria-selected={p === pestana} onClick={() => setParams({ ver: p }, { replace: true })}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', p === pestana ? 'border-marca text-marca' : 'border-transparent text-slate-600 hover:text-slate-900')}>{PESTANAS[p]}</button>
        ))}
      </div>
      {pestana === 'stock' && <Stock obraId={c.obra.id} puede={puedeMoverStock(rol)} onMover={(materialId, tipo) => setMov({ materialId, tipo })} />}
      {pestana === 'movimientos' && <Movimientos obraId={c.obra.id} />}
      {pestana === 'control' && (
        <Card titulo="Control de materiales por partida (KAB-11)">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[820px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Partida · material</th><th className="font-medium">Presupuestado</th><th className="font-medium">Según avance</th>
                  <th className="font-medium">Comprado</th><th className="font-medium">Recibido</th><th className="font-medium">Consumido</th><th className="font-medium">Desviación</th>
                </tr>
              </thead>
              <tbody>
                {controlMateriales(d, c, t).map((x) => (
                  <tr key={x.partida.id} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left"><div className="font-medium">{x.partida.codigo} {x.partida.descripcion}</div><div className="text-xs text-slate-500">{x.material.nombre} · {x.material.unidad}</div></td>
                    <td>{q(x.presupuestado)}</td><td>{q(x.segunAvance)}</td><td>{q(x.comprado)}</td><td>{q(x.recibido)}</td><td>{q(x.consumido)}</td>
                    <td className={cx(x.desvio != null && x.desvio > TOLERANCIA_CONSUMO && 'font-medium text-crit')}>{x.desvio != null ? signoPct(x.desvio) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Según avance = material presupuestado por unidad × cantidad ejecutada validada. Las partidas con contrato marco (p. ej. hormigón H-30, OC-1021) se abastecen contra ese contrato, fuera de las OC de la app.</p>
        </Card>
      )}
      {mov && <NuevoMovimiento obraId={c.obra.id} inicial={mov} onCerrar={() => setMov(null)} />}
    </div>
  )
}

function Stock({ obraId, puede, onMover }: { obraId: string; puede: boolean; onMover: (materialId: string, tipo: Exclude<TipoMovimiento, 'entrada'>) => void }) {
  const d = useDatosDominio()
  const t = hoy()
  const filas = stockObra(d.movimientosStock, d.materiales, obraId, t).sort((a, b) => b.valor - a.valor)
  return (
    <Card titulo="Stock por material">
      {filas.length === 0 ? <Vacio titulo="Bodega vacía" texto="Las recepciones de órdenes de compra ingresan el material a la bodega." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Material</th><th className="font-medium">Stock</th><th className="font-medium">Costo promedio</th><th className="font-medium">Valor</th><th className="text-left font-medium">Último movimiento</th><th />
              </tr>
            </thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.material.id} className="border-b border-slate-100 text-right">
                  <td className="py-2 text-left"><div className="font-medium">{x.material.nombre}</div><div className="text-xs text-slate-500">{x.material.codigo} · {x.material.categoria}{x.material.critico ? ' · crítico' : ''}</div></td>
                  <td className={cx(x.cantidad <= 0 && 'text-slate-400')}>{q(x.cantidad)} {x.material.unidad}</td>
                  <td>{clp(Math.round(x.costoPromedio))}</td><td>{mm(x.valor)}</td>
                  <td className="text-left">{x.ultimo != null ? fmtFecha(x.ultimo) : '—'}</td>
                  <td>{puede && x.cantidad > 0 && <span className="flex justify-end gap-3 text-xs"><button className="text-marca hover:underline" onClick={() => onMover(x.material.id, 'salida')}>Salida</button><button className="text-marca hover:underline" onClick={() => onMover(x.material.id, 'traspaso')}>Traspaso</button><button className="text-slate-500 hover:text-crit" onClick={() => onMover(x.material.id, 'merma')}>Merma</button></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Movimientos({ obraId }: { obraId: string }) {
  const d = useDatosDominio()
  const [todos, setTodos] = useState(false)
  const t = hoy()
  const movs = d.movimientosStock.filter((m) => m.obraId === obraId && m.fecha <= t).sort((a, b) => b.fecha - a.fecha)
  const lista = todos ? movs : movs.slice(0, 40)
  return (
    <Card titulo="Movimientos" accion={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Ver todos ({movs.length})</label>}>
      {movs.length === 0 ? <Vacio titulo="Sin movimientos" texto="Aún no hay entradas ni salidas en esta bodega." /> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Fecha</th><th className="font-medium">Movimiento</th><th className="font-medium">Material</th><th className="text-right font-medium">Cantidad</th><th className="font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const mat = d.materiales.find((x) => x.id === m.materialId)
                const p = d.partidas.find((x) => x.id === m.partidaId)
                const destino = d.obras.find((o) => o.id === m.obraDestinoId)
                const s = signo(m)
                return (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-1.5">{fmtFecha(m.fecha)}</td>
                    <td><Badge tono={m.tipo === 'entrada' ? 'verde' : m.tipo === 'salida' ? 'azul' : m.tipo === 'merma' ? 'rojo' : 'gris'}>{TIPOS_MOVIMIENTO[m.tipo]}</Badge></td>
                    <td>{mat?.nombre}</td>
                    <td className={cx('text-right', s < 0 && 'text-slate-600')}>{s > 0 ? '+' : ''}{q(s)} {mat?.unidad}</td>
                    <td className="max-w-[260px] truncate text-slate-600">{p ? `${p.codigo} ${p.descripcion}` : destino ? `A ${destino.nombre}` : m.motivo ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function NuevoMovimiento({ obraId, inicial, onCerrar }: { obraId: string; inicial: { materialId?: string; tipo?: Exclude<TipoMovimiento, 'entrada'> }; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarMovimiento)
  const d = useDatosDominio()
  const t = hoy()
  const conStock = stockObra(d.movimientosStock, d.materiales, obraId, t)
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const [v, setV] = useState({
    tipo: inicial.tipo ?? 'salida' as Exclude<TipoMovimiento, 'entrada'>, materialId: inicial.materialId ?? conStock[0]?.material.id ?? d.materiales[0]?.id ?? '',
    cantidad: '', partidaId: partidas[0]?.id ?? '', obraDestinoId: d.obras.find((o) => o.id !== obraId)?.id ?? '', motivo: '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const mat = d.materiales.find((m) => m.id === v.materialId)
  const disponible = stockMaterial(d.movimientosStock, obraId, v.materialId, t).cantidad
  return (
    <Modal abierto titulo="Registrar movimiento de bodega" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Los movimientos no se editan ni se borran; para corregir se registra un ajuste. Las entradas nacen de las recepciones de OC.</p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Movimiento">
            <select className={inputCls} value={v.tipo} onChange={set('tipo')}>{(['salida', 'traspaso', 'merma', 'ajuste'] as const).map((k) => <option key={k} value={k}>{TIPOS_MOVIMIENTO[k]}</option>)}</select>
          </Campo>
          <Campo etiqueta="Material" ayuda={`Stock: ${q(disponible)} ${mat?.unidad ?? ''}`}>
            <select className={inputCls} value={v.materialId} onChange={set('materialId')}>{d.materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
          </Campo>
        </div>
        <Campo etiqueta={`Cantidad${mat ? ` (${mat.unidad})` : ''}`} ayuda={v.tipo === 'ajuste' ? 'Positiva si sobra en el conteo, negativa si falta.' : undefined}>
          <input type="number" className={inputCls} value={v.cantidad} onChange={set('cantidad')} />
        </Campo>
        {v.tipo === 'salida' && <Campo etiqueta="Partida que consume"><select className={inputCls} value={v.partidaId} onChange={set('partidaId')}>{partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} {p.descripcion}</option>)}</select></Campo>}
        {v.tipo === 'traspaso' && <Campo etiqueta="Obra de destino"><select className={inputCls} value={v.obraDestinoId} onChange={set('obraDestinoId')}>{d.obras.filter((o) => o.id !== obraId).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></Campo>}
        {v.tipo !== 'salida' && <Campo etiqueta={v.tipo === 'traspaso' ? 'Motivo (opcional)' : 'Motivo'}><input className={inputCls} value={v.motivo} onChange={set('motivo')} /></Campo>}
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = registrar({
            obraId, materialId: v.materialId, tipo: v.tipo, cantidad: Number(v.cantidad || 0), motivo: v.motivo,
            partidaId: v.tipo === 'salida' ? v.partidaId : undefined, obraDestinoId: v.tipo === 'traspaso' ? v.obraDestinoId : undefined,
          })
          if (err) setError(err)
          else onCerrar()
        }}>Registrar</Boton>
      </div>
    </Modal>
  )
}
