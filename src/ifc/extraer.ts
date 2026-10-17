// Extrae de un IFC lo que necesita la simulación 4D: niveles, elementos (clase, nombre, nivel)
// y su geometría ya transformada a coordenadas del visor: Y hacia arriba, metros, centrado en
// planta y con el piso del primer nivel en y = 0. Lo usan el web worker y los tests (Node).
import {
  IFCBUILDINGSTOREY, IFCCONVERSIONBASEDUNIT, IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCSIUNIT, type IfcAPI,
} from 'web-ifc'
import { agruparIfc, capaIfc, type ElementoLeido, type NivelLeido } from '../domain/bim'

export interface MallaElemento {
  id: number
  /** xyz por vértice. */
  posiciones: Float32Array
  normales: Float32Array
  /** rgb por vértice (color del IFC). */
  colores: Float32Array
  indices: Uint32Array
  /** Vidrios y similares (opacidad < 1 en el IFC). */
  transparente: boolean
}

export interface GeometriaIfc {
  schema: string
  /** Elevaciones en metros. */
  niveles: NivelLeido[]
  elementos: ElementoLeido[]
  mallas: MallaElemento[]
  min: [number, number, number]
  max: [number, number, number]
}

const ids = (v: { size(): number; get(i: number): number }) => Array.from({ length: v.size() }, (_, i) => v.get(i))
const texto = (x: { value?: unknown } | null | undefined) => (typeof x?.value === 'string' ? x.value : '')
const ref = (x: { value?: unknown } | null | undefined) => (typeof x?.value === 'number' ? x.value : null)

function cajaDe(els: { min: number[]; max: number[] }[]) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const e of els) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], e.min[a]); max[a] = Math.max(max[a], e.max[a]) }
  return { min, max }
}

/** Metros por unidad de longitud del modelo (las elevaciones de nivel vienen sin escalar). */
function metrosPorUnidad(api: IfcAPI, modelo: number): number {
  for (const id of ids(api.GetLineIDsWithType(modelo, IFCSIUNIT))) {
    const u = api.GetLine(modelo, id)
    if (u.UnitType?.value !== 'LENGTHUNIT') continue
    return { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 }[u.Prefix?.value as string] ?? 1
  }
  for (const id of ids(api.GetLineIDsWithType(modelo, IFCCONVERSIONBASEDUNIT))) {
    const u = api.GetLine(modelo, id)
    if (u.UnitType?.value !== 'LENGTHUNIT') continue
    const n = texto(u.Name).toUpperCase()
    if (n.includes('FOOT')) return 0.3048
    if (n.includes('INCH')) return 0.0254
  }
  return 1
}

const NO_ES_IFC = 'El archivo no parece un IFC válido (debe ser un IFC exportado en formato STEP, no .ifcxml ni .ifczip).'

export function extraerIfc(api: IfcAPI, bytes: Uint8Array, onProgreso?: (f: number) => void): GeometriaIfc {
  // Un IFC (STEP) empieza con ISO-10303-21; se revisa antes de entregarlo al lector
  const cabecera = new TextDecoder().decode(bytes.subarray(0, 64)).replace(/^﻿/, '').trimStart()
  if (!cabecera.startsWith('ISO-10303-21')) throw new Error(NO_ES_IFC)
  const modelo = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
  if (modelo < 0) throw new Error(NO_ES_IFC)
  try {
    return leerModelo(api, modelo, onProgreso)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    // Errores propios (en español) pasan tal cual; los internos del lector se explican
    throw new Error(/^(El IFC|El archivo)/.test(m) ? m : `No se pudo leer el IFC (${m}). Prueba exportarlo de nuevo en IFC2x3 o IFC4.`)
  } finally {
    api.CloseModel(modelo)
  }
}

function leerModelo(api: IfcAPI, modelo: number, onProgreso?: (f: number) => void): GeometriaIfc {
  const schema = api.GetModelSchema(modelo)
  const escala = metrosPorUnidad(api, modelo)

  const niveles: NivelLeido[] = ids(api.GetLineIDsWithType(modelo, IFCBUILDINGSTOREY)).map((id) => {
    const l = api.GetLine(modelo, id)
    const elev = typeof l.Elevation?.value === 'number' ? l.Elevation.value * escala : 0
    return { id, nombre: texto(l.Name) || texto(l.LongName) || `Nivel ${id}`, elevacion: Math.round(elev * 1000) / 1000 }
  })
  const esNivel = new Set(niveles.map((n) => n.id))

  // Elemento → nivel: contención directa o heredada del objeto que lo agrega (escaleras, muros cortina…)
  const contenido = new Map<number, number>()
  for (const id of ids(api.GetLineIDsWithType(modelo, IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
    const r = api.GetLine(modelo, id)
    const est = ref(r.RelatingStructure)
    if (est == null || !esNivel.has(est)) continue
    for (const e of r.RelatedElements ?? []) { const x = ref(e); if (x != null) contenido.set(x, est) }
  }
  const padre = new Map<number, number>()
  for (const id of ids(api.GetLineIDsWithType(modelo, IFCRELAGGREGATES))) {
    const r = api.GetLine(modelo, id)
    const p = ref(r.RelatingObject)
    if (p == null) continue
    for (const e of r.RelatedObjects ?? []) { const x = ref(e); if (x != null) padre.set(x, p) }
  }
  const nivelDe = (id: number): number | null => {
    let x: number | undefined = id
    for (let k = 0; k < 12 && x != null; k++) {
      if (contenido.has(x)) return contenido.get(x)!
      if (esNivel.has(x)) return x
      x = padre.get(x)
    }
    return null
  }

  // Geometría: una malla por elemento con las transformaciones aplicadas
  const elementos: ElementoLeido[] = []
  const mallas: MallaElemento[] = []
  api.StreamAllMeshes(modelo, (m, i, total) => {
    const id = m.expressID
    const tipo = api.GetNameFromTypeCode(api.GetLineType(modelo, id)).toUpperCase()
    if (!capaIfc(tipo) && /^IFC(OPENINGELEMENT|SPACE|ANNOTATION|GRID|VIRTUALELEMENT)/.test(tipo)) return
    const pos: number[] = []
    const nor: number[] = []
    const col: number[] = []
    const idx: number[] = []
    let transparente = false
    const n = m.geometries.size()
    for (let g = 0; g < n; g++) {
      const pg = m.geometries.get(g)
      const geom = api.GetGeometry(modelo, pg.geometryExpressID)
      const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
      const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
      const t = pg.flatTransformation
      const base = pos.length / 3
      for (let k = 0; k < v.length; k += 6) {
        const [x, y, z, nx, ny, nz] = [v[k], v[k + 1], v[k + 2], v[k + 3], v[k + 4], v[k + 5]]
        pos.push(t[0] * x + t[4] * y + t[8] * z + t[12], t[1] * x + t[5] * y + t[9] * z + t[13], t[2] * x + t[6] * y + t[10] * z + t[14])
        const a = t[0] * nx + t[4] * ny + t[8] * nz
        const b = t[1] * nx + t[5] * ny + t[9] * nz
        const c = t[2] * nx + t[6] * ny + t[10] * nz
        const l = Math.hypot(a, b, c) || 1
        nor.push(a / l, b / l, c / l)
        col.push(pg.color.x, pg.color.y, pg.color.z)
      }
      for (let k = 0; k < ix.length; k++) idx.push(ix[k] + base)
      if (pg.color.w < 0.99) transparente = true
      geom.delete()
    }
    if (idx.length === 0) return
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let k = 0; k < pos.length; k += 3)
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], pos[k + a]); max[a] = Math.max(max[a], pos[k + a]) }
    const linea = api.GetLine(modelo, id)
    elementos.push({ id, tipo, nombre: texto(linea.Name) || tipo, nivelId: nivelDe(id), min, max })
    mallas.push({
      id, transparente,
      posiciones: new Float32Array(pos), normales: new Float32Array(nor), colores: new Float32Array(col), indices: new Uint32Array(idx),
    })
    if (onProgreso && (i % 25 === 0 || i === total - 1)) onProgreso((i + 1) / total)
  })
  if (elementos.length === 0) throw new Error('El IFC no tiene elementos con geometría.')

  // Centrar en planta y dejar el piso del primer nivel en y = 0
  const g = agruparIfc(niveles, elementos)
  const dibujables = elementos.filter((e) => g.claveDe.has(e.id))
  const ref0 = dibujables.length ? dibujables : elementos
  const primerPiso = elementos.filter((e) => g.claveDe.get(e.id)?.endsWith('|1'))
  const caja = cajaDe(ref0)
  const suelo = primerPiso.length ? cajaDe(primerPiso).min[1] : caja.min[1]
  const d = [-(caja.min[0] + caja.max[0]) / 2, -suelo, -(caja.min[2] + caja.max[2]) / 2]
  for (const m of mallas) for (let k = 0; k < m.posiciones.length; k += 3) for (let a = 0; a < 3; a++) m.posiciones[k + a] += d[a]
  for (const e of elementos) for (let a = 0; a < 3; a++) { e.min[a] += d[a]; e.max[a] += d[a] }
  return { schema, niveles, elementos, mallas, ...cajaDe(ref0) }
}
