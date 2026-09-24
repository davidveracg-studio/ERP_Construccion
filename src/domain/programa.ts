import type { Actividad, Dia, Obra, Programa } from './types'

/** Fracción programada de una actividad al cierre del día t (distribución lineal). */
export function fraccionProgramada(a: Pick<Actividad, 'inicio' | 'fin'>, t: Dia): number {
  if (a.fin <= a.inicio) return t >= a.inicio ? 1 : 0
  return Math.min(1, Math.max(0, (t + 1 - a.inicio) / (a.fin - a.inicio)))
}

/**
 * Cantidad programada de cada partida al día t según la línea base.
 * Las partidas sin actividad se distribuyen linealmente en el plazo de la obra.
 */
export function cantidadesProgramadas(
  lb: Programa | undefined,
  obra: Obra,
  cantidades: Map<string, number>,
  t: Dia,
): Map<string, number> {
  const out = new Map<string, number>()
  const cubiertas = new Map<string, number>()
  for (const a of lb?.actividades ?? []) {
    const f = fraccionProgramada(a, t)
    for (const ap of a.partidas) {
      out.set(ap.partidaId, (out.get(ap.partidaId) ?? 0) + ap.cantidad * f)
      cubiertas.set(ap.partidaId, (cubiertas.get(ap.partidaId) ?? 0) + ap.cantidad)
    }
  }
  const fObra = fraccionProgramada({ inicio: obra.fechaInicio, fin: obra.fechaInicio + obra.plazoDias }, t)
  for (const [pid, cant] of cantidades) {
    const cub = cubiertas.get(pid) ?? 0
    const resto = Math.max(0, cant - cub)
    if (resto > 0) out.set(pid, (out.get(pid) ?? 0) + resto * fObra)
  }
  return out
}

/**
 * Avance (0–1) de cada actividad: la cantidad ejecutada de cada partida se asigna
 * a sus actividades en orden de inicio (ej.: hormigón piso 1, luego piso 2…).
 */
export function avanceActividades(
  acts: Actividad[],
  cantEjec: Map<string, number>,
  /** Peso por unidad de cada partida (PU de costo) para ponderar partidas de distinta unidad. */
  pesoUnitario?: Map<string, number>,
): Map<string, number> {
  const porPartida = new Map<string, { act: Actividad; cantidad: number }[]>()
  for (const a of acts)
    for (const ap of a.partidas) {
      const l = porPartida.get(ap.partidaId) ?? []
      l.push({ act: a, cantidad: ap.cantidad })
      porPartida.set(ap.partidaId, l)
    }
  const hecho = new Map<string, number>()
  const total = new Map<string, number>()
  for (const [pid, lista] of porPartida) {
    lista.sort((x, y) => x.act.inicio - y.act.inicio || x.act.codigo.localeCompare(y.act.codigo))
    let resto = cantEjec.get(pid) ?? 0
    for (const { act, cantidad } of lista) {
      const asig = Math.min(resto, cantidad)
      resto -= asig
      const w = pesoUnitario?.get(pid) || 1
      hecho.set(act.id, (hecho.get(act.id) ?? 0) + asig * w)
      total.set(act.id, (total.get(act.id) ?? 0) + cantidad * w)
    }
  }
  const out = new Map<string, number>()
  for (const a of acts) {
    if (a.finReal != null) out.set(a.id, 1)
    else if (a.partidas.length === 0) out.set(a.id, a.avanceManual ?? 0)
    else {
      const tot = total.get(a.id) ?? 0
      out.set(a.id, tot > 0 ? Math.min(1, (hecho.get(a.id) ?? 0) / tot) : 0)
    }
  }
  return out
}
