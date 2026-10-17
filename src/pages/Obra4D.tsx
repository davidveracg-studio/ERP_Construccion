// Simulación 4D: la obra en el tiempo sobre un modelo paramétrico. Contorno = línea base,
// sólido = avance real (validado en RDO) hasta hoy y proyección del CPM después.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import Vista4D, { COLOR_ESTADO, type Modo4D } from '../components/Vista4D'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { serieCurvaS } from '../domain/evm'
import { fmtFecha } from '../domain/fechas'
import { pct, pp } from '../domain/formato'
import {
  CAPAS, CAPAS_TERRENO, ESTADOS_4D, actividadesEnCurso, elementosDe, estadoElementos, interpolarSerie, leerPisos,
  lineaTiempo4D, modeloDe, textoPisos, type Estado4D,
} from '../domain/modelo4d'
import type { Actividad, Capa, EnlaceModelo, Modelo4D } from '../domain/types'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'

const VELOCIDADES = [{ dias: 7, etiqueta: '1 semana/s' }, { dias: 30, etiqueta: '1 mes/s' }]
const LEYENDA: Estado4D[] = ['al_dia', 'atrasado', 'critico']

export default function Obra4D() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [t, setT] = useState(() => c?.corte ?? 0)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [velocidad, setVelocidad] = useState(7)
  const [modo, setModo] = useState<Modo4D>('estado')
  const [editar, setEditar] = useState(false)

  const obra = c?.obra
  const acts = c?.actualizado?.actividades
  const linea = useMemo(() => (c ? lineaTiempo4D(d, c) : null), [d, c])
  const modelo = useMemo(() => (obra && acts ? modeloDe(obra, acts) : null), [obra, acts])
  const elementos = useMemo(() => (modelo && linea ? elementosDe(modelo, linea.actividades) : []), [modelo, linea])
  const estados = useMemo(() => (linea && c ? estadoElementos(elementos, linea, t, c) : []), [elementos, linea, t, c])
  const enCurso = useMemo(() => (linea && c ? actividadesEnCurso(linea, t, c) : []), [linea, t, c])
  const serie = useMemo(() => (c ? serieCurvaS(d, c.obra.id, c.corte) : []), [d, c])

  // Al cambiar de obra se vuelve a hoy
  useEffect(() => { if (c) { setT(c.corte); setReproduciendo(false) } }, [obra?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reproduciendo || !linea) return
    const id = setInterval(() => setT((x) => Math.min(x + 1, linea.fin)), 1000 / velocidad)
    return () => clearInterval(id)
  }, [reproduciendo, velocidad, linea])
  useEffect(() => { if (reproduciendo && linea && t >= linea.fin) setReproduciendo(false) }, [t, reproduciendo, linea])

  if (!c || !linea || !modelo || !obra) return null
  if (linea.actividades.length === 0)
    return <Vacio titulo="Esta obra no tiene programa" texto="La simulación 4D se arma desde la Carta Gantt. Importa el programa para verla." accion={<Link to="/importar" className="text-marca">Importar programa</Link>} />

  const puedeEditar = rol === 'R01' || rol === 'R02' || rol === 'R05'
  const inicio = linea.inicio
  const tt = Math.min(Math.max(t, inicio), linea.fin)
  const avPlan = interpolarSerie(serie, inicio, tt, 'avancePlan') ?? 0
  const avReal = interpolarSerie(serie, inicio, tt, 'avanceReal')
  const atrasados = estados.filter((e) => e.estado === 'atrasado' || e.estado === 'critico').length
  const momento = tt < linea.corte ? { texto: 'Real (histórico)', tono: 'gris' as const } : tt === linea.corte ? { texto: 'Hoy', tono: 'azul' as const } : { texto: 'Proyección', tono: 'ambar' as const }
  const pos = (x: number) => `${((x - inicio) / Math.max(1, linea.fin - inicio)) * 100}%`

  const play = () => {
    if (tt >= linea.fin) setT(inicio)
    setReproduciendo((r) => !r)
  }

  return (
    <div className="space-y-4">
      <Titulo sub="Contorno = dónde debería ir la obra según la línea base · sólido = avance real validado (proyección después de hoy)"
        accion={puedeEditar ? <Boton variante="secundario" onClick={() => setEditar(true)}>Configurar modelo</Boton> : undefined}>
        Simulación 4D
      </Titulo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Día de obra" valor={`${tt - inicio + 1} / ${obra.plazoDias}`} sub={fmtFecha(tt)} />
        <Kpi etiqueta="Avance planificado" valor={pct(avPlan, 0)} />
        <Kpi etiqueta={tt > linea.corte ? 'Avance real (a hoy)' : 'Avance real'} valor={avReal != null ? pct(avReal, 0) : pct(c.avanceReal, 0)}
          sub={avReal != null ? `${pp(avReal - avPlan)} vs plan` : 'después de hoy se muestra la proyección'}
          estado={avReal == null ? undefined : avReal - avPlan >= -0.02 ? 'verde' : avReal - avPlan >= -0.06 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Elementos atrasados" valor={atrasados} sub={`de ${estados.filter((e) => e.estado !== 'pendiente').length} iniciados`} estado={atrasados === 0 ? 'verde' : 'amarillo'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="-m-4">
            <div className="relative h-[52vh] min-h-[320px] bg-slate-100">
              {elementos.length > 0 ? (
                <Vista4D modelo={modelo} estados={estados} modo={modo} girar={reproduciendo} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                  Ninguna actividad del programa está enlazada al modelo.{puedeEditar && <> Usa “Configurar modelo”.</>}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2">
                <Badge tono={momento.tono}>{momento.texto}</Badge>
                {!obra.modelo4d && <Badge>Modelo inferido de la Carta Gantt</Badge>}
              </div>
              <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-slate-300 bg-white text-xs shadow-sm">
                {(['estado', 'realista'] as const).map((m) => (
                  <button key={m} onClick={() => setModo(m)} className={cx('px-3 py-1.5', modo === m ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-50')}>
                    {m === 'estado' ? 'Plan vs real' : 'Realista'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Boton onClick={play} aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} className="min-w-32 whitespace-nowrap">{reproduciendo ? '❚❚ Pausa' : '▶ Reproducir'}</Boton>
                <Boton variante="secundario" onClick={() => { setReproduciendo(false); setT(inicio) }}>Inicio</Boton>
                <Boton variante="secundario" onClick={() => { setReproduciendo(false); setT(linea.corte) }}>Hoy</Boton>
                <Boton variante="secundario" onClick={() => { setReproduciendo(false); setT(linea.fin) }}>Término</Boton>
                <select value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} className={cx(inputCls, 'ml-auto w-auto')} aria-label="Velocidad">
                  {VELOCIDADES.map((v) => <option key={v.dias} value={v.dias}>{v.etiqueta}</option>)}
                </select>
              </div>
              <div className="relative pt-4">
                <span className="absolute top-0 -translate-x-1/2 text-[10px] font-medium text-marca" style={{ left: pos(linea.corte) }}>Hoy</span>
                <span className="absolute top-4 h-2 w-0.5 -translate-x-1/2 bg-marca" style={{ left: pos(linea.corte) }} />
                <span className="absolute top-4 h-2 w-0.5 -translate-x-1/2 bg-crit" style={{ left: pos(c.terminoContractual - 1) }} title="Término contractual" />
                <input type="range" min={inicio} max={linea.fin} step={1} value={tt} aria-label="Fecha de la simulación"
                  onChange={(e) => { setReproduciendo(false); setT(Number(e.target.value)) }} className="w-full accent-marca" />
              </div>
              <div className="tabular flex justify-between text-xs text-slate-500">
                <span>{fmtFecha(inicio)}</span>
                <span className="text-crit">Contractual {fmtFecha(c.terminoContractual - 1)}</span>
                <span>Proyectado {fmtFecha(c.terminoProyectado - 1)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {LEYENDA.map((e) => (
                  <span key={e} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO[e] }} />{ESTADOS_4D[e]}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-300 bg-stone-300" />Terminado (color de obra)</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-slate-500" />Plan (línea base)</span>
              </div>
            </div>
          </div>
        </Card>

        <Card titulo={`En ejecución al ${fmtFecha(tt)}`}>
          {enCurso.length === 0 ? (
            <p className="text-sm text-slate-500">{tt < linea.corte || tt === linea.corte ? 'No hay actividades en ejecución en esta fecha.' : 'Sin actividades proyectadas en esta fecha.'}</p>
          ) : (
            <ul className="max-h-[60vh] space-y-3 overflow-y-auto overflow-x-hidden py-1 pr-1">
              {enCurso.map((x) => (
                <li key={x.act.id} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-800">{x.act.codigo} {x.act.nombre}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: COLOR_ESTADO[x.estado] }}>{ESTADOS_4D[x.estado]}</span>
                  </div>
                  <div className="relative mt-1 h-2 rounded-full bg-slate-100">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${x.real * 100}%`, background: COLOR_ESTADO[x.estado] }} />
                    <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-700" style={{ left: `calc(${x.plan * 100}% - ${x.plan * 2}px)` }} title="Plan" />
                  </div>
                  <div className="tabular mt-0.5 text-xs text-slate-500">Real {pct(x.real, 0)} · plan {pct(x.plan, 0)}</div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/programa" className="mt-3 block text-sm text-marca">Ver Carta Gantt →</Link>
        </Card>
      </div>

      {editar && (
        <EditorModelo modelo={modelo} acts={linea.actividades} guardado={!!obra.modelo4d} obraId={obra.id} onCerrar={() => setEditar(false)} />
      )}
    </div>
  )
}

function EditorModelo({ modelo, acts, guardado, obraId, onCerrar }: { modelo: Modelo4D; acts: Actividad[]; guardado: boolean; obraId: string; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarModelo4D)
  const [dim, setDim] = useState({ pisos: modelo.pisos, largo: modelo.largo, ancho: modelo.ancho, alturaPiso: modelo.alturaPiso })
  const [filas, setFilas] = useState(() => {
    const porAct = new Map(modelo.enlaces.map((e) => [e.actividadId, e]))
    return acts.filter((a) => !a.esHito).map((a) => {
      const e = porAct.get(a.id)
      return { act: a, capa: (e?.capa ?? '') as Capa | '', pisos: e ? textoPisos(e.pisos, modelo.pisos) : 'todos' }
    })
  })
  const dimOk = dim.pisos >= 1 && dim.pisos <= 80 && dim.largo >= 4 && dim.ancho >= 4 && dim.alturaPiso >= 2
  const leidas = filas.map((f) => (f.capa && !CAPAS_TERRENO.includes(f.capa) ? leerPisos(f.pisos, dim.pisos) : [0]))
  const ok = dimOk && leidas.every((p) => p != null)

  const enviar = () => {
    const enlaces: EnlaceModelo[] = filas.flatMap((f, i) => (f.capa ? [{ actividadId: f.act.id, capa: f.capa, pisos: leidas[i]! }] : []))
    guardar(obraId, { ...dim, enlaces })
    onCerrar()
  }
  const num = (k: keyof typeof dim) => (
    <input type="number" step={k === 'pisos' ? 1 : 0.1} className={inputCls} value={dim[k]} onChange={(e) => setDim({ ...dim, [k]: Number(e.target.value) })} />
  )

  return (
    <Modal abierto titulo="Configurar modelo 4D" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">El edificio se genera con estas medidas. Cada actividad avanza sobre su capa y sus pisos, de abajo hacia arriba.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo etiqueta="Pisos">{num('pisos')}</Campo>
        <Campo etiqueta="Largo (m)">{num('largo')}</Campo>
        <Campo etiqueta="Ancho (m)">{num('ancho')}</Campo>
        <Campo etiqueta="Altura piso (m)">{num('alturaPiso')}</Campo>
      </div>
      {!dimOk && <p className="mt-2 text-xs text-crit">Revisa las medidas: 1 a 80 pisos, planta de al menos 4 m y altura de piso de al menos 2 m.</p>}

      <div className="mt-4 text-xs font-medium text-slate-500">Actividades → capa y pisos (“todos”, “3”, “1-4”, “1, 3”)</div>
      <ul className="mt-2 max-h-[40vh] space-y-2 overflow-auto pr-1">
        {filas.map((f, i) => {
          const terreno = !f.capa || CAPAS_TERRENO.includes(f.capa)
          return (
            <li key={f.act.id} className="grid grid-cols-[1fr_auto_80px] items-center gap-2 text-sm">
              <span className="truncate" title={f.act.nombre}>{f.act.codigo} {f.act.nombre}</span>
              <select className={cx(inputCls, 'w-36 py-1.5')} value={f.capa} aria-label={`Capa de ${f.act.nombre}`}
                onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, capa: e.target.value as Capa | '' } : x)))}>
                <option value="">— No se dibuja</option>
                {(Object.keys(CAPAS) as Capa[]).map((k) => <option key={k} value={k}>{CAPAS[k]}</option>)}
              </select>
              <input className={cx(inputCls, 'py-1.5', leidas[i] == null && 'border-crit')} disabled={terreno} value={terreno ? '' : f.pisos} aria-label={`Pisos de ${f.act.nombre}`}
                placeholder={f.capa ? 'terreno' : ''} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, pisos: e.target.value } : x)))} />
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Boton variante="fantasma" disabled={!guardado} onClick={() => { guardar(obraId, undefined); onCerrar() }}>Volver al automático</Boton>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={!ok} onClick={enviar}>Guardar</Boton>
        </div>
      </div>
    </Modal>
  )
}
