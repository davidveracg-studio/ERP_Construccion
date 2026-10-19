// Modelo BIM (fase 2 de la simulación 4D). Cada elemento de un IFC se asigna a una capa
// según su clase IFC y a un piso según su nivel (IfcBuildingStorey). Así el IFC reutiliza
// los mismos enlaces actividad → capa y pisos del modelo paramétrico, y el avance de cada
// capa/piso se reparte entre sus elementos de abajo hacia arriba.
import { CAPAS_TERRENO } from './modelo4d'
import type { Capa, EnlaceModelo, NivelIfc } from './types'

/** Modelo BIM de ejemplo servido con la app (public/demo, generado por scripts/ifc-demo.mjs). */
export const RUTA_IFC_DEMO = 'demo:edificio-los-aromos.ifc'

/** Nivel tal como viene del IFC. */
export interface NivelLeido {
  id: number
  nombre: string
  elevacion: number
}

/** Elemento del IFC con su caja envolvente en coordenadas del visor (Y hacia arriba, metros). */
export interface ElementoLeido {
  id: number
  /** Clase IFC en mayúsculas, p. ej. IFCCOLUMN. */
  tipo: string
  nombre: string
  nivelId: number | null
  min: [number, number, number]
  max: [number, number, number]
}

const CLASES: [RegExp, Capa][] = [
  [/^IFC(FOOTING|PILE|CAISSONFOUNDATION|DEEPFOUNDATION)/, 'fundaciones'],
  [/^IFCEARTHWORKS/, 'terreno'],
  [/^IFC(SLAB|COLUMN|BEAM|MEMBER|STAIR|STAIRFLIGHT|RAMP|RAMPFLIGHT|ROOF|PLATE|CHIMNEY)(STANDARDCASE|ELEMENTEDCASE)?$/, 'estructura'],
  [/^IFC(WALL|CURTAINWALL)/, 'muros'],
  [/^IFC(FLOW|DISTRIBUTIONCONTROL|DISTRIBUTIONFLOW|PIPE|DUCT|CABLE|SANITARY|LIGHTFIXTURE|LAMP|ELECTRIC|OUTLET|SWITCHINGDEVICE|AIRTERMINAL|VALVE|PUMP|FAN|BOILER|CHILLER|TANK|FIRESUPPRESSION|ALARM|SENSOR|UNITARYEQUIPMENT|JUNCTIONBOX|PROTECTIVEDEVICE|COIL|COMPRESSOR|SPACEHEATER|WASTETERMINAL|STACKTERMINAL|INTERCEPTOR|FLOWMETER|DAMPER|FILTER|TRANSFORMER|MOTORCONNECTION|EVAPORATOR|CONDENSER|HEATEXCHANGER|HUMIDIFIER|COOLINGTOWER|BURNER|MEDICALDEVICE|COMMUNICATIONSAPPLIANCE|AUDIOVISUALAPPLIANCE)/, 'instalaciones'],
  [/^IFC(WINDOW|DOOR|COVERING|RAILING|FURNISHINGELEMENT|FURNITURE|SYSTEMFURNITUREELEMENT|SHADINGDEVICE)/, 'terminaciones'],
]

/** Capa de una clase IFC (null = no se dibuja: espacios, aberturas, anotaciones, proxies…). */
export function capaIfc(tipo: string): Capa | null {
  const t = tipo.toUpperCase()
  for (const [re, capa] of CLASES) if (re.test(t)) return capa
  return null
}

export interface AgrupacionIfc {
  /** Niveles ordenados por elevación con su piso (0 = solo fundaciones o terreno). */
  niveles: NivelIfc[]
  /** Pisos numerados del modelo 4D (al menos 1). */
  pisos: number
  /** Clave capa|piso → ids de elementos ordenados de abajo hacia arriba. */
  grupos: Map<string, number[]>
  /** Id de elemento → clave capa|piso. */
  claveDe: Map<number, string>
  /** Elementos con geometría cuya clase no corresponde a ninguna capa. */
  sinCapa: number
  /** Clave capa|piso de origen, antes de asignar elementos a actividades. */
  original?: Map<number, string>
}

/**
 * Numera los niveles y agrupa los elementos por capa y piso. Un nivel que solo tiene
 * fundaciones (p. ej. "Fundaciones −1,20") no cuenta como piso: va al nivel de terreno.
 */
export function agruparIfc(niveles: NivelLeido[], elementos: ElementoLeido[]): AgrupacionIfc {
  const capaDe = new Map(elementos.map((e) => [e.id, capaIfc(e.tipo)]))
  const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion)
  const conEdificio = new Set(
    elementos.filter((e) => { const c = capaDe.get(e.id); return c && !CAPAS_TERRENO.includes(c) }).map((e) => e.nivelId),
  )
  let n = 0
  const pisoDeNivel = new Map<number, number>()
  const salida: NivelIfc[] = ordenados.map((v) => {
    const piso = conEdificio.has(v.id) ? ++n : 0
    pisoDeNivel.set(v.id, piso)
    return { nombre: v.nombre, elevacion: v.elevacion, piso }
  })
  const pisos = Math.max(1, n)

  // Elementos sin nivel conocido: se ubican por altura comparando con los pisos ya asignados
  const bases: { piso: number; y: number }[] = []
  for (let p = 1; p <= n; p++) {
    const ys = elementos.filter((e) => e.nivelId != null && pisoDeNivel.get(e.nivelId) === p).map((e) => e.min[1]).sort((a, b) => a - b)
    if (ys.length) bases.push({ piso: p, y: ys[Math.floor(ys.length / 2)] })
  }
  const porAltura = (y: number) => bases.filter((b) => b.y <= y + 0.3).pop()?.piso ?? 1

  const grupos = new Map<string, ElementoLeido[]>()
  const claveDe = new Map<number, string>()
  let sinCapa = 0
  for (const e of elementos) {
    const capa = capaDe.get(e.id)
    if (!capa) { sinCapa++; continue }
    let piso = CAPAS_TERRENO.includes(capa) ? 0 : e.nivelId != null && pisoDeNivel.has(e.nivelId) ? pisoDeNivel.get(e.nivelId)! : porAltura(e.min[1])
    // Un elemento de edificio en un nivel de fundaciones se lleva al primer piso
    if (piso === 0 && !CAPAS_TERRENO.includes(capa)) piso = 1
    const clave = `${capa}|${piso}`
    claveDe.set(e.id, clave)
    grupos.set(clave, [...(grupos.get(clave) ?? []), e])
  }

  // Orden constructivo dentro del grupo: de abajo hacia arriba y luego en planta
  const r = (v: number) => Math.round(v * 20) / 20
  const ordenadosPorGrupo = new Map<string, number[]>()
  for (const [clave, lista] of grupos)
    ordenadosPorGrupo.set(clave, lista.sort((a, b) => r(a.min[1]) - r(b.min[1]) || a.min[0] - b.min[0] || a.min[2] - b.min[2]).map((e) => e.id))

  return { niveles: salida, pisos, grupos: ordenadosPorGrupo, claveDe, sinCapa }
}

/** Cuántos elementos de un grupo se muestran construidos para un avance f (0–1). */
export function elementosConstruidos(total: number, f: number): number {
  return Math.min(total, Math.max(0, Math.round(f * total + 1e-9)))
}

/** Clave del grupo de elementos asignados directamente a una actividad. */
export const claveActividad = (actividadId: string) => `act|${actividadId}`

/**
 * Detalle por tarea: los elementos asignados a una actividad salen de su grupo capa|piso y forman
 * el grupo de esa actividad, en el mismo orden constructivo. El resto sigue la regla de capa y piso.
 */
export function reagruparPorActividad(agr: AgrupacionIfc, enlaces: EnlaceModelo[]): AgrupacionIfc {
  const asignado = new Map<number, string>()
  for (const e of enlaces) for (const id of e.elementos ?? []) if (agr.claveDe.has(id) && !asignado.has(id)) asignado.set(id, claveActividad(e.actividadId))
  if (!asignado.size) return agr
  const grupos = new Map<string, number[]>()
  const claveDe = new Map(agr.claveDe)
  for (const [clave, ids] of agr.grupos) {
    const quedan = ids.filter((id) => !asignado.has(id))
    if (quedan.length) grupos.set(clave, quedan)
    for (const id of ids) {
      const k = asignado.get(id)
      if (!k) continue
      grupos.set(k, [...(grupos.get(k) ?? []), id])
      claveDe.set(id, k)
    }
  }
  return { ...agr, grupos, claveDe, original: agr.claveDe }
}

/** Capa y piso de origen (regla automática) de un elemento IFC. */
export function origenElemento(agr: AgrupacionIfc, id: number): { capa: Capa; piso: number } | null {
  const k = (agr.original ?? agr.claveDe).get(id)
  if (!k) return null
  const [capa, piso] = k.split('|')
  return { capa: capa as Capa, piso: Number(piso) }
}

/** Piso más frecuente de un conjunto de elementos (para etiquetar el grupo de una actividad). */
export function pisoDominante(agr: AgrupacionIfc, ids: number[]): number {
  const n = new Map<number, number>()
  for (const id of ids) { const o = origenElemento(agr, id); if (o) n.set(o.piso, (n.get(o.piso) ?? 0) + 1) }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1
}
