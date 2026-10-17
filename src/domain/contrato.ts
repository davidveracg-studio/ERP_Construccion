// Contrato (v1.1): obligaciones con multas (08, RULE-904), garantías (10 §20, RULE-404) y recepción
// provisoria y definitiva de la obra (10 §16, 11 RecepcionProvisoria/DefinitivaRegistrada).
// Los estados se derivan de las fechas registradas, igual que en EP y órdenes de cambio.
import type { CalcObra } from './evm'
import type { Dia, EstadoObra, Garantia, ObjetoGarantia, Obligacion, Obra, RecepcionObra, TipoObligacion } from './types'

/** RULE-904: días de aviso antes del vencimiento de una obligación. */
export const DIAS_AVISO_OBLIGACION = 10
/** 10 §20: una garantía pasa a "por vencer" 30 días antes. */
export const DIAS_AVISO_GARANTIA = 30
export const TOPE_MULTAS_DEFECTO = 0.1

export const TIPOS_OBLIGACION: Record<TipoObligacion, string> = {
  garantia: 'Entrega de garantía', programa: 'Programa de trabajo', planos: 'Planos as-built', poliza: 'Póliza de seguro',
  informe: 'Informe al mandante', respuesta: 'Plazo de respuesta', otra: 'Otra',
}

export const OBJETOS_GARANTIA: Record<ObjetoGarantia, string> = {
  fiel_cumplimiento: 'Fiel cumplimiento del contrato', anticipo: 'Correcta inversión del anticipo', correcta_ejecucion: 'Correcta ejecución de las obras',
  canje_retenciones: 'Canje de retenciones', seriedad_oferta: 'Seriedad de la oferta',
}

export const TIPOS_GARANTIA: Record<Garantia['tipo'], string> = { boleta: 'Boleta de garantía', poliza: 'Póliza de garantía', vale_vista: 'Vale vista' }

export const ESTADOS_OBRA: Record<EstadoObra, string> = {
  planificacion: 'En planificación', en_ejecucion: 'En ejecución', paralizada: 'Paralizada', terminada: 'Terminada',
  recepcion_provisoria: 'Recepción provisoria', en_garantia: 'En garantía', cerrada: 'Cerrada',
}

// ───────────────────────── Obligaciones ─────────────────────────

export type EstadoObligacion = 'pendiente' | 'por_vencer' | 'vencida' | 'cumplida' | 'cumplida_con_atraso'

export const ESTADOS_OBLIGACION: Record<EstadoObligacion, string> = {
  pendiente: 'Pendiente', por_vencer: 'Por vencer', vencida: 'Vencida', cumplida: 'Cumplida', cumplida_con_atraso: 'Cumplida con atraso',
}
export const TONO_OBLIGACION: Record<EstadoObligacion, 'gris' | 'ambar' | 'rojo' | 'verde'> = {
  pendiente: 'gris', por_vencer: 'ambar', vencida: 'rojo', cumplida: 'verde', cumplida_con_atraso: 'ambar',
}

export function estadoObligacion(o: Obligacion, t: Dia): EstadoObligacion {
  if (o.cumplida != null && o.cumplida <= t) return o.cumplida <= o.fechaLimite ? 'cumplida' : 'cumplida_con_atraso'
  if (t > o.fechaLimite) return 'vencida'
  return o.fechaLimite - t <= DIAS_AVISO_OBLIGACION ? 'por_vencer' : 'pendiente'
}

/** Multa que acumula una obligación atrasada al día t (diaria por día de atraso o monto fijo). */
export function multaDevengada(o: Obligacion, t: Dia): number {
  if (!o.multa) return 0
  const hasta = o.cumplida != null && o.cumplida <= t ? o.cumplida : t
  const atraso = hasta - o.fechaLimite
  if (atraso <= 0) return 0
  return o.multa.tipo === 'diaria' ? o.multa.monto * atraso : o.multa.monto
}

// ───────────────────────── Garantías ─────────────────────────

export type EstadoGarantia = 'vigente' | 'por_vencer' | 'vencida' | 'renovada' | 'devuelta' | 'cobrada'

export const ESTADOS_GARANTIA: Record<EstadoGarantia, string> = {
  vigente: 'Vigente', por_vencer: 'Por vencer', vencida: 'Vencida', renovada: 'Renovada', devuelta: 'Devuelta', cobrada: 'Cobrada por el mandante',
}
export const TONO_GARANTIA: Record<EstadoGarantia, 'gris' | 'ambar' | 'rojo' | 'verde' | 'azul'> = {
  vigente: 'verde', por_vencer: 'ambar', vencida: 'rojo', renovada: 'gris', devuelta: 'gris', cobrada: 'rojo',
}

export function estadoGarantia(g: Garantia, todas: Garantia[], t: Dia): EstadoGarantia | null {
  if (g.creada > t) return null
  if (g.cobrada != null && g.cobrada <= t) return 'cobrada'
  if (g.devuelta != null && g.devuelta <= t) return 'devuelta'
  if (todas.some((x) => x.reemplazaA === g.id && x.creada <= t)) return 'renovada'
  if (g.vencimiento < t) return 'vencida'
  return g.vencimiento - t <= DIAS_AVISO_GARANTIA ? 'por_vencer' : 'vigente'
}

/** Garantías en poder del mandante (no devueltas, cobradas ni reemplazadas). */
export const garantiasVivas = (gs: Garantia[], t: Dia) =>
  gs.filter((g) => { const e = estadoGarantia(g, gs, t); return e === 'vigente' || e === 'por_vencer' || e === 'vencida' })

// ───────────────────────── Recepción ─────────────────────────

export type EstadoRecepcion = 'provisoria_con_observaciones' | 'provisoria_sin_observaciones' | 'definitiva' | 'rechazada'

export const ESTADOS_RECEPCION: Record<EstadoRecepcion, string> = {
  provisoria_con_observaciones: 'Provisoria con observaciones', provisoria_sin_observaciones: 'Provisoria sin observaciones',
  definitiva: 'Definitiva', rechazada: 'Rechazada por el mandante',
}

/** Una observación queda cerrada cuando se subsanó y el mandante dio su V°B°. */
export const observacionCerrada = (o: RecepcionObra['observaciones'][number], t: Dia) => o.vistoBueno != null && o.vistoBueno <= t

export function estadoRecepcion(r: RecepcionObra, t: Dia): EstadoRecepcion {
  if (r.resultado === 'rechazada') return 'rechazada'
  if (r.tipo === 'definitiva') return 'definitiva'
  return r.observaciones.every((o) => observacionCerrada(o, t)) ? 'provisoria_sin_observaciones' : 'provisoria_con_observaciones'
}

/** Recepción provisoria vigente (recibida) de la obra al día t. */
export const recepcionProvisoria = (rs: RecepcionObra[], obraId: string, t: Dia) =>
  rs.filter((r) => r.obraId === obraId && r.tipo === 'provisoria' && r.resultado === 'recibida' && r.fecha <= t).sort((a, b) => b.fecha - a.fecha)[0]

/** Estado de la obra que corresponde a sus recepciones (10 §7). */
export function estadoObraPorRecepcion(rs: RecepcionObra[], obraId: string, t: Dia, actual: EstadoObra): EstadoObra {
  const propias = rs.filter((r) => r.obraId === obraId && r.fecha <= t).sort((a, b) => a.fecha - b.fecha)
  const ultima = propias.at(-1)
  if (!ultima) return actual
  if (ultima.resultado === 'rechazada') return 'en_ejecucion'
  if (ultima.tipo === 'definitiva') return 'cerrada'
  return estadoRecepcion(ultima, t) === 'provisoria_sin_observaciones' ? 'en_garantia' : 'recepcion_provisoria'
}

/** Para la provisoria la obra debe estar terminada (10 §7: avance ≥ 100 % de partidas no deductivas). */
export const AVANCE_MINIMO_RECEPCION = 0.99

// ───────────────────────── Multas ─────────────────────────

export interface ExposicionMultas {
  /** Multa por atraso proyectado del término (días × multa diaria), con tope. */
  atraso: number
  /** Multas devengadas por obligaciones incumplidas. */
  obligaciones: number
  /** Multas y descuentos ya aplicados por el mandante en los EP. */
  aplicadas: number
  tope: number
  total: number
}

export function exposicionMultas(c: CalcObra, obligaciones: Obligacion[], descuentosEP: number, obra: Obra): ExposicionMultas {
  const tope = (obra.topeMultas ?? TOPE_MULTAS_DEFECTO) * c.venta
  const atraso = Math.max(0, c.atrasoProyectado) * obra.multaDiaria
  const deObligaciones = obligaciones.reduce((s, o) => s + multaDevengada(o, c.corte), 0)
  return { atraso, obligaciones: deObligaciones, aplicadas: descuentosEP, tope, total: Math.min(tope, atraso + deObligaciones + descuentosEP) }
}
