// Maquinaria (v1.2: 08 Dominio 13, 10 §29, 12 RULE-205/206, 14 KMQ). Parte diario por equipo: horas
// disponibles, trabajadas por partida, improductivas con causa, mantención y combustible. Al validarse,
// las horas trabajadas son costo real de equipo de cada partida (tarifa por hora, o el costo fijo del día
// repartido entre las partidas). Utilización, costo hora real, consumo y rendimiento salen de los partes.
import { UMBRALES_DOC14 } from './umbrales'
import type { CausaImproductiva, Dia, Equipo, ParteMaquinaria, Partida, Rol } from './types'

export const CAUSAS_IMPRODUCTIVAS: Record<CausaImproductiva, string> = {
  espera_frente: 'Espera de frente', falta_operador: 'Falta de operador', clima: 'Clima', combustible: 'Falta de combustible', otra: 'Otra',
}
export const PROPIEDAD: Record<Equipo['propiedad'], string> = { propio: 'Propio', arrendado: 'Arrendado', subcontratista: 'De subcontratista' }
export const MODALIDAD: Record<Equipo['tarifa']['modalidad'], string> = { hora: 'por hora', dia: 'por día', mes: 'por mes' }

/** KMQ-01: verde ≥ 75 %, RULE-205 bajo 60 % (costo fijo). */
export const UTILIZACION_VERDE = UMBRALES_DOC14['KMQ-01'].objetivo!
export const UTILIZACION_MIN = UMBRALES_DOC14['KMQ-01'].alerta
/** RULE-206: improductivas sobre 20 % de las disponibles, o la misma causa 3 días seguidos. */
export const IMPRODUCTIVAS_MAX = UMBRALES_DOC14['KMQ-02'].alerta
export const DIAS_CAUSA_REPETIDA = 3
/** Ventana de los indicadores (KMQ semanales y RULE-205/206). */
export const VENTANA = 7
const DIAS_HABILES_MES = 22

export const puedeRegistrarParte = (rol: Rol) => rol === 'R03' || rol === 'R04'
export const puedeValidarParte = (rol: Rol) => rol === 'R03'
export const puedeEditarEquipos = (rol: Rol) => rol === 'R07'

export const estadoParte = (p: ParteMaquinaria, t: Dia) => (p.creado > t ? null : p.historial.filter((h) => h.fecha <= t).at(-1)?.estado ?? 'enviado')
export const horasTrabajadas = (p: ParteMaquinaria) => p.trabajos.reduce((s, x) => s + x.horas, 0)
export const horasImproductivas = (p: ParteMaquinaria) => p.improductivas.reduce((s, x) => s + x.horas, 0)
export const costoFijo = (e: Equipo) => e.tarifa.modalidad !== 'hora'
/** Costo diario de un equipo de costo fijo. */
export const costoDia = (e: Equipo) => (e.tarifa.modalidad === 'dia' ? e.tarifa.monto : e.tarifa.modalidad === 'mes' ? e.tarifa.monto / DIAS_HABILES_MES : 0)

/** Validaciones del parte: las horas deben cuadrar con las disponibles y con el horómetro. */
export function erroresParte(p: Pick<ParteMaquinaria, 'horasDisponibles' | 'trabajos' | 'improductivas' | 'horasMantencion' | 'horometroInicial' | 'horometroFinal' | 'combustible'>): string | null {
  const trab = p.trabajos.reduce((s, x) => s + x.horas, 0)
  const imp = p.improductivas.reduce((s, x) => s + x.horas, 0)
  if (p.horasDisponibles < 0 || trab < 0 || imp < 0 || p.horasMantencion < 0 || p.combustible < 0) return 'Las horas y el combustible no pueden ser negativos.'
  if (trab + imp > p.horasDisponibles + 1e-6) return 'Trabajadas + improductivas no pueden superar las horas disponibles.'
  if (p.horometroFinal < p.horometroInicial) return 'El horómetro final no puede ser menor que el inicial.'
  if (p.horometroFinal - p.horometroInicial < trab - 0.5) return 'El horómetro marca menos horas que las trabajadas.'
  return null
}

/** Costo real del parte por partida (al validarse). */
export function costoParte(p: ParteMaquinaria, e: Equipo): { partidaId: string; horas: number; monto: number }[] {
  const trab = horasTrabajadas(p)
  if (trab <= 0) return []
  return p.trabajos.filter((x) => x.horas > 0).map((x) => ({
    partidaId: x.partidaId,
    horas: x.horas,
    monto: Math.round(e.tarifa.modalidad === 'hora' ? x.horas * e.tarifa.monto : (costoDia(e) * x.horas) / trab),
  }))
}

export type AccionParte = 'validar' | 'corregir'
export function accionesParte(p: ParteMaquinaria, t: Dia, rol: Rol): AccionParte[] {
  const e = estadoParte(p, t)
  if (!puedeValidarParte(rol) || !e) return []
  return e === 'validado' ? [] : ['validar', 'corregir']
}

// ───────────────────────── Indicadores KMQ ─────────────────────────

export interface IndicadoresEquipo {
  partes: number
  disponibles: number
  trabajadas: number
  improductivas: number
  mantencion: number
  /** KMQ-01 */
  utilizacion: number | null
  /** KMQ-02 (total y por causa) */
  improductividad: number | null
  porCausa: { causa: CausaImproductiva; horas: number }[]
  /** KMQ-03: costo hora real vs presupuestado − 1. */
  costoHoraReal: number | null
  desvioCostoHora: number | null
  /** KMQ-04: l/h y su desvío contra el estándar. */
  consumo: number | null
  desvioConsumo: number | null
  /** KMQ-05 */
  disponibilidad: number | null
  /** KMQ-06 */
  mantencionesEnFecha: number | null
  proximaMantencion?: { descripcion: string; programada: Dia }
  /** Costo de las horas ociosas (equipos de costo fijo). */
  costoOcioso: number
  /** RULE-206: causa repetida al menos 3 días seguidos. */
  causaRepetida: CausaImproductiva | null
}

export function indicadoresEquipo(e: Equipo, partes: ParteMaquinaria[], t: Dia, ventana = VENTANA): IndicadoresEquipo {
  const ps = partes.filter((p) => p.equipoId === e.id && p.fecha <= t && p.fecha > t - ventana && estadoParte(p, t) != null).sort((a, b) => a.fecha - b.fecha)
  const disp = ps.reduce((s, p) => s + p.horasDisponibles, 0)
  const trab = ps.reduce((s, p) => s + horasTrabajadas(p), 0)
  const imp = ps.reduce((s, p) => s + horasImproductivas(p), 0)
  const mant = ps.reduce((s, p) => s + p.horasMantencion, 0)
  const litros = ps.reduce((s, p) => s + p.combustible, 0)
  const causas = new Map<CausaImproductiva, number>()
  for (const p of ps) for (const x of p.improductivas) causas.set(x.causa, (causas.get(x.causa) ?? 0) + x.horas)
  const costo = e.tarifa.modalidad === 'hora' ? trab * e.tarifa.monto : ps.length * costoDia(e)
  const costoHora = trab > 0 ? costo / trab : null
  // Causa repetida: la misma causa en los últimos partes de días consecutivos
  let causaRepetida: CausaImproductiva | null = null
  for (let k = 0; k + DIAS_CAUSA_REPETIDA <= ps.length; k++) {
    const tramo = ps.slice(k, k + DIAS_CAUSA_REPETIDA)
    for (const c of Object.keys(CAUSAS_IMPRODUCTIVAS) as CausaImproductiva[]) {
      if (tramo.every((p) => p.improductivas.some((x) => x.causa === c && x.horas > 0))) causaRepetida = c
    }
  }
  const vencidas = e.mantenciones.filter((m) => m.programada <= t)
  const proxima = e.mantenciones.filter((m) => m.realizada == null && m.programada >= t).sort((a, b) => a.programada - b.programada)[0]
  return {
    partes: ps.length,
    disponibles: disp,
    trabajadas: trab,
    improductivas: imp,
    mantencion: mant,
    utilizacion: disp > 0 ? trab / disp : null,
    improductividad: disp > 0 ? imp / disp : null,
    porCausa: [...causas.entries()].map(([causa, horas]) => ({ causa, horas })).sort((a, b) => b.horas - a.horas),
    costoHoraReal: costoHora,
    desvioCostoHora: costoHora != null && e.costoHoraPresupuesto ? costoHora / e.costoHoraPresupuesto - 1 : null,
    consumo: trab > 0 ? litros / trab : null,
    desvioConsumo: trab > 0 && e.consumoEstandar ? litros / trab / e.consumoEstandar - 1 : null,
    disponibilidad: disp + mant > 0 ? disp / (disp + mant) : null,
    mantencionesEnFecha: vencidas.length ? vencidas.filter((m) => m.realizada != null && m.realizada <= m.programada).length / vencidas.length : null,
    proximaMantencion: proxima ? { descripcion: proxima.descripcion, programada: proxima.programada } : undefined,
    costoOcioso: costoFijo(e) && disp > 0 ? Math.round((costo * Math.max(0, disp - trab)) / disp) : 0,
    causaRepetida,
  }
}

/** KMQ-07: rendimiento del equipo en una partida (unidades por hora) vs el del presupuesto. */
export function rendimientoEquipo(partes: ParteMaquinaria[], equipoId: string, p: Partida, cantidadEjecutada: number, t: Dia) {
  const horas = partes.filter((x) => x.equipoId === equipoId && x.fecha <= t && estadoParte(x, t) === 'validado').reduce((s, x) => s + x.trabajos.filter((y) => y.partidaId === p.id).reduce((a, y) => a + y.horas, 0), 0)
  const cpu = p.recursos.find((r) => r.tipo === 'EQ')?.cantPorUnidad
  return { horas, real: horas > 0 ? cantidadEjecutada / horas : null, presupuesto: cpu ? 1 / cpu : null }
}

export const equiposDeObra = (equipos: Equipo[], obraId: string, t: Dia) => equipos.filter((e) => e.obraId === obraId && e.asignado <= t && (e.liberado == null || e.liberado > t))
