import type { Partida, TipoRecurso } from './types'

export function puCosto(p: Partida): number {
  return p.recursos.reduce((s, r) => s + r.cantPorUnidad * r.precio, 0)
}

export function puCostoTipo(p: Partida, tipo: TipoRecurso): number {
  return p.recursos.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.cantPorUnidad * r.precio, 0)
}

/** HH presupuestadas por unidad (Σ recursos de mano de obra). */
export function hhPorUnidad(p: Partida): number {
  return p.recursos.filter((r) => r.tipo === 'MO').reduce((s, r) => s + r.cantPorUnidad, 0)
}

/** Costo HH presupuestado (promedio ponderado de los recursos MO). */
export function costoHHPres(p: Partida): number {
  const mo = p.recursos.filter((r) => r.tipo === 'MO')
  const hh = mo.reduce((s, r) => s + r.cantPorUnidad, 0)
  return hh > 0 ? mo.reduce((s, r) => s + r.cantPorUnidad * r.precio, 0) / hh : 0
}

export function ventaPartida(p: Partida): number {
  return p.cantidad * p.puVenta
}

export function bacPartida(p: Partida): number {
  return p.cantidad * puCosto(p)
}

export function tiposDe(p: Partida): TipoRecurso[] {
  return [...new Set(p.recursos.map((r) => r.tipo))]
}
