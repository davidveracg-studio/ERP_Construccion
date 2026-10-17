// Archivos de planos, EETT y respaldos. En modo nube viven en Supabase Storage (bucket privado
// "documentos-obra", ruta <empresa>/<obra>/<archivo>, RLS por membresía: migración 0005); en modo
// local, en IndexedDB del dispositivo. Mismo esquema que los IFC (src/ifc/archivos.ts).
import { get, set } from 'idb-keyval'
import type { ArchivoDoc } from '../domain/types'
import { supabase } from '../lib/supabase'
import { empresaActual } from '../store/sync'

export const BUCKET_DOCUMENTOS = 'documentos-obra'
/** Tope por archivo en la demo pública (el bucket admite 50 MB). */
export const MAX_BYTES_DOCUMENTO = 15 * 1024 * 1024
export const TIPOS_ACEPTADOS = '.pdf,.png,.jpg,.jpeg,.dwg,.dxf'

const clave = (ruta: string) => `vpai-doc:${ruta}`
const local = (ruta: string) => ruta.startsWith('local/')

function mensaje(e: unknown): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/bucket not found/i.test(m)) return 'Falta ejecutar supabase/migrations/0005_v11_oficina_tecnica.sql en el SQL Editor de Supabase.'
  if (/row-level security|unauthorized|not authorized|403/i.test(m)) return 'Sin permiso para guardar o leer archivos de esta empresa.'
  if (/exceeded|too large|payload|413/i.test(m)) return 'El archivo supera el tamaño máximo.'
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión con el servidor.'
  return m
}

const tipoDe = (nombre: string) =>
  /\.pdf$/i.test(nombre) ? 'application/pdf' : /\.png$/i.test(nombre) ? 'image/png' : /\.jpe?g$/i.test(nombre) ? 'image/jpeg' : 'application/octet-stream'

/** Sube el archivo de una revisión y devuelve su referencia. */
export async function subirDocumento(obraId: string, archivo: File): Promise<ArchivoDoc> {
  if (archivo.size > MAX_BYTES_DOCUMENTO) throw new Error(`El archivo supera el máximo de ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB.`)
  const nombre = `${Date.now()}-${archivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')}`
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!supabase) {
    const ruta = `local/${obraId}/${nombre}`
    await set(clave(ruta), bytes)
    return { ruta, nombre: archivo.name, bytes: archivo.size }
  }
  const emp = empresaActual()
  if (!emp) throw new Error('No hay una sesión abierta.')
  const ruta = `${emp}/${obraId}/${nombre}`
  try {
    const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(ruta, bytes, { contentType: tipoDe(archivo.name), upsert: false })
    if (error) throw error
  } catch (e) {
    throw new Error(mensaje(e))
  }
  set(clave(ruta), bytes).catch(() => {})
  return { ruta, nombre: archivo.name, bytes: archivo.size }
}

/** Abre el archivo en una pestaña nueva (o lo descarga si el navegador no lo muestra). */
export async function abrirDocumento(a: ArchivoDoc) {
  let bytes = await get<Uint8Array>(clave(a.ruta)).catch(() => undefined)
  if (!bytes) {
    if (!supabase || local(a.ruta)) throw new Error('El archivo se subió en otro navegador y no está en este dispositivo.')
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(a.ruta)
    if (error) throw new Error(mensaje(error))
    bytes = new Uint8Array(await data.arrayBuffer())
    set(clave(a.ruta), bytes).catch(() => {})
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipoDe(a.nombre) }))
  const w = window.open(url, '_blank')
  if (!w) {
    const link = Object.assign(document.createElement('a'), { href: url, download: a.nombre })
    link.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
