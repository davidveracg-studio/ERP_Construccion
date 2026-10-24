// Last Planner (v1.1: 08 Tarea Semanal, 10 §8, 11 TareaSemanal*/RestriccionLiberada, 14 KPL-04, 07 §Ejecución).
// Plan semanal con metas por partida y cuadrilla; una tarea solo se compromete con sus restricciones
// liberadas (las de RFI y submittal se liberan solas al responderse o aprobarse). Al cierre de la
// semana se mide el PPC y se registran las causas de no cumplimiento; el avance logrado se toma de
// los RDO de la semana.
import { estadoKpi, UMBRALES_DOC14 } from './umbrales'
import type { CalcObra } from './evm'
import { estadoRFI, estadoSubmittal, partidasCriticas } from './documental'
import { diaSemana, fmtFecha } from './fechas'
import type { CausaNoCumplimiento, Dia, EstadoSemaforo, EstadoTarea, RDO, RFI, Restriccion, Rol, Submittal, TareaSemanal, TipoRestriccion } from './types'

export const ESTADOS_TAREA: Record<EstadoTarea, string> = {
  propuesta: 'Propuesta', comprometida: 'Comprometida', en_ejecucion: 'En ejecución', cumplida: 'Cumplida', no_cumplida: 'No cumplida',
}
export const TONO_TAREA: Record<EstadoTarea, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  propuesta: 'gris', comprometida: 'azul', en_ejecucion: 'ambar', cumplida: 'verde', no_cumplida: 'rojo',
}
export const CAUSAS_CNC: Record<CausaNoCumplimiento, string> = {
  material: 'Material', mano_obra: 'Mano de obra', equipo: 'Equipo', clima: 'Clima', diseno: 'Diseño / información',
  subcontratista: 'Subcontratista', tarea_previa: 'Tarea previa', mandante: 'Mandante',
}
export const TIPOS_RESTRICCION: Record<TipoRestriccion, string> = {
  material: 'Material', plano: 'Plano', rfi: 'RFI', submittal: 'Submittal', equipo: 'Equipo', permiso: 'Permiso', mano_obra: 'Mano de obra', otra: 'Otra',
}

/** Meta de PPC (14 KPL-04): verde ≥ 80 %, rojo < 60 %. */
export const META_PPC = UMBRALES_DOC14['KPL-04'].objetivo!
export const PPC_ROJO = UMBRALES_DOC14['KPL-04'].critico
/** RULE-113: bajo este PPC la semana se alerta (umbral ámbar de KPL-04). */
export const PPC_ALERTA = UMBRALES_DOC14['KPL-04'].alerta
/** RULE-114 / 07 §Ejecución: restricción sin liberar a 48 h del inicio. */
export const HORAS_AVISO_RESTRICCION = 48

export const lunesDe = (t: Dia) => t - ((diaSemana(t) + 6) % 7)
/** La semana se considera cerrada desde el sábado. */
export const semanaCerrada = (lunes: Dia, t: Dia) => t >= lunes + 5

export const estadoTarea = (x: TareaSemanal, t: Dia): EstadoTarea | null =>
  x.creado > t ? null : x.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'propuesta'

export const fueComprometida = (x: TareaSemanal, t: Dia) => x.historial.some((p) => p.estado === 'comprometida' && p.fecha <= t)

// ───────────────────────── Restricciones ─────────────────────────

export interface Contexto { rfis: RFI[]; submittals: Submittal[] }

/** Día en que se liberó la restricción (manual, o al responderse el RFI / aprobarse el submittal). */
export function liberacion(r: Restriccion, ctx: Contexto, t: Dia): Dia | null {
  if (r.liberada != null && r.liberada <= t) return r.liberada
  if (r.rfiId) {
    const rfi = ctx.rfis.find((x) => x.id === r.rfiId)
    const paso = rfi?.historial.find((p) => (p.estado === 'respondido' || p.estado === 'cerrado') && p.fecha <= t)
    if (rfi && paso && ['respondido', 'cerrado'].includes(estadoRFI(rfi, t) ?? '')) return paso.fecha
  }
  if (r.submittalId) {
    const s = ctx.submittals.find((x) => x.id === r.submittalId)
    const e = s ? estadoSubmittal(s, t) : null
    if (s && (e === 'aprobado' || e === 'aprobado_con_observaciones')) return s.historial.filter((p) => p.fecha <= t).at(-1)!.fecha
  }
  return null
}

export const restriccionesAbiertas = (x: TareaSemanal, ctx: Contexto, t: Dia) => x.restricciones.filter((r) => liberacion(r, ctx, t) == null)

/** RULE-114: tarea por iniciar en ≤ 48 h con alguna restricción abierta. */
export function restriccionUrgente(x: TareaSemanal, ctx: Contexto, t: Dia) {
  const e = estadoTarea(x, t)
  return (e === 'propuesta' || e === 'comprometida') && x.inicio >= t && x.inicio - t <= HORAS_AVISO_RESTRICCION / 24 && restriccionesAbiertas(x, ctx, t).length > 0
}

// ───────────────────────── Avance desde los RDO ─────────────────────────

/** Cantidad reportada en los RDO (no rechazados) de la partida durante la tarea, hasta t. */
export function avanceReportado(x: TareaSemanal, rdos: RDO[], t: Dia): number | null {
  if (!x.partidaId) return null
  const hasta = Math.min(x.fin, t)
  let s = 0
  for (const r of rdos) {
    if (r.obraId !== x.obraId || r.fecha < x.inicio || r.fecha > hasta || r.estado === 'rechazado') continue
    if (x.cuadrillaId && r.cuadrillaId !== x.cuadrillaId) continue
    for (const a of r.avances) if (a.partidaId === x.partidaId) s += a.cantidad
  }
  return Math.round(s * 100) / 100
}

// ───────────────────────── Transiciones (10 §8) ─────────────────────────

export type AccionTarea = 'comprometer' | 'iniciar' | 'cumplir' | 'no_cumplir'
export const ACCIONES_TAREA: Record<AccionTarea, string> = { comprometer: 'Comprometer', iniciar: 'Iniciar', cumplir: 'Cumplida', no_cumplir: 'No cumplida' }

const PERMISOS: Partial<Record<EstadoTarea, Partial<Record<AccionTarea, Rol[]>>>> = {
  propuesta: { comprometer: ['R02', 'R03'] },
  comprometida: { iniciar: ['R02', 'R03', 'R04'], cumplir: ['R02', 'R03'], no_cumplir: ['R02', 'R03'] },
  en_ejecucion: { cumplir: ['R02', 'R03'], no_cumplir: ['R02', 'R03'] },
}
/** Planifican R02 y R03 (19: R03 CRUDXE, R02 RUX); restricciones también R05. */
export const puedePlanificar = (rol: Rol) => rol === 'R02' || rol === 'R03'
export const puedeGestionarRestricciones = (rol: Rol) => rol === 'R02' || rol === 'R03' || rol === 'R05'

export function accionesTarea(x: TareaSemanal, t: Dia, rol: Rol): AccionTarea[] {
  const e = estadoTarea(x, t)
  if (!e) return []
  // Antes del inicio solo se puede comprometer
  return (Object.entries(PERMISOS[e] ?? {}) as [AccionTarea, Rol[]][])
    .filter(([a, roles]) => roles.includes(rol) && (a === 'comprometer' || t >= x.inicio)).map(([a]) => a)
}

export function aplicarAccionTarea(
  x: TareaSemanal, accion: AccionTarea, d: { fecha: Dia; autor: string; ctx: Contexto; logrado?: number; causa?: CausaNoCumplimiento; nota?: string },
): TareaSemanal {
  const e = estadoTarea(x, d.fecha)
  if (!e || !(accion in (PERMISOS[e] ?? {}))) throw new Error(`No se puede marcar ${ACCIONES_TAREA[accion].toLowerCase()} una tarea ${e ? ESTADOS_TAREA[e].toLowerCase() : 'inexistente'}.`)
  if (accion !== 'comprometer' && d.fecha < x.inicio) throw new Error(`La tarea parte el ${fmtFecha(x.inicio)}.`)
  const paso = (estado: EstadoTarea) => [...x.historial, { fecha: d.fecha, estado, por: d.autor, ...(d.nota?.trim() ? { texto: d.nota.trim() } : {}) }]
  switch (accion) {
    case 'comprometer': {
      const abiertas = restriccionesAbiertas(x, d.ctx, d.fecha)
      if (abiertas.length) throw new Error(`Tiene ${abiertas.length} restricción(es) sin liberar: no se puede comprometer.`)
      if (!(x.meta > 0)) throw new Error('Indica la meta de la semana.')
      return { ...x, historial: paso('comprometida') }
    }
    case 'iniciar':
      return { ...x, historial: paso('en_ejecucion') }
    case 'cumplir':
      if (d.logrado == null || d.logrado < x.meta) throw new Error('Para marcarla cumplida, lo logrado debe alcanzar la meta.')
      return { ...x, logrado: d.logrado, historial: paso('cumplida') }
    case 'no_cumplir':
      if (!d.causa) throw new Error('Indica la causa de no cumplimiento.')
      return { ...x, logrado: d.logrado, causa: d.causa, historial: paso('no_cumplida') }
  }
}

/** Nueva tarea para la semana siguiente con lo que faltó (una no cumplida es terminal). */
export function replanificar(x: TareaSemanal, id: string, fecha: Dia, autor: string): TareaSemanal {
  const lunes = lunesDe(x.semana + 7)
  return {
    ...x, id, semana: lunes, inicio: lunes, fin: lunes + 4, meta: Math.max(0, Math.round((x.meta - (x.logrado ?? 0)) * 100) / 100),
    restricciones: [], historial: [], logrado: undefined, causa: undefined, reemplazaA: x.id, creado: fecha, creadoPor: autor,
  }
}

// ───────────────────────── PPC e indicadores (KPL-04) ─────────────────────────

export interface SemanaPPC { lunes: Dia; comprometidas: number; cumplidas: number; ppc: number | null; cerrada: boolean }

export function ppcSemana(tareas: TareaSemanal[], lunes: Dia, t: Dia): SemanaPPC {
  const comp = tareas.filter((x) => x.semana === lunes && fueComprometida(x, t))
  const cumplidas = comp.filter((x) => estadoTarea(x, t) === 'cumplida').length
  return { lunes, comprometidas: comp.length, cumplidas, ppc: comp.length ? cumplidas / comp.length : null, cerrada: semanaCerrada(lunes, t) }
}

export const estadoPPC = (ppc: number | null): EstadoSemaforo => estadoKpi(null, 'KPL-04', ppc)

export interface IndicadoresLP {
  /** KPL-04: PPC de la última semana cerrada. */
  ultima: SemanaPPC | null
  serie: SemanaPPC[]
  /** PPC acumulado de las semanas de la serie. */
  ppcPromedio: number | null
  causas: { causa: CausaNoCumplimiento; n: number }[]
  restriccionesAbiertas: number
  restriccionesVencidas: number
  urgentes: number
  estado: EstadoSemaforo
}

export function indicadoresLP(tareas: TareaSemanal[], ctx: Contexto, t: Dia, semanas = 8): IndicadoresLP {
  const actual = lunesDe(t)
  const serie = Array.from({ length: semanas }, (_, k) => ppcSemana(tareas, actual - 7 * (semanas - 1 - k), t)).filter((s) => s.comprometidas > 0)
  const cerradas = serie.filter((s) => s.cerrada)
  const ultima = cerradas.at(-1) ?? null
  const comp = cerradas.reduce((s, x) => s + x.comprometidas, 0)
  const desde = actual - 7 * (semanas - 1)
  const conteo = new Map<CausaNoCumplimiento, number>()
  for (const x of tareas) if (x.semana >= desde && estadoTarea(x, t) === 'no_cumplida' && x.causa) conteo.set(x.causa, (conteo.get(x.causa) ?? 0) + 1)
  const vivas = tareas.filter((x) => ['propuesta', 'comprometida', 'en_ejecucion'].includes(estadoTarea(x, t) ?? ''))
  const abiertas = vivas.flatMap((x) => restriccionesAbiertas(x, ctx, t))
  return {
    ultima,
    serie,
    ppcPromedio: comp ? cerradas.reduce((s, x) => s + x.cumplidas, 0) / comp : null,
    causas: [...conteo.entries()].map(([causa, n]) => ({ causa, n })).sort((a, b) => b.n - a.n),
    restriccionesAbiertas: abiertas.length,
    restriccionesVencidas: abiertas.filter((r) => r.fechaCompromiso < t).length,
    urgentes: tareas.filter((x) => restriccionUrgente(x, ctx, t)).length,
    estado: estadoPPC(ultima?.ppc ?? null),
  }
}

export const tareaCritica = (x: TareaSemanal, c: CalcObra) => !!x.partidaId && partidasCriticas(c).has(x.partidaId)
