// Finanzas (v1.3: 07 workspace R09, 08 dominio 16, 10 §21, 14 KFI-03/05/09/11/12/13, RF-FIN-01/02).
// Facturación electrónica de los EP (DTE con folio correlativo e IVA; la respuesta del SII la registra
// Finanzas: la integración con el SII queda simulada), cuentas por cobrar y por pagar por antigüedad,
// cobros y pagos registrados y pagos programados con el semáforo de cumplimiento laboral (RULE-701).
// Montos netos de IVA, como el flujo de caja, salvo los totales de los DTE.
import { condicionesDe } from './caja'
import { estadoEPConDocs } from './cumplimiento'
import type { Datos } from './datos'
import { etapaEP, pagadoHasta, vigente } from './estadosPago'
import { montosEPSub } from './subcontratos'
import type { CostoReal, Dia, DocumentoTributario, EstadoDTE, EstadoPago, Rol, TipoDTE } from './types'

export const IVA = 0.19
export const TIPOS_DTE: Record<TipoDTE, { nombre: string; codigo: number }> = {
  factura: { nombre: 'Factura electrónica', codigo: 33 }, nota_credito: { nombre: 'Nota de crédito', codigo: 61 }, nota_debito: { nombre: 'Nota de débito', codigo: 56 },
}
export const ESTADOS_DTE: Record<EstadoDTE, string> = { borrador: 'Borrador', emitido: 'Emitido', aceptado_sii: 'Aceptado SII', rechazado_sii: 'Rechazado SII', anulado: 'Anulado' }
export const TONO_DTE: Record<EstadoDTE, 'gris' | 'azul' | 'verde' | 'rojo'> = { borrador: 'gris', emitido: 'azul', aceptado_sii: 'verde', rechazado_sii: 'rojo', anulado: 'gris' }

/** 19 §6.7: Finanzas emite los documentos tributarios y registra cobros y pagos (Gerencia también factura). */
export const puedeFacturar = (rol: Rol) => rol === 'R09' || rol === 'R01'
export const puedeTesoreria = (rol: Rol) => rol === 'R09'

export const estadoDTE = (x: DocumentoTributario, t: Dia): EstadoDTE | null => (x.creado > t ? null : x.historial.filter((h) => h.fecha <= t).at(-1)?.estado ?? 'emitido')
export const siguienteFolio = (dtes: DocumentoTributario[], tipo: TipoDTE) => Math.max(tipo === 'factura' ? 1000 : 100, ...dtes.filter((x) => x.tipo === tipo).map((x) => x.folio)) + 1
export const conIVA = (neto: number) => ({ neto, iva: Math.round(neto * IVA), total: neto + Math.round(neto * IVA) })
export const codigoDTE = (x: Pick<DocumentoTributario, 'tipo' | 'folio'>) => `${x.tipo === 'factura' ? 'F' : x.tipo === 'nota_credito' ? 'NC' : 'ND'}-${x.folio}`

/** Una nota de crédito total anula la factura de un EP aún no cobrado (vuelve a "por facturar"). */
export function puedeAnularConNC(f: DocumentoTributario, ep: EstadoPago | undefined, t: Dia) {
  const e = estadoDTE(f, t)
  return f.tipo === 'factura' && (e === 'emitido' || e === 'aceptado_sii') && !!ep && ep.factura === codigoDTE(f) && pagadoHasta(ep, t) === 0
}

// --- Cuentas por cobrar (KFI-03, 09, 11, 12) ---
export const TRAMOS_CXC = ['0–30', '31–60', '61–90', '> 90'] as const
const tramoCxC = (dias: number) => (dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3)

export interface ItemCxC {
  ep: EstadoPago
  saldo: number
  dias: number
  vencidoHace: number | null
  tramo: number
}

export function cuentasPorCobrar(d: Pick<Datos, 'estadosPago'>, obraIds: string[], t: Dia) {
  const items: ItemCxC[] = []
  const tramos = [0, 0, 0, 0]
  for (const ep of d.estadosPago) {
    if (!obraIds.includes(ep.obraId) || !vigente(ep, t)) continue
    const e = etapaEP(ep, t)
    if (e !== 'facturado' && e !== 'pagado_parcial') continue
    const saldo = ep.neto - pagadoHasta(ep, t)
    if (saldo < 1) continue
    const dias = t - ep.facturado!
    const tramo = tramoCxC(dias)
    tramos[tramo] += saldo
    items.push({ ep, saldo, dias, vencidoHace: ep.vencimiento != null && ep.vencimiento < t ? t - ep.vencimiento : null, tramo })
  }
  const total = tramos.reduce((s, x) => s + x, 0)
  // KFI-03: días de cobro de los EP pagados en los últimos 180 días
  const pagados = d.estadosPago.filter((ep) => obraIds.includes(ep.obraId) && ep.pagado != null && ep.facturado != null && ep.pagado <= t && ep.pagado > t - 180 && vigente(ep, t))
  const porFacturar = d.estadosPago.filter((ep) => obraIds.includes(ep.obraId) && vigente(ep, t) && etapaEP(ep, t) === 'aprobado')
  const retenciones = d.estadosPago.filter((ep) => obraIds.includes(ep.obraId) && vigente(ep, t) && ep.aprobado != null && ep.aprobado <= t).reduce((s, ep) => s + ep.retencion, 0)
  return {
    items: items.sort((a, b) => b.dias - a.dias),
    tramos,
    total,
    /** KFI-09 */
    vencidos: items.filter((i) => i.vencidoHace != null).reduce((s, i) => s + i.saldo, 0),
    dso: pagados.length ? pagados.reduce((s, ep) => s + (ep.pagado! - ep.facturado!), 0) / pagados.length : null,
    porFacturar,
    montoPorFacturar: porFacturar.reduce((s, ep) => s + ep.neto, 0),
    /** KFI-05: retenciones de los EP aprobados (se devuelven tras la recepción). */
    retenciones,
    /** KFI-12: > 60 días sobre el total. */
    sobre60: total > 0 ? (tramos[2] + tramos[3]) / total : 0,
  }
}

// --- Cuentas por pagar (KFI-13) y pagos programados ---
export const TRAMOS_CXP = ['Por vencer', 'Vencidas 1–30', 'Vencidas > 30'] as const

export interface ItemCxP {
  id: string
  obraId: string
  fuente: 'costo' | 'ep_subcontrato'
  contraparte: string
  documento: string
  monto: number
  vence: Dia
  /** Días de atraso (negativo: faltan). */
  atraso: number
  tramo: number
  /** RULE-701: EP de subcontrato sin F30-1 vigente: no se puede pagar. */
  bloqueado?: boolean
  costo?: CostoReal
}

/** Costos de proveedores ya pagados (registrados por Finanzas). */
export const pagosDe = (d: Pick<Datos, 'transacciones'>, t: Dia) => new Map(d.transacciones.filter((x) => x.tipo === 'pago' && x.refId && x.fecha <= t).map((x) => [x.refId!, x]))

/**
 * Por pagar: facturas de proveedores (costos registrados) hasta su pago y EP de subcontratos aprobados
 * sin pagar. Los costos importados de la contabilidad que vencieron sin pago registrado se consideran
 * pagados por la contabilidad (igual que el flujo de caja); los de las operaciones quedan vencidos.
 * Las rendiciones se pagan con el fondo y los EP de subcontrato se siguen en su propio documento.
 */
export function cuentasPorPagar(d: Pick<Datos, 'costos' | 'transacciones' | 'obras' | 'epsSubcontrato' | 'subcontratos' | 'proveedores' | 'documentosLaborales'>, obraIds: string[], t: Dia) {
  const pagados = pagosDe(d, t)
  const items: ItemCxP[] = []
  const tramoDe = (atraso: number) => (atraso <= 0 ? 0 : atraso <= 30 ? 1 : 2)
  for (const o of d.obras.filter((x) => obraIds.includes(x.id))) {
    const dias = condicionesDe(o).diasPagoProveedores
    for (const k of d.costos) {
      if (k.obraId !== o.id || k.fecha > t || k.tipo === 'MO' || k.origen === 'rendicion' || k.origen === 'ep_subcontrato' || pagados.has(k.id)) continue
      const vence = k.fecha + dias
      if (vence < t && (k.origen === 'importacion' || k.origen === 'manual')) continue
      items.push({ id: k.id, obraId: o.id, fuente: 'costo', contraparte: k.proveedor ?? k.descripcion, documento: k.documento ?? k.descripcion, monto: k.monto, vence, atraso: t - vence, tramo: tramoDe(t - vence), costo: k })
    }
    for (const ep of d.epsSubcontrato.filter((x) => x.obraId === o.id)) {
      const sc = d.subcontratos.find((x) => x.id === ep.subcontratoId)
      if (!sc) continue
      const e = estadoEPConDocs(ep, sc, d.documentosLaborales, t)
      if (e !== 'aprobado' && e !== 'bloqueado') continue
      const aprobado = ep.historial.filter((h) => h.estado === 'aprobado' && h.fecha <= t).at(-1)?.fecha ?? ep.creado
      const vence = aprobado + dias
      items.push({
        id: ep.id, obraId: o.id, fuente: 'ep_subcontrato', contraparte: d.proveedores.find((p) => p.id === sc.subcontratistaId)?.nombre ?? sc.codigo,
        documento: `${sc.codigo} · EP N° ${ep.numero}`, monto: montosEPSub(ep, sc).neto, vence, atraso: t - vence, tramo: tramoDe(t - vence), bloqueado: e === 'bloqueado',
      })
    }
  }
  // Los EP retenidos por RULE-701 no cuentan como vencidos: la ley permite retener el pago (Ley 20.123)
  const tramos = [0, 0, 0]
  for (const i of items) if (!i.bloqueado) tramos[i.tramo] += i.monto
  const retenidos = items.filter((i) => i.bloqueado).reduce((s, i) => s + i.monto, 0)
  return {
    items: items.sort((a, b) => a.vence - b.vence),
    tramos,
    total: tramos.reduce((s, x) => s + x, 0) + retenidos,
    retenidos,
    /** KFI-13 */
    vencidas: tramos[1] + tramos[2],
    proximos30: items.filter((i) => i.vence <= t + 30).reduce((s, i) => s + i.monto, 0),
    bloqueados: items.filter((i) => i.bloqueado).length,
  }
}
