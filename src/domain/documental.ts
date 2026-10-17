// Gestión documental de la obra (v1.1: 08 Dominio 9, 10 §26–27, 12 RULE-902/903/905, 14 KDO-01…03).
// Planos y EETT con control de revisiones (una sola vigente), RFI, submittals y Libro de Obra.
// Los estados se derivan del historial a la fecha, igual que en riesgos; los folios son inmutables.
import type { CalcObra } from './evm'
import { diaSemana } from './fechas'
import type {
  Dia, Documento, Especialidad, EstadoRFI, EstadoSemaforo, EstadoSubmittal, Folio, PasoDoc, RFI, RevisionDocumento, Rol, Submittal, TipoDocumento,
  TipoFolio, TipoSubmittal,
} from './types'

export const ESPECIALIDADES: Record<Especialidad, string> = {
  arquitectura: 'Arquitectura', estructura: 'Estructura', sanitaria: 'Instalaciones sanitarias', electrica: 'Instalaciones eléctricas',
  climatizacion: 'Climatización', general: 'General',
}
export const TIPOS_DOCUMENTO: Record<TipoDocumento, string> = { plano: 'Plano', eett: 'Especificaciones técnicas', memoria: 'Memoria', otro: 'Otro' }

// ───────────────────────── Planos y EETT ─────────────────────────

export const revisionesA = (doc: Documento, t: Dia) => doc.revisiones.filter((r) => r.fecha <= t)
/** La última revisión publicada es la vigente; las anteriores quedan superadas. */
export const revisionVigente = (doc: Documento, t: Dia): RevisionDocumento | undefined => revisionesA(doc, t).at(-1)

/** Revisión siguiente sugerida: A → B → … en desarrollo y 0 → 1 → … para construcción. */
export function siguienteRevision(doc: Documento): string {
  const ult = doc.revisiones.at(-1)?.revision
  if (!ult) return 'A'
  if (/^\d+$/.test(ult)) return String(Number(ult) + 1)
  if (/^[A-Y]$/i.test(ult)) return String.fromCharCode(ult.toUpperCase().charCodeAt(0) + 1)
  return `${ult}-1`
}

/** RULE-905: terreno sigue usando una revisión superada. */
export function terrenoDesactualizado(doc: Documento, t: Dia): RevisionDocumento | null {
  const vig = revisionVigente(doc, t)
  if (!vig || !doc.enTerreno || doc.enTerreno.fecha > t || doc.enTerreno.revisionId === vig.id) return null
  return doc.revisiones.find((r) => r.id === doc.enTerreno!.revisionId) ?? null
}

export const puedePublicarDocumento = (rol: Rol) => rol === 'R02' || rol === 'R05'
export const puedeConfirmarTerreno = (rol: Rol) => rol === 'R02' || rol === 'R03'

// ───────────────────────── Historial genérico ─────────────────────────

export function estadoSegun<E extends string>(historial: PasoDoc<E>[], creado: Dia, t: Dia, inicial: E): E | null {
  if (creado > t) return null
  return historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? inicial
}

// ───────────────────────── RFI (10 §26) ─────────────────────────

export const ESTADOS_RFI: Record<EstadoRFI, string> = { borrador: 'Borrador', emitido: 'Emitido', respondido: 'Respondido', cerrado: 'Cerrado', anulado: 'Anulado' }
export const TONO_RFI: Record<EstadoRFI, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = { borrador: 'gris', emitido: 'ambar', respondido: 'azul', cerrado: 'verde', anulado: 'gris' }
export const DESTINATARIOS_RFI: Record<RFI['destinatario'], string> = { mandante: 'Mandante', proyectista: 'Proyectista', ito: 'ITO' }

export const estadoRFI = (r: RFI, t: Dia) => estadoSegun(r.historial, r.creado, t, 'borrador')
/** Emitido y abierto (emitido o respondido, aún sin cerrar). */
export const rfiAbierto = (r: RFI, t: Dia) => { const e = estadoRFI(r, t); return e === 'emitido' || e === 'respondido' }
/** RULE-903: emitido sin respuesta con la fecha límite superada. */
export const rfiVencido = (r: RFI, t: Dia) => estadoRFI(r, t) === 'emitido' && r.fechaLimite != null && r.fechaLimite < t

/** Primera emisión y primera respuesta (para KDO-02). */
export function tiemposRFI(r: RFI) {
  const emision = r.historial.find((p) => p.estado === 'emitido')?.fecha
  const respuesta = r.historial.find((p) => p.estado === 'respondido')?.fecha
  return { emision, respuesta }
}

export type AccionRFI = 'emitir' | 'responder' | 'repreguntar' | 'cerrar' | 'anular'
export const ACCIONES_RFI: Record<AccionRFI, string> = { emitir: 'Emitir', responder: 'Registrar respuesta', repreguntar: 'Repreguntar', cerrar: 'Cerrar', anular: 'Anular' }

const PERMISOS_RFI: Partial<Record<EstadoRFI, Partial<Record<AccionRFI, Rol[]>>>> = {
  borrador: { emitir: ['R02', 'R03', 'R05'], anular: ['R02', 'R05'] },
  emitido: { responder: ['R05', 'R11'], anular: ['R02', 'R05'] },
  respondido: { repreguntar: ['R05'], cerrar: ['R02', 'R05'] },
}
export const puedeCrearRFI = (rol: Rol) => rol === 'R02' || rol === 'R03' || rol === 'R05'

export function accionesRFI(r: RFI, t: Dia, rol: Rol): AccionRFI[] {
  const e = estadoRFI(r, t)
  if (!e) return []
  return (Object.entries(PERMISOS_RFI[e] ?? {}) as [AccionRFI, Rol[]][]).filter(([, roles]) => roles.includes(rol)).map(([a]) => a)
}

export function aplicarAccionRFI(r: RFI, accion: AccionRFI, x: { fecha: Dia; autor: string; texto?: string; ordenCambioId?: string; riesgoId?: string }): RFI {
  const e = estadoRFI(r, x.fecha)
  if (!e || !(accion in (PERMISOS_RFI[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_RFI[accion].toLowerCase()} un RFI ${e ? ESTADOS_RFI[e].toLowerCase() : 'inexistente'}.`)
  const texto = x.texto?.trim()
  const paso = (estado: EstadoRFI) => [...r.historial, { fecha: x.fecha, estado, por: x.autor, ...(texto ? { texto } : {}) }]
  switch (accion) {
    case 'emitir':
      if (!r.pregunta.trim()) throw new Error('Escribe la consulta.')
      if (r.fechaLimite == null) throw new Error('Indica la fecha límite de respuesta.')
      if (r.fechaLimite <= x.fecha) throw new Error('La fecha límite debe ser posterior a hoy.')
      return { ...r, historial: paso('emitido') }
    case 'responder':
      if (!texto) throw new Error('Escribe la respuesta.')
      return { ...r, historial: paso('respondido') }
    case 'repreguntar':
      if (!texto) throw new Error('Indica qué falta en la respuesta.')
      return { ...r, historial: paso('emitido') }
    case 'cerrar':
      return { ...r, ordenCambioId: x.ordenCambioId ?? r.ordenCambioId, riesgoId: x.riesgoId ?? r.riesgoId, historial: paso('cerrado') }
    case 'anular':
      if (!texto) throw new Error('Indica el motivo de la anulación.')
      return { ...r, historial: paso('anulado') }
  }
}

// ───────────────────────── Submittals (10 §27) ─────────────────────────

export const ESTADOS_SUBMITTAL: Record<EstadoSubmittal, string> = {
  borrador: 'Borrador', enviado: 'Enviado', aprobado: 'Aprobado', aprobado_con_observaciones: 'Aprobado con observaciones', rechazado: 'Rechazado', anulado: 'Anulado',
}
export const TONO_SUBMITTAL: Record<EstadoSubmittal, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', enviado: 'ambar', aprobado: 'verde', aprobado_con_observaciones: 'verde', rechazado: 'rojo', anulado: 'gris',
}
export const TIPOS_SUBMITTAL: Record<TipoSubmittal, string> = { ficha_tecnica: 'Ficha técnica', muestra: 'Muestra', plano_taller: 'Plano de taller', otro: 'Otro' }

export const estadoSubmittal = (s: Submittal, t: Dia) => estadoSegun(s.historial, s.creado, t, 'borrador')
/** Enviado y con la fecha requerida superada: frena la compra o la actividad. */
export const submittalVencido = (s: Submittal, t: Dia) => estadoSubmittal(s, t) === 'enviado' && s.fechaRequerida != null && s.fechaRequerida < t

export type AccionSubmittal = 'enviar' | 'aprobar' | 'aprobar_con_observaciones' | 'rechazar' | 'anular'
export const ACCIONES_SUBMITTAL: Record<AccionSubmittal, string> = {
  enviar: 'Enviar al mandante', aprobar: 'Aprobar', aprobar_con_observaciones: 'Aprobar con observaciones', rechazar: 'Rechazar', anular: 'Anular',
}
const PERMISOS_SUBMITTAL: Partial<Record<EstadoSubmittal, Partial<Record<AccionSubmittal, Rol[]>>>> = {
  borrador: { enviar: ['R02', 'R05'], anular: ['R05'] },
  enviado: { aprobar: ['R05', 'R11'], aprobar_con_observaciones: ['R05', 'R11'], rechazar: ['R05', 'R11'], anular: ['R05'] },
}
export const puedeCrearSubmittal = (rol: Rol) => rol === 'R02' || rol === 'R05'

export function accionesSubmittal(s: Submittal, t: Dia, rol: Rol): AccionSubmittal[] {
  const e = estadoSubmittal(s, t)
  if (!e) return []
  return (Object.entries(PERMISOS_SUBMITTAL[e] ?? {}) as [AccionSubmittal, Rol[]][]).filter(([, roles]) => roles.includes(rol)).map(([a]) => a)
}

export function aplicarAccionSubmittal(s: Submittal, accion: AccionSubmittal, x: { fecha: Dia; autor: string; texto?: string }): Submittal {
  const e = estadoSubmittal(s, x.fecha)
  if (!e || !(accion in (PERMISOS_SUBMITTAL[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_SUBMITTAL[accion].toLowerCase()} un submittal ${e ? ESTADOS_SUBMITTAL[e].toLowerCase() : 'inexistente'}.`)
  const texto = x.texto?.trim()
  if ((accion === 'aprobar_con_observaciones' || accion === 'rechazar' || accion === 'anular') && !texto)
    throw new Error(accion === 'aprobar_con_observaciones' ? 'Escribe las observaciones.' : 'Indica el motivo.')
  const estado: EstadoSubmittal = accion === 'enviar' ? 'enviado' : accion === 'aprobar' ? 'aprobado' : accion === 'anular' ? 'anulado' : accion === 'rechazar' ? 'rechazado' : 'aprobado_con_observaciones'
  return { ...s, historial: [...s.historial, { fecha: x.fecha, estado, por: x.autor, ...(texto ? { texto } : {}) }] }
}

/** Revisión siguiente de un submittal rechazado, en borrador para corregir y reenviar. */
export function nuevaRevisionSubmittal(s: Submittal, id: string, fecha: Dia, autor: string): Submittal {
  return { ...s, id, revision: s.revision + 1, reemplazaA: s.id, historial: [], creado: fecha, creadoPor: autor }
}

// ───────────────────────── Libro de Obra ─────────────────────────

export const TIPOS_FOLIO: Record<TipoFolio, string> = { instruccion: 'Instrucción', observacion: 'Observación', comunicacion: 'Comunicación', respuesta: 'Respuesta' }
/** RULE-902: días hábiles para responder una instrucción u observación del ITO sin plazo propio. */
export const DIAS_HABILES_RESPUESTA_FOLIO = 3

export function sumarHabiles(desde: Dia, n: number, habiles: number[]): Dia {
  let d = desde
  for (let k = 0; k < n; ) { d++; if (habiles.includes(diaSemana(d))) k++ }
  return d
}

export const requiereRespuesta = (f: Folio) => f.emisor === 'mandante' && (f.tipo === 'instruccion' || f.tipo === 'observacion')
export const limiteRespuestaFolio = (f: Folio, habiles: number[]) => f.plazoRespuesta ?? sumarHabiles(f.fecha, DIAS_HABILES_RESPUESTA_FOLIO, habiles)
export const respuestaDe = (f: Folio, folios: Folio[], t: Dia) => folios.find((x) => x.respondeA === f.id && x.fecha <= t)

/** El folio del ITO espera respuesta (vencido = pasó su plazo). */
export function folioPendiente(f: Folio, folios: Folio[], t: Dia, habiles: number[]): { limite: Dia; vencido: boolean } | null {
  if (f.fecha > t || !requiereRespuesta(f) || respuestaDe(f, folios, t)) return null
  const limite = limiteRespuestaFolio(f, habiles)
  return { limite, vencido: limite < t }
}

/** R02 y R03 firman como contratista; R11 (ITO) como mandante (19). */
export const emisorFolio = (rol: Rol): Folio['emisor'] | null => (rol === 'R11' ? 'mandante' : rol === 'R02' || rol === 'R03' ? 'contratista' : null)

// ───────────────────────── Indicadores KDO (14) ─────────────────────────

/** Partidas de actividades críticas pendientes del programa actualizado. */
export function partidasCriticas(c: CalcObra): Set<string> {
  const out = new Set<string>()
  for (const a of c.actualizado?.actividades ?? []) {
    if (a.finReal != null || !c.cpm.get(a.id)?.critica) continue
    for (const p of a.partidas) out.add(p.partidaId)
  }
  return out
}
export const tocaCriticas = (partidaIds: string[], criticas: Set<string>) => partidaIds.some((p) => criticas.has(p))

export interface IndicadoresDocumental {
  /** KDO-01 */
  rfiAbiertos: number
  rfiVencidos: number
  rfiVencidoCritico: boolean
  /** KDO-02: promedio de días de respuesta y del plazo dado, sobre los RFI respondidos. */
  diasRespuesta: number | null
  plazoRespuesta: number | null
  /** KDO-03 */
  submittalsPendientes: number
  submittalsVencidos: number
  submittalVencidoCritico: boolean
  foliosPendientes: number
  foliosVencidos: number
  planosDesactualizados: number
  estado: { kdo01: EstadoSemaforo; kdo02: EstadoSemaforo; kdo03: EstadoSemaforo; folios: EstadoSemaforo; planos: EstadoSemaforo }
}

export function indicadoresDocumental(
  x: { rfis: RFI[]; submittals: Submittal[]; folios: Folio[]; documentos: Documento[] }, c: CalcObra, habiles: number[], t: Dia,
): IndicadoresDocumental {
  const criticas = partidasCriticas(c)
  const rfiAbiertos = x.rfis.filter((r) => rfiAbierto(r, t))
  const vencidos = x.rfis.filter((r) => rfiVencido(r, t))
  const respondidos = x.rfis.map(tiemposRFI).map((tt, i) => ({ ...tt, r: x.rfis[i] })).filter((y) => y.emision != null && y.respuesta != null && y.respuesta <= t)
  const prom = (v: number[]) => (v.length ? v.reduce((s, n) => s + n, 0) / v.length : null)
  const diasRespuesta = prom(respondidos.map((y) => y.respuesta! - y.emision!))
  const plazoRespuesta = prom(respondidos.filter((y) => y.r.fechaLimite != null).map((y) => y.r.fechaLimite! - y.emision!))
  const pendientesSub = x.submittals.filter((s) => estadoSubmittal(s, t) === 'enviado')
  const subVencidos = x.submittals.filter((s) => submittalVencido(s, t))
  const pendFolios = x.folios.map((f) => folioPendiente(f, x.folios, t, habiles)).filter((p) => !!p)
  const foliosVencidos = pendFolios.filter((p) => p.vencido).length
  const planos = x.documentos.filter((d) => terrenoDesactualizado(d, t)).length
  const rfiVencidoCritico = vencidos.some((r) => tocaCriticas(r.partidaIds, criticas))
  const submittalVencidoCritico = subVencidos.some((s) => tocaCriticas(s.partidaIds, criticas))
  return {
    rfiAbiertos: rfiAbiertos.length,
    rfiVencidos: vencidos.length,
    rfiVencidoCritico,
    diasRespuesta,
    plazoRespuesta,
    submittalsPendientes: pendientesSub.length,
    submittalsVencidos: subVencidos.length,
    submittalVencidoCritico,
    foliosPendientes: pendFolios.length,
    foliosVencidos,
    planosDesactualizados: planos,
    estado: {
      kdo01: rfiVencidoCritico ? 'rojo' : vencidos.length ? 'amarillo' : 'verde',
      kdo02: diasRespuesta == null || plazoRespuesta == null ? 'na' : diasRespuesta > 2 * plazoRespuesta ? 'rojo' : diasRespuesta > plazoRespuesta ? 'amarillo' : 'verde',
      kdo03: submittalVencidoCritico ? 'rojo' : pendientesSub.length > 5 || subVencidos.length ? 'amarillo' : 'verde',
      folios: foliosVencidos ? 'amarillo' : 'verde',
      planos: planos ? 'amarillo' : 'verde',
    },
  }
}
