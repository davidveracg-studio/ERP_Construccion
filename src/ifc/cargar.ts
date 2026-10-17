// Carga de modelos IFC para la simulación 4D: lectura en el web worker y caché en memoria
// de los últimos modelos leídos (volver a una obra no vuelve a procesar el archivo).
import { useEffect, useState } from 'react'
import { bytesIfc } from './archivos'
import type { GeometriaIfc } from './extraer'

type Respuesta = { id: number; progreso?: number; geo?: GeometriaIfc; error?: string }

let worker: Worker | null = null
let secuencia = 0
const pendientes = new Map<number, { ok: (g: GeometriaIfc) => void; mal: (e: Error) => void; progreso?: (f: number) => void }>()

function obtenerWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./ifc.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (ev: MessageEvent<Respuesta>) => {
    const p = pendientes.get(ev.data.id)
    if (!p) return
    if (ev.data.progreso != null) p.progreso?.(ev.data.progreso)
    else {
      pendientes.delete(ev.data.id)
      if (ev.data.geo) p.ok(ev.data.geo)
      else p.mal(new Error(ev.data.error ?? 'No se pudo leer el IFC.'))
    }
  }
  worker.onerror = (ev) => {
    for (const p of pendientes.values()) p.mal(new Error(ev.message || 'Falló el lector de IFC.'))
    pendientes.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/** Lee un IFC (bytes) en el worker. Los bytes se copian: el llamador puede seguir usándolos. */
export function leerIfc(bytes: Uint8Array, progreso?: (f: number) => void): Promise<GeometriaIfc> {
  const id = ++secuencia
  const copia = bytes.slice()
  return new Promise((ok, mal) => {
    pendientes.set(id, { ok, mal, progreso })
    obtenerWorker().postMessage({ id, bytes: copia }, [copia.buffer])
  })
}

const cache = new Map<string, Promise<GeometriaIfc>>()
const MAX_CACHE = 3

/** Deja en caché una geometría ya leída (p. ej., recién subida). */
export function precargarIfc(ruta: string, geo: GeometriaIfc) {
  cache.set(ruta, Promise.resolve(geo))
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
}

export function geometriaIfc(ruta: string, progreso?: (f: number) => void): Promise<GeometriaIfc> {
  const enCache = cache.get(ruta)
  if (enCache) {
    // Al reusarla pasa a ser la más reciente
    cache.delete(ruta)
    cache.set(ruta, enCache)
    return enCache
  }
  const p = bytesIfc(ruta).then((b) => leerIfc(b, progreso))
  cache.set(ruta, p)
  p.catch(() => cache.delete(ruta))
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
  return p
}

export type CargaIfc =
  | { estado: 'sin' }
  | { estado: 'cargando'; progreso: number }
  | { estado: 'listo'; geo: GeometriaIfc }
  | { estado: 'error'; error: string }

export function useGeometriaIfc(ruta: string | undefined): CargaIfc {
  const [carga, setCarga] = useState<CargaIfc & { ruta?: string }>({ estado: 'sin' })
  useEffect(() => {
    if (!ruta) { setCarga({ estado: 'sin' }); return }
    let vivo = true
    setCarga({ estado: 'cargando', progreso: 0, ruta })
    geometriaIfc(ruta, (f) => { if (vivo) setCarga({ estado: 'cargando', progreso: f, ruta }) })
      .then((geo) => { if (vivo) setCarga({ estado: 'listo', geo, ruta }) })
      .catch((e: Error) => { if (vivo) setCarga({ estado: 'error', error: e.message, ruta }) })
    return () => { vivo = false }
  }, [ruta])
  // Mientras el efecto no corre para una ruta nueva, no se muestra la geometría anterior
  if (!ruta) return { estado: 'sin' }
  return carga.ruta !== ruta ? { estado: 'cargando', progreso: 0 } : carga
}
