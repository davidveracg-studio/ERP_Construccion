// Simulación 4D paramétrica (fase 1). El edificio se genera desde datos simples de la obra
// (pisos y planta) y cada actividad del programa se enlaza a una capa de uno o más pisos.
// El avance real de cada elemento sale de los RDO validados hasta el corte; después del
// corte se muestra la proyección del CPM. El plan es siempre la línea base vigente.
import { programaDe, type Datos } from './datos'
import type { CalcObra, PuntoSerie } from './evm'
import { puCosto } from './presupuesto'
import { avanceActividades, fraccionProgramada } from './programa'
import type { AgrupacionIfc } from './bim'
import type { Actividad, Capa, Dia, EnlaceModelo, Modelo4D, Obra } from './types'

export const CAPAS: Record<Capa, string> = {
  terreno: 'Movimiento de tierra',
  fundaciones: 'Fundaciones',
  estructura: 'Estructura',
  muros: 'Muros y tabiques',
  instalaciones: 'Instalaciones',
  terminaciones: 'Terminaciones',
}

/** Capas que van al nivel de terreno (piso 0) y no se reparten por pisos. */
export const CAPAS_TERRENO: Capa[] = ['terreno', 'fundaciones']

/** Tolerancias de desviación real − plan de un elemento: [al día, crítico]. */
export const TOL_4D: [number, number] = [0.05, 0.15]

// El orden importa: "Instalación de faena" no es una instalación del edificio
const REGLAS: [RegExp, Capa | null][] = [
  [/faena/, null],
  [/excavacion|movimiento de tierra|relleno|escarpe|demolicion|trazado/, 'terreno'],
  [/fundacion|cimiento|zapata|radier|pilote/, 'fundaciones'],
  [/estructura|hormigon|losa|obra gruesa|moldaje|enfierradura/, 'estructura'],
  [/albanileria|tabique|muro|cerramiento|fachada/, 'muros'],
  [/instalacion|electric|sanitari|climatizacion|gas|ascensor/, 'instalaciones'],
  [/estuco|ceramic|pintura|cielo|pavimento|terminacion|revestimiento/, 'terminaciones'],
]

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Capa sugerida para una actividad según su nombre (null = no se dibuja). */
export function capaDe(nombre: string): Capa | null {
  const n = normalizar(nombre)
  for (const [re, capa] of REGLAS) if (re.test(n)) return capa
  return null
}

/** Pisos mencionados en el nombre: "piso 3", "pisos 1 al 4", "nivel 2". Vacío si no menciona. */
export function pisosEnNombre(nombre: string): number[] {
  const n = normalizar(nombre)
  const rango = n.match(/(?:pisos?|niveles?)\s*(\d+)\s*(?:al|a|-)\s*(\d+)/)
  if (rango) return rangoPisos(Number(rango[1]), Number(rango[2]))
  const uno = n.match(/(?:piso|nivel)\s*(\d+)/)
  return uno ? [Number(uno[1])] : []
}

function rangoPisos(a: number, b: number) {
  const [x, y] = a <= b ? [a, b] : [b, a]
  return Array.from({ length: y - x + 1 }, (_, i) => x + i)
}

const todos = (n: number) => rangoPisos(1, n)

/** Modelo inferido desde los nombres del programa. */
export function inferirModelo(acts: Actividad[]): Modelo4D {
  const candidatos = acts
    .filter((a) => !a.esHito)
    .map((a) => ({ a, capa: capaDe(a.nombre), pisos: pisosEnNombre(a.nombre) }))
    .filter((x): x is { a: Actividad; capa: Capa; pisos: number[] } => x.capa != null)
  const pisos = Math.max(1, ...candidatos.flatMap((x) => x.pisos))
  const enlaces: EnlaceModelo[] = candidatos.map(({ a, capa, pisos: p }) => ({
    actividadId: a.id,
    capa,
    pisos: CAPAS_TERRENO.includes(capa) ? [0] : p.length ? p : todos(pisos),
  }))
  return { pisos, largo: 24, ancho: 16, alturaPiso: 2.6, enlaces }
}

export function modeloDe(obra: Obra, acts: Actividad[]): Modelo4D {
  return obra.modelo4d ?? inferirModelo(acts)
}

/** Texto editable de una lista de pisos: "todos", "3", "1-4", "1, 3, 5". */
export function textoPisos(pisos: number[], total: number): string {
  if (pisos.length === 1 && pisos[0] === 0) return 'terreno'
  if (pisos.length === total && pisos.every((p, i) => p === i + 1)) return 'todos'
  const s = [...pisos].sort((a, b) => a - b)
  const partes: string[] = []
  for (let i = 0; i < s.length; ) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    partes.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`)
    i = j + 1
  }
  return partes.join(', ')
}

/** Interpreta el texto de pisos. null si no es válido. */
export function leerPisos(texto: string, total: number): number[] | null {
  const t = normalizar(texto.trim())
  if (t === '' || t === 'todos') return todos(total)
  if (t === 'terreno' || t === '0') return [0]
  const out = new Set<number>()
  for (const parte of t.split(/[,;]/)) {
    const m = parte.trim().match(/^(\d+)\s*(?:-|a|al)\s*(\d+)$|^(\d+)$/)
    if (!m) return null
    const r = m[3] != null ? [Number(m[3])] : rangoPisos(Number(m[1]), Number(m[2]))
    for (const p of r) {
      if (p < 1 || p > total) return null
      out.add(p)
    }
  }
  return [...out].sort((a, b) => a - b)
}

// ───────────────────────── Elementos ─────────────────────────

export interface Elemento {
  clave: string
  capa: Capa
  piso: number
  /** Cada actividad aporta su avance repartido de abajo hacia arriba entre sus pisos. */
  aportes: { actividadId: string; peso: number; indice: number; total: number }[]
  /** Grupo de elementos asignados directamente a esta actividad (detalle por tarea). */
  actividad?: string
}

export function elementosDe(modelo: Modelo4D, acts: Actividad[], bim?: AgrupacionIfc | null): Elemento[] {
  const porId = new Map(acts.map((a) => [a.id, a]))
  const out = new Map<string, Elemento>()
  for (const e of modelo.enlaces) {
    const a = porId.get(e.actividadId)
    if (!a || a.esHito) continue
    // Detalle por tarea: con IFC, los elementos asignados a la actividad avanzan solo con ella. La
    // actividad sigue aportando a su capa y pisos para el resto de los elementos (nadie queda huérfano).
    if (bim && e.elementos?.length) {
      const ids = e.elementos.filter((id) => bim.claveDe.has(id))
      if (ids.length) {
        const clave = `act|${a.id}`
        const conteo = new Map<number, number>()
        for (const id of ids) { const k = (bim.original ?? bim.claveDe).get(id); const p = k ? Number(k.split('|')[1]) : 1; conteo.set(p, (conteo.get(p) ?? 0) + 1) }
        const piso = [...conteo].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 1
        out.set(clave, { clave, capa: e.capa, piso, aportes: [{ actividadId: a.id, peso: 1, indice: 0, total: 1 }], actividad: a.id })
      }
    }
    const pisos = (CAPAS_TERRENO.includes(e.capa) ? [0] : e.pisos.filter((p) => p >= 1 && p <= modelo.pisos)).sort((x, y) => x - y)
    pisos.forEach((piso, indice) => {
      const clave = `${e.capa}|${piso}`
      const el = out.get(clave) ?? { clave, capa: e.capa, piso, aportes: [] }
      el.aportes.push({ actividadId: a.id, peso: Math.max(1, a.duracion), indice, total: pisos.length })
      out.set(clave, el)
    })
  }
  return [...out.values()]
}

/** Avance (0–1) de un elemento dado el avance de cada actividad. */
export function avanceElemento(e: Elemento, avance: Map<string, number>): number {
  let s = 0
  let w = 0
  for (const x of e.aportes) {
    const f = avance.get(x.actividadId) ?? 0
    s += x.peso * Math.min(1, Math.max(0, f * x.total - x.indice))
    w += x.peso
  }
  return w > 0 ? s / w : 0
}

// ───────────────────────── Línea de tiempo ─────────────────────────

export interface Linea4D {
  inicio: Dia
  fin: Dia
  corte: Dia
  actividades: Actividad[]
  /** Avance planificado (línea base) de cada actividad al cierre del día t. */
  plan: (t: Dia) => Map<string, number>
  /** Avance real hasta el corte; proyectado (CPM) después. */
  real: (t: Dia) => Map<string, number>
}

export function lineaTiempo4D(d: Datos, c: CalcObra): Linea4D {
  const obra = c.obra
  const acts = c.actualizado?.actividades ?? []
  const lb = new Map((programaDe(d, obra.id, 'lineaBase')?.actividades ?? []).map((a) => [a.id, a]))
  const pesos = new Map(d.partidas.filter((p) => p.obraId === obra.id).map((p) => [p.id, puCosto(p)]))
  const corte = c.corte
  const inicio = obra.fechaInicio
  const finLB = Math.max(0, ...[...lb.values()].map((a) => a.fin))
  const fin = Math.max(c.terminoProyectado, c.terminoContractual, finLB)

  // Avance real día a día: cantidades de RDO validados acumuladas y fechas reales solo si ya ocurrieron
  const rdos = d.rdos.filter((r) => r.obraId === obra.id && r.estado === 'validado' && r.fecha <= corte).sort((a, b) => a.fecha - b.fecha)
  const cantEjec = new Map<string, number>()
  const diarios: Map<string, number>[] = []
  let i = 0
  for (let t = inicio; t < corte; t++) {
    while (i < rdos.length && rdos[i].fecha <= t) {
      for (const a of rdos[i].avances) cantEjec.set(a.partidaId, (cantEjec.get(a.partidaId) ?? 0) + a.cantidad)
      i++
    }
    const vista = acts.map((a) => {
      const iniciada = a.inicioReal != null && a.inicioReal <= t
      return {
        ...a,
        finReal: a.finReal != null && a.finReal <= t + 1 ? a.finReal : undefined,
        avanceManual: iniciada ? a.avanceManual : undefined,
      }
    })
    diarios.push(avanceActividades(vista, cantEjec, pesos))
  }

  const vacio = new Map<string, number>()
  const real = (t: Dia): Map<string, number> => {
    if (t < inicio) return vacio
    if (t < corte) return diarios[t - inicio]
    if (t === corte) return c.avanceAct
    const out = new Map<string, number>()
    for (const a of acts) {
      const a0 = c.avanceAct.get(a.id) ?? 0
      const r = c.cpm.get(a.id)
      if (!r || a0 >= 1) { out.set(a.id, a0); continue }
      const desde = Math.max(corte + 1, r.es)
      const f = r.ef <= desde ? (t + 1 >= desde ? 1 : 0) : Math.min(1, Math.max(0, (t + 1 - desde) / (r.ef - desde)))
      out.set(a.id, a0 + (1 - a0) * f)
    }
    return out
  }

  const plan = (t: Dia): Map<string, number> => {
    const out = new Map<string, number>()
    for (const a of acts) out.set(a.id, fraccionProgramada(lb.get(a.id) ?? a, t))
    return out
  }

  return { inicio, fin, corte, actividades: acts, plan, real }
}

// ───────────────────────── Estado ─────────────────────────

export type Estado4D = 'pendiente' | 'al_dia' | 'atrasado' | 'critico' | 'terminado'

export const ESTADOS_4D: Record<Estado4D, string> = {
  pendiente: 'Sin iniciar',
  al_dia: 'Al día',
  atrasado: 'Atrasado',
  critico: 'Crítico',
  terminado: 'Terminado',
}

export function clasificar(plan: number, real: number, critica = false): Estado4D {
  if (real >= 0.999) return 'terminado'
  if (plan <= 0.001 && real <= 0.001) return 'pendiente'
  const desvio = real - plan
  if (desvio >= -TOL_4D[0]) return 'al_dia'
  if (desvio < -TOL_4D[1] || critica) return 'critico'
  return 'atrasado'
}

export interface EstadoElemento {
  elemento: Elemento
  plan: number
  real: number
  estado: Estado4D
}

/**
 * Estado de cada elemento al día t. La ruta crítica solo se considera desde el corte
 * en adelante: es la del programa actualizado de hoy, no la de semanas pasadas.
 */
export function estadoElementos(elementos: Elemento[], linea: Linea4D, t: Dia, c: CalcObra): EstadoElemento[] {
  const plan = linea.plan(t)
  const real = linea.real(t)
  return elementos.map((e) => {
    const p = avanceElemento(e, plan)
    const r = avanceElemento(e, real)
    const critica = t >= linea.corte && e.aportes.some((x) => c.cpm.get(x.actividadId)?.critica && (real.get(x.actividadId) ?? 0) < 1)
    return { elemento: e, plan: p, real: r, estado: clasificar(p, r, critica) }
  })
}

export interface ActividadEnCurso {
  act: Actividad
  plan: number
  real: number
  estado: Estado4D
}

/** Actividades que al día t están en ejecución o deberían estarlo, las más atrasadas primero. */
export function actividadesEnCurso(linea: Linea4D, t: Dia, c: CalcObra): ActividadEnCurso[] {
  const plan = linea.plan(t)
  const real = linea.real(t)
  return linea.actividades
    .filter((a) => !a.esHito)
    .map((act) => {
      const p = plan.get(act.id) ?? 0
      const r = real.get(act.id) ?? 0
      const critica = t >= linea.corte && !!c.cpm.get(act.id)?.critica
      return { act, plan: p, real: r, estado: clasificar(p, r, critica) }
    })
    .filter((x) => x.real < 0.999 && (x.plan > 0.001 || x.real > 0.001))
    .sort((a, b) => a.real - a.plan - (b.real - b.plan))
}

/**
 * Avance de la Curva S interpolado al día t, partiendo de 0 al inicio de la obra.
 * El avance real no existe después del último punto (el corte): devuelve null.
 */
export function interpolarSerie(serie: PuntoSerie[], inicio: Dia, t: Dia, campo: 'avancePlan' | 'avanceReal'): number | null {
  if (t < inicio) return 0
  const pts = [{ fecha: inicio - 1, v: 0 }]
  for (const p of serie) if (p[campo] != null && p.fecha >= inicio) pts.push({ fecha: p.fecha, v: p[campo] as number })
  const ult = pts[pts.length - 1]
  if (t > ult.fecha) return campo === 'avanceReal' ? null : ult.v
  const k = pts.findIndex((p) => p.fecha >= t)
  const a = pts[k - 1] ?? pts[k]
  const b = pts[k]
  return b.fecha === a.fecha ? b.v : a.v + ((b.v - a.v) * (t - a.fecha)) / (b.fecha - a.fecha)
}
