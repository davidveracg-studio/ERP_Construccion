// Seguridad y salud en el trabajo (v1.3: 08 dominio 15, 10 §18, 12 RULE-801/802/803/804, 14 KSE).
// Gestión preventiva (charlas, ART de tareas críticas, inspecciones, observaciones) separada de los
// resultados (incidentes con investigación, medidas correctivas, IF, IG, accidentabilidad). El RDO no
// se envía sin la charla del día (RULE-801) ni con avance en una tarea crítica sin ART (RULE-803).
import type { Datos } from './datos'
import type { Dia, EstadoIncidente, EstadoSemaforo, Incidente, MedidaCorrectiva, Partida, RDO, Rol, TipoIncidente, TipoTareaCritica } from './types'

export const TAREAS_CRITICAS: Record<TipoTareaCritica, string> = {
  altura: 'Trabajo en altura', excavacion: 'Excavación', izaje: 'Izaje de cargas', caliente: 'Trabajo en caliente', confinado: 'Espacio confinado', electrico: 'Trabajo eléctrico',
}
export const TIPOS_INCIDENTE: Record<TipoIncidente, string> = {
  cuasi: 'Cuasi accidente', sin_tiempo_perdido: 'Accidente sin tiempo perdido', con_tiempo_perdido: 'Accidente con tiempo perdido', grave: 'Accidente grave',
  fatal: 'Accidente fatal', danio_material: 'Daño material', enfermedad: 'Sospecha de enfermedad profesional',
}
export const ESTADOS_INCIDENTE: Record<EstadoIncidente, string> = {
  reportado: 'Reportado', clasificado: 'Clasificado', en_investigacion: 'En investigación', medidas_en_curso: 'Medidas en curso', cerrado: 'Cerrado',
}
export const TONO_INCIDENTE: Record<EstadoIncidente, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  reportado: 'rojo', clasificado: 'ambar', en_investigacion: 'ambar', medidas_en_curso: 'azul', cerrado: 'verde',
}
/** Temas del catálogo de charlas diarias. */
export const TEMAS_CHARLA = [
  'Uso correcto de EPP', 'Trabajo en altura y arnés', 'Orden y aseo en el frente', 'Manejo manual de cargas', 'Riesgo eléctrico en faena',
  'Excavaciones y taludes', 'Izaje y señalero', 'Exposición a radiación UV', 'Herramientas eléctricas portátiles', 'Prevención de caídas a mismo nivel',
]
/** Riesgos y medidas típicas de cada tarea crítica (base del ART). */
export const RIESGOS_TAREA: Record<TipoTareaCritica, { riesgos: string[]; medidas: string[] }> = {
  altura: { riesgos: ['Caída a distinto nivel', 'Caída de objetos'], medidas: ['Arnés con doble cola anclado a línea de vida', 'Barandas y rodapiés en bordes', 'Zona inferior delimitada'] },
  excavacion: { riesgos: ['Derrumbe de talud', 'Caída a la excavación', 'Atropello por maquinaria'], medidas: ['Talud o entibación según estudio', 'Barrera a 1 m del borde', 'Señalero para maquinaria'] },
  izaje: { riesgos: ['Caída de la carga', 'Golpe por carga suspendida'], medidas: ['Plan de izaje y estrobos revisados', 'Señalero certificado', 'Nadie bajo la carga'] },
  caliente: { riesgos: ['Quemaduras', 'Incendio'], medidas: ['Permiso de trabajo en caliente', 'Extintor a mano', 'Retiro de combustibles'] },
  confinado: { riesgos: ['Atmósfera peligrosa', 'Atrapamiento'], medidas: ['Medición de gases', 'Vigía permanente', 'Ventilación forzada'] },
  electrico: { riesgos: ['Contacto eléctrico', 'Arco eléctrico'], medidas: ['Bloqueo y etiquetado (LOTO)', 'Herramientas aisladas', 'Verificación de ausencia de tensión'] },
}

const ACCIDENTE_CTP: TipoIncidente[] = ['con_tiempo_perdido', 'grave', 'fatal']
export const esCTP = (i: Incidente) => ACCIDENTE_CTP.includes(i.tipo)
export const esGrave = (i: Incidente) => i.tipo === 'grave' || i.tipo === 'fatal'
export const estadoIncidente = (i: Incidente, t: Dia): EstadoIncidente | null => (i.creado > t ? null : i.historial.filter((h) => h.fecha <= t).at(-1)?.estado ?? 'reportado')
export const medidaVencida = (m: MedidaCorrectiva, t: Dia) => m.creado <= t && !(m.cumplida && m.cumplida.fecha <= t) && m.plazo < t

// --- Permisos (19 §6.6) ---
export const puedeCharla = (rol: Rol) => rol === 'R03' || rol === 'R04' || rol === 'R08'
export const puedeART = (rol: Rol) => rol === 'R03' || rol === 'R04' || rol === 'R08'
export const puedeReportarIncidente = (rol: Rol) => ['R02', 'R03', 'R04', 'R07', 'R08'].includes(rol)
export const puedeGestionarSST = (rol: Rol) => rol === 'R08'
export const puedeObservar = (rol: Rol) => ['R02', 'R03', 'R04', 'R08'].includes(rol)
export const puedeCumplirMedida = (rol: Rol) => ['R02', 'R03', 'R04', 'R08'].includes(rol)
export const puedeMarcarCritica = (rol: Rol) => rol === 'R08' || rol === 'R03'
/** RN-P08: los datos de salud del afectado solo los ven Prevención y Gerencia. */
export const veDatosSalud = (rol: Rol) => rol === 'R08' || rol === 'R01'

export type AccionIncidente = 'clasificar' | 'investigar' | 'medidas' | 'cerrar'
export const ACCIONES_INCIDENTE: Record<AccionIncidente, string> = { clasificar: 'Clasificar', investigar: 'Iniciar investigación', medidas: 'Registrar causas y medidas', cerrar: 'Cerrar' }
export const ESTADO_POR_ACCION_INC: Record<AccionIncidente, EstadoIncidente> = { clasificar: 'clasificado', investigar: 'en_investigacion', medidas: 'medidas_en_curso', cerrar: 'cerrado' }

export function accionesIncidente(i: Incidente, t: Dia, rol: Rol): AccionIncidente[] {
  if (!puedeGestionarSST(rol)) return []
  const e = estadoIncidente(i, t)
  if (e === 'reportado') return ['clasificar']
  // Solo los cuasi accidentes de bajo potencial se cierran sin investigación (10 §18)
  if (e === 'clasificado') return i.tipo === 'cuasi' && i.potencial === 'bajo' ? ['investigar', 'cerrar'] : ['investigar']
  if (e === 'en_investigacion') return ['medidas']
  if (e === 'medidas_en_curso') return ['cerrar']
  return []
}

/** Error que impide la acción o null. */
export function validarAccionIncidente(d: Pick<Datos, 'medidasCorrectivas'>, i: Incidente, accion: AccionIncidente, t: Dia, x: { causas?: string }): string | null {
  const medidas = d.medidasCorrectivas.filter((m) => m.origen.tipo === 'incidente' && m.origen.id === i.id)
  if (accion === 'medidas' && (!(x.causas ?? i.causas)?.trim() || !medidas.length)) return 'Registra las causas y al menos una medida correctiva.'
  if (accion === 'cerrar' && estadoIncidente(i, t) === 'medidas_en_curso' && medidas.some((m) => !m.cumplida)) return 'Todas las medidas deben estar cumplidas con evidencia.'
  if (accion === 'cerrar' && esCTP(i) && !i.protocolo?.diat) return 'Falta registrar la denuncia (DIAT) ante el organismo administrador.'
  if (accion === 'cerrar' && esGrave(i) && !i.protocolo?.reanudacion) return 'Falta la autorización de reanudación de la faena afectada.'
  return null
}

/** RULE-802: pasos pendientes del protocolo legal de un accidente. */
export function pasosPendientes(i: Incidente): string[] {
  const p = i.protocolo ?? {}
  const out: string[] = []
  if (esGrave(i)) {
    if (!p.suspension) out.push('Suspender la faena afectada')
    if (!p.avisoInspeccion) out.push('Avisar a la Inspección del Trabajo')
    if (!p.avisoSeremi) out.push('Avisar a la SEREMI de Salud')
  }
  if (esCTP(i) && !p.diat) out.push('Denuncia DIAT')
  if (esGrave(i) && p.suspension && !p.reanudacion) out.push('Autorización de reanudación')
  return out
}

// --- Controles del RDO ---
export function charlaDelDia(d: Pick<Datos, 'charlasSeguridad'>, obraId: string, cuadrillaId: string, t: Dia) {
  return d.charlasSeguridad.find((c) => c.obraId === obraId && c.fecha === t && (c.cuadrillaId === cuadrillaId || c.cuadrillaId == null))
}
export function artDelDia(d: Pick<Datos, 'arts'>, obraId: string, cuadrillaId: string, partida: Pick<Partida, 'id' | 'tareaCritica'>, t: Dia) {
  return d.arts.find((a) => a.obraId === obraId && a.fecha === t && a.tarea === partida.tareaCritica && (a.cuadrillaId == null || a.cuadrillaId === cuadrillaId) && (a.partidaId == null || a.partidaId === partida.id))
}
/** Partidas críticas con avance o HH en el RDO que no tienen ART del día (RULE-803). */
export function partidasSinART(d: Pick<Datos, 'arts' | 'partidas'>, r: Pick<RDO, 'obraId' | 'cuadrillaId' | 'fecha' | 'avances' | 'hh'>) {
  const ids = new Set([...r.avances.filter((a) => a.cantidad > 0).map((a) => a.partidaId), ...r.hh.filter((h) => h.partidaId && !h.causaNoProductiva && h.trabajadores > 0).map((h) => h.partidaId!)])
  return d.partidas.filter((p) => ids.has(p.id) && p.tareaCritica && !artDelDia(d, r.obraId, r.cuadrillaId, p, r.fecha))
}

// --- Indicadores (14 KSE) ---
export interface IndicadoresSeguridad {
  /** KSE-01 / KSE-02 (30 días) */
  if: number | null
  ig: number | null
  /** KSE-03 / KSE-04 (30 días) */
  accidentabilidad: number | null
  siniestralidad: number | null
  /** KSE-05: cuadrilla-días con charla / cuadrilla-días trabajados (7 días). */
  charlas: number | null
  /** KSE-06: tareas críticas con ART / ejecutadas (7 días). */
  art: number | null
  /** KSE-07: cuasi accidentes por 100 trabajadores (30 días). */
  cuasi: number | null
  /** KSE-08 */
  medidasVencidas: number
  medidasAbiertas: number
  /** KSE-09 */
  diasSinCTP: number
  /** KSE-10: inspecciones realizadas / programadas (30 días). */
  inspecciones: number | null
  /** KSE-11: observaciones (30 días) y % cerradas en plazo. */
  observaciones: number
  obsEnPlazo: number | null
  /** KSE-12 (30 días) */
  ctp: number
  stp: number
  incidentesMes: number
  graveMes: boolean
  hhTrab30: number
  trabProm: number
  incidentesAbiertos: number
  estado: EstadoSemaforo
}

export function indicadoresSeguridad(d: Pick<Datos, 'rdos' | 'cuadrillas' | 'partidas' | 'charlasSeguridad' | 'arts' | 'inspeccionesSeguridad' | 'observacionesPreventivas' | 'incidentes' | 'medidasCorrectivas'>, obraId: string, inicio: Dia, t: Dia): IndicadoresSeguridad {
  const cq = new Map(d.cuadrillas.map((c) => [c.id, c]))
  const rdos = d.rdos.filter((r) => r.obraId === obraId && r.fecha <= t && (r.estado === 'validado' || r.estado === 'enviado'))
  const mes = rdos.filter((r) => r.fecha > t - 30)
  const semana = rdos.filter((r) => r.fecha > t - 7)
  const hhTrab30 = mes.reduce((s, r) => s + r.hh.reduce((x, h) => x + h.trabajadores * (h.horasNormales + h.horasExtra), 0), 0)
  // Trabajadores promedio: dotación de las cuadrillas que reportan, por día trabajado
  const porDia = new Map<Dia, number>()
  for (const r of mes) porDia.set(r.fecha, (porDia.get(r.fecha) ?? 0) + (cq.get(r.cuadrillaId)?.trabajadores ?? 0))
  const trabProm = porDia.size ? [...porDia.values()].reduce((s, x) => s + x, 0) / porDia.size : 0
  const incs = d.incidentes.filter((i) => i.obraId === obraId && i.creado <= t)
  const incMes = incs.filter((i) => i.fecha > t - 30)
  const ctp = incMes.filter(esCTP)
  const dias = ctp.reduce((s, i) => s + (i.diasPerdidos ?? 0), 0)
  const ultimoCTP = Math.max(inicio, ...incs.filter(esCTP).map((i) => i.fecha))
  const conCharla = semana.filter((r) => charlaDelDia(d, obraId, r.cuadrillaId, r.fecha)).length
  let criticas = 0
  let conART = 0
  const partidas = new Map(d.partidas.map((p) => [p.id, p]))
  for (const r of semana) {
    const ids = new Set([...r.avances.filter((a) => a.cantidad > 0).map((a) => a.partidaId), ...r.hh.filter((h) => h.partidaId && !h.causaNoProductiva).map((h) => h.partidaId!)])
    for (const id of ids) {
      const p = partidas.get(id)
      if (!p?.tareaCritica) continue
      criticas++
      if (artDelDia(d, obraId, r.cuadrillaId, p, r.fecha)) conART++
    }
  }
  const medidas = d.medidasCorrectivas.filter((m) => m.obraId === obraId && m.creado <= t)
  const insp = d.inspeccionesSeguridad.filter((i) => i.obraId === obraId && i.programada > t - 30 && i.programada <= t)
  const obs = d.observacionesPreventivas.filter((o) => o.obraId === obraId && o.fecha > t - 30 && o.fecha <= t)
  const insegurasVencibles = obs.filter((o) => !o.segura && (o.plazo < t || (o.cerrada != null && o.cerrada <= t)))
  const charlas = semana.length ? conCharla / semana.length : null
  const art = criticas ? conART / criticas : null
  const preventivos = Math.min(charlas ?? 1, art ?? 1)
  const graveMes = incMes.some(esGrave)
  return {
    if: hhTrab30 > 0 ? (ctp.length * 1_000_000) / hhTrab30 : null,
    ig: hhTrab30 > 0 ? (dias * 1_000_000) / hhTrab30 : null,
    accidentabilidad: trabProm > 0 ? (ctp.length / trabProm) * 100 : null,
    siniestralidad: trabProm > 0 ? (dias / trabProm) * 100 : null,
    charlas,
    art,
    cuasi: trabProm > 0 ? (incMes.filter((i) => i.tipo === 'cuasi').length / trabProm) * 100 : null,
    medidasVencidas: medidas.filter((m) => medidaVencida(m, t)).length,
    medidasAbiertas: medidas.filter((m) => !(m.cumplida && m.cumplida.fecha <= t)).length,
    diasSinCTP: t - ultimoCTP,
    inspecciones: insp.length ? insp.filter((i) => i.realizada && i.realizada.fecha <= t).length / insp.length : null,
    observaciones: obs.length,
    obsEnPlazo: insegurasVencibles.length ? insegurasVencibles.filter((o) => o.cerrada != null && o.cerrada <= Math.min(o.plazo, t)).length / insegurasVencibles.length : null,
    ctp: ctp.length,
    stp: incMes.filter((i) => i.tipo === 'sin_tiempo_perdido').length,
    incidentesMes: incMes.length,
    graveMes,
    hhTrab30,
    trabProm,
    incidentesAbiertos: incs.filter((i) => estadoIncidente(i, t) !== 'cerrado').length,
    // Semáforo (14 §5.3): ≥ 1 CTP o grave → rojo; 0 CTP con preventivos < 95 % → amarillo
    estado: !rdos.length ? 'na' : ctp.length > 0 || graveMes ? 'rojo' : preventivos < 0.95 ? 'amarillo' : 'verde',
  }
}
