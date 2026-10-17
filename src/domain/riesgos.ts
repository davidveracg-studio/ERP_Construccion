// Registro de riesgos de la obra (v1.1: 08 Riesgo, 10 §25, 12 RULE-610/611, 14 KRI-01…06, RF-CTL-08).
// Ciclo: identificado → en análisis (responsable) → abierto (evaluado) ⇄ en mitigación (plan) →
// materializado o cerrado. El estado vigente es el último paso del historial a la fecha, igual que
// en EP y órdenes de cambio; la exposición sale de la última evaluación (probabilidad × impacto).
import type { CalcObra } from './evm'
import type { AccionMitigacion, CategoriaRiesgo, Config, Dia, Escala5, EstadoRiesgo, EstadoSemaforo, EvaluacionRiesgo, Riesgo, Rol } from './types'

export const ESTADOS_RIESGO: Record<EstadoRiesgo, string> = {
  identificado: 'Identificado', en_analisis: 'En análisis', abierto: 'Abierto', en_mitigacion: 'En mitigación', materializado: 'Materializado', cerrado: 'Cerrado',
}
export const TONO_ESTADO_RIESGO: Record<EstadoRiesgo, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  identificado: 'gris', en_analisis: 'gris', abierto: 'ambar', en_mitigacion: 'azul', materializado: 'rojo', cerrado: 'verde',
}

export const CATEGORIAS_RIESGO: Record<CategoriaRiesgo, string> = {
  plazo: 'Plazo', costo: 'Costo', tecnico: 'Técnico / diseño', abastecimiento: 'Abastecimiento', subcontrato: 'Subcontrato',
  seguridad: 'Seguridad', contractual: 'Contractual', externo: 'Externo (clima, permisos)',
}

export const ESCALA: Record<Escala5, string> = { 1: 'Muy baja', 2: 'Baja', 3: 'Media', 4: 'Alta', 5: 'Muy alta' }
/** Probabilidad de ocurrencia que representa cada punto de la escala (para la exposición económica). */
export const PROBABILIDAD_PCT: Record<Escala5, number> = { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.7, 5: 0.9 }

export type NivelRiesgo = 'bajo' | 'medio' | 'alto' | 'critico'
export const NIVELES: Record<NivelRiesgo, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', critico: 'Crítico' }
export const TONO_NIVEL: Record<NivelRiesgo, 'verde' | 'ambar' | 'rojo' | 'gris'> = { bajo: 'verde', medio: 'ambar', alto: 'rojo', critico: 'rojo' }

/** Matriz 5×5: probabilidad × impacto → nivel. */
export function nivelRiesgo(p: Escala5, i: Escala5): NivelRiesgo {
  const s = p * i
  return s >= 15 ? 'critico' : s >= 10 ? 'alto' : s >= 5 ? 'medio' : 'bajo'
}

/** RULE-610: días que tiene un riesgo crítico para registrar su plan de mitigación. */
export const DIAS_PLAN_CRITICO = 3
/** RULE-610: un riesgo Alto también exige plan si su impacto supera este monto ("X UF"). */
export const MONTO_ALTO_EXIGE_PLAN = 25_000_000

const ACTIVOS: EstadoRiesgo[] = ['identificado', 'en_analisis', 'abierto', 'en_mitigacion']
/** Abierto o en mitigación: evaluado y vigente (los que suman exposición). */
const EVALUADOS: EstadoRiesgo[] = ['abierto', 'en_mitigacion']

export function estadoRiesgo(r: Riesgo, t: Dia): EstadoRiesgo | null {
  if (r.creado > t) return null
  return r.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'identificado'
}

export const riesgoActivo = (r: Riesgo, t: Dia) => { const e = estadoRiesgo(r, t); return !!e && ACTIVOS.includes(e) }

export const evaluacionVigente = (r: Riesgo, t: Dia): EvaluacionRiesgo | undefined => r.evaluaciones.filter((e) => e.fecha <= t).at(-1)

export interface Exposicion {
  nivel: NivelRiesgo
  puntaje: number
  /** prob.% × impacto en dinero. */
  monto: number
  /** prob.% × impacto en días. */
  dias: number
}

export function exposicionRiesgo(r: Riesgo, t: Dia): Exposicion | null {
  const e = evaluacionVigente(r, t)
  if (!e) return null
  const pr = PROBABILIDAD_PCT[e.probabilidad]
  return { nivel: nivelRiesgo(e.probabilidad, e.impacto), puntaje: e.probabilidad * e.impacto, monto: Math.round(pr * e.impactoMonto), dias: Math.round(pr * e.impactoDias * 10) / 10 }
}

export const accionesPlan = (r: Riesgo, t: Dia) => r.plan.filter((a) => a.creada <= t)
export const tienePlan = (r: Riesgo, t: Dia) => accionesPlan(r, t).length > 0
export const accionVencida = (a: AccionMitigacion, t: Dia) => (a.cumplida == null || a.cumplida > t) && a.fecha < t

/** RULE-611: abierto o en mitigación con la fecha de revisión superada (o sin fecha). */
export function revisionVencida(r: Riesgo, t: Dia) {
  const e = estadoRiesgo(r, t)
  return !!e && EVALUADOS.includes(e) && (r.fechaRevision == null || r.fechaRevision < t)
}

/** RULE-610: crítico (o alto sobre el monto) evaluado hace ≥ 3 días y todavía sin plan (ver diasSinPlan). */
const evaluacionExigePlan = (ev: EvaluacionRiesgo) => {
  const n = nivelRiesgo(ev.probabilidad, ev.impacto)
  return n === 'critico' || (n === 'alto' && ev.impactoMonto > MONTO_ALTO_EXIGE_PLAN)
}

/** El riesgo exige plan de mitigación y no lo tiene. */
export function exigePlan(r: Riesgo, t: Dia) {
  const ev = evaluacionVigente(r, t)
  return estadoRiesgo(r, t) === 'abierto' && !!ev && evaluacionExigePlan(ev) && !tienePlan(r, t)
}

/** Días desde que el riesgo pasó a exigir plan (desde la última racha de evaluaciones que lo exigen). */
export function diasSinPlan(r: Riesgo, t: Dia) {
  if (!exigePlan(r, t)) return 0
  const evs = r.evaluaciones.filter((e) => e.fecha <= t)
  let desde = evs.at(-1)!.fecha
  for (let k = evs.length - 1; k >= 0 && evaluacionExigePlan(evs[k]); k--) desde = evs[k].fecha
  return t - desde
}

// ───────────────────────── Transiciones (10 §25) ─────────────────────────

export type AccionRiesgo = 'asignar' | 'evaluar' | 'registrar_plan' | 'cumplir_accion' | 'reabrir' | 'materializar' | 'cerrar'

export const ACCIONES_RIESGO: Record<AccionRiesgo, string> = {
  asignar: 'Asignar responsable', evaluar: 'Evaluar', registrar_plan: 'Agregar acción de mitigación', cumplir_accion: 'Cumplir acción',
  reabrir: 'Volver a abierto', materializar: 'Marcar materializado', cerrar: 'Cerrar',
}

const GESTION: Rol[] = ['R01', 'R02', 'R03', 'R05']
const ADMIN: Rol[] = ['R01', 'R02']
const PERMISOS: Partial<Record<EstadoRiesgo, Partial<Record<AccionRiesgo, Rol[]>>>> = {
  identificado: { asignar: GESTION },
  en_analisis: { asignar: GESTION, evaluar: GESTION },
  abierto: { evaluar: GESTION, registrar_plan: GESTION, materializar: ADMIN, cerrar: ADMIN },
  en_mitigacion: { evaluar: GESTION, registrar_plan: GESTION, cumplir_accion: GESTION, reabrir: GESTION, materializar: ADMIN, cerrar: ADMIN },
  materializado: { cerrar: ADMIN },
}

/** Quién puede crear riesgos (19: R01/R02/R03/R05). */
export const puedeCrearRiesgo = (rol: Rol) => GESTION.includes(rol)

export function accionesRiesgo(r: Riesgo, t: Dia, rol: Rol): AccionRiesgo[] {
  const e = estadoRiesgo(r, t)
  if (!e) return []
  return (Object.entries(PERMISOS[e] ?? {}) as [AccionRiesgo, Rol[]][]).filter(([, roles]) => roles.includes(rol)).map(([a]) => a)
}

export interface DatosAccionRiesgo {
  fecha: Dia
  autor: string
  nota?: string
  responsable?: string
  evaluacion?: Omit<EvaluacionRiesgo, 'fecha' | 'autor'>
  fechaRevision?: Dia
  accion?: Pick<AccionMitigacion, 'id' | 'descripcion' | 'responsable' | 'fecha'>
  accionId?: string
  impactoReal?: { monto: number; dias: number }
}

/** Aplica una acción al riesgo. Lanza un error con el motivo si no corresponde. */
export function aplicarAccionRiesgo(r: Riesgo, accion: AccionRiesgo, x: DatosAccionRiesgo): Riesgo {
  const e = estadoRiesgo(r, x.fecha)
  if (!e || !(accion in (PERMISOS[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_RIESGO[accion].toLowerCase()} un riesgo ${e ? ESTADOS_RIESGO[e].toLowerCase() : 'inexistente'}.`)
  const paso = (estado: EstadoRiesgo, nota = x.nota) => [...r.historial, { fecha: x.fecha, estado, por: x.autor, ...(nota?.trim() ? { nota: nota.trim() } : {}) }]
  const revision = () => {
    if (x.fechaRevision == null) throw new Error('Indica la fecha de la próxima revisión (RULE-611).')
    if (x.fechaRevision <= x.fecha) throw new Error('La próxima revisión debe ser posterior a hoy.')
    return x.fechaRevision
  }
  switch (accion) {
    case 'asignar':
      if (!x.responsable?.trim()) throw new Error('Indica el responsable del riesgo.')
      return { ...r, responsable: x.responsable.trim(), historial: e === 'identificado' ? paso('en_analisis') : r.historial }
    case 'evaluar': {
      const ev = x.evaluacion
      if (!ev) throw new Error('Falta la evaluación.')
      if (ev.impactoMonto < 0 || ev.impactoDias < 0) throw new Error('El impacto no puede ser negativo.')
      if (ev.impactoMonto === 0 && ev.impactoDias === 0) throw new Error('Estima el impacto en dinero, en días o en ambos.')
      return {
        ...r, evaluaciones: [...r.evaluaciones, { ...ev, fecha: x.fecha, autor: x.autor }], fechaRevision: revision(),
        historial: e === 'en_analisis' ? paso('abierto') : r.historial,
      }
    }
    case 'registrar_plan': {
      const a = x.accion
      if (!a?.descripcion.trim() || !a.responsable.trim()) throw new Error('La acción necesita descripción y responsable.')
      if (a.fecha < x.fecha) throw new Error('La fecha de la acción no puede estar en el pasado.')
      return {
        ...r, plan: [...r.plan, { ...a, descripcion: a.descripcion.trim(), responsable: a.responsable.trim(), creada: x.fecha }],
        fechaRevision: x.fechaRevision != null ? revision() : r.fechaRevision,
        historial: e === 'abierto' ? paso('en_mitigacion') : r.historial,
      }
    }
    case 'cumplir_accion':
      if (!r.plan.some((a) => a.id === x.accionId && a.cumplida == null)) throw new Error('La acción no existe o ya está cumplida.')
      return { ...r, plan: r.plan.map((a) => (a.id === x.accionId ? { ...a, cumplida: x.fecha } : a)) }
    case 'reabrir':
      if (!x.nota?.trim()) throw new Error('Indica por qué el plan no es efectivo.')
      return { ...r, historial: paso('abierto') }
    case 'materializar':
      return { ...r, impactoReal: x.impactoReal ?? r.impactoReal, historial: paso('materializado') }
    case 'cerrar':
      if (e === 'materializado') {
        if (!x.impactoReal) throw new Error('Registra el impacto real (dinero y días) para cerrarlo.')
        return { ...r, impactoReal: x.impactoReal, historial: paso('cerrado') }
      }
      if (!x.nota?.trim()) throw new Error('Indica el motivo del cierre.')
      return { ...r, historial: paso('cerrado') }
  }
}

// ───────────────────────── Indicadores KRI (14) ─────────────────────────

export interface IndicadoresRiesgo {
  /** KRI-01: identificados, en análisis, abiertos o en mitigación. */
  abiertos: number
  /** KRI-02 */
  criticos: number
  criticosSinPlan: number
  /** KRI-03 */
  vencidos: number
  /** KRI-04: Σ prob × impacto en dinero de los evaluados vigentes. */
  exposicionMonto: number
  /** Contingencia disponible: margen proyectado por sobre el mínimo de la empresa. */
  contingencia: number
  /** KRI-05: Σ prob × impacto en días. */
  exposicionDias: number
  /** Holgura al término contractual (días de adelanto proyectado). */
  holgura: number
  /** KRI-06: materializados / cerrados. */
  materializados: number
  cerrados: number
  tasaMaterializacion: number | null
  impactoRealMonto: number
  impactoEstimadoMaterializados: number
  estado: { kri02: EstadoSemaforo; kri03: EstadoSemaforo; kri04: EstadoSemaforo; kri05: EstadoSemaforo; kri06: EstadoSemaforo }
}

export function indicadoresRiesgo(riesgos: Riesgo[], c: CalcObra, config: Config, t: Dia): IndicadoresRiesgo {
  const conEstado = riesgos.map((r) => ({ r, e: estadoRiesgo(r, t), x: exposicionRiesgo(r, t) })).filter((y) => y.e)
  const evaluados = conEstado.filter((y) => EVALUADOS.includes(y.e!) && y.x)
  const criticos = evaluados.filter((y) => y.x!.nivel === 'critico')
  const criticosSinPlan = criticos.filter((y) => !tienePlan(y.r, t)).length
  const vencidos = conEstado.filter((y) => revisionVencida(y.r, t)).length
  const exposicionMonto = evaluados.reduce((s, y) => s + y.x!.monto, 0)
  const exposicionDias = Math.round(evaluados.reduce((s, y) => s + y.x!.dias, 0) * 10) / 10
  const contingencia = Math.max(0, Math.round(c.venta * (c.margenProyectado - config.umbrales.margenMinimo)))
  const holgura = -c.atrasoProyectado
  // Materialización: un riesgo cerrado cuenta como materializado si pasó por ese estado
  const cerradosOMat = conEstado.filter((y) => y.e === 'cerrado' || y.e === 'materializado')
  const pasoPorMat = (r: Riesgo) => r.historial.some((p) => p.estado === 'materializado' && p.fecha <= t)
  const materializados = cerradosOMat.filter((y) => pasoPorMat(y.r))
  const tasa = cerradosOMat.length ? materializados.length / cerradosOMat.length : null
  return {
    abiertos: conEstado.filter((y) => ACTIVOS.includes(y.e!)).length,
    criticos: criticos.length,
    criticosSinPlan,
    vencidos,
    exposicionMonto,
    contingencia,
    exposicionDias,
    holgura,
    materializados: materializados.length,
    cerrados: cerradosOMat.length,
    tasaMaterializacion: tasa,
    impactoRealMonto: materializados.reduce((s, y) => s + (y.r.impactoReal?.monto ?? 0), 0),
    impactoEstimadoMaterializados: materializados.reduce((s, y) => s + (y.r.evaluaciones.at(-1)?.impactoMonto ?? 0), 0),
    estado: {
      kri02: criticosSinPlan ? 'rojo' : criticos.length ? 'amarillo' : 'verde',
      kri03: vencidos >= 3 ? 'rojo' : vencidos ? 'amarillo' : 'verde',
      kri04: exposicionMonto > contingencia ? 'rojo' : exposicionMonto > contingencia * 0.5 ? 'amarillo' : 'verde',
      kri05: exposicionDias > holgura + 10 ? 'rojo' : exposicionDias >= holgura && exposicionDias > 0 ? 'amarillo' : 'verde',
      kri06: tasa == null ? 'na' : tasa > 0.5 ? 'rojo' : tasa > 0.3 ? 'amarillo' : 'verde',
    },
  }
}
