// Semáforo ejecutivo de 8 dimensiones (14 §5.3). Todas activas desde la v1.3.
import type { CalcObra } from './evm'
import type { Config, EstadoSemaforo } from './types'

export type Dimension = 'plazo' | 'costos' | 'avance' | 'productividad' | 'compras' | 'calidad' | 'seguridad' | 'caja'

export interface CeldaSemaforo {
  dim: Dimension
  nombre: string
  kpi: string
  valor: number | null
  estado: EstadoSemaforo
  disponibleEn?: string
}

export const DIMENSIONES: { dim: Dimension; nombre: string; kpi: string; disponibleEn?: string }[] = [
  { dim: 'plazo', nombre: 'Plazo', kpi: 'SPI' },
  { dim: 'costos', nombre: 'Costos', kpi: 'CPI' },
  { dim: 'avance', nombre: 'Avance', kpi: 'Desviación' },
  { dim: 'productividad', nombre: 'Productividad', kpi: 'HH/unidad' },
  { dim: 'compras', nombre: 'Compras', kpi: 'OTIF' },
  { dim: 'calidad', nombre: 'Calidad', kpi: 'NCR abiertas' },
  { dim: 'seguridad', nombre: 'Seguridad', kpi: 'Accidentes CTP' },
  { dim: 'caja', nombre: 'Caja', kpi: 'Mínimo 60 días' },
]

/** Mayor es mejor: ≥ u[0] verde, ≥ u[1] amarillo. */
function mayorMejor(v: number | null, u: [number, number]): EstadoSemaforo {
  if (v == null) return 'na'
  return v >= u[0] ? 'verde' : v >= u[1] ? 'amarillo' : 'rojo'
}
/** Menor es mejor: ≤ u[0] verde, ≤ u[1] amarillo. */
function menorMejor(v: number | null, u: [number, number]): EstadoSemaforo {
  if (v == null) return 'na'
  return v <= u[0] ? 'verde' : v <= u[1] ? 'amarillo' : 'rojo'
}

export function semaforo(c: CalcObra, cfg: Config): CeldaSemaforo[] {
  const u = cfg.umbrales
  return DIMENSIONES.map((d) => {
    let valor: number | null = null
    let estado: EstadoSemaforo = 'na'
    switch (d.dim) {
      case 'plazo': valor = c.spi; estado = mayorMejor(c.spi, u.spi); break
      case 'costos': valor = c.cpi; estado = mayorMejor(c.cpi, u.cpi); break
      case 'avance': valor = c.desvAvance; estado = mayorMejor(c.pvDir > 0 ? c.desvAvance : null, u.avancePp); break
      case 'productividad': valor = c.productividadDesv; estado = menorMejor(c.productividadDesv, u.productividad); break
      // KFI-06: caja proyectada mínima a 60 días contra el colchón (ver caja.ts)
      case 'caja': valor = c.caja.minimo60; estado = c.caja.estado; break
      // KAB-06: OTIF móvil de 90 días (ver compras.ts)
      case 'compras': valor = c.compras.otif; estado = c.compras.estado; break
      // KCA-02: NCR abiertas (rojo si hay vencidas, ver calidad.ts)
      case 'calidad': valor = c.calidad.ncrAbiertas; estado = c.calidad.estado; break
      // KSE-12 + preventivos: accidentes con tiempo perdido del mes (ver seguridad.ts)
      case 'seguridad': valor = c.seguridad.ctp; estado = c.seguridad.estado; break
    }
    return { ...d, valor, estado }
  })
}

export function semaforoRecord(celdas: CeldaSemaforo[]): Record<string, EstadoSemaforo> {
  return Object.fromEntries(celdas.map((c) => [c.dim, c.estado]))
}

/** Health Score de obra (14 §5.1) con renormalización sobre dimensiones disponibles. */
export function healthScore(c: CalcObra, cfg: Config): number | null {
  return healthDetalle(c, cfg).score
}

export interface DimensionHealth { id: string; nombre: string; peso: number; valor: number | null }

/** Desglose del Health Score: puntaje 0–100 de cada dimensión, su peso y el tope por accidente grave. */
export function healthDetalle(c: CalcObra, cfg: Config): { dimensiones: DimensionHealth[]; sinTope: number | null; score: number | null; tope: boolean } {
  const u = cfg.umbrales
  // normaliza: crítico → 0, alerta → 60, objetivo → 100
  const norm = (v: number | null, obj: number, alerta: number, crit: number) => {
    if (v == null) return null
    const up = obj > crit
    const s = up ? v : -v
    const [o, a, k] = up ? [obj, alerta, crit] : [-obj, -alerta, -crit]
    if (s >= o) return 100
    if (s >= a) return 60 + (40 * (s - a)) / (o - a)
    if (s >= k) return (60 * (s - k)) / (a - k)
    return 0
  }
  const comps: [number | null, number][] = [
    [avg([[norm(c.margenProyectado, 0.11, u.margenMinimo, 0), 0.4], [norm(c.cpi, 1, u.cpi[1], 0.85), 0.3], [norm(c.bac > 0 ? c.vac / c.bac : null, 0, -u.vac[0], -u.vac[1]), 0.3]]), 0.25],
    [avg([[norm(c.spi, 1, u.spi[1], 0.75), 0.6], [norm(c.atrasoProyectado, 0, 15, 45), 0.4]]), 0.2],
    [norm(c.desvAvance, 0, u.avancePp[1], -0.15), 0.1],
    [norm(c.productividadDesv, 0, u.productividad[1], 0.3), 0.1],
    // Caja (14 §6: 10 %): mínimo a 60 días como fracción de la venta, contra el colchón
    [c.venta > 0 && c.caja.estado !== 'na' ? norm(c.caja.minimo60 / c.venta, u.cajaColchon ?? 0.02, 0, -0.05) : null, 0.1],
    // Seguridad (14 §5.1: 15 %): IF, charlas, medidas vencidas y observaciones cerradas en plazo
    [c.seguridad.estado !== 'na' ? avg([
      [norm(c.seguridad.if, u.metaIF ?? 20, (u.metaIF ?? 20) * 1.5, (u.metaIF ?? 20) * 2), 0.3], [norm(c.seguridad.charlas, 1, 0.95, 0.85), 0.25],
      [norm(c.seguridad.medidasVencidas, 0, 1, 5), 0.25], [norm(c.seguridad.obsEnPlazo, 0.9, 0.8, 0.6), 0.2],
    ]) : null, 0.15],
    // Calidad (14 §5.1: 5 %): rework rate (KCA-07) y NCR abiertas (KCA-02)
    [c.calidad.estado !== 'na' ? avg([[norm(c.calidad.reworkRate, 0.02, 0.03, 0.06), 0.5], [norm(c.calidad.ncrAbiertas, 3, 5, 10), 0.5]]) : null, 0.05],
  ]
  const sinTope = avg(comps)
  // Regla de tope: un accidente grave o fatal en el mes limita el score a 59 ("Riesgo")
  const tope = sinTope != null && !!c.seguridad.graveMes
  const nombres: [string, string][] = [['costo', 'Costo'], ['plazo', 'Plazo'], ['avance', 'Avance'], ['productividad', 'Productividad'], ['caja', 'Caja'], ['seguridad', 'Seguridad'], ['calidad', 'Calidad']]
  return {
    dimensiones: comps.map(([valor, peso], i) => ({ id: nombres[i][0], nombre: nombres[i][1], peso, valor })),
    sinTope,
    score: tope ? Math.min(sinTope!, 59) : sinTope,
    tope,
  }
}

function avg(xs: [number | null, number][]): number | null {
  const v = xs.filter((x): x is [number, number] => x[0] != null)
  const w = v.reduce((s, x) => s + x[1], 0)
  return w > 0 ? v.reduce((s, x) => s + x[0] * x[1], 0) / w : null
}
