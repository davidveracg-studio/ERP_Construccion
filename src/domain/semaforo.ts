// Semáforo ejecutivo de 8 dimensiones (14 §5.3) y Health Score de obra (14 §5.1). Los umbrales salen
// del catálogo único (umbrales.ts, doc 14 §4) y el color sigue la convención alerta / crítico.
import type { CalcObra } from './evm'
import { estadoKpi, estadoUmbral, normKpi, normUmbral, umbralIF, umbralMargen } from './umbrales'
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

/** Antigüedad (días) de la NCR abierta más antigua. */
const antiguedadNCR = (c: CalcObra) => (c.calidad.ncrAbiertas ? c.calidad.ncrAntiguedad : 0)

/** KCA-02 (14 §4.5): > 5 alerta; > 10 abiertas o alguna con más de 30 días, crítico. */
export function estadoCalidad(c: CalcObra, cfg: Config): EstadoSemaforo {
  if (c.calidad.estado === 'na') return 'na'
  return antiguedadNCR(c) > 30 ? 'rojo' : estadoKpi(cfg, 'KCA-02', c.calidad.ncrAbiertas)
}

/** KSE-12 (14 §4.4): grave o fatal → crítico; ≥ 1 CTP o preventivos (KSE-05, KSE-06) en alerta → alerta. */
export function estadoSeguridad(c: CalcObra, cfg: Config): EstadoSemaforo {
  const s = c.seguridad
  if (s.estado === 'na') return 'na'
  if (s.graveMes) return 'rojo'
  return s.ctp > 0 || estadoKpi(cfg, 'KSE-05', s.charlas) === 'rojo' || estadoKpi(cfg, 'KSE-05', s.charlas) === 'amarillo'
    || estadoKpi(cfg, 'KSE-06', s.art) === 'rojo' || estadoKpi(cfg, 'KSE-06', s.art) === 'amarillo' ? 'amarillo' : 'verde'
}

export function semaforo(c: CalcObra, cfg: Config): CeldaSemaforo[] {
  return DIMENSIONES.map((d) => {
    let valor: number | null = null
    let estado: EstadoSemaforo = 'na'
    switch (d.dim) {
      case 'plazo': valor = c.spi; estado = estadoKpi(cfg, 'KPL-05', c.spi); break
      case 'costos': valor = c.cpi; estado = estadoKpi(cfg, 'KCO-03', c.cpi); break
      case 'avance': valor = c.desvAvance; estado = estadoKpi(cfg, 'KPL-03', c.pvDir > 0 ? c.desvAvance : null); break
      // KPR-01 agregado (14 §5.3): HH reales sobre las del APU para el avance logrado
      case 'productividad': valor = c.productividadDesv; estado = estadoKpi(cfg, 'KPR-01', c.productividadDesv); break
      // KFI-06: caja proyectada mínima a 60 días contra el colchón (ver caja.ts)
      case 'caja': valor = c.caja.minimo60; estado = c.caja.estado; break
      // KAB-06: OTIF móvil de 90 días (ver compras.ts)
      case 'compras': valor = c.compras.otif; estado = estadoKpi(cfg, 'KAB-06', c.compras.otif); break
      case 'calidad': valor = c.calidad.ncrAbiertas; estado = estadoCalidad(c, cfg); break
      case 'seguridad': valor = c.seguridad.ctp; estado = estadoSeguridad(c, cfg); break
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

export interface ComponenteHealth { id: string; nombre: string; peso: number; valor: number | null }
export interface DimensionHealth { id: string; nombre: string; peso: number; valor: number | null; componentes: ComponenteHealth[] }

/** KPL-09: hitos con fecha comprometida ≤ hoy; 100 si todos a tiempo, 60 si alguno atrasado, 0 si hay un hito contractual vencido. */
function puntajeHitos(c: CalcObra): number | null {
  const debidos = c.hitos.filter((h) => h.comprometida <= c.corte)
  if (!debidos.length) return null
  if (debidos.some((h) => h.estado === 'vencido' && h.act.hitoContractual)) return 0
  return debidos.every((h) => h.estado === 'cumplido') ? 100 : 60
}

/** KFI-09: 100 sin EP vencidos, 60 si hay vencidos, 0 si alguno lleva más de 30 días. */
function puntajeEPVencidos(c: CalcObra): number | null {
  if (c.caja.estado === 'na') return null
  const dias = c.caja.epVencidos.map((ep) => c.corte - (ep.vencimiento ?? c.corte))
  return !dias.length ? 100 : dias.some((x) => x > 30) ? 0 : 60
}

/** Desglose del Health Score (14 §5.1): 8 dimensiones con sus indicadores y pesos, y el tope por accidente grave. */
export function healthDetalle(c: CalcObra, cfg: Config): { dimensiones: DimensionHealth[]; sinTope: number | null; score: number | null; tope: boolean } {
  const s = c.seguridad
  const q = c.calidad
  const hh = c.hhTotal > 0 ? c.hhNoProd / c.hhTotal : null
  const dim = (id: string, nombre: string, peso: number, componentes: ComponenteHealth[], disponible = true): DimensionHealth =>
    ({ id, nombre, peso, componentes, valor: disponible ? avg(componentes.map((x) => [x.valor, x.peso])) : null })
  const dimensiones: DimensionHealth[] = [
    dim('costo', 'Costo', 0.25, [
      { id: 'KCO-05', nombre: 'Margen proyectado', peso: 0.4, valor: normUmbral(c.margenProyectado, umbralMargen(cfg, c.obra.margenOfertado)) },
      { id: 'KCO-03', nombre: 'CPI', peso: 0.3, valor: normKpi(cfg, 'KCO-03', c.cpi) },
      { id: 'KCO-14', nombre: 'VAC / BAC', peso: 0.3, valor: normKpi(cfg, 'KCO-14', c.bac > 0 ? c.vac / c.bac : null) },
    ]),
    dim('plazo', 'Plazo', 0.2, [
      { id: 'KPL-05', nombre: 'SPI', peso: 0.4, valor: normKpi(cfg, 'KPL-05', c.spi) },
      { id: 'KPL-06', nombre: 'Atraso proyectado', peso: 0.3, valor: normKpi(cfg, 'KPL-06', c.atrasoProyectado) },
      { id: 'KPL-09', nombre: 'Hitos', peso: 0.3, valor: puntajeHitos(c) },
    ]),
    dim('avance', 'Avance', 0.1, [
      { id: 'KPL-03', nombre: 'Desviación de avance', peso: 0.6, valor: normKpi(cfg, 'KPL-03', c.pvDir > 0 ? c.desvAvance : null) },
      { id: 'KPL-13', nombre: 'Índice avance / plazo', peso: 0.4, valor: normKpi(cfg, 'KPL-13', c.indiceAvancePlazo) },
    ]),
    dim('productividad', 'Productividad', 0.1, [
      { id: 'KPR-02', nombre: 'Índice de productividad MO', peso: 0.6, valor: normKpi(cfg, 'KPR-02', c.indiceProductividad) },
      { id: 'KPR-09', nombre: 'HH no productivas', peso: 0.4, valor: normKpi(cfg, 'KPR-09', hh) },
    ]),
    dim('seguridad', 'Seguridad', 0.15, [
      { id: 'KSE-01', nombre: 'Tasa de frecuencia', peso: 0.3, valor: normUmbral(s.if, umbralIF(cfg)) },
      { id: 'KSE-05', nombre: 'Charlas', peso: 0.25, valor: normKpi(cfg, 'KSE-05', s.charlas) },
      { id: 'KSE-08', nombre: 'Medidas vencidas', peso: 0.25, valor: s.medidasVencidas30 > 0 ? 0 : normKpi(cfg, 'KSE-08', s.medidasVencidas) },
      { id: 'KSE-11', nombre: 'Observaciones en plazo', peso: 0.2, valor: normKpi(cfg, 'KSE-11', s.obsEnPlazo) },
    ], s.estado !== 'na'),
    dim('caja', 'Caja y cobranza', 0.1, [
      { id: 'KFI-04', nombre: 'Avance no cobrado (períodos)', peso: 0.5, valor: normKpi(cfg, 'KFI-04', c.caja.periodosNoCobrados) },
      { id: 'KFI-09', nombre: 'EP vencidos', peso: 0.5, valor: puntajeEPVencidos(c) },
    ], c.caja.estado !== 'na'),
    dim('calidad', 'Calidad', 0.05, [
      { id: 'KCA-07', nombre: 'Rework rate', peso: 0.5, valor: normKpi(cfg, 'KCA-07', q.reworkRate) },
      { id: 'KCA-02', nombre: 'NCR abiertas', peso: 0.5, valor: antiguedadNCR(c) > 30 ? 0 : normKpi(cfg, 'KCA-02', q.ncrAbiertas) },
    ], q.estado !== 'na'),
    dim('abastecimiento', 'Abastecimiento', 0.05, [
      { id: 'KAB-06', nombre: 'OTIF', peso: 1, valor: normKpi(cfg, 'KAB-06', c.compras.otif) },
    ]),
  ]
  const sinTope = avg(dimensiones.map((d) => [d.valor, d.peso]))
  // Regla de tope: un accidente grave o fatal en el mes limita el score a 59 ("Riesgo")
  const tope = sinTope != null && !!s.graveMes
  return { dimensiones, sinTope, score: tope ? Math.min(sinTope!, 59) : sinTope, tope }
}

/** Escala del Health Score (14 §5.4). */
export const nivelHealth = (v: number | null) => (v == null ? '—' : v >= 90 ? 'Excelente' : v >= 80 ? 'Muy bueno' : v >= 70 ? 'Bueno' : v >= 60 ? 'Riesgo' : 'Crítico')
/** Color de la escala: Excelente y Muy bueno verde, Bueno y Riesgo ámbar, Crítico rojo. */
export const estadoHealth = (v: number | null): EstadoSemaforo => (v == null ? 'na' : v >= 80 ? 'verde' : v >= 60 ? 'amarillo' : 'rojo')
export { estadoUmbral }

function avg(xs: [number | null, number][]): number | null {
  const v = xs.filter((x): x is [number, number] => x[0] != null)
  const w = v.reduce((s, x) => s + x[1], 0)
  return w > 0 ? v.reduce((s, x) => s + x[0] * x[1], 0) / w : null
}
