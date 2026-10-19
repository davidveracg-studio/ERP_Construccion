// Calidad (v1.3: 08 dominio 14, 10 §11 y §22, 12 RULE-103/104/111/112, 14 KCA).
// Protocolos por partida con checklist; los de liberación bloquean el avance de la partida hasta
// aprobarse y los obligatorios condicionan la recepción provisoria. Un rechazo abre una no
// conformidad (NCR) y un protocolo de reinspección. Las HH de corrección se registran en el RDO con
// marca de retrabajo: alimentan el rework rate y el costo de no calidad.
import type { Datos } from './datos'
import type { Dia, EstadoNCR, EstadoProtocolo, EstadoSemaforo, NoConformidad, ProtocoloCalidad, RDO, Rol } from './types'

export const ESTADOS_PROTOCOLO: Record<EstadoProtocolo, string> = {
  pendiente: 'Pendiente', en_inspeccion: 'En inspección', aprobado: 'Aprobado', rechazado: 'Rechazado', aprobado_ito: 'Visado ITO',
}
export const TONO_PROTOCOLO: Record<EstadoProtocolo, 'gris' | 'azul' | 'verde' | 'rojo'> = {
  pendiente: 'gris', en_inspeccion: 'azul', aprobado: 'verde', rechazado: 'rojo', aprobado_ito: 'verde',
}
export const ESTADOS_NCR: Record<EstadoNCR, string> = {
  abierta: 'Abierta', en_correccion: 'En corrección', verificada: 'Verificada', cerrada: 'Cerrada', anulada: 'Anulada',
}
export const TONO_NCR: Record<EstadoNCR, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  abierta: 'rojo', en_correccion: 'ambar', verificada: 'azul', cerrada: 'verde', anulada: 'gris',
}
export const ORIGENES_NCR: Record<NoConformidad['origen'], string> = { protocolo: 'Protocolo rechazado', inspeccion: 'Inspección de calidad', ito: 'Inspección ITO', hallazgo: 'Hallazgo en terreno' }

/** Plazo de corrección por defecto de una NCR (días). */
export const PLAZO_NCR = 7

const ultimo = <E extends string>(h: { fecha: Dia; estado: E }[], t: Dia): E | null => h.filter((x) => x.fecha <= t).at(-1)?.estado ?? null

export const estadoProtocolo = (p: ProtocoloCalidad, t: Dia): EstadoProtocolo | null => (p.creado > t ? null : ultimo(p.historial, t) ?? 'pendiente')
export const estadoNCR = (n: NoConformidad, t: Dia): EstadoNCR | null => (n.creado > t ? null : ultimo(n.historial, t) ?? 'abierta')
export const protocoloAprobado = (e: EstadoProtocolo | null) => e === 'aprobado' || e === 'aprobado_ito'
export const ncrAbierta = (e: EstadoNCR | null) => e === 'abierta' || e === 'en_correccion' || e === 'verificada'
export const ncrVencida = (n: NoConformidad, t: Dia) => { const e = estadoNCR(n, t); return (e === 'abierta' || e === 'en_correccion') && n.plazo < t }
/** Fecha del paso a un estado (la última vez). */
export const fechaEstado = <E extends string>(h: { fecha: Dia; estado: E }[], estado: E, t = Infinity) => h.filter((x) => x.estado === estado && x.fecha <= t).at(-1)?.fecha ?? null

/** Protocolos vigentes: los que no tienen una reinspección posterior. */
export function protocolosVigentes(ps: ProtocoloCalidad[], t: Dia) {
  const reemplazados = new Set(ps.filter((p) => p.reinspeccionDe && p.creado <= t).map((p) => p.reinspeccionDe!))
  return ps.filter((p) => p.creado <= t && !reemplazados.has(p.id))
}

/** Protocolos de liberación que hoy bloquean el avance de la partida (10 §11). */
export function liberacionesPendientes(d: Pick<Datos, 'protocolosCalidad'>, partidaId: string, t: Dia) {
  return protocolosVigentes(d.protocolosCalidad.filter((p) => p.partidaId === partidaId && p.tipo === 'liberacion'), t)
    .filter((p) => p.programado <= t && !protocoloAprobado(estadoProtocolo(p, t)))
}

/** RULE-103: protocolos obligatorios sin aprobar que impiden la recepción provisoria. */
export function protocolosFaltantes(d: Pick<Datos, 'protocolosCalidad'>, obraId: string, t: Dia) {
  return protocolosVigentes(d.protocolosCalidad.filter((p) => p.obraId === obraId && p.obligatorio), t).filter((p) => !protocoloAprobado(estadoProtocolo(p, t)))
}

// --- Permisos (19 §6; 10 §11 y §22) ---
export type AccionProtocolo = 'iniciar' | 'aprobar' | 'rechazar' | 'visar'
export const ACCIONES_PROTOCOLO: Record<AccionProtocolo, string> = { iniciar: 'Iniciar inspección', aprobar: 'Aprobar', rechazar: 'Rechazar', visar: 'Registrar V°B° ITO' }

export function accionesProtocolo(p: ProtocoloCalidad, t: Dia, rol: Rol): AccionProtocolo[] {
  const e = estadoProtocolo(p, t)
  if (e === 'pendiente') return rol === 'R03' || rol === 'R04' ? ['iniciar'] : []
  if (e === 'en_inspeccion') return rol === 'R03' ? ['aprobar', 'rechazar'] : []
  if (e === 'aprobado' && p.requiereITO) return rol === 'R03' || rol === 'R11' ? ['visar'] : []
  return []
}

/** Error que impide la acción (checklist incompleto, observaciones faltantes) o null. */
export function validarAccionProtocolo(p: ProtocoloCalidad, accion: AccionProtocolo, observaciones?: string): string | null {
  if (accion === 'aprobar' && p.checklist.some((i) => !i.ok)) return 'Para aprobar, todos los puntos del checklist deben estar conformes.'
  if (accion === 'rechazar' && !observaciones?.trim()) return 'Indica las observaciones del rechazo.'
  return null
}

export const ESTADO_POR_ACCION: Record<AccionProtocolo, EstadoProtocolo> = { iniciar: 'en_inspeccion', aprobar: 'aprobado', rechazar: 'rechazado', visar: 'aprobado_ito' }

export const puedeCrearProtocolo = (rol: Rol) => rol === 'R02' || rol === 'R03'
export const puedeCrearNCR = (rol: Rol) => rol === 'R02' || rol === 'R03'
export const puedeProgramarInspeccion = (rol: Rol) => rol === 'R02' || rol === 'R03'

export type AccionNCR = 'corregir' | 'verificar' | 'cerrar' | 'anular'
export const ACCIONES_NCR: Record<AccionNCR, string> = { corregir: 'Iniciar corrección', verificar: 'Verificar corrección', cerrar: 'Cerrar', anular: 'Anular' }

export function accionesNCR(n: NoConformidad, t: Dia, rol: Rol): AccionNCR[] {
  const e = estadoNCR(n, t)
  const out: AccionNCR[] = []
  if (e === 'abierta' && ['R02', 'R03', 'R04', 'R10'].includes(rol)) out.push('corregir')
  if (e === 'en_correccion' && rol === 'R03') out.push('verificar')
  if (e === 'verificada' && (rol === 'R02' || rol === 'R03')) out.push('cerrar')
  if (e === 'abierta' && rol === 'R02') out.push('anular')
  return out
}

export const ESTADO_POR_ACCION_NCR: Record<AccionNCR, EstadoNCR> = { corregir: 'en_correccion', verificar: 'verificada', cerrar: 'cerrada', anular: 'anulada' }

// --- Retrabajo ---
const hh = (h: { trabajadores: number; horasNormales: number; horasExtra: number }) => h.trabajadores * (h.horasNormales + h.horasExtra)

/** HH y costo de retrabajo de los RDO validados (por NCR, hasta t). */
export function retrabajo(d: Pick<Datos, 'rdos' | 'cuadrillas' | 'config'>, obraId: string, desde: Dia, hasta: Dia) {
  const cq = new Map(d.cuadrillas.map((c) => [c.id, c]))
  const recargo = d.config.umbrales.recargoExtra
  const porNCR = new Map<string, { hh: number; costo: number }>()
  let hhRt = 0
  let hhTot = 0
  let costo = 0
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.estado !== 'validado' || r.fecha < desde || r.fecha > hasta) continue
    const tarifa = cq.get(r.cuadrillaId)?.costoHH ?? 0
    for (const h of r.hh) {
      const x = hh(h)
      hhTot += x
      if (!h.ncrId) continue
      const c = h.trabajadores * (h.horasNormales * tarifa + h.horasExtra * tarifa * (1 + recargo))
      hhRt += x
      costo += c
      const e = porNCR.get(h.ncrId) ?? { hh: 0, costo: 0 }
      porNCR.set(h.ncrId, { hh: e.hh + x, costo: e.costo + c })
    }
  }
  return { hhRt, hhTot, costo, porNCR, rate: hhTot > 0 ? hhRt / hhTot : null }
}

/** HH de retrabajo de un RDO cualquiera (para mostrar en el reporte). */
export const hhRetrabajoRDO = (r: RDO) => r.hh.filter((h) => h.ncrId).reduce((s, h) => s + hh(h), 0)

// --- Indicadores (14 KCA) ---
export interface IndicadoresCalidad {
  /** KCA-01: protocolos aprobados sin rechazo previo / protocolos cerrados (90 días). */
  primera: number | null
  /** KCA-02 */
  ncrAbiertas: number
  ncrVencidas: number
  /** Antigüedad de la NCR abierta más antigua (días). */
  ncrAntiguedad: number
  /** KCA-03: costo de retrabajo (HH + materiales) / costo real. */
  costoNoCalidad: number | null
  costoRetrabajo: number
  /** KCA-07: HH de retrabajo / HH totales (últimos 7 días). */
  reworkRate: number | null
  hhRetrabajo7: number
  /** KCA-08 (30 días) */
  ejecutados: number
  rechazados: number
  /** KCA-09: inspecciones realizadas / programadas (30 días). */
  inspecciones: number | null
  pendientesHoy: number
  porVisarITO: number
  estado: EstadoSemaforo
}

export function indicadoresCalidad(d: Pick<Datos, 'protocolosCalidad' | 'inspeccionesCalidad' | 'noConformidades' | 'rdos' | 'cuadrillas' | 'config'>, obraId: string, t: Dia, ac: number): IndicadoresCalidad {
  const ps = d.protocolosCalidad.filter((p) => p.obraId === obraId && p.creado <= t)
  const ncrs = d.noConformidades.filter((n) => n.obraId === obraId && n.creado <= t)
  // KCA-01: protocolos originales resueltos en los últimos 90 días
  const originales = ps.filter((p) => !p.reinspeccionDe)
  const resueltos = originales.filter((p) => {
    const e = estadoProtocolo(p, t)
    const f = fechaEstado(p.historial, e === 'rechazado' ? 'rechazado' : 'aprobado', t)
    return (protocoloAprobado(e) || e === 'rechazado') && f != null && f > t - 90
  })
  const abiertas = ncrs.filter((n) => ncrAbierta(estadoNCR(n, t)))
  const total = retrabajo(d, obraId, -Infinity, t)
  const materiales = ncrs.filter((n) => estadoNCR(n, t) === 'cerrada').reduce((s, n) => s + (n.costoMateriales ?? 0), 0)
  const semana = retrabajo(d, obraId, t - 6, t)
  const pasos30 = ps.flatMap((p) => p.historial.filter((h) => h.fecha > t - 30 && h.fecha <= t && (h.estado === 'aprobado' || h.estado === 'rechazado')))
  const insp = d.inspeccionesCalidad.filter((i) => i.obraId === obraId && i.tipo === 'programada' && i.programada > t - 30 && i.programada <= t)
  const vencidas = abiertas.filter((n) => ncrVencida(n, t)).length
  const n = abiertas.length
  return {
    primera: resueltos.length ? resueltos.filter((p) => protocoloAprobado(estadoProtocolo(p, t))).length / resueltos.length : null,
    ncrAbiertas: n,
    ncrVencidas: vencidas,
    ncrAntiguedad: n ? t - Math.min(...abiertas.map((x) => x.creado)) : 0,
    costoNoCalidad: ac > 0 ? (total.costo + materiales) / ac : null,
    costoRetrabajo: total.costo + materiales,
    reworkRate: semana.rate,
    hhRetrabajo7: semana.hhRt,
    ejecutados: pasos30.length,
    rechazados: pasos30.filter((h) => h.estado === 'rechazado').length,
    inspecciones: insp.length ? insp.filter((i) => i.realizada && i.realizada.fecha <= t).length / insp.length : null,
    pendientesHoy: protocolosVigentes(ps, t).filter((p) => p.programado <= t && (estadoProtocolo(p, t) === 'pendiente' || estadoProtocolo(p, t) === 'en_inspeccion')).length,
    porVisarITO: ps.filter((p) => p.requiereITO && estadoProtocolo(p, t) === 'aprobado').length,
    // Semáforo (14 §5.3): NCR abiertas ≤ 3 verde, 4–8 amarillo, > 8 o vencidas rojo
    estado: !ps.length && !ncrs.length ? 'na' : vencidas > 0 || n > 8 ? 'rojo' : n > 3 ? 'amarillo' : 'verde',
  }
}
