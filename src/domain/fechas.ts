import type { Dia } from './types'

const MS_DIA = 86_400_000

/** Convierte 'YYYY-MM-DD' a día (UTC, sin zona horaria). */
export function dia(iso: string): Dia {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_DIA)
}

export function iso(d: Dia): string {
  return new Date(d * MS_DIA).toISOString().slice(0, 10)
}

export function hoy(): Dia {
  const n = new Date()
  return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / MS_DIA)
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(d: Dia): number {
  return new Date(d * MS_DIA).getUTCDay()
}

export function fmtFecha(d: Dia): string {
  const s = iso(d)
  return `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`
}

export function fmtFechaCorta(d: Dia): string {
  const s = iso(d)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`
}

/** Viernes de la semana del día dado (corte de período por defecto). */
export function finDeSemana(d: Dia, diaCorte = 5): Dia {
  const w = diaSemana(d)
  return d + ((diaCorte - w + 7) % 7)
}

export function diasHabilesEntre(desde: Dia, hasta: Dia, habiles: number[]): Dia[] {
  const out: Dia[] = []
  for (let d = desde; d <= hasta; d++) if (habiles.includes(diaSemana(d))) out.push(d)
  return out
}

/** Último día del mes del día dado. */
export function finDeMes(d: Dia): Dia {
  const f = new Date(d * MS_DIA)
  return Math.round(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0) / MS_DIA)
}
