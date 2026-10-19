// Sincronización del store con Supabase (20 §7: offline primero, idempotente).
//
// Cómo funciona:
//  - "base" es la última versión de cada documento confirmada por el servidor (id → JSON).
//  - Cualquier cambio del store se compara contra la base: lo distinto se sube (upsert) y lo que
//    falta se borra. Subir dos veces lo mismo no tiene efecto, así que reintentar es seguro.
//  - La base y los datos se guardan en IndexedDB por empresa: sin señal en faena se sigue
//    trabajando y los cambios pendientes se suben al volver la conexión.
//  - Realtime trae los cambios de otros usuarios; si hay un cambio local pendiente sobre el mismo
//    documento, gana el local (se sube después).
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { get, set } from 'idb-keyval'
import { create } from 'zustand'
import { COLECCIONES, CONFIG_DEFECTO, datosVacios, type Coleccion, type Datos } from '../domain/datos'
import type { Config } from '../domain/types'
import { supabase } from '../lib/supabase'
import { useStore } from './store'

export const TABLA: Record<Coleccion, string> = {
  obras: 'obras', partidas: 'partidas', programas: 'programas', cuadrillas: 'cuadrillas', rdos: 'rdos', costos: 'costos',
  compromisos: 'compromisos', reglasMapeo: 'reglas_mapeo', ajustes: 'ajustes', periodos: 'periodos', alertas: 'alertas',
  estadosPago: 'estados_pago', ordenesCambio: 'ordenes_cambio', obligaciones: 'obligaciones', garantias: 'garantias',
  recepciones: 'recepciones', riesgos: 'riesgos',
  documentos: 'documentos', rfis: 'rfis', submittals: 'submittals', folios: 'folios', tareasSemanales: 'tareas_semanales',
  proveedores: 'proveedores', materiales: 'materiales', solicitudesMaterial: 'solicitudes_material', ordenesCompra: 'ordenes_compra', movimientosStock: 'movimientos_stock', subcontratos: 'subcontratos', epsSubcontrato: 'eps_subcontrato', trabajadores: 'trabajadores', documentosLaborales: 'documentos_laborales', equipos: 'equipos', partesMaquinaria: 'partes_maquinaria', cajasChicas: 'cajas_chicas', rendiciones: 'rendiciones', protocolosCalidad: 'protocolos_calidad', inspeccionesCalidad: 'inspecciones_calidad', noConformidades: 'no_conformidades',
}

export type EstadoSync = 'inactivo' | 'sincronizando' | 'al_dia' | 'pendiente' | 'sin_conexion' | 'error'
export const useSync = create<{ estado: EstadoSync; pendientes: number; error?: string; ultimo?: number }>(() => ({
  estado: 'inactivo', pendientes: 0,
}))

type Doc = { id: string; obraId?: string }
interface Base { cols: Record<Coleccion, Record<string, string>>; config: string }
interface Diff { ups: Record<Coleccion, Doc[]>; dels: Record<Coleccion, string[]>; config: boolean; total: number }

const baseVacia = (): Base => ({ cols: Object.fromEntries(COLECCIONES.map((c) => [c, {}])) as Base['cols'], config: '' })

let empresaId = ''
let userId = ''
let base: Base = baseVacia()
let desuscribir: (() => void) | null = null
let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let temporizador: ReturnType<typeof setTimeout> | undefined
let enCurso = false
let repetir = false

// JSON por referencia: los objetos del store son inmutables, así que solo se serializa lo que cambió
const cacheJson = new WeakMap<object, string>()
const json = (o: object) => {
  let v = cacheJson.get(o)
  if (v === undefined) { v = JSON.stringify(o); cacheJson.set(o, v) }
  return v
}

function calcularDiff(s: Datos): Diff {
  const d: Diff = { ups: {} as Diff['ups'], dels: {} as Diff['dels'], config: json(s.config) !== base.config, total: 0 }
  for (const col of COLECCIONES) {
    const b = base.cols[col]
    const presentes = new Set<string>()
    d.ups[col] = []
    for (const o of s[col] as Doc[]) {
      presentes.add(o.id)
      if (b[o.id] !== json(o)) d.ups[col].push(o)
    }
    d.dels[col] = Object.keys(b).filter((id) => !presentes.has(id))
    d.total += d.ups[col].length + d.dels[col].length
  }
  if (d.config) d.total++
  return d
}

/** Lotes de hasta 500 filas o ~1 MB para no exceder el tamaño de request. */
function lotes<T>(items: T[], peso: (x: T) => number): T[][] {
  const r: T[][] = []
  let actual: T[] = []
  let tam = 0
  for (const x of items) {
    const p = peso(x)
    if (actual.length && (actual.length >= 500 || tam + p > 1_000_000)) { r.push(actual); actual = []; tam = 0 }
    actual.push(x)
    tam += p
  }
  if (actual.length) r.push(actual)
  return r
}

const guardarBase = () => set(`vpai-base-${empresaId}`, base).catch(() => {})

async function subir() {
  if (!supabase || !empresaId) return
  if (enCurso) { repetir = true; return }
  enCurso = true
  const emp = empresaId
  try {
    const s = useStore.getState()
    const d = calcularDiff(s)
    if (d.total === 0) { useSync.setState({ estado: 'al_dia', pendientes: 0, error: undefined }); return }
    useSync.setState({ estado: 'sincronizando', pendientes: d.total })
    for (const col of COLECCIONES) {
      for (const lote of lotes(d.ups[col], (o) => json(o).length)) {
        const filas = lote.map((o) => ({ empresa_id: emp, id: o.id, obra_id: col === 'obras' ? o.id : (o.obraId ?? null), data: o }))
        // Los períodos cerrados son inmutables: solo se insertan
        const { error } = await supabase.from(TABLA[col]).upsert(filas, { onConflict: 'empresa_id,id', ignoreDuplicates: col === 'periodos' })
        if (error) throw error
        if (emp !== empresaId) return
        for (const o of lote) base.cols[col][o.id] = json(o)
      }
      for (const lote of lotes(d.dels[col], () => 1)) {
        const { error } = await supabase.from(TABLA[col]).delete().eq('empresa_id', emp).in('id', lote)
        if (error) throw error
        if (emp !== empresaId) return
        for (const id of lote) delete base.cols[col][id]
      }
    }
    if (d.config) {
      const c = s.config
      const { error } = await supabase.from('empresas').update({ config: c, nombre: c.empresa, rut: c.rut }).eq('id', emp)
      if (error) throw error
      base.config = json(c)
    }
    await guardarBase()
    useSync.setState({ estado: 'al_dia', pendientes: 0, error: undefined, ultimo: Date.now() })
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    useSync.setState({ estado: offline ? 'sin_conexion' : 'error', error: offline ? undefined : mensaje(e) })
    clearTimeout(temporizador)
    temporizador = setTimeout(subir, offline ? 30_000 : 15_000)
  } finally {
    enCurso = false
    if (repetir) { repetir = false; programar() }
  }
}

function mensaje(e: unknown) {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
}

function programar() {
  clearTimeout(temporizador)
  if (useSync.getState().estado !== 'sincronizando') useSync.setState({ estado: 'pendiente' })
  temporizador = setTimeout(subir, 800)
}

async function descargar(emp: string): Promise<{ cols: Record<Coleccion, Doc[]>; config: Config | null; nombre: string; rut: string }> {
  const sb = supabase!
  const cols = {} as Record<Coleccion, Doc[]>
  await Promise.all(
    COLECCIONES.map(async (col) => {
      const filas: Doc[] = []
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await sb.from(TABLA[col]).select('id,data').eq('empresa_id', emp).order('id').range(desde, desde + 999)
        if (error) throw error
        filas.push(...data.map((f) => f.data as Doc))
        if (data.length < 1000) break
      }
      cols[col] = filas
    }),
  )
  const { data, error } = await sb.from('empresas').select('nombre,rut,config').eq('id', emp).single()
  if (error) throw error
  return { cols, config: data.config as Config | null, nombre: data.nombre, rut: data.rut ?? '' }
}

/** Carga los datos de la empresa (caché local + servidor) y deja la sincronización en marcha. */
export async function iniciarSync(emp: string, uid: string) {
  detenerSync()
  empresaId = emp
  userId = uid
  useSync.setState({ estado: 'sincronizando', pendientes: 0, error: undefined })

  // 1. Caché local de esta empresa (sirve para abrir sin señal)
  vaciarStore()
  useStore.persist.setOptions({ name: `vpai-cache-${emp}` })
  await useStore.persist.rehydrate()
  base = (await get<Base>(`vpai-base-${emp}`).catch(() => undefined)) ?? baseVacia()
  const local = useStore.getState()
  const hayCache = COLECCIONES.some((c) => local[c].length > 0)
  // Si la caché se perdió pero la base no, no se interpreta como "borrar todo"
  if (!hayCache) base = baseVacia()
  const pendiente = calcularDiff(local)

  // 2. Servidor + cambios locales pendientes encima
  try {
    const srv = await descargar(emp)
    if (emp !== empresaId) return
    const nueva = baseVacia()
    const datos: Partial<Datos> = {}
    for (const col of COLECCIONES) {
      const m = new Map(srv.cols[col].map((o) => [o.id, o]))
      for (const o of srv.cols[col]) nueva.cols[col][o.id] = json(o)
      for (const o of pendiente.ups[col]) m.set(o.id, o)
      for (const id of pendiente.dels[col]) m.delete(id)
      ;(datos as Record<string, unknown>)[col] = [...m.values()]
    }
    const cfgSrv: Config = { ...CONFIG_DEFECTO, ...(srv.config ?? {}), empresa: srv.nombre, rut: srv.rut }
    nueva.config = srv.config ? json(cfgSrv) : ''
    datos.config = pendiente.config && hayCache ? local.config : cfgSrv
    if (!srv.config) nueva.config = json(datos.config) // primera vez: no se sube la config por defecto
    base = nueva
    useStore.getState().cargarDatos(datos)
    await guardarBase()
  } catch (e) {
    // Sin conexión: se trabaja con la caché y se reintenta
    if (!hayCache) throw e
  }

  // 3. Subir cambios del store y escuchar los de otros usuarios
  desuscribir = useStore.subscribe((s, prev) => {
    if (s.config !== prev.config || COLECCIONES.some((c) => s[c] !== prev[c])) programar()
  })
  suscribirRealtime(emp)
  window.addEventListener('online', subir)
  await subir()
}

export function detenerSync() {
  desuscribir?.()
  desuscribir = null
  clearTimeout(temporizador)
  if (canal) supabase?.removeChannel(canal)
  canal = null
  if (typeof window !== 'undefined') window.removeEventListener('online', subir)
  empresaId = ''
  useSync.setState({ estado: 'inactivo', pendientes: 0, error: undefined })
}

/**
 * Deja el store vacío sin tocar la caché de ninguna empresa (el persist escribe en cada cambio,
 * así que se apunta primero a una clave descartable). Evita que datos de otra empresa o de otro
 * usuario queden en pantalla o se suban a la empresa equivocada.
 */
export function vaciarStore() {
  useStore.persist.setOptions({ name: 'vpai-cache-descartable' })
  useStore.getState().cargarDatos(datosVacios())
}

/** Empresa con sesión abierta ('' en modo local o antes de ingresar). */
export const empresaActual = () => empresaId

/** Fuerza subir lo pendiente (p. ej., antes de cerrar sesión). */
export const sincronizarAhora = () => subir()

// ───────────────────────── Realtime ─────────────────────────
type Fila = { empresa_id: string; id: string; data: Doc; actualizado_por: string | null }
let cola: { col: Coleccion; tipo: string; fila: Partial<Fila> }[] = []
let temporizadorCola: ReturnType<typeof setTimeout> | undefined

function suscribirRealtime(emp: string) {
  if (!supabase) return
  canal = supabase.channel(`vpai-${emp}`)
  for (const col of COLECCIONES) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: TABLA[col], filter: `empresa_id=eq.${emp}` },
      (p: RealtimePostgresChangesPayload<Fila>) => encolar(col, p))
  }
  canal.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'empresas', filter: `id=eq.${emp}` },
    (p: RealtimePostgresChangesPayload<{ config: Config | null; nombre: string; rut: string | null }>) => {
      const n = p.new as { config: Config | null; nombre: string; rut: string | null }
      if (!n?.config) return
      const c: Config = { ...CONFIG_DEFECTO, ...n.config, empresa: n.nombre, rut: n.rut ?? '' }
      const s = useStore.getState()
      if (json(s.config) !== base.config) return // hay un cambio local pendiente
      base.config = json(c)
      useStore.getState().cargarDatos({ config: c })
    })
  canal.subscribe()
}

function encolar(col: Coleccion, p: RealtimePostgresChangesPayload<Fila>) {
  const fila = (p.eventType === 'DELETE' ? p.old : p.new) as Partial<Fila>
  if (fila.empresa_id && fila.empresa_id !== empresaId) return
  // Eco de un cambio propio: ya está aplicado (y quizás hay uno más nuevo en camino)
  if (p.eventType !== 'DELETE' && fila.actualizado_por === userId) return
  cola.push({ col, tipo: p.eventType, fila })
  clearTimeout(temporizadorCola)
  temporizadorCola = setTimeout(aplicarCola, 300)
}

function aplicarCola() {
  const eventos = cola
  cola = []
  const s = useStore.getState()
  const cambios: Partial<Record<Coleccion, Doc[]>> = {}
  for (const { col, tipo, fila } of eventos) {
    const id = fila.id
    if (!id) continue
    const lista = (cambios[col] ??= [...(s[col] as Doc[])])
    const i = lista.findIndex((o) => o.id === id)
    const local = i >= 0 ? lista[i] : undefined
    const pendienteLocal = local ? base.cols[col][id] !== json(local) : false
    if (tipo === 'DELETE') {
      if (base.cols[col][id] === undefined) continue
      delete base.cols[col][id]
      if (i >= 0 && !pendienteLocal) lista.splice(i, 1)
    } else if (fila.data) {
      if (pendienteLocal) continue
      base.cols[col][id] = json(fila.data)
      if (i >= 0) lista[i] = fila.data
      else lista.push(fila.data)
    }
  }
  if (Object.keys(cambios).length) {
    useStore.getState().cargarDatos(cambios as Partial<Datos>)
    guardarBase()
  }
}
