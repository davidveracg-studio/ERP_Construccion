// Órdenes de cambio del contrato (v1.1: 10 §10, 11 OrdenCambioAprobada, 12 RULE-105, 19 RN-P04).
// Ciclo: borrador → valorizada → aprobada interna (Gerencia si supera el umbral) → presentada →
// aprobada por el mandante o rechazada; anulable antes de presentarse. Al aprobarla el mandante se
// ajustan las cantidades vigentes, entran las partidas extraordinarias y se extiende el plazo.
import type { Dia, LineaOrdenCambio, Obra, OrdenCambio, Partida, Rol, TipoOrdenCambio } from './types'

export type EtapaOC = 'borrador' | 'valorizada' | 'aprobada_interna' | 'presentada' | 'aprobada_mandante' | 'rechazada' | 'anulada'

export const ETAPAS_OC: Record<EtapaOC, string> = {
  borrador: 'Borrador', valorizada: 'Valorizada', aprobada_interna: 'Aprobada internamente', presentada: 'Presentada al mandante',
  aprobada_mandante: 'Aprobada por el mandante', rechazada: 'Rechazada', anulada: 'Anulada',
}

export const TONO_ETAPA_OC: Record<EtapaOC, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', valorizada: 'gris', aprobada_interna: 'azul', presentada: 'ambar', aprobada_mandante: 'verde', rechazada: 'rojo', anulada: 'rojo',
}

export const TIPOS_OC: Record<TipoOrdenCambio, string> = {
  aumento: 'Aumento de obra', extraordinaria: 'Obra extraordinaria', disminucion: 'Disminución de obra (deductivo)', plazo: 'Aumento de plazo',
}

export const CAUSAS_OC: Record<OrdenCambio['causa'], string> = {
  mandante: 'Solicitud del mandante', proyecto: 'Error u omisión del proyecto', imprevisto: 'Condición imprevista', mayor_obra: 'Mayor obra medida en terreno',
}

/** RN-P04: sobre esta fracción del contrato la aprobación interna la da Gerencia (R01). */
export const UMBRAL_GERENCIA_OC = 0.05

export function etapaOC(oc: OrdenCambio, t: Dia): EtapaOC | null {
  if (oc.creada > t) return null
  if (oc.anulada != null && oc.anulada <= t) return 'anulada'
  if (oc.rechazada != null && oc.rechazada <= t) return 'rechazada'
  if (oc.aprobadaMandante != null && oc.aprobadaMandante <= t) return 'aprobada_mandante'
  if (oc.presentada != null && oc.presentada <= t) return 'presentada'
  if (oc.aprobadaInterna != null && oc.aprobadaInterna <= t) return 'aprobada_interna'
  return oc.valorizada != null && oc.valorizada <= t ? 'valorizada' : 'borrador'
}

export const editableOC = (oc: OrdenCambio, t: Dia) => etapaOC(oc, t) === 'borrador'

/** Valorización: venta (lo que se cobra al mandante), costo y margen de la orden. */
export function montosOC(oc: Pick<OrdenCambio, 'lineas'>) {
  const venta = Math.round(oc.lineas.reduce((s, l) => s + l.cantidad * l.puVenta, 0))
  const costo = Math.round(oc.lineas.reduce((s, l) => s + l.cantidad * l.puCosto, 0))
  return { venta, costo, margen: venta !== 0 ? (venta - costo) / venta : null }
}

/** Requiere aprobación interna de Gerencia por superar el umbral del contrato. */
export const requiereGerencia = (oc: OrdenCambio, ventaContrato: number) =>
  ventaContrato > 0 && Math.abs(montosOC(oc).venta) > UMBRAL_GERENCIA_OC * ventaContrato

/** Una partida cuenta en el presupuesto, la venta y los EP si no viene de una orden pendiente. */
export function partidaVigente(p: Partida, ordenes: OrdenCambio[], t: Dia) {
  if (!p.ordenCambioId) return true
  const oc = ordenes.find((o) => o.id === p.ordenCambioId)
  return !!oc && etapaOC(oc, t) === 'aprobada_mandante'
}

// ───────────────────────── Transiciones ─────────────────────────

export type AccionOC = 'valorizar' | 'devolver' | 'aprobar_interna' | 'presentar' | 'aprobar_mandante' | 'rechazar' | 'anular'

export const ACCIONES_OC: Record<AccionOC, string> = {
  valorizar: 'Valorizar', devolver: 'Devolver a borrador', aprobar_interna: 'Aprobar internamente', presentar: 'Presentar al mandante',
  aprobar_mandante: 'Aprobar', rechazar: 'Rechazar', anular: 'Anular',
}

const PERMISOS: Partial<Record<EtapaOC, Partial<Record<AccionOC, Rol[]>>>> = {
  borrador: { valorizar: ['R05'], anular: ['R02', 'R05'] },
  valorizada: { aprobar_interna: ['R02', 'R01'], devolver: ['R02', 'R01'], anular: ['R02', 'R05'] },
  aprobada_interna: { presentar: ['R02'], anular: ['R02', 'R05'] },
  presentada: { aprobar_mandante: ['R11', 'R02'], rechazar: ['R11', 'R02'] },
}

export function accionesOC(oc: OrdenCambio, t: Dia, rol: Rol, ventaContrato: number): AccionOC[] {
  const e = etapaOC(oc, t)
  if (!e) return []
  return (Object.entries(PERMISOS[e] ?? {}) as [AccionOC, Rol[]][])
    .filter(([a, roles]) => roles.includes(rol) && !(a === 'aprobar_interna' && rol === 'R02' && requiereGerencia(oc, ventaContrato)))
    .map(([a]) => a)
}

/** Aplica una acción a la orden (solo su estado). Lanza un error con el motivo si no corresponde. */
export function aplicarAccionOC(oc: OrdenCambio, accion: AccionOC, x: { fecha: Dia; autor: string; texto?: string }): OrdenCambio {
  const e = etapaOC(oc, x.fecha)
  if (!e || !(accion in (PERMISOS[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_OC[accion].toLowerCase()} una orden ${e ? ETAPAS_OC[e].toLowerCase() : 'inexistente'}.`)
  switch (accion) {
    case 'valorizar':
      if (oc.tipo !== 'plazo' && oc.lineas.length === 0) throw new Error('Agrega al menos una partida con su valorización.')
      if (oc.lineas.some((l) => !(l.puVenta > 0) || l.cantidad === 0)) throw new Error('Cada línea necesita cantidad y precio de venta.')
      if (oc.tipo === 'plazo' && oc.diasPlazo === 0) throw new Error('Indica los días de aumento de plazo.')
      return { ...oc, valorizada: x.fecha }
    case 'devolver':
      if (!x.texto?.trim()) throw new Error('Indica qué hay que corregir.')
      return { ...oc, valorizada: undefined, devoluciones: [...oc.devoluciones, { fecha: x.fecha, autor: x.autor, texto: x.texto.trim() }] }
    case 'aprobar_interna':
      return { ...oc, aprobadaInterna: x.fecha, aprobadaInternaPor: x.autor }
    case 'presentar':
      return { ...oc, presentada: x.fecha }
    case 'aprobar_mandante':
      return { ...oc, aprobadaMandante: x.fecha }
    case 'rechazar':
      if (!x.texto?.trim()) throw new Error('Indica el motivo del rechazo.')
      return { ...oc, rechazada: x.fecha, motivoRechazo: x.texto.trim() }
    case 'anular':
      if (!x.texto?.trim()) throw new Error('Indica el motivo de la anulación.')
      return { ...oc, anulada: x.fecha, motivoAnulacion: x.texto.trim() }
  }
}

/** Id de la partida que crea una línea extraordinaria. */
export const idPartidaNueva = (oc: OrdenCambio, i: number) => `${oc.id}_l${i}`

/**
 * Partidas extraordinarias de la orden. Se crean al aprobarla internamente para que terreno pueda
 * reportar avance si se ejecuta antes; no cuentan hasta la aprobación del mandante (partidaVigente).
 */
export function partidasNuevas(oc: OrdenCambio): Partida[] {
  return oc.lineas.flatMap((l, i) => (l.nueva ? [{
    id: idPartidaNueva(oc, i), obraId: oc.obraId, codigo: l.nueva.codigo, capitulo: `OC N° ${oc.numero} · ${oc.titulo}`,
    descripcion: l.nueva.descripcion, unidad: l.nueva.unidad, cantidad: l.cantidad, puVenta: l.puVenta, ordenCambioId: oc.id,
    recursos: [{ tipo: l.nueva.tipoCosto, descripcion: `Costo valorizado OC N° ${oc.numero}`, cantPorUnidad: 1, unidad: l.nueva.unidad, precio: l.puCosto }],
  }] : []))
}

/**
 * Efectos de la aprobación del mandante (11 OrdenCambioAprobada): cantidad vigente de las partidas
 * existentes (sin bajar de lo ejecutado), partidas nuevas programadas desde la fecha y plazo.
 */
export function aplicarAprobacion(
  partidas: Partida[], obra: Obra, oc: OrdenCambio, fecha: Dia, ejecutado: Map<string, number> = new Map(),
): { partidas: Partida[]; obra: Obra } {
  const ajuste = new Map<string, number>()
  for (const l of oc.lineas) if (l.partidaId) ajuste.set(l.partidaId, (ajuste.get(l.partidaId) ?? 0) + l.cantidad)
  const nuevas = new Set(partidasNuevas(oc).map((p) => p.id))
  return {
    partidas: partidas.map((p) => {
      if (ajuste.has(p.id)) return { ...p, cantidad: Math.max(ejecutado.get(p.id) ?? 0, p.cantidad + ajuste.get(p.id)!) }
      if (nuevas.has(p.id)) return { ...p, inicioProgramado: fecha }
      return p
    }),
    obra: { ...obra, plazoDias: obra.plazoDias + oc.diasPlazo },
  }
}

/** Línea vacía para una partida existente, con el precio de contrato y su costo unitario. */
export function lineaExistente(p: Partida, puCosto: number, cantidad = 0): LineaOrdenCambio {
  return { partidaId: p.id, cantidad, puVenta: p.puVenta, puCosto }
}

export interface IndicadoresOC {
  aprobadas: number
  montoAprobado: number
  /** Fracción del contrato original que suman las órdenes aprobadas. */
  fraccionContrato: number | null
  pendientesMandante: number
  montoPendiente: number
  diasAprobacionMandante: number | null
  diasPlazoAprobados: number
}

export function indicadoresOC(ordenes: OrdenCambio[], t: Dia, ventaVigente: number): IndicadoresOC {
  const aprobadas = ordenes.filter((o) => etapaOC(o, t) === 'aprobada_mandante')
  const pendientes = ordenes.filter((o) => etapaOC(o, t) === 'presentada')
  const montoAprobado = aprobadas.reduce((s, o) => s + montosOC(o).venta, 0)
  const dias = aprobadas.filter((o) => o.presentada != null).map((o) => o.aprobadaMandante! - o.presentada!)
  const original = ventaVigente - montoAprobado
  return {
    aprobadas: aprobadas.length, montoAprobado, fraccionContrato: original > 0 ? montoAprobado / original : null,
    pendientesMandante: pendientes.length, montoPendiente: pendientes.reduce((s, o) => s + montosOC(o).venta, 0),
    diasAprobacionMandante: dias.length ? dias.reduce((s, x) => s + x, 0) / dias.length : null,
    diasPlazoAprobados: aprobadas.reduce((s, o) => s + o.diasPlazo, 0),
  }
}
