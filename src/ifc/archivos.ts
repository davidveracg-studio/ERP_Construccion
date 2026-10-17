// Archivos IFC de las obras. En modo nube viven en Supabase Storage (bucket privado
// "modelos-ifc", ruta <empresa>/<obra>/<archivo>, RLS por membresía: migración 0003) y se
// guardan en IndexedDB al bajarlos, para abrirlos sin señal. En modo local solo en IndexedDB.
import { del, get, set } from 'idb-keyval'
import { supabase } from '../lib/supabase'
import { empresaActual } from '../store/sync'

export const BUCKET_IFC = 'modelos-ifc'
export const MAX_BYTES_IFC = 50 * 1024 * 1024

const clave = (ruta: string) => `vpai-ifc:${ruta}`
const local = (ruta: string) => ruta.startsWith('local/')

function mensaje(e: unknown): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/bucket not found/i.test(m)) return 'Falta ejecutar supabase/migrations/0003_modelos_ifc.sql en el SQL Editor de Supabase.'
  if (/row-level security|unauthorized|not authorized|403/i.test(m)) return 'Sin permiso para guardar o leer archivos de esta empresa.'
  if (/exceeded|too large|payload|413/i.test(m)) return 'El archivo supera el máximo de 50 MB.'
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión con el servidor.'
  return m
}

/** Bytes del IFC: ejemplo de la app, caché del dispositivo o Supabase Storage. */
export async function bytesIfc(ruta: string): Promise<Uint8Array> {
  if (ruta.startsWith('demo:')) {
    const r = await fetch(`./demo/${ruta.slice(5)}`)
    if (!r.ok) throw new Error('No se encontró el modelo de ejemplo.')
    return new Uint8Array(await r.arrayBuffer())
  }
  const enCache = await get<Uint8Array>(clave(ruta)).catch(() => undefined)
  if (enCache) return enCache
  if (!supabase || local(ruta)) throw new Error('El archivo IFC se subió en otro navegador y no está en este dispositivo.')
  const { data, error } = await supabase.storage.from(BUCKET_IFC).download(ruta)
  if (error) throw new Error(mensaje(error))
  const bytes = new Uint8Array(await data.arrayBuffer())
  set(clave(ruta), bytes).catch(() => {})
  return bytes
}

/** Sube el IFC de una obra y devuelve su ruta. */
export async function subirIfc(obraId: string, nombre: string, bytes: Uint8Array): Promise<string> {
  const archivo = `${Date.now()}-${nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')}`
  if (!supabase) {
    const ruta = `local/${obraId}/${archivo}`
    await set(clave(ruta), bytes)
    return ruta
  }
  const emp = empresaActual()
  if (!emp) throw new Error('No hay una sesión abierta.')
  const ruta = `${emp}/${obraId}/${archivo}`
  try {
    const { error } = await supabase.storage.from(BUCKET_IFC).upload(ruta, bytes, { contentType: 'application/x-step', upsert: false })
    if (error) throw error
  } catch (e) {
    throw new Error(mensaje(e))
  }
  set(clave(ruta), bytes).catch(() => {})
  return ruta
}

/** Borra un IFC que dejó de usarse (sin error si ya no existe). */
export async function borrarIfc(ruta: string) {
  if (ruta.startsWith('demo:')) return
  await del(clave(ruta)).catch(() => {})
  if (supabase && !local(ruta)) await supabase.storage.from(BUCKET_IFC).remove([ruta]).catch(() => {})
}
