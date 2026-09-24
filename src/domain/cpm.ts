// Método de la ruta crítica (13 §5B). Días corridos; una actividad ocupa [es, ef).
import type { Actividad, Dia } from './types'

export interface ResultadoCPM {
  es: Dia
  ef: Dia
  ls: Dia
  lf: Dia
  /** Holgura total (días). Negativa = atraso respecto de la fecha límite. null si terminada. */
  holgura: number | null
  holguraLibre: number | null
  critica: boolean
  terminada: boolean
}

export interface OpcionesCPM {
  /** Fecha de corte: las actividades no iniciadas no pueden comenzar antes. */
  hoy?: Dia
  /** Fecha límite (término contractual) para el paso hacia atrás. */
  fechaLimite?: Dia
  /** Avance 0–1 por actividad, para proyectar la duración restante. */
  avance?: Map<string, number>
  /** Fechas límite por actividad (p. ej. hitos contractuales): acotan el término tardío. */
  limites?: Map<string, Dia>
  /** Si true, usa fechas reales y proyecta lo pendiente (programa actualizado). */
  usarReales?: boolean
}

export class CicloError extends Error {}

export function ordenTopologico(acts: Actividad[]): Actividad[] {
  const porId = new Map(acts.map((a) => [a.id, a]))
  const visit = new Map<string, 0 | 1 | 2>()
  const out: Actividad[] = []
  const dfs = (a: Actividad, camino: string[]) => {
    const st = visit.get(a.id) ?? 0
    if (st === 2) return
    if (st === 1) throw new CicloError(`Dependencia circular: ${[...camino, a.codigo].join(' → ')}`)
    visit.set(a.id, 1)
    for (const d of a.predecesoras) {
      const p = porId.get(d.actividadId)
      if (p) dfs(p, [...camino, a.codigo])
    }
    visit.set(a.id, 2)
    out.push(a)
  }
  for (const a of acts) dfs(a, [])
  return out
}

export function calcularCPM(acts: Actividad[], inicioProyecto: Dia, op: OpcionesCPM = {}): Map<string, ResultadoCPM> {
  const orden = ordenTopologico(acts)
  const porId = new Map(acts.map((a) => [a.id, a]))
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  const terminada = new Map<string, boolean>()
  const hoy = op.hoy

  // Paso hacia adelante
  for (const a of orden) {
    const dur = a.duracion
    let minEs = inicioProyecto
    for (const d of a.predecesoras) {
      const p = porId.get(d.actividadId)
      if (!p) continue
      const pes = es.get(p.id)!
      const pef = ef.get(p.id)!
      let r: number
      switch (d.tipo) {
        case 'FC': r = pef + d.desfase; break
        case 'CC': r = pes + d.desfase; break
        case 'FF': r = pef + d.desfase - dur; break
        case 'CF': r = pes + d.desfase - dur; break
      }
      minEs = Math.max(minEs, r)
    }
    let s = minEs
    let f = s + dur
    let fin = false
    if (op.usarReales) {
      if (a.finReal != null) {
        s = a.inicioReal ?? a.finReal - dur
        f = a.finReal
        fin = true
      } else if (a.inicioReal != null) {
        s = a.inicioReal
        const av = Math.min(1, Math.max(0, op.avance?.get(a.id) ?? 0))
        const restante = Math.ceil(dur * (1 - av))
        f = Math.max(s + (av >= 1 ? 0 : 1), (hoy ?? s) + restante)
        if (av >= 1) { f = Math.max(s, hoy ?? s); fin = true }
      } else if (hoy != null) {
        s = Math.max(minEs, hoy)
        f = s + dur
      }
    }
    es.set(a.id, s)
    ef.set(a.id, f)
    terminada.set(a.id, fin)
  }

  // Sucesores
  const sucesores = new Map<string, { s: Actividad; tipo: string; desfase: number }[]>()
  for (const a of acts)
    for (const d of a.predecesoras) {
      if (!porId.has(d.actividadId)) continue
      const l = sucesores.get(d.actividadId) ?? []
      l.push({ s: a, tipo: d.tipo, desfase: d.desfase })
      sucesores.set(d.actividadId, l)
    }

  const finProyecto = Math.max(inicioProyecto, ...acts.map((a) => ef.get(a.id)!))
  const ancla = op.fechaLimite ?? finProyecto
  const ls = new Map<string, number>()
  const lf = new Map<string, number>()

  // Paso hacia atrás
  for (const a of [...orden].reverse()) {
    const durEff = ef.get(a.id)! - es.get(a.id)!
    let maxLf = Math.min(ancla, op.limites?.get(a.id) ?? Infinity)
    for (const { s, tipo, desfase } of sucesores.get(a.id) ?? []) {
      const sls = ls.get(s.id)!
      const slf = lf.get(s.id)!
      let r: number
      switch (tipo) {
        case 'FC': r = sls - desfase; break
        case 'CC': r = sls - desfase + durEff; break
        case 'FF': r = slf - desfase; break
        default: r = slf - desfase + durEff; break
      }
      maxLf = Math.min(maxLf, r)
    }
    lf.set(a.id, maxLf)
    ls.set(a.id, maxLf - durEff)
  }

  const res = new Map<string, ResultadoCPM>()
  let minHolgura = Infinity
  for (const a of acts) {
    if (terminada.get(a.id)) continue
    minHolgura = Math.min(minHolgura, ls.get(a.id)! - es.get(a.id)!)
  }
  for (const a of acts) {
    const fin = terminada.get(a.id)!
    const h = fin ? null : ls.get(a.id)! - es.get(a.id)!
    let hl: number | null = null
    if (!fin) {
      const sucs = sucesores.get(a.id) ?? []
      if (sucs.length === 0) hl = h
      else
        hl = Math.min(
          ...sucs.map(({ s, tipo, desfase }) => {
            const ses = es.get(s.id)!
            const sef = ef.get(s.id)!
            switch (tipo) {
              case 'FC': return ses - desfase - ef.get(a.id)!
              case 'CC': return ses - desfase - es.get(a.id)!
              case 'FF': return sef - desfase - ef.get(a.id)!
              default: return sef - desfase - es.get(a.id)!
            }
          }),
        )
    }
    res.set(a.id, {
      es: es.get(a.id)!,
      ef: ef.get(a.id)!,
      ls: ls.get(a.id)!,
      lf: lf.get(a.id)!,
      holgura: h,
      holguraLibre: hl,
      // Crítica: holgura mínima de la red, o cualquier holgura negativa (atraso contra un límite)
      critica: h != null && h <= Math.max(0, minHolgura),
      terminada: fin,
    })
  }
  return res
}

/** Recalcula inicio/fin de las actividades de una versión (sin reales). */
export function programarActividades(acts: Actividad[], inicioProyecto: Dia): Actividad[] {
  const r = calcularCPM(acts, inicioProyecto)
  return acts.map((a) => ({ ...a, inicio: r.get(a.id)!.es, fin: r.get(a.id)!.ef }))
}
