// Simulación 4D: la obra en el tiempo sobre un modelo paramétrico o BIM (IFC). Contorno =
// línea base, sólido = avance real (validado en RDO) hasta hoy y proyección del CPM después.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import Vista4D, { COLOR_ESTADO, type FiltroPiso, type ModeloBim, type Modo4D, type Seleccion4D, type Visor4D } from '../components/Vista4D'
import { avancePeriodo, componerImagen, descargarImagen, LEYENDA_PERIODO } from '../components/Comparacion4D'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import GuiaFigura from '../components/GuiaFigura'
import { agruparIfc, origenElemento, reagruparPorActividad, RUTA_IFC_DEMO } from '../domain/bim'
import { contextoElemento } from '../domain/bimContexto'
import { ESTADOS_PROTOCOLO, ESTADOS_NCR, TONO_NCR, TONO_PROTOCOLO } from '../domain/calidad'
import { ESTADOS_INCIDENTE, TONO_INCIDENTE, TIPOS_INCIDENTE } from '../domain/seguridad'
import { ESTADOS_POSTVENTA, TONO_POSTVENTA } from '../domain/postventa'
import { serieCurvaS } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { num, pct, pp } from '../domain/formato'
import { borrarIfc, MAX_BYTES_IFC, subirIfc } from '../ifc/archivos'
import { geometriaIfc, leerIfc, precargarIfc, useGeometriaIfc } from '../ifc/cargar'
import type { GeometriaIfc } from '../ifc/extraer'
import {
  CAPAS, CAPAS_TERRENO, ESTADOS_4D, actividadesEnCurso, elementosDe, estadoElementos, interpolarSerie, leerPisos,
  lineaTiempo4D, modeloDe, textoPisos, type Estado4D,
} from '../domain/modelo4d'
import type { Actividad, ArchivoIfc, Capa, EnlaceModelo, Modelo4D, NivelIfc } from '../domain/types'
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
  const [filtro, setFiltro] = useState<FiltroPiso>({ modo: 'todos', piso: 1 })
  const [seleccion, setSeleccion] = useState<Seleccion4D | null>(null)
  const [asignando, setAsignando] = useState<{ actividadId: string; ids: Set<number> } | null>(null)
  // Comparación de fechas: A según el preset (relativo a la fecha de la simulación) o una fecha fija
  const [comparar, setComparar] = useState<{ tipo: 'semana' | 'mes' | 'inicio' | 'fecha'; fecha: number } | null>(null)
  const visor = useRef<Visor4D | null>(null)

  const obra = c?.obra
  const acts = c?.actualizado?.actividades
  const linea = useMemo(() => (c ? lineaTiempo4D(d, c) : null), [d, c])
  const modelo = useMemo(() => (obra && acts ? modeloDe(obra, acts) : null), [obra, acts])
  const carga = useGeometriaIfc(modelo?.ifc?.ruta)
  const geo = carga.estado === 'listo' ? carga.geo : null
  // Detalle por tarea: los elementos asignados a una actividad forman su propio grupo
  const bim = useMemo<ModeloBim | null>(() => (geo && modelo ? { geo, grupos: reagruparPorActividad(agruparIfc(geo.niveles, geo.elementos), modelo.enlaces) } : null), [geo, modelo])
  const elementos = useMemo(() => (modelo && linea ? elementosDe(modelo, linea.actividades, bim?.grupos) : []), [modelo, linea, bim])
  const estados = useMemo(() => (linea && c ? estadoElementos(elementos, linea, t, c) : []), [elementos, linea, t, c])
  const fechaA = comparar && linea ? Math.max(linea.inicio, Math.min(t - 1, comparar.tipo === 'semana' ? t - 7 : comparar.tipo === 'mes' ? t - 30 : comparar.tipo === 'inicio' ? linea.inicio : comparar.fecha)) : null
  const estadosA = useMemo(() => (linea && c && fechaA != null ? estadoElementos(elementos, linea, fechaA, c) : null), [elementos, linea, fechaA, c])
  const enCurso = useMemo(() => (linea && c ? actividadesEnCurso(linea, t, c) : []), [linea, t, c])
  const serie = useMemo(() => (c ? serieCurvaS(d, c.obra.id, c.corte) : []), [d, c])

  // Al cambiar de obra se vuelve a hoy, con todos los pisos y sin selección
  useEffect(() => { if (c) { setT(c.corte); setReproduciendo(false); setSeleccion(null); setAsignando(null); setFiltro({ modo: 'todos', piso: 1 }) } }, [obra?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const alClic = (sel: Seleccion4D | null) => {
    if (asignando) {
      if (sel?.ifcId == null) return
      const ids = new Set(asignando.ids)
      if (ids.has(sel.ifcId)) ids.delete(sel.ifcId)
      else ids.add(sel.ifcId)
      setAsignando({ ...asignando, ids })
      return
    }
    setSeleccion(sel)
  }
  const elemSel = seleccion ? estados.find((e) => e.elemento.clave === seleccion.clave) : undefined
  const periodo = fechaA != null ? avancePeriodo(d, c, fechaA, tt) : null
  const avanzados = estadosA ? estados.filter((e) => e.real > (estadosA.find((x) => x.elemento.clave === e.elemento.clave)?.real ?? 0) + 0.001).length : 0
  const descargar = async () => {
    const cap = visor.current?.captura()
    if (!cap) return
    const leyenda = fechaA != null ? LEYENDA_PERIODO(fechaA)
      : [...LEYENDA.map((e) => ({ color: COLOR_ESTADO[e], texto: ESTADOS_4D[e] })), { color: '#64748b', texto: 'Plan (línea base)', borde: true }]
    const cifras = fechaA != null && periodo
      ? [`Avance ${pct(periodo.a, 0)} → ${pct(periodo.b, 0)} (${pp(periodo.b - periodo.a)})`, `${avanzados} grupos avanzaron`, `Plan al ${fmtFecha(tt)}: ${pct(periodo.planB, 0)}`]
      : [`Avance real ${avReal != null ? pct(avReal, 0) : pct(c.avanceReal, 0)}`, `Planificado ${pct(avPlan, 0)}`, `Término proyectado ${fmtFecha(c.terminoProyectado - 1)}`]
    const sub = fechaA != null ? `Avance del ${fmtFecha(fechaA)} al ${fmtFecha(tt)}` : `${momento.texto} · ${fmtFecha(tt)}${filtro.modo !== 'todos' ? ` · ${filtro.modo === 'solo' ? 'solo' : 'hasta'} el piso ${filtro.piso}` : ''}`
    descargarImagen(await componerImagen(cap, `${obra.nombre} · Simulación 4D`, sub, leyenda, cifras), `4d-${obra.nombre.toLowerCase().replace(/\s+/g, '-')}-${iso(tt)}.png`)
  }

  const play = () => {
    if (tt >= linea.fin) setT(inicio)
    setReproduciendo((r) => !r)
  }

  return (
    <div className="space-y-4">
      <Titulo sub="Contorno = dónde debería ir la obra según la línea base · sólido = avance real validado (proyección después de hoy)"
        accion={<>
          <GuiaFigura figura="obra-4d" titulo="Cómo se lee la simulación 4D" texto="Una maqueta de obra: mueve el cursor sobre la regla (o usa las flechas) y la obra se levanta según el programa. Lo sólido es lo ejecutado; el contorno marcado es lo que el plan ya pedía y aún falta. El reloj compara el avance real con el planificado." />
          {puedeEditar && bim && <Boton variante="secundario" onClick={() => { setSeleccion(null); setReproduciendo(false); setComparar(null); setAsignando({ actividadId: '', ids: new Set() }) }}>Asignar elementos a tareas</Boton>}
          {puedeEditar && <Boton variante="secundario" onClick={() => setEditar(true)}>Configurar modelo</Boton>}
        </>}>
        Simulación 4D
      </Titulo>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Día de obra" valor={`${tt - inicio + 1} / ${obra.plazoDias}`} sub={fmtFecha(tt)} />
        <Kpi etiqueta="Avance planificado" valor={pct(avPlan, 0)} />
        <Kpi etiqueta={tt > linea.corte ? 'Avance real (a hoy)' : 'Avance real'} valor={avReal != null ? pct(avReal, 0) : pct(c.avanceReal, 0)}
          sub={avReal != null ? `${pp(avReal - avPlan)} vs plan` : 'después de hoy se muestra la proyección'}
          estado={avReal == null ? undefined : avReal - avPlan >= -0.02 ? 'verde' : avReal - avPlan >= -0.06 ? 'amarillo' : 'rojo'} />
        {periodo ? (
          <Kpi etiqueta={`Avance del período (desde ${fmtFecha(fechaA!)})`} valor={pp(periodo.b - periodo.a)} sub={`${pct(periodo.a, 0)} → ${pct(periodo.b, 0)} · ${avanzados} grupos avanzaron`} />
        ) : (
          <Kpi etiqueta="Elementos atrasados" valor={atrasados} sub={`de ${estados.filter((e) => e.estado !== 'pendiente').length} iniciados`} estado={atrasados === 0 ? 'verde' : 'amarillo'} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="-m-4">
            <div className="relative h-[52vh] min-h-[320px] bg-slate-100">
              {modelo.ifc && carga.estado === 'cargando' ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-slate-600">
                  <span>Cargando modelo BIM… {pct(carga.progreso, 0)}</span>
                  <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-marca transition-all" style={{ width: `${carga.progreso * 100}%` }} /></div>
                </div>
              ) : elementos.length > 0 ? (
                <Vista4D modelo={modelo} bim={bim} estados={estados} modo={modo} girar={reproduciendo} filtro={filtro} seleccion={seleccion} asignados={asignando?.ids ?? null} onClic={alClic} desde={asignando ? null : estadosA} visor={visor} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                  Ninguna actividad del programa está enlazada al modelo.{puedeEditar && <> Usa “Configurar modelo”.</>}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2">
                <Badge tono={momento.tono}>{momento.texto}</Badge>
                {!obra.modelo4d && <Badge>Modelo inferido de la Carta Gantt</Badge>}
                {modelo.ifc && carga.estado !== 'error' && <Badge>BIM · {modelo.ifc.nombre}</Badge>}
                {carga.estado === 'error' && <Badge tono="rojo">No se pudo cargar el IFC: {carga.error} Se muestra el modelo paramétrico.</Badge>}
              </div>
              {/* Vista por piso: todos, hasta un piso (corte) o solo uno */}
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 text-xs shadow-sm">
                <select value={filtro.modo} onChange={(e) => setFiltro({ ...filtro, modo: e.target.value as FiltroPiso['modo'] })} className="rounded border-0 bg-transparent py-0.5 pl-1 pr-6 text-xs" aria-label="Vista por piso">
                  <option value="todos">Todos los pisos</option>
                  <option value="hasta">Hasta el piso</option>
                  <option value="solo">Solo el piso</option>
                </select>
                {filtro.modo !== 'todos' && (
                  <select value={filtro.piso} onChange={(e) => setFiltro({ ...filtro, piso: Number(e.target.value) })} className="rounded border-0 bg-transparent py-0.5 pl-1 pr-6 text-xs" aria-label="Piso">
                    {filtro.modo === 'solo' && <option value={0}>Terreno</option>}
                    {Array.from({ length: modelo.pisos }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
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
                <select value={comparar?.tipo ?? ''} aria-label="Comparar con"
                  onChange={(e) => { const v = e.target.value as '' | 'semana' | 'mes' | 'inicio' | 'fecha'; setReproduciendo(false); setComparar(v ? { tipo: v, fecha: Math.max(inicio, tt - 14) } : null) }}
                  className={cx(inputCls, 'w-auto')}>
                  <option value="">Sin comparar</option>
                  <option value="semana">Comparar con hace 1 semana</option>
                  <option value="mes">Comparar con hace 1 mes</option>
                  <option value="inicio">Comparar con el inicio</option>
                  <option value="fecha">Comparar con una fecha…</option>
                </select>
                {comparar?.tipo === 'fecha' && (
                  <input type="date" className={cx(inputCls, 'w-auto')} aria-label="Fecha A" value={iso(comparar.fecha)} min={iso(inicio)} max={iso(Math.max(inicio, tt - 1))}
                    onChange={(e) => e.target.value && setComparar({ tipo: 'fecha', fecha: dia(e.target.value) })} />
                )}
                <Boton variante="secundario" onClick={descargar}>Descargar imagen</Boton>
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
              {fechaA != null ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  {LEYENDA_PERIODO(fechaA).map((l) => <span key={l.texto} className="flex items-center gap-1.5"><span className={l.borde ? 'h-3 w-3 rounded-sm border border-dashed border-slate-500' : 'h-3 w-3 rounded-sm'} style={l.borde ? undefined : { background: l.color }} />{l.texto}</span>)}
                  <span>Fecha B: la del control deslizante ({fmtFecha(tt)})</span>
                </div>
              ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {LEYENDA.map((e) => (
                  <span key={e} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO[e] }} />{ESTADOS_4D[e]}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-300 bg-stone-300" />Terminado (color de obra)</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-slate-500" />Plan (línea base)</span>
              </div>
              )}
            </div>
          </div>
        </Card>

        {asignando && bim ? (
          <PanelAsignar bim={bim} modelo={modelo} acts={linea.actividades} asignando={asignando} setAsignando={setAsignando} obraId={obra.id} onCerrar={() => setAsignando(null)} />
        ) : elemSel ? (
          <FichaElemento e={elemSel} sel={seleccion!} t={tt} linea={linea} onCerrar={() => setSeleccion(null)} />
        ) : (
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
          <p className="mt-2 text-xs text-slate-500">Toca un elemento del modelo para ver su ficha.</p>
        </Card>
        )}
      </div>

      {editar && (
        <EditorModelo modelo={modelo} acts={linea.actividades} guardado={!!obra.modelo4d} obraId={obra.id} onCerrar={() => setEditar(false)} />
      )}
    </div>
  )
}

/** IFC elegido en el editor (aún sin guardar o ya guardado en la obra). */
interface IfcElegido {
  ruta?: string
  nombre: string
  bytes?: Uint8Array
  tamano: number
  niveles: NivelIfc[]
  pisos: number
  geo?: GeometriaIfc
  sinCapa?: number
}

function resumenIfc(geo: GeometriaIfc) {
  const g = agruparIfc(geo.niveles, geo.elementos)
  return { niveles: g.niveles, pisos: g.pisos, sinCapa: g.sinCapa }
}

function EditorModelo({ modelo, acts, guardado, obraId, onCerrar }: { modelo: Modelo4D; acts: Actividad[]; guardado: boolean; obraId: string; onCerrar: () => void }) {
  const guardar = useStore((s) => s.guardarModelo4D)
  const usuario = useStore((s) => s.ui.usuario)
  const [fuente, setFuente] = useState<'parametrico' | 'bim'>(modelo.ifc ? 'bim' : 'parametrico')
  const [ifc, setIfc] = useState<IfcElegido | null>(() =>
    modelo.ifc ? { ruta: modelo.ifc.ruta, nombre: modelo.ifc.nombre, tamano: modelo.ifc.bytes, niveles: modelo.ifc.niveles, pisos: modelo.pisos } : null)
  const [leyendo, setLeyendo] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string>()
  const [dim, setDim] = useState({ pisos: modelo.pisos, largo: modelo.largo, ancho: modelo.ancho, alturaPiso: modelo.alturaPiso })
  const [filas, setFilas] = useState(() => {
    const porAct = new Map(modelo.enlaces.map((e) => [e.actividadId, e]))
    return acts.filter((a) => !a.esHito).map((a) => {
      const e = porAct.get(a.id)
      return { act: a, capa: (e?.capa ?? '') as Capa | '', pisos: e ? textoPisos(e.pisos, modelo.pisos) : 'todos' }
    })
  })
  const bimMode = fuente === 'bim'
  const pisos = bimMode ? (ifc?.pisos ?? 1) : dim.pisos
  const dimOk = dim.pisos >= 1 && dim.pisos <= 80 && dim.largo >= 4 && dim.ancho >= 4 && dim.alturaPiso >= 2
  const leidas = filas.map((f) => (f.capa && !CAPAS_TERRENO.includes(f.capa) ? leerPisos(f.pisos, pisos) : [0]))
  const ok = (bimMode ? !!ifc && leyendo == null : dimOk) && leidas.every((p) => p != null) && !guardando

  const leer = async (obtener: () => Promise<{ geo: GeometriaIfc; elegido: Omit<IfcElegido, 'niveles' | 'pisos' | 'geo'> }>) => {
    setError(undefined)
    setLeyendo(0)
    try {
      const { geo, elegido } = await obtener()
      setIfc({ ...elegido, geo, ...resumenIfc(geo) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLeyendo(null)
    }
  }
  const elegirArchivo = (archivo: File | undefined) => {
    if (!archivo) return
    if (!/\.ifc$/i.test(archivo.name)) { setError('El archivo debe ser .ifc (exportado desde Revit, ArchiCAD, Tekla u otro).'); return }
    if (archivo.size > MAX_BYTES_IFC) { setError('El archivo supera el máximo de 50 MB.'); return }
    leer(async () => {
      const bytes = new Uint8Array(await archivo.arrayBuffer())
      return { geo: await leerIfc(bytes, setLeyendo), elegido: { nombre: archivo.name, bytes, tamano: archivo.size } }
    })
  }
  const usarEjemplo = () =>
    leer(async () => ({ geo: await geometriaIfc(RUTA_IFC_DEMO, setLeyendo), elegido: { ruta: RUTA_IFC_DEMO, nombre: 'edificio-los-aromos.ifc', tamano: 0 } }))

  const enviar = async () => {
    setGuardando(true)
    setError(undefined)
    try {
      const enlaces: EnlaceModelo[] = filas.flatMap((f, i) => (f.capa ? [{ actividadId: f.act.id, capa: f.capa, pisos: leidas[i]! }] : []))
      let archivo: ArchivoIfc | undefined
      if (bimMode && ifc) {
        if (ifc.ruta && ifc.ruta === modelo.ifc?.ruta) archivo = modelo.ifc
        else {
          const ruta = ifc.ruta ?? (await subirIfc(obraId, ifc.nombre, ifc.bytes!))
          if (ifc.geo) precargarIfc(ruta, ifc.geo)
          archivo = { ruta, nombre: ifc.nombre, bytes: ifc.tamano, fecha: hoy(), subidoPor: usuario, niveles: ifc.niveles }
        }
      }
      guardar(obraId, { ...dim, pisos, enlaces, ...(archivo ? { ifc: archivo } : {}) })
      // El archivo anterior deja de usarse
      if (modelo.ifc && modelo.ifc.ruta !== archivo?.ruta) borrarIfc(modelo.ifc.ruta)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }
  const restablecer = () => {
    guardar(obraId, undefined)
    if (modelo.ifc) borrarIfc(modelo.ifc.ruta)
    onCerrar()
  }
  const numero = (k: keyof typeof dim) => (
    <input type="number" step={k === 'pisos' ? 1 : 0.1} className={inputCls} value={dim[k]} onChange={(e) => setDim({ ...dim, [k]: Number(e.target.value) })} />
  )
  const selectorArchivo = (texto: string, cls: string) => (
    <label className={cls}>
      {texto}
      <input type="file" accept=".ifc" className="sr-only" onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )

  return (
    <Modal abierto titulo="Configurar modelo 4D" onCerrar={onCerrar}>
      <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="radiogroup" aria-label="Fuente del modelo">
        {(['parametrico', 'bim'] as const).map((f) => (
          <button key={f} role="radio" aria-checked={fuente === f} onClick={() => setFuente(f)}
            className={cx('px-3 py-1.5', fuente === f ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-50')}>
            {f === 'parametrico' ? 'Paramétrico' : 'Modelo BIM (IFC)'}
          </button>
        ))}
      </div>

      {!bimMode ? (
        <>
          <p className="mb-3 text-sm text-slate-600">El edificio se genera con estas medidas. Cada actividad avanza sobre su capa y sus pisos, de abajo hacia arriba.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo etiqueta="Pisos">{numero('pisos')}</Campo>
            <Campo etiqueta="Largo (m)">{numero('largo')}</Campo>
            <Campo etiqueta="Ancho (m)">{numero('ancho')}</Campo>
            <Campo etiqueta="Altura piso (m)">{numero('alturaPiso')}</Campo>
          </div>
          {!dimOk && <p className="mt-2 text-xs text-crit">Revisa las medidas: 1 a 80 pisos, planta de al menos 4 m y altura de piso de al menos 2 m.</p>}
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          {leyendo != null ? (
            <div className="space-y-2 py-2 text-center text-slate-600">
              <div>Leyendo IFC… {pct(leyendo, 0)}</div>
              <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-marca" style={{ width: `${leyendo * 100}%` }} /></div>
            </div>
          ) : ifc ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="break-all font-medium text-slate-800">{ifc.nombre}{ifc.ruta === RUTA_IFC_DEMO && ' (ejemplo)'}</span>
                {ifc.tamano > 0 && <span className="tabular shrink-0 text-xs text-slate-500">{num(ifc.tamano / 1048576, 1)} MB</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {ifc.geo && `${ifc.geo.elementos.length - (ifc.sinCapa ?? 0)} elementos · `}{ifc.pisos} piso(s)
                {!!ifc.sinCapa && ` · ${ifc.sinCapa} sin capa (no se dibujan)`}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {ifc.niveles.map((n, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{n.nombre} <span className="tabular text-slate-400">({n.elevacion >= 0 ? '+' : ''}{num(n.elevacion, 2)} m)</span></span>
                    <span className="shrink-0">→ {n.piso === 0 ? 'Terreno / fundaciones' : `Piso ${n.piso}`}</span>
                  </li>
                ))}
              </ul>
              {selectorArchivo('Reemplazar archivo', 'mt-2 inline-block cursor-pointer text-marca hover:underline')}
            </>
          ) : (
            <div className="space-y-2 text-center">
              {selectorArchivo('Elegir archivo .ifc (máx. 50 MB)', 'block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-4 text-slate-700 hover:border-marca hover:text-marca')}
              <button onClick={usarEjemplo} className="text-sm text-marca hover:underline">o usar el modelo BIM de ejemplo</button>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Cada elemento se asigna solo: pilares, vigas y losas → estructura; muros → muros; ventanas, puertas y cielos → terminaciones;
            cañerías y ductos → instalaciones. El piso sale del nivel del IFC.
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}

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
        <Boton variante="fantasma" disabled={!guardado || guardando} onClick={restablecer}
          title={modelo.ifc ? 'Vuelve al modelo inferido de la Carta Gantt y borra el IFC de la obra' : undefined}>Volver al automático</Boton>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton disabled={!ok} onClick={enviar}>{guardando ? (bimMode && ifc && !ifc.ruta ? 'Subiendo…' : 'Guardando…') : 'Guardar'}</Boton>
        </div>
      </div>
    </Modal>
  )
}

/** Ficha del elemento tocado en el modelo: actividades, partidas y lo que pasa en ese lugar. */
function FichaElemento({ e, sel, t, linea, onCerrar }: { e: ReturnType<typeof estadoElementos>[number]; sel: Seleccion4D; t: number; linea: ReturnType<typeof lineaTiempo4D>; onCerrar: () => void }) {
  const { d, c } = useCalc()
  if (!c) return null
  const x = contextoElemento(d, c, linea, t, e.elemento)
  const lugar = e.elemento.piso === 0 ? 'Terreno' : `Piso ${e.elemento.piso}`
  const seccion = (titulo: string, n: number, link: string, hijos: React.ReactNode) => (
    <div className="border-t border-slate-100 pt-2">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"><span>{titulo} ({n})</span><Link to={link} className="normal-case tracking-normal text-marca">Abrir →</Link></div>
      {n === 0 ? <p className="text-xs text-slate-400">Sin registros en este lugar.</p> : hijos}
    </div>
  )
  return (
    <Card titulo={<span className="flex items-start justify-between gap-2"><span>{sel.nombre ?? `${CAPAS[e.elemento.capa]} · ${lugar}`}</span><button onClick={onCerrar} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar ficha">✕</button></span>}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>{lugar} · {CAPAS[e.elemento.capa]}{e.elemento.actividad ? ' · asignado a la tarea' : ''}</span>
          <span className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: COLOR_ESTADO[e.estado] }}>{ESTADOS_4D[e.estado]}</span>
          <span className="tabular">plan {pct(e.plan, 0)} · real {pct(e.real, 0)} al {fmtFecha(t)}</span>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Actividades</div>
          <ul className="space-y-2">
            {x.actividades.map((a) => (
              <li key={a.act.id}>
                <div className="flex justify-between gap-2"><span className="font-medium">{a.act.codigo} {a.act.nombre}</span>{a.critica && <Badge tono="rojo">Crítica</Badge>}</div>
                <div className="relative mt-1 h-1.5 rounded-full bg-slate-100"><div className="absolute inset-y-0 left-0 rounded-full bg-marca" style={{ width: `${a.real * 100}%` }} /><div className="absolute -top-0.5 h-2.5 w-0.5 bg-slate-700" style={{ left: `${a.plan * 100}%` }} /></div>
                <div className="tabular text-xs text-slate-500">Real {pct(a.real, 0)} · plan {pct(a.plan, 0)}{a.finLB != null ? ` · línea base al ${fmtFecha(a.finLB - 1)}` : ''}{a.finProyectado != null && a.real < 1 ? ` · proyectado ${fmtFecha(a.finProyectado - 1)}` : ''}</div>
              </li>
            ))}
          </ul>
        </div>
        {seccion('Partidas', x.partidas.length, '/costos', (
          <ul className="space-y-1">{x.partidas.map((p) => <li key={p.p.id} className="flex justify-between gap-2 text-xs"><span>{p.p.codigo} {p.p.descripcion}</span><span className="tabular whitespace-nowrap text-slate-500">{pct(p.avance, 0)} · CPI {p.cpi != null ? num(p.cpi, 2) : '—'}</span></li>)}</ul>
        ))}
        {seccion('Protocolos de calidad', x.protocolos.length, '/calidad', (
          <ul className="space-y-1">{x.protocolos.slice(0, 6).map(({ p, estado }) => <li key={p.id} className="flex justify-between gap-2 text-xs"><span>N° {p.numero} {p.nombre}<span className="block text-slate-500">{p.ubicacion} · {fmtFecha(p.programado)}</span></span><Badge tono={TONO_PROTOCOLO[estado]}>{ESTADOS_PROTOCOLO[estado]}</Badge></li>)}</ul>
        ))}
        {seccion('No conformidades', x.ncrs.length, '/calidad', (
          <ul className="space-y-1">{x.ncrs.map(({ n, estado }) => <li key={n.id} className="flex justify-between gap-2 text-xs"><span>N° {n.numero} {n.descripcion}</span><Badge tono={TONO_NCR[estado]}>{ESTADOS_NCR[estado]}</Badge></li>)}</ul>
        ))}
        {seccion('RFI', x.rfis.length, '/documentos', (
          <ul className="space-y-1">{x.rfis.map(({ r, estado }) => <li key={r.id} className="flex justify-between gap-2 text-xs"><span>RFI {r.numero} · {r.asunto}</span><Badge tono="gris">{estado}</Badge></li>)}</ul>
        ))}
        {seccion('Incidentes de seguridad', x.incidentes.length, '/seguridad', (
          <ul className="space-y-1">{x.incidentes.map(({ i, estado }) => <li key={i.id} className="flex justify-between gap-2 text-xs"><span>{TIPOS_INCIDENTE[i.tipo]} · {i.lugar}<span className="block text-slate-500">{fmtFecha(i.fecha)}</span></span><Badge tono={TONO_INCIDENTE[estado]}>{ESTADOS_INCIDENTE[estado]}</Badge></li>)}</ul>
        ))}
        {x.postventa.length > 0 && seccion('Postventa', x.postventa.length, '/postventa', (
          <ul className="space-y-1">{x.postventa.map(({ s, estado }) => <li key={s.id} className="flex justify-between gap-2 text-xs"><span>N° {s.numero} {s.descripcion}</span><Badge tono={TONO_POSTVENTA[estado]}>{ESTADOS_POSTVENTA[estado]}</Badge></li>)}</ul>
        ))}
        <p className="text-xs text-slate-400">Los registros se relacionan por partida y por el piso que menciona su ubicación.</p>
      </div>
    </Card>
  )
}

/** Detalle por tarea: asigna elementos del IFC a una actividad (clic en el modelo o por filtro). */
function PanelAsignar({ bim, modelo, acts, asignando, setAsignando, obraId, onCerrar }: {
  bim: ModeloBim; modelo: Modelo4D; acts: Actividad[]; asignando: { actividadId: string; ids: Set<number> }
  setAsignando: (a: { actividadId: string; ids: Set<number> }) => void; obraId: string; onCerrar: () => void
}) {
  const guardar = useStore((s) => s.guardarModelo4D)
  const [f, setF] = useState({ texto: '', capa: '' as Capa | '', piso: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const elegibles = acts.filter((a) => !a.esHito)
  const asignadoA = new Map<number, string>()
  for (const e of modelo.enlaces) if (e.actividadId !== asignando.actividadId) for (const id of e.elementos ?? []) asignadoA.set(id, e.actividadId)
  const coinciden = bim.geo.elementos.filter((el) => {
    const o = origenElemento(bim.grupos, el.id)
    if (!o) return false
    if (f.capa && o.capa !== f.capa) return false
    if (f.piso !== '' && o.piso !== Number(f.piso)) return false
    return !f.texto.trim() || `${el.nombre} ${el.tipo}`.toLowerCase().includes(f.texto.trim().toLowerCase())
  })
  const elegir = (actividadId: string) => {
    const e = modelo.enlaces.find((x) => x.actividadId === actividadId)
    setAsignando({ actividadId, ids: new Set(e?.elementos ?? []) })
    setMsg(null)
  }
  const enviar = () => {
    const ids = [...asignando.ids].filter((id) => !asignadoA.has(id))
    const existe = modelo.enlaces.some((e) => e.actividadId === asignando.actividadId)
    let enlaces: EnlaceModelo[] = modelo.enlaces.map((e) => (e.actividadId !== asignando.actividadId ? e : (({ elementos: _x, ...r }) => (ids.length ? { ...r, elementos: ids } : r))(e)))
    if (!existe && ids.length) {
      const o = origenElemento(bim.grupos, ids[0])!
      enlaces = [...enlaces, { actividadId: asignando.actividadId, capa: o.capa, pisos: [o.piso], elementos: ids }]
    }
    guardar(obraId, { ...modelo, enlaces })
    setMsg(`Guardado: ${ids.length} elemento(s) asignados.${asignando.ids.size > ids.length ? ' Los que ya eran de otra tarea no se movieron.' : ''}`)
  }
  const act = elegibles.find((a) => a.id === asignando.actividadId)
  return (
    <Card titulo={<span className="flex items-start justify-between gap-2"><span>Asignar elementos a una tarea</span><button onClick={onCerrar} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar">✕</button></span>}>
      <div className="space-y-3 text-sm">
        <Campo etiqueta="Tarea (actividad de la Carta Gantt)">
          <select className={inputCls} value={asignando.actividadId} onChange={(e) => elegir(e.target.value)}>
            <option value="">Elige una actividad…</option>
            {elegibles.map((a) => <option key={a.id} value={a.id}>{a.codigo} {a.nombre}{modelo.enlaces.find((x) => x.actividadId === a.id)?.elementos?.length ? ' ●' : ''}</option>)}
          </select>
        </Campo>
        {act && (
          <>
            <p className="rounded-lg bg-violet-50 p-2 text-xs text-violet-900"><b>{asignando.ids.size}</b> elemento(s) en morado. Toca un elemento en el modelo para agregarlo o quitarlo. Los elementos asignados avanzan solo con esta tarea; el resto de su capa y piso sigue la regla general.</p>
            <div className="rounded-lg border border-slate-200 p-2">
              <div className="mb-1 text-xs font-medium text-slate-500">Agregar por filtro</div>
              <div className="grid grid-cols-2 gap-2">
                <input className={cx(inputCls, 'col-span-2 py-1')} placeholder="Nombre contiene (ej.: losa, eje A, fachada sur)" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
                <select className={cx(inputCls, 'py-1')} value={f.capa} onChange={(e) => setF({ ...f, capa: e.target.value as Capa | '' })}><option value="">Toda capa</option>{(Object.keys(CAPAS) as Capa[]).map((k) => <option key={k} value={k}>{CAPAS[k]}</option>)}</select>
                <select className={cx(inputCls, 'py-1')} value={f.piso} onChange={(e) => setF({ ...f, piso: e.target.value })}><option value="">Todo piso</option><option value="0">Terreno</option>{Array.from({ length: modelo.pisos }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Piso {n}</option>)}</select>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Boton variante="secundario" className="min-h-0 py-1" disabled={!coinciden.length} onClick={() => setAsignando({ ...asignando, ids: new Set([...asignando.ids, ...coinciden.map((x) => x.id)]) })}>Agregar {coinciden.length}</Boton>
                <Boton variante="secundario" className="min-h-0 py-1" disabled={!coinciden.length} onClick={() => setAsignando({ ...asignando, ids: new Set([...asignando.ids].filter((id) => !coinciden.some((x) => x.id === id))) })}>Quitar {coinciden.length}</Boton>
                <Boton variante="fantasma" className="min-h-0 py-1" disabled={!asignando.ids.size} onClick={() => setAsignando({ ...asignando, ids: new Set() })}>Vaciar</Boton>
              </div>
            </div>
            {msg && <p className="text-xs text-emerald-700">{msg}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={onCerrar}>Cerrar</Boton>
              <Boton onClick={enviar}>Guardar asignación</Boton>
            </div>
          </>
        )}
        <p className="text-xs text-slate-500">Útil para sectorizar: por ejemplo, separar "Losa piso 3, ejes A–D" de "ejes E–H", o la fachada sur de la norte. Lo que no se asigna sigue la regla de capa y piso.</p>
      </div>
    </Card>
  )
}
