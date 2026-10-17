// Estados de pago al mandante (v1.1: 10 §9, 08 Estado de Pago y Generador, 14 KFI-01/02/10,
// 12 RULE-402/403). Ciclo: borrador → en revisión interna → presentado ⇄ observado → aprobado →
// facturado → pagado parcial → pagado; anulable antes de aprobarse. Desde la presentación las
// líneas quedan congeladas: una observación del mandante obliga a reingresar una versión nueva.
import type { Datos } from './datos'
import { finDeMes } from './fechas'
import { partidaVigente } from './ordenesCambio'
import type { CondicionesPago, Dia, EstadoPago, LineaEP, Rol } from './types'

export type EtapaEP =
  | 'borrador' | 'en_revision_interna' | 'presentado' | 'observado' | 'aprobado' | 'facturado' | 'pagado_parcial' | 'pagado' | 'anulado'

export const ETAPAS_EP: Record<EtapaEP, string> = {
  borrador: 'Borrador', en_revision_interna: 'En revisión interna', presentado: 'Presentado', observado: 'Observado',
  aprobado: 'Aprobado', facturado: 'Facturado', pagado_parcial: 'Pago parcial', pagado: 'Pagado', anulado: 'Anulado',
}

export const TONO_ETAPA_EP: Record<EtapaEP, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', en_revision_interna: 'gris', presentado: 'azul', observado: 'ambar', aprobado: 'azul',
  facturado: 'ambar', pagado_parcial: 'ambar', pagado: 'verde', anulado: 'rojo',
}

/** Días entre el corte del EP y su presentación al mandante (también el plazo de RULE-403). */
export const DIAS_PREPARACION_EP = 3

/** Monto pagado del EP hasta el día t. */
export function pagadoHasta(ep: EstadoPago, t: Dia) {
  return ep.pagos.filter((p) => p.fecha <= t).reduce((s, p) => s + p.monto, 0)
}

/** Primera presentación al mandante (null si nunca se presentó). */
export const presentadoEn = (ep: EstadoPago): Dia | null => ep.presentaciones[0] ?? null

/** Etapa del EP al cierre del día t (null si aún no existía). */
export function etapaEP(ep: EstadoPago, t: Dia): EtapaEP | null {
  if (ep.creado > t) return null
  if (ep.anulado != null && ep.anulado <= t) return 'anulado'
  if (ep.pagado != null && ep.pagado <= t) return 'pagado'
  if (pagadoHasta(ep, t) > 0) return 'pagado_parcial'
  if (ep.facturado != null && ep.facturado <= t) return 'facturado'
  if (ep.aprobado != null && ep.aprobado <= t) return 'aprobado'
  // Cada observación del mandante responde a una presentación: si todas las presentaciones ya
  // fueron observadas, está observado (cuenta eventos y no fechas: ambos pueden ocurrir el mismo día)
  const presentaciones = ep.presentaciones.filter((f) => f <= t).length
  const observaciones = ep.observaciones.filter((o) => o.origen === 'mandante' && o.fecha <= t).length
  if (presentaciones > 0) return observaciones >= presentaciones ? 'observado' : 'presentado'
  return ep.enRevision != null && ep.enRevision <= t ? 'en_revision_interna' : 'borrador'
}

/** Presentado al mandante y vigente al día t: cuenta para cobros y para el avance ya cobrado. */
export function vigente(ep: EstadoPago, t: Dia) {
  const e = etapaEP(ep, t)
  return e != null && !['borrador', 'en_revision_interna', 'anulado'].includes(e)
}

/** Facturado, con saldo por cobrar y vencimiento superado al día t (RULE-402). */
export function epVencido(ep: EstadoPago, t: Dia): boolean {
  const e = etapaEP(ep, t)
  return (e === 'facturado' || e === 'pagado_parcial') && ep.vencimiento != null && ep.vencimiento < t
}

/** Las líneas solo se editan antes de presentar o tras una observación (nueva versión). */
export function editable(ep: EstadoPago, t: Dia) {
  const e = etapaEP(ep, t)
  return e === 'borrador' || e === 'observado'
}

/** Anticipo recibido menos lo amortizado en los EP no anulados, sin contar el EP excluido. */
export function anticipoPorAmortizar(eps: EstadoPago[], t: Dia, excluir?: string) {
  const vivos = eps.filter((e) => e.id !== excluir && e.creado <= t && !(e.anulado != null && e.anulado <= t))
  return vivos.filter((e) => e.tipo === 'anticipo').reduce((s, e) => s + e.bruto, 0) - vivos.reduce((s, e) => s + e.amortizacion, 0)
}

/** Montos del EP a partir de su valor bruto, reajuste y descuentos. */
export function montosEP(
  bruto: number,
  cond: CondicionesPago,
  anticipoPendiente: number,
  extra: { indiceReajuste?: number; descuentos?: { monto: number }[] } = {},
) {
  const reajuste = cond.reajuste && extra.indiceReajuste ? Math.round(bruto * (extra.indiceReajuste / cond.reajuste.base - 1)) : 0
  const retencion = Math.round((bruto + reajuste) * cond.retencion)
  const amortizacion = Math.round(Math.min(bruto * cond.anticipo, Math.max(0, anticipoPendiente)))
  const descuentos = (extra.descuentos ?? []).reduce((s, d) => s + d.monto, 0)
  return { reajuste, retencion, amortizacion, neto: bruto + reajuste - retencion - amortizacion - descuentos }
}

/** Recalcula los montos de un EP de avance tras editar líneas, índice o descuentos. */
export function recalcularEP(ep: EstadoPago, cond: CondicionesPago, eps: EstadoPago[]): EstadoPago {
  if (ep.tipo === 'anticipo') return ep
  const bruto = ep.lineas.reduce((s, l) => s + l.monto, 0)
  return { ...ep, bruto, ...montosEP(bruto, cond, anticipoPorAmortizar(eps, ep.fechaCorte, ep.id), ep) }
}

/** Cantidad validada en RDO hasta el corte que aún no está en otro EP no anulado, por partida. */
export function pendientePorPartida(d: Pick<Datos, 'rdos' | 'estadosPago' | 'partidas' | 'ordenesCambio'>, obraId: string, corte: Dia, excluir?: string) {
  const ejecutado = new Map<string, number>()
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.estado !== 'validado' || r.fecha > corte) continue
    for (const a of r.avances) ejecutado.set(a.partidaId, (ejecutado.get(a.partidaId) ?? 0) + a.cantidad)
  }
  const incluido = new Map<string, number>()
  for (const e of d.estadosPago)
    if (e.obraId === obraId && e.id !== excluir && e.anulado == null)
      for (const l of e.lineas) incluido.set(l.partidaId, (incluido.get(l.partidaId) ?? 0) + l.cantidad)
  const out = new Map<string, number>()
  // Solo se cobran partidas vigentes: una obra extraordinaria espera la aprobación del mandante
  for (const p of d.partidas) {
    if (p.obraId !== obraId || !partidaVigente(p, d.ordenesCambio, corte)) continue
    const q = Math.min(ejecutado.get(p.id) ?? 0, p.cantidad) - (incluido.get(p.id) ?? 0)
    if (q > 1e-9) out.set(p.id, Math.round(q * 10_000) / 10_000)
  }
  return out
}

/**
 * Líneas del próximo EP al corte: lo validado no incluido en otro EP, valorizado a precio de venta,
 * con un generador por defecto que remite a los RDO.
 */
export function lineasEP(d: Pick<Datos, 'rdos' | 'estadosPago' | 'partidas' | 'ordenesCambio'>, obraId: string, corte: Dia): LineaEP[] {
  const pu = new Map(d.partidas.map((p) => [p.id, p.puVenta]))
  return [...pendientePorPartida(d, obraId, corte)].map(([partidaId, cantidad]) => ({
    partidaId, cantidad, monto: Math.round(cantidad * (pu.get(partidaId) ?? 0)),
  }))
}

/** Cambia la cantidad cubicada de una línea (≤ lo validado pendiente) y su monto. */
export function ajustarLinea(l: LineaEP, cantidad: number, puVenta: number, maximo: number): LineaEP {
  const q = Math.max(0, Math.min(cantidad, maximo))
  return { ...l, cantidad: Math.round(q * 10_000) / 10_000, monto: Math.round(q * puVenta) }
}

// ───────────────────────── Transiciones ─────────────────────────

export type AccionEP = 'enviar_revision' | 'devolver' | 'presentar' | 'observar' | 'aprobar' | 'facturar' | 'pagar' | 'anular'

export const ACCIONES_EP: Record<AccionEP, string> = {
  enviar_revision: 'Enviar a revisión interna', devolver: 'Devolver a borrador', presentar: 'Presentar al mandante',
  observar: 'Observar', aprobar: 'Aprobar', facturar: 'Registrar factura', pagar: 'Registrar pago', anular: 'Anular',
}

/** Acciones disponibles por etapa y quién puede ejecutarlas (19: R11 = mandante/ITO). */
const PERMISOS: Partial<Record<EtapaEP, Partial<Record<AccionEP, Rol[]>>>> = {
  borrador: { enviar_revision: ['R05', 'R02'], anular: ['R02', 'R05'] },
  en_revision_interna: { presentar: ['R02'], devolver: ['R02'], anular: ['R02', 'R05'] },
  presentado: { aprobar: ['R11', 'R02'], observar: ['R11', 'R02'], anular: ['R01'] },
  observado: { presentar: ['R02'], anular: ['R01'] },
  aprobado: { facturar: ['R01', 'R02', 'R05'] },
  facturado: { pagar: ['R01', 'R02', 'R05'] },
  pagado_parcial: { pagar: ['R01', 'R02', 'R05'] },
}

export function accionesEP(ep: EstadoPago, t: Dia, rol: Rol): AccionEP[] {
  const e = etapaEP(ep, t)
  if (!e) return []
  return (Object.entries(PERMISOS[e] ?? {}) as [AccionEP, Rol[]][]).filter(([, roles]) => roles.includes(rol)).map(([a]) => a)
}

export interface DatosAccion {
  fecha: Dia
  autor: string
  texto?: string
  factura?: string
  monto?: number
}

/** Aplica una acción al EP. Lanza un error con el motivo si no corresponde. */
export function aplicarAccion(ep: EstadoPago, accion: AccionEP, x: DatosAccion, cond: CondicionesPago): EstadoPago {
  const e = etapaEP(ep, x.fecha)
  if (!e || !(accion in (PERMISOS[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_EP[accion].toLowerCase()} un EP ${e ? ETAPAS_EP[e].toLowerCase() : 'inexistente'}.`)
  switch (accion) {
    case 'enviar_revision':
      if (ep.lineas.length === 0 && ep.tipo === 'avance') throw new Error('El EP no tiene líneas.')
      return { ...ep, enRevision: x.fecha }
    case 'devolver':
      if (!x.texto?.trim()) throw new Error('Indica qué hay que corregir.')
      return { ...ep, enRevision: undefined, observaciones: [...ep.observaciones, { fecha: x.fecha, autor: x.autor, texto: x.texto.trim(), version: ep.version, origen: 'interna' }] }
    case 'presentar':
      // Reingreso tras una observación: nueva versión
      return { ...ep, version: e === 'observado' ? ep.version + 1 : ep.version, presentaciones: [...ep.presentaciones, x.fecha] }
    case 'observar':
      if (!x.texto?.trim()) throw new Error('La observación es obligatoria.')
      return { ...ep, observaciones: [...ep.observaciones, { fecha: x.fecha, autor: x.autor, texto: x.texto.trim(), version: ep.version, origen: 'mandante' }] }
    case 'aprobar':
      return { ...ep, aprobado: x.fecha }
    case 'facturar':
      if (!x.factura?.trim()) throw new Error('Ingresa el número de factura.')
      return { ...ep, facturado: x.fecha, factura: x.factura.trim(), vencimiento: x.fecha + cond.diasPago }
    case 'pagar': {
      const saldo = ep.neto - pagadoHasta(ep, Infinity)
      const monto = Math.min(x.monto ?? saldo, saldo)
      if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.')
      const pagos = [...ep.pagos, { fecha: x.fecha, monto: Math.round(monto) }]
      return { ...ep, pagos, pagado: saldo - monto < 1 ? x.fecha : undefined }
    }
    case 'anular':
      if (!x.texto?.trim()) throw new Error('Indica el motivo de la anulación.')
      return { ...ep, anulado: x.fecha, motivoAnulacion: x.texto.trim() }
  }
}

// ───────────────────────── Indicadores y alertas ─────────────────────────

export interface IndicadoresEP {
  /** KFI-01: promedio de días entre el corte y la primera presentación. */
  diasPreparacion: number | null
  /** KFI-02: promedio de días entre la primera presentación y la aprobación. */
  diasAprobacion: number | null
  /** KFI-10: EP observados al menos una vez / EP presentados. */
  observados: number | null
  porAprobar: number
}

export function indicadoresEP(eps: EstadoPago[], t: Dia): IndicadoresEP {
  const avance = eps.filter((e) => e.tipo === 'avance' && vigente(e, t))
  const prom = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const aprobados = avance.filter((e) => e.aprobado != null && e.aprobado <= t)
  return {
    diasPreparacion: prom(avance.map((e) => presentadoEn(e)! - e.fechaCorte)),
    diasAprobacion: prom(aprobados.map((e) => e.aprobado! - presentadoEn(e)!)),
    observados: avance.length ? avance.filter((e) => e.observaciones.some((o) => o.origen === 'mandante' && o.fecha <= t)).length / avance.length : null,
    porAprobar: avance.filter((e) => { const x = etapaEP(e, t); return x === 'presentado' }).length,
  }
}

/**
 * RULE-403: el último cierre de mes con avance validado que lleva más de DIAS_PREPARACION_EP
 * días sin EP presentado. Devuelve la fecha de corte atrasada, o null.
 */
export function epAtrasado(d: Pick<Datos, 'rdos' | 'estadosPago' | 'partidas' | 'ordenesCambio'>, obraId: string, t: Dia): Dia | null {
  const corte = finDeMes(finDeMes(t) - 31)
  if (t - corte <= DIAS_PREPARACION_EP) return null
  const presentado = d.estadosPago.some((e) => e.obraId === obraId && e.tipo === 'avance' && e.fechaCorte >= corte && vigente(e, t))
  if (presentado) return null
  return pendientePorPartida(d, obraId, corte).size > 0 ? corte : null
}
