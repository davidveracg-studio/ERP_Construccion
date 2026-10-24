// Catálogo único de umbrales de los indicadores (doc 14 §4: objetivo / alerta / crítico).
// Todas las tarjetas, el semáforo ejecutivo, las reglas y el Health Score leen de aquí.
// Convención de color (acordada con el negocio, 2026-10-23):
//   verde    → no se cruzó la alerta (el objetivo es la meta que se muestra)
//   amarillo → se cruzó la alerta pero no el crítico
//   rojo     → se cruzó el crítico
//   gris     → sin dato
// Normalización 0–100 del Health Score (doc 14 §5.1): crítico → 0, alerta → 60, objetivo → 100,
// con interpolación lineal; si el doc no define objetivo, el objetivo es la alerta.
// Cada empresa puede ajustar alerta, crítico y objetivo en Configuración (config.umbrales.kpi).
import type { Config, EstadoSemaforo } from './types'

export type Sentido = 'mayor' | 'menor'
export type UnidadKpi = 'indice' | 'pct' | 'pp' | 'dias' | 'n' | 'meses' | 'periodos'

export interface Umbral {
  /** Meta (doc 14 "Objetivo"); null si el doc no la define. */
  objetivo: number | null
  /** Doc 14 "Alerta": al cruzarlo el indicador pasa a amarillo. */
  alerta: number
  /** Doc 14 "Crítico": al cruzarlo pasa a rojo. */
  critico: number
  sentido: Sentido
  /** La alerta incluye el valor límite (≤ / ≥ en el doc); si no, es estricta (< / >). */
  alertaIncluye?: boolean
  criticoIncluye?: boolean
}

export interface FichaUmbral extends Umbral {
  nombre: string
  unidad: UnidadKpi
  /** Texto del doc cuando el umbral tiene una condición adicional que no es numérica. */
  nota?: string
}

const M = (nombre: string, unidad: UnidadKpi, objetivo: number | null, alerta: number, critico: number, extra: Partial<FichaUmbral> = {}): FichaUmbral =>
  ({ nombre, unidad, objetivo, alerta, critico, sentido: 'mayor', ...extra })
const m = (nombre: string, unidad: UnidadKpi, objetivo: number | null, alerta: number, critico: number, extra: Partial<FichaUmbral> = {}): FichaUmbral =>
  ({ nombre, unidad, objetivo, alerta, critico, sentido: 'menor', ...extra })

/** Valores por defecto del doc 14 §4 (configurables por empresa, RF-ADM-04). */
export const UMBRALES_DOC14 = {
  // 4.1 Avance y plazo
  'KPL-03': M('Desviación de avance', 'pp', 0, -0.03, -0.08),
  'KPL-04': M('PPC', 'pct', 0.8, 0.7, 0.6),
  'KPL-05': M('SPI', 'indice', 1, 0.95, 0.85),
  'KPL-06': m('Días de atraso proyectado', 'dias', 0, 0, 15),
  'KPL-10': m('Actividades atrasadas', 'pct', 0.1, 0.2, 0.35),
  'KPL-13': M('Índice avance / plazo', 'indice', 1, 0.9, 0.8),
  'KPL-14': M('Holgura mínima', 'dias', 5, 5, 0, { alertaIncluye: true }),
  'KPL-15': m('Actividades críticas atrasadas', 'n', 0, 1, 3, { alertaIncluye: true, criticoIncluye: true }),
  // 4.2 Costos y valor ganado
  'KCO-03': M('CPI', 'indice', 1, 0.95, 0.9),
  'KCO-04': m('EAC / BAC', 'indice', 1, 1.03, 1.07),
  'KCO-07': m('Merma de material', 'pct', 0.03, 0.05, 0.1),
  'KCO-08': m('Costo no imputado', 'pct', 0.05, 0.1, 0.15),
  'KCO-10': m('Desviación de gastos generales', 'pct', 0, 0.1, 0.25),
  'KCO-11': M('CV / BAC', 'pct', 0, -0.02, -0.05),
  'KCO-12': M('SV / BAC', 'pct', 0, -0.03, -0.08),
  'KCO-14': M('VAC / BAC', 'pct', 0, -0.03, -0.07),
  'KCO-15': m('TCPI', 'indice', 1, 1.05, 1.15),
  // 4.3 Estados de pago y finanzas
  'KFI-01': m('Días de preparación de EP', 'dias', 1, 3, 7),
  'KFI-02': m('Días de aprobación de EP', 'dias', 7, 15, 30),
  'KFI-03': m('Días de cobro de EP', 'dias', 30, 45, 60),
  'KFI-04': m('Avance valorizado no cobrado', 'periodos', 1, 1.5, 2),
  'KFI-07': M('Backlog', 'meses', null, 6, 3),
  'KFI-10': m('EP observados', 'pct', 0.1, 0.25, 0.5),
  // 4.4 Seguridad (KSE-01 usa la meta de IF de la empresa: alerta > meta, crítico > 2 × meta)
  'KSE-05': M('Cumplimiento de charlas', 'pct', 1, 0.95, 0.85),
  'KSE-06': M('Cumplimiento de ART', 'pct', 1, 1, 0.95),
  'KSE-08': m('Medidas correctivas vencidas', 'n', 0, 1, 5, { alertaIncluye: true, criticoIncluye: true, nota: 'crítico también si alguna vence hace más de 30 días' }),
  'KSE-10': M('Cumplimiento de inspecciones', 'pct', 1, 0.9, 0.75),
  'KSE-11': M('Observaciones cerradas en plazo', 'pct', 0.9, 0.8, 0.6),
  // 4.5 Calidad
  'KCA-01': M('Aprobación a la primera', 'pct', 0.9, 0.85, 0.75),
  'KCA-02': m('NCR abiertas', 'n', null, 5, 10, { nota: 'crítico también si alguna tiene más de 30 días' }),
  'KCA-03': m('Costo de no calidad', 'pct', 0.01, 0.02, 0.04),
  'KCA-07': m('Rework rate', 'pct', 0.02, 0.03, 0.06),
  'KCA-08': m('Protocolos rechazados', 'pct', null, 0.15, 0.25),
  'KCA-09': M('Inspecciones de calidad', 'pct', 1, 0.9, 0.75),
  // 4.6 Productividad y mano de obra
  'KPR-01': m('Rendimiento de MO sobre el APU', 'pct', 0, 0.1, 0.25),
  'KPR-02': M('Índice de productividad MO', 'indice', 1, 0.9, 0.8),
  'KPR-05': M('Cumplimiento de RDO', 'pct', 0.95, 0.9, 0.75),
  'KPR-08': m('HH extraordinarias', 'pct', 0.05, 0.1, 0.2),
  'KPR-09': m('HH no productivas', 'pct', 0.05, 0.1, 0.15),
  // 4.7 Abastecimiento
  'KAB-01': M('Entregas en fecha', 'pct', 0.9, 0.8, 0.7),
  'KAB-02': m('Lead time', 'dias', 3, 5, 10),
  'KAB-03': m('Compras urgentes', 'pct', 0.1, 0.2, 0.35),
  'KAB-05': m('Material inmovilizado', 'pct', 0.02, 0.05, 0.1),
  'KAB-06': M('OTIF', 'pct', 0.95, 0.9, 0.8),
  'KAB-09': m('Compras fuera de presupuesto', 'pct', 0, 0.05, 0.15),
  'KAB-12': m('Tiempo de compra', 'dias', 2, 4, 7),
  // 4.8 Subcontratos
  'KSU-01': M('Cumplimiento documental', 'pct', 1, 1, 0.8),
  'KSU-03': M('Avance del subcontrato vs programa', 'pct', 1, 0.9, 0.8),
  'KSU-06': m('Pagado vs avance', 'pct', 1, 1, Number.POSITIVE_INFINITY, { nota: 'el doc no define crítico' }),
  'KSU-08': m('Adicionales de subcontrato', 'pct', 0.05, 0.1, 0.2),
  // 4.9 Comercial
  'KCM-02': M('Tasa de adjudicación', 'pct', 0.2, 0.15, 0.1),
  'KCM-05': m('Concentración de mandante', 'pct', 0.35, 0.5, 0.7),
  // 4.10 Maquinaria
  'KMQ-01': M('Utilización de equipos', 'pct', 0.75, 0.6, 0.4),
  'KMQ-02': m('Horas improductivas', 'pct', 0.1, 0.2, 0.35),
  'KMQ-03': m('Costo hora real vs presupuestado', 'pct', 0, 0.1, 0.25),
  'KMQ-04': m('Consumo de combustible vs estándar', 'pct', 0, 0.15, 0.3),
  'KMQ-05': M('Disponibilidad mecánica', 'pct', 0.9, 0.85, 0.75),
  'KMQ-06': M('Cumplimiento de mantenciones', 'pct', 1, 0.9, 0.75),
  'KMQ-07': M('Rendimiento de equipo vs presupuesto', 'pct', 0, -0.1, -0.25),
  // 4.11 Riesgos
  'KRI-03': m('Riesgos con revisión vencida', 'n', 0, 1, 3, { alertaIncluye: true, criticoIncluye: true }),
  'KRI-06': m('Riesgos materializados', 'pct', null, 0.3, 0.5),
  // 4.12 Documental y contratos
  'KDO-05': m('Multas sobre el contrato', 'pct', 0, 0, 0.01),
} satisfies Record<string, FichaUmbral>

export type KpiId = keyof typeof UMBRALES_DOC14
export const KPIS = Object.keys(UMBRALES_DOC14) as KpiId[]

/** Umbral vigente: el del doc 14 con los ajustes de la empresa. */
export function umbral(cfg: Pick<Config, 'umbrales'> | null | undefined, id: KpiId): FichaUmbral {
  const base = UMBRALES_DOC14[id]
  const ajuste = cfg?.umbrales.kpi?.[id]
  return ajuste ? { ...base, ...ajuste } : base
}

const cruza = (v: number, limite: number, sentido: Sentido, incluye?: boolean) =>
  sentido === 'mayor' ? (incluye ? v <= limite : v < limite) : (incluye ? v >= limite : v > limite)

/** Estado del semáforo de un valor contra un umbral (convención alerta / crítico). */
export function estadoUmbral(v: number | null | undefined, u: Umbral): EstadoSemaforo {
  if (v == null || !isFinite(v)) return 'na'
  if (cruza(v, u.critico, u.sentido, u.criticoIncluye)) return 'rojo'
  if (cruza(v, u.alerta, u.sentido, u.alertaIncluye)) return 'amarillo'
  return 'verde'
}

export const estadoKpi = (cfg: Pick<Config, 'umbrales'> | null | undefined, id: KpiId, v: number | null | undefined) => estadoUmbral(v, umbral(cfg, id))

/** Normaliza a 0–100: crítico → 0, alerta → 60, objetivo (o la alerta si no hay objetivo) → 100. */
export function norm(v: number | null | undefined, obj: number, alerta: number, crit: number): number | null {
  if (v == null || !isFinite(v)) return null
  const up = obj !== crit ? obj > crit : alerta > crit
  const s = up ? v : -v
  const [o, a, k] = up ? [obj, alerta, crit] : [-obj, -alerta, -crit]
  if (s >= o) return 100
  if (s >= a) return 60 + (40 * (s - a)) / (o - a || 1)
  if (s >= k) return (60 * (s - k)) / (a - k || 1)
  return 0
}

export function normUmbral(v: number | null | undefined, u: Umbral) {
  return norm(v, u.objetivo ?? u.alerta, u.alerta, u.critico)
}
export const normKpi = (cfg: Pick<Config, 'umbrales'> | null | undefined, id: KpiId, v: number | null | undefined) => normUmbral(v, umbral(cfg, id))

/** KSE-01: alerta sobre la meta de la empresa, crítico sobre el doble (doc 14 §4.4). */
export function umbralIF(cfg: Pick<Config, 'umbrales'> | null | undefined): Umbral {
  const meta = cfg?.umbrales.metaIF ?? 20
  return { objetivo: meta, alerta: meta, critico: 2 * meta, sentido: 'menor' }
}

/** KCO-05: alerta bajo el margen mínimo de la empresa, crítico bajo 0, objetivo el margen ofertado de la obra. */
export function umbralMargen(cfg: Pick<Config, 'umbrales'>, margenOfertado: number): Umbral {
  return { objetivo: margenOfertado, alerta: cfg.umbrales.margenMinimo, critico: 0, sentido: 'mayor' }
}

/** Texto corto del umbral para ayudas en pantalla, p. ej. "meta ≥ 1,00 · alerta < 0,95 · crítico < 0,85". */
export function textoUmbral(u: FichaUmbral | Umbral, fmt: (v: number) => string) {
  const op = (inc?: boolean) => (u.sentido === 'mayor' ? (inc ? '≤' : '<') : (inc ? '≥' : '>'))
  const meta = u.objetivo != null ? `meta ${u.sentido === 'mayor' ? '≥' : '≤'} ${fmt(u.objetivo)} · ` : ''
  return `${meta}alerta ${op(u.alertaIncluye)} ${fmt(u.alerta)} · crítico ${op(u.criticoIncluye)} ${fmt(u.critico)}`
}
