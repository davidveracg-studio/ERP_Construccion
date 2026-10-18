// Abastecimiento (v1.2: 08 Dominio 11, 10 §12–13, 12 RULE-301…306, 14 KAB, semáforo Compras).
// Solicitud de material desde terreno → orden de compra imputada a partida, con aprobación por monto
// (RN-P04) → recepciones parciales o totales con guía. El saldo pendiente de las OC aprobadas suma al
// comprometido de la partida (evm.ts) y cada recepción genera el costo real (store). OTIF, lead time y
// cumplimiento de fecha salen de las recepciones.
import type {
  Config, Dia, EstadoOC, EstadoSemaforo, EstadoSolicitud, LineaOC, OrdenCompra, Proveedor, Rol, SolicitudMaterial,
} from './types'

export const ESTADOS_OC: Record<EstadoOC, string> = {
  borrador: 'Borrador', por_aprobar: 'Por aprobar', aprobada: 'Aprobada', enviada: 'Enviada al proveedor',
  recibida_parcial: 'Recibida parcial', recibida: 'Recibida', cerrada: 'Cerrada (facturada)', anulada: 'Anulada',
}
export const TONO_OC: Record<EstadoOC, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', por_aprobar: 'ambar', aprobada: 'azul', enviada: 'azul', recibida_parcial: 'ambar', recibida: 'verde', cerrada: 'verde', anulada: 'gris',
}
export const ESTADOS_SOLICITUD: Record<EstadoSolicitud, string> = {
  enviada: 'Enviada', en_gestion: 'En gestión', atendida_bodega: 'Atendida desde bodega', en_compra: 'En compra',
  recibida_parcial: 'Recibida parcial', completada: 'Completada', rechazada: 'Rechazada',
}
export const TONO_SOLICITUD: Record<EstadoSolicitud, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  enviada: 'ambar', en_gestion: 'azul', atendida_bodega: 'verde', en_compra: 'azul', recibida_parcial: 'ambar', completada: 'verde', rechazada: 'gris',
}
export const codigoOC = (oc: Pick<OrdenCompra, 'numero'>) => `OC-${String(oc.numero).padStart(4, '0')}`

/** Meta de OTIF del semáforo de Compras (14 §5.3): verde ≥ 95 %, rojo < 88 %. */
export const OTIF_VERDE = 0.95
export const OTIF_ROJO = 0.88
/** RULE-305: OTIF móvil de 90 días del proveedor bajo 85 % (con al menos 3 OC). */
export const OTIF_PROVEEDOR_MIN = 0.85
/** RULE-306: compras urgentes del último mes sobre 20 % (con al menos 5 OC). */
export const URGENTES_MAX = 0.2
export const VENTANA_DIAS = 90

export const valorUF = (cfg: Config) => cfg.valorUF ?? 40_000
export const limiteAdmin = (cfg: Config) => (cfg.umbrales.limiteOcUf ?? 150) * valorUF(cfg)
export const umbralCotizaciones = (cfg: Config) => (cfg.umbrales.cotizacionesUf ?? 100) * valorUF(cfg)

// ───────────────────────── Montos y recepciones ─────────────────────────

export const montoLinea = (l: LineaOC) => Math.round(l.cantidad * l.precio)
export const montoOC = (oc: Pick<OrdenCompra, 'lineas'>) => oc.lineas.reduce((s, l) => s + montoLinea(l), 0)

export const recibidoLinea = (oc: OrdenCompra, lineaId: string, t: Dia) =>
  oc.recepciones.filter((r) => r.fecha <= t).reduce((s, r) => s + (r.cantidades[lineaId] ?? 0), 0)
export const pendienteLinea = (oc: OrdenCompra, l: LineaOC, t: Dia) => Math.max(0, l.cantidad - recibidoLinea(oc, l.id, t))
export const recibidaCompleta = (oc: OrdenCompra, t: Dia) => oc.lineas.every((l) => pendienteLinea(oc, l, t) <= 1e-9)

/** Día en que quedó recibida completa (null si todavía no). */
export function fechaCompleta(oc: OrdenCompra): Dia | null {
  const fechas = [...new Set(oc.recepciones.map((r) => r.fecha))].sort((a, b) => a - b)
  return fechas.find((f) => recibidaCompleta(oc, f)) ?? null
}

export function estadoOC(oc: OrdenCompra, t: Dia): EstadoOC | null {
  if (oc.creado > t) return null
  const base = oc.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'borrador'
  if (base !== 'enviada') return base
  if (!oc.recepciones.some((r) => r.fecha <= t)) return 'enviada'
  return recibidaCompleta(oc, t) ? 'recibida' : 'recibida_parcial'
}

/** Aprobada y no anulada ni cerrada: su saldo por recibir es compromiso de la partida. */
const COMPROMETE: EstadoOC[] = ['aprobada', 'enviada', 'recibida_parcial']
export function compromisoOC(ocs: OrdenCompra[], obraId: string, t: Dia): Map<string, number> {
  const out = new Map<string, number>()
  for (const oc of ocs) {
    if (oc.obraId !== obraId || !COMPROMETE.includes(estadoOC(oc, t) ?? 'borrador')) continue
    for (const l of oc.lineas) out.set(l.partidaId, (out.get(l.partidaId) ?? 0) + Math.round(pendienteLinea(oc, l, t) * l.precio))
  }
  return out
}

export const fechaPaso = (oc: OrdenCompra, estado: EstadoOC) => oc.historial.find((p) => p.estado === estado)?.fecha

// ───────────────────────── Solicitudes (10 §12) ─────────────────────────

export function estadoSolicitud(s: SolicitudMaterial, ocs: OrdenCompra[], t: Dia): EstadoSolicitud | null {
  if (s.creado > t) return null
  const base = s.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'enviada'
  if (base === 'rechazada' || base === 'atendida_bodega' || base === 'completada') return base
  const oc = s.ordenCompraId ? ocs.find((o) => o.id === s.ordenCompraId) : undefined
  const e = oc ? estadoOC(oc, t) : null
  if (!oc || !e || e === 'anulada') return base === 'en_compra' ? 'enviada' : base
  const lineas = oc.lineas.filter((l) => l.solicitudId === s.id)
  const recibido = lineas.reduce((x, l) => x + recibidoLinea(oc, l.id, t), 0)
  if (recibido >= s.cantidad - 1e-9) return 'completada'
  return recibido > 0 ? 'recibida_parcial' : 'en_compra'
}

/** 19: solicitan R03 y R04; compra R07 (R02 aprueba); el catálogo lo mantienen R07 y R05; proveedores, R07. */
export const puedeSolicitar = (rol: Rol) => rol === 'R03' || rol === 'R04'
export const puedeComprar = (rol: Rol) => rol === 'R07'
export const puedeEditarCatalogo = (rol: Rol) => rol === 'R07' || rol === 'R05'
export const puedeEditarProveedores = (rol: Rol) => rol === 'R07'
export const puedeRechazarSolicitud = (rol: Rol) => rol === 'R03' || rol === 'R07'

// ───────────────────────── Transiciones de la OC (10 §13) ─────────────────────────

export type AccionOC = 'enviar_aprobacion' | 'aprobar' | 'devolver' | 'enviar' | 'cerrar' | 'anular'
export const ACCIONES_OC: Record<AccionOC, string> = {
  enviar_aprobacion: 'Enviar a aprobación', aprobar: 'Aprobar', devolver: 'Devolver con observaciones', enviar: 'Enviar al proveedor',
  cerrar: 'Registrar factura y cerrar', anular: 'Anular',
}
const PERMISOS: Partial<Record<EstadoOC, Partial<Record<AccionOC, Rol[]>>>> = {
  borrador: { enviar_aprobacion: ['R07', 'R02'], anular: ['R07', 'R02'] },
  por_aprobar: { aprobar: ['R02', 'R01'], devolver: ['R02', 'R01'], anular: ['R07', 'R02'] },
  aprobada: { enviar: ['R07'], anular: ['R07', 'R02'] },
  enviada: { anular: ['R07', 'R02'] },
  // La factura la registra Finanzas (10 §13)
  recibida: { cerrar: ['R09'] },
}

/** RN-P04 / RULE-301 y RULE-304: sobre el límite o fuera de presupuesto la aprueba Gerencia. */
export const requiereGerencia = (oc: OrdenCompra, cfg: Config) => montoOC(oc) > limiteAdmin(cfg) || (oc.fueraPresupuesto?.length ?? 0) > 0
/** RULE-303: sobre el umbral sin 3 cotizaciones exige justificación. */
export const faltanCotizaciones = (oc: OrdenCompra, cfg: Config) => montoOC(oc) > umbralCotizaciones(cfg) && oc.cotizaciones < 3

export function accionesOC(oc: OrdenCompra, t: Dia, rol: Rol, cfg: Config): AccionOC[] {
  const e = estadoOC(oc, t)
  if (!e) return []
  return (Object.entries(PERMISOS[e] ?? {}) as [AccionOC, Rol[]][])
    .filter(([a, roles]) => roles.includes(rol) && !(a === 'aprobar' && rol === 'R02' && requiereGerencia(oc, cfg)))
    .map(([a]) => a)
}
export const puedeRecibir = (oc: OrdenCompra, t: Dia, rol: Rol) => (rol === 'R07' || rol === 'R03') && ['enviada', 'recibida_parcial'].includes(estadoOC(oc, t) ?? '')

export function aplicarAccionOC(
  oc: OrdenCompra, accion: AccionOC,
  x: { fecha: Dia; autor: string; texto?: string; proveedor?: Proveedor; cfg: Config; saldoPartida?: (partidaId: string) => number },
): OrdenCompra {
  const e = estadoOC(oc, x.fecha)
  if (!e || !(accion in (PERMISOS[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_OC[accion].toLowerCase()} una OC ${e ? ESTADOS_OC[e].toLowerCase() : 'inexistente'}.`)
  const texto = x.texto?.trim()
  const paso = (estado: EstadoOC) => [...oc.historial, { fecha: x.fecha, estado, por: x.autor, ...(texto ? { texto } : {}) }]
  switch (accion) {
    case 'enviar_aprobacion': {
      if (!x.proveedor || x.proveedor.estado !== 'activo') throw new Error(`RULE-302: el proveedor está ${x.proveedor?.estado ?? 'sin registrar'}; no se puede emitir la OC.`)
      if (oc.lineas.length === 0 || oc.lineas.some((l) => !(l.cantidad > 0) || !(l.precio > 0))) throw new Error('Cada línea necesita cantidad y precio.')
      if (faltanCotizaciones(oc, x.cfg) && !oc.justificacion?.trim()) throw new Error('RULE-303: sobre el umbral se necesitan 3 cotizaciones o una justificación (proveedor único, urgencia).')
      // Fuera de presupuesto: líneas cuyo monto supera el saldo de la partida (presupuesto − ejecutado − comprometido)
      const usado = new Map<string, number>()
      const fuera: string[] = []
      for (const l of oc.lineas) {
        const acumulado = (usado.get(l.partidaId) ?? 0) + montoLinea(l)
        usado.set(l.partidaId, acumulado)
        if (x.saldoPartida && acumulado > x.saldoPartida(l.partidaId)) fuera.push(l.id)
      }
      return { ...oc, fueraPresupuesto: fuera, historial: paso('por_aprobar') }
    }
    case 'aprobar':
      return { ...oc, historial: paso('aprobada') }
    case 'devolver':
      if (!texto) throw new Error('Indica qué hay que corregir.')
      return { ...oc, historial: paso('borrador') }
    case 'enviar':
      return { ...oc, historial: paso('enviada') }
    case 'cerrar':
      if (!texto) throw new Error('Indica el número de factura.')
      return { ...oc, factura: texto, historial: paso('cerrada') }
    case 'anular':
      if (!texto) throw new Error('Indica el motivo de la anulación.')
      if (oc.recepciones.some((r) => r.fecha <= x.fecha)) throw new Error('Tiene recepciones registradas: no se puede anular.')
      return { ...oc, historial: paso('anulada') }
  }
}

/** Valida y agrega una recepción (no más de lo pendiente por línea). */
export function registrarRecepcion(oc: OrdenCompra, r: { id: string; fecha: Dia; guia: string; cantidades: Record<string, number>; recibidoPor: string }): OrdenCompra {
  if (!r.guia.trim()) throw new Error('Indica el número de guía de despacho.')
  const cant = Object.fromEntries(Object.entries(r.cantidades).filter(([, q]) => q > 0))
  if (Object.keys(cant).length === 0) throw new Error('Indica al menos una cantidad recibida.')
  for (const [id, q] of Object.entries(cant)) {
    const l = oc.lineas.find((x) => x.id === id)
    if (!l) throw new Error('Línea inexistente.')
    if (q > pendienteLinea(oc, l, r.fecha) + 1e-9) throw new Error('No se puede recibir más de lo pendiente.')
  }
  return { ...oc, recepciones: [...oc.recepciones, { ...r, guia: r.guia.trim(), cantidades: cant }] }
}

// ───────────────────────── Indicadores KAB y semáforo ─────────────────────────

/** Entrega debida: recibida completa o con la fecha comprometida ya pasada (y no anulada). */
function evaluable(oc: OrdenCompra, t: Dia) {
  const e = estadoOC(oc, t)
  if (!e || e === 'borrador' || e === 'por_aprobar' || e === 'anulada') return false
  return fechaCompleta(oc) != null && fechaCompleta(oc)! <= t ? true : oc.fechaEntrega < t
}
/** On time in full: completa a más tardar en la fecha comprometida. */
export const esOTIF = (oc: OrdenCompra) => { const f = fechaCompleta(oc); return f != null && f <= oc.fechaEntrega }

export function otif(ocs: OrdenCompra[], t: Dia, ventana = VENTANA_DIAS): { valor: number | null; n: number; ok: number } {
  const ev = ocs.filter((oc) => evaluable(oc, t) && oc.fechaEntrega > t - ventana)
  const ok = ev.filter((oc) => esOTIF(oc) && fechaCompleta(oc)! <= t).length
  return { valor: ev.length ? ok / ev.length : null, n: ev.length, ok }
}

export const estadoOTIF = (v: number | null): EstadoSemaforo => (v == null ? 'na' : v >= OTIF_VERDE ? 'verde' : v >= OTIF_ROJO ? 'amarillo' : 'rojo')

export interface IndicadoresCompras {
  /** KAB-06 (semáforo Compras), 90 días. */
  otif: number | null
  otifN: number
  /** KAB-01: primera recepción en fecha / OC recibidas. */
  enFecha: number | null
  /** KAB-02: días entre la solicitud (o la OC) y la recepción completa. */
  leadTime: number | null
  /** KAB-03: OC urgentes / OC emitidas (90 días). */
  urgentes: number | null
  /** KAB-09: monto fuera de presupuesto / monto comprado. */
  fueraPresupuesto: number | null
  /** KAB-12: días entre la solicitud y la aprobación de la OC. */
  tiempoCompra: number | null
  montoComprado: number
  nOC: number
  porAprobar: number
  solicitudesPendientes: number
  estado: EstadoSemaforo
}

const prom = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

export function indicadoresCompras(ocsTodas: OrdenCompra[], solicitudes: SolicitudMaterial[], obraId: string, t: Dia): IndicadoresCompras {
  const ocs = ocsTodas.filter((o) => o.obraId === obraId && o.creado <= t)
  const sols = solicitudes.filter((s) => s.obraId === obraId)
  const o = otif(ocs, t)
  const emitidas = ocs.filter((oc) => {
    const ap = fechaPaso(oc, 'aprobada')
    return ap != null && ap <= t && ap > t - VENTANA_DIAS && estadoOC(oc, t) !== 'anulada'
  })
  const recibidas = ocs.filter((oc) => oc.recepciones.some((r) => r.fecha <= t) && oc.fechaEntrega > t - VENTANA_DIAS)
  const solDe = (oc: OrdenCompra) => oc.lineas.map((l) => sols.find((s) => s.id === l.solicitudId)?.creado).filter((x): x is number => x != null)
  const lead = recibidas.map((oc) => { const f = fechaCompleta(oc); const desde = Math.min(...solDe(oc), oc.creado); return f != null && f <= t ? f - desde : null }).filter((x): x is number => x != null)
  const tiempo = emitidas.map((oc) => { const s = solDe(oc); return s.length ? fechaPaso(oc, 'aprobada')! - Math.min(...s) : null }).filter((x): x is number => x != null)
  const monto = emitidas.reduce((s, oc) => s + montoOC(oc), 0)
  const fuera = emitidas.reduce((s, oc) => s + oc.lineas.filter((l) => oc.fueraPresupuesto?.includes(l.id)).reduce((x, l) => x + montoLinea(l), 0), 0)
  return {
    otif: o.valor,
    otifN: o.n,
    enFecha: recibidas.length ? recibidas.filter((oc) => Math.min(...oc.recepciones.map((r) => r.fecha)) <= oc.fechaEntrega).length / recibidas.length : null,
    leadTime: prom(lead),
    urgentes: emitidas.length ? emitidas.filter((oc) => oc.urgente).length / emitidas.length : null,
    fueraPresupuesto: monto ? fuera / monto : null,
    tiempoCompra: prom(tiempo),
    montoComprado: monto,
    nOC: emitidas.length,
    porAprobar: ocs.filter((oc) => estadoOC(oc, t) === 'por_aprobar').length,
    solicitudesPendientes: sols.filter((s) => ['enviada', 'en_gestion'].includes(estadoSolicitud(s, ocsTodas, t) ?? '')).length,
    estado: estadoOTIF(o.valor),
  }
}

/** OTIF móvil de 90 días de un proveedor en todas las obras (RULE-305). */
export const otifProveedor = (ocs: OrdenCompra[], proveedorId: string, t: Dia) => otif(ocs.filter((o) => o.proveedorId === proveedorId), t)

/** Compras urgentes del último mes (RULE-306). */
export function urgentesMes(ocs: OrdenCompra[], obraId: string, t: Dia) {
  const mes = ocs.filter((oc) => { const ap = fechaPaso(oc, 'aprobada'); return oc.obraId === obraId && ap != null && ap <= t && ap > t - 30 && estadoOC(oc, t) !== 'anulada' })
  const urg = mes.filter((oc) => oc.urgente)
  return { n: mes.length, urgentes: urg, fraccion: mes.length ? urg.length / mes.length : null }
}
