// Flujo de caja por obra (v1.3: 14 KFI, 13 "Flujo de caja proyectado", 12 RULE-603/402).
//
// Ingresos: anticipo, estados de pago (EP) cobrados o por cobrar y retenciones devueltas al
// término. Egresos: costos registrados (proveedores, subcontratos, GG) al plazo de pago,
// remuneraciones a fin de mes (HH de los RDO validados) y el costo por completar (ETC)
// distribuido según el avance proyectado. Hasta el corte es real; después, lo comprometido
// (documentos ya registrados) y lo estimado. Montos netos, sin IVA.
import { programaDe, type Datos } from './datos'
import { calcularObraPlan, costoRegistro, type CalcObra } from './evm'
import { finDeMes } from './fechas'
import { puCostoTipo } from './presupuesto'
import { recepcionProvisoria } from './contrato'
import { anticipoPorAmortizar, DIAS_PREPARACION_EP, epVencido, etapaEP, montosEP, pagadoHasta, presentadoEn, vigente } from './estadosPago'
import type { CondicionesPago, Dia, EstadoPago, EstadoSemaforo, Partida } from './types'

export const CONDICIONES_PAGO_DEFECTO: CondicionesPago = {
  anticipo: 0, retencion: 0.05, diasAprobacion: 10, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.2,
}

/** Días entre el cobro del EP al mandante y el pago a los subcontratistas del mismo período. */
export const DIAS_PAGO_CONTRA_PAGO = 5

export type TipoMovimiento = 'anticipo' | 'cobro_ep' | 'retencion' | 'proveedores' | 'remuneraciones' | 'gastos_generales'

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, string> = {
  anticipo: 'Anticipo', cobro_ep: 'Cobro de EP', retencion: 'Devolución de retenciones',
  proveedores: 'Proveedores y subcontratos', remuneraciones: 'Remuneraciones', gastos_generales: 'Gastos generales',
}

/** real: ya ocurrió · comprometido: documento registrado, por pagar o cobrar · estimado: proyección. */
export type OrigenMovimiento = 'real' | 'comprometido' | 'estimado'

export interface Movimiento {
  fecha: Dia
  /** Positivo = ingreso. */
  monto: number
  tipo: TipoMovimiento
  origen: OrigenMovimiento
  detalle: string
}

export function condicionesDe(obra: { condicionesPago?: CondicionesPago }): CondicionesPago {
  return { ...CONDICIONES_PAGO_DEFECTO, ...obra.condicionesPago }
}

export interface SemanaCaja {
  desde: Dia
  ingresos: number
  egresos: number
  /** Caja disponible al final de la semana (capital + flujo acumulado). */
  saldo: number
  /** La semana terminó antes del corte (todo real). */
  real: boolean
  /** Retenciones de EP acumuladas (retenidas por el mandante y aún no devueltas) al final de la semana. */
  retenido: number
}

/** Retención de un EP (monto > 0, en su corte) o devolución de retenciones (monto < 0). */
export interface MovRetencion { fecha: Dia; monto: number }

export interface ResumenCaja {
  condiciones: CondicionesPago
  movimientos: Movimiento[]
  /** Capital de trabajo asignado a la obra (monto). */
  capital: number
  /** Posición neta de la obra al corte: cobros − pagos acumulados. */
  saldoHoy: number
  /** Caja disponible al corte: capital + saldoHoy. */
  disponibleHoy: number
  /** KFI-06: caja disponible proyectada mínima en los próximos 60 días. */
  minimo60: number
  fechaMinimo60: Dia
  colchon: number
  estado: EstadoSemaforo
  /** EP facturados sin pagar. */
  cxc: number
  cxcVencida: number
  epVencidos: EstadoPago[]
  /** Pagos comprometidos en los próximos 30 días. */
  porPagar30: number
  /** KFI-04: avance valorizado validado no cubierto por EP aprobados. */
  avanceNoCobrado: number
  retenciones: MovRetencion[]
  semanas: SemanaCaja[]
}

const ventaDe = (p: Partida) => p.cantidad * p.puVenta

export function calcularCaja(d: Datos, c: CalcObra): ResumenCaja {
  const obra = c.obra
  const T = c.corte
  const cond = condicionesDe(obra)
  const movs: Movimiento[] = []
  const add = (fecha: Dia, monto: number, tipo: TipoMovimiento, detalle: string, futuro: OrigenMovimiento = 'comprometido') => {
    if (Math.abs(monto) < 1) return
    movs.push({ fecha, monto: Math.round(monto), tipo, detalle, origen: fecha <= T ? 'real' : futuro })
  }

  // --- Estados de pago presentados y no anulados al corte ---
  const eps = d.estadosPago.filter((e) => e.obraId === obra.id && vigente(e, T)).sort((a, b) => a.numero - b.numero)
  let cxc = 0
  let cxcVencida = 0
  const epVencidos: EstadoPago[] = []
  for (const ep of eps) {
    const tipo: TipoMovimiento = ep.tipo === 'anticipo' ? 'anticipo' : 'cobro_ep'
    const nombre = ep.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${ep.numero}`
    for (const p of ep.pagos) if (p.fecha <= T) add(p.fecha, p.monto, tipo, nombre)
    const saldo = ep.neto - pagadoHasta(ep, T)
    if (saldo < 1) continue
    const etapa = etapaEP(ep, T)
    let fecha: Dia
    if (etapa === 'facturado' || etapa === 'pagado_parcial') {
      cxc += saldo
      fecha = ep.vencimiento ?? ep.facturado! + cond.diasPago
      if (epVencido(ep, T)) { cxcVencida += saldo; epVencidos.push(ep) }
    } else if (etapa === 'aprobado') fecha = ep.aprobado! + 1 + cond.diasPago
    // Presentado u observado: se cobra tras aprobarse (un observado se demora un ciclo más)
    else fecha = Math.max(presentadoEn(ep)!, T) + cond.diasAprobacion + 1 + cond.diasPago
    // Lo atrasado se espera cobrar la próxima semana
    const etiqueta = etapa === 'facturado' ? 'facturado' : etapa === 'pagado_parcial' ? 'saldo' : etapa === 'aprobado' ? 'aprobado' : etapa === 'observado' ? 'observado' : 'en aprobación'
    add(Math.max(fecha, T + 7), saldo, tipo, `${nombre} (${etiqueta})`)
  }

  // --- Avance futuro: curva de la línea base reescalada al término proyectado ---
  // Solo partidas vigentes: las de órdenes de cambio pendientes no tienen venta todavía
  const partidas = c.partidas.map((cp) => cp.p)
  const venta = partidas.reduce((s, p) => s + ventaDe(p), 0)
  const puVenta = new Map(partidas.map((p) => [p.id, p.puVenta]))
  const valReal = c.partidas.reduce((s, cp) => s + Math.min(cp.cantEjec, cp.p.cantidad) * (puVenta.get(cp.p.id) ?? 0), 0)
  const finProy = Math.max(c.terminoProyectado, T + 7)
  const finLB = Math.max(obra.fechaInicio + obra.plazoDias, ...(programaDe(d, obra.id, 'lineaBase')?.actividades ?? []).map((a) => a.fin))
  const plan = new Map<Dia, number>()
  const P = (s: Dia) => { if (!plan.has(s)) plan.set(s, calcularObraPlan(d, obra.id, s).avancePlan); return plan.get(s)! }
  const P0 = finLB > T ? P(T) : 1
  /** Fracción (0–1) del trabajo pendiente ejecutada entre el corte y t. */
  const g = (t: Dia) => {
    if (t <= T) return 0
    if (t >= finProy) return 1
    const lineal = (t - T) / (finProy - T)
    if (P0 >= 0.999) return lineal
    const s = Math.round(T + (t - T) * ((finLB - T) / (finProy - T)))
    return Math.min(1, Math.max(0, (P(s) - P0) / (1 - P0)))
  }

  // --- EP futuros: un corte por mes hasta completar la venta ---
  const valIncluido = eps.filter((e) => e.tipo === 'avance').reduce((s, e) => s + e.bruto, 0)
  let porAmortizar = anticipoPorAmortizar(eps, T)
  let retenido = eps.reduce((s, e) => s + e.retencion, 0)
  const retenciones: MovRetencion[] = eps.filter((e) => e.retencion > 0).map((e) => ({ fecha: e.fechaCorte, monto: e.retencion }))
  let previo = valIncluido
  let numero = (eps.at(-1)?.numero ?? 0) + 1
  // Parte en el primer corte pendiente: el EP del mes recién cerrado puede no estar presentado aún
  const ultimoCorte = eps.filter((e) => e.tipo === 'avance').at(-1)?.fechaCorte
  const primerCorte = finDeMes(ultimoCorte != null ? ultimoCorte + 1 : obra.fechaInicio)
  for (let corte = primerCorte; previo < venta - 1 && corte <= finDeMes(finProy) + 1; corte = finDeMes(corte + 1)) {
    const valor = valReal + Math.max(0, venta - valReal) * g(corte)
    const bruto = valor - previo
    if (bruto <= 1) continue
    const m = montosEP(bruto, cond, porAmortizar)
    porAmortizar -= m.amortizacion
    retenido += m.retencion
    if (m.retencion > 0) retenciones.push({ fecha: corte, monto: m.retencion })
    add(Math.max(corte + DIAS_PREPARACION_EP + cond.diasAprobacion + 1 + cond.diasPago, T + 7), m.neto, 'cobro_ep', `EP N° ${numero++} (estimado)`, 'estimado')
    previo = valor
  }
  // Las retenciones se devuelven tras la recepción provisoria (o el término proyectado si aún no hay)
  const recepcion = recepcionProvisoria(d.recepciones, obra.id, T)
  if (retenido > 0) retenciones.push({ fecha: Math.max((recepcion?.fecha ?? finProy) + cond.diasDevolucionRetencion, T + 7), monto: -retenido })
  if (retenido > 0)
    add(Math.max((recepcion?.fecha ?? finProy) + cond.diasDevolucionRetencion, T + 7), retenido, 'retencion',
      recepcion ? 'Devolución de retenciones (recepción provisoria)' : 'Devolución de retenciones al término', recepcion ? 'comprometido' : 'estimado')

  // --- Egresos registrados: proveedores, subcontratos y GG al plazo de pago ---
  // Pagos a proveedores registrados por Finanzas (v1.3): el costo sale en la fecha de su pago
  const pagoRegistrado = new Map(d.transacciones.filter((x) => x.tipo === 'pago' && x.refId && x.obraId === obra.id && x.fecha <= T).map((x) => [x.refId!, x.fecha]))
  for (const k of d.costos) {
    // Las remuneraciones salen de los RDO (más abajo)
    if (k.obraId !== obra.id || k.fecha > T || k.tipo === 'MO') continue
    add(pagoRegistrado.get(k.id) ?? k.fecha + cond.diasPagoProveedores, -k.monto, k.tipo === 'GG' ? 'gastos_generales' : 'proveedores', k.proveedor ?? k.descripcion)
  }

  // Subcontratos "contra pago": el trabajo de un mes se paga unos días después de cobrar al
  // mandante el EP de ese mismo mes
  const pagoSubcontrato = (finMes: Dia) => finMes + DIAS_PREPARACION_EP + cond.diasAprobacion + 1 + cond.diasPago + DIAS_PAGO_CONTRA_PAGO

  // Trabajo de subcontratistas ejecutado y aún no facturado (provisión del EVM)
  if (c.provisionSub > 0) add(pagoSubcontrato(finDeMes(T)), -c.provisionSub, 'proveedores', 'Subcontratos ejecutados por facturar')

  // --- Remuneraciones: HH de los RDO validados, pagadas a fin de mes ---
  const cuadrillas = new Map(d.cuadrillas.filter((q) => q.obraId === obra.id).map((q) => [q.id, q]))
  const porMes = new Map<Dia, number>()
  for (const r of d.rdos) {
    if (r.obraId !== obra.id || r.estado !== 'validado' || r.fecha > T) continue
    const costo = r.hh.reduce((s, h) => s + costoRegistro(h, cuadrillas.get(r.cuadrillaId), d.config.umbrales.recargoExtra), 0)
    const mes = finDeMes(r.fecha)
    porMes.set(mes, (porMes.get(mes) ?? 0) + costo)
  }
  for (const [mes, monto] of porMes) add(mes, -monto, 'remuneraciones', 'Remuneraciones del mes')

  // --- Costo por completar (ETC) según el avance proyectado ---
  const etcDirecto = Math.max(0, c.eacDir - c.acDir)
  const ggFuturo = Math.max(0, c.ggEac - c.ggAc)
  // Cada tipo de costo se paga a su ritmo: remuneraciones a fin de mes; subcontratos contra
  // pago del EP del mes; materiales y equipos al plazo de pago
  const fraccion = (tipo: 'MO' | 'SUB') => c.bacDir > 0 ? partidas.reduce((s, p) => s + p.cantidad * puCostoTipo(p, tipo), 0) / c.bacDir : 0
  const fraccionMO = fraccion('MO')
  const fraccionSUB = fraccion('SUB')
  for (let ini = T; ini < finProy; ) {
    // Tramos hasta cada fin de mes (el primero parte en el corte)
    const fin = Math.min(finDeMes(ini + 1), finProy)
    const tramo = g(fin) - g(ini)
    const mes = finDeMes(fin)
    add(mes, -etcDirecto * tramo * fraccionMO, 'remuneraciones', 'Remuneraciones proyectadas', 'estimado')
    add(pagoSubcontrato(mes), -etcDirecto * tramo * fraccionSUB, 'proveedores', 'Subcontratos por completar', 'estimado')
    add(Math.round((ini + fin) / 2) + cond.diasPagoProveedores, -etcDirecto * tramo * (1 - fraccionMO - fraccionSUB), 'proveedores', 'Materiales y equipos por completar', 'estimado')
    add(mes, -ggFuturo * ((fin - ini) / (finProy - T)), 'gastos_generales', 'Gastos generales proyectados', 'estimado')
    ini = fin
  }

  movs.sort((a, b) => a.fecha - b.fecha || b.monto - a.monto)

  // --- Saldos ---
  const saldoHoy = movs.filter((m) => m.origen === 'real').reduce((s, m) => s + m.monto, 0)
  const capital = cond.capitalTrabajo * venta
  const disponibleHoy = capital + saldoHoy
  let saldo = disponibleHoy
  let minimo60 = disponibleHoy
  let fechaMinimo60 = T
  for (const m of movs) {
    if (m.origen === 'real' || m.fecha > T + 60) continue
    saldo += m.monto
    if (saldo < minimo60) { minimo60 = saldo; fechaMinimo60 = m.fecha }
  }
  const colchon = (d.config.umbrales.cajaColchon ?? 0.02) * venta
  const estado: EstadoSemaforo = T < obra.fechaInicio ? 'na' : minimo60 >= colchon ? 'verde' : minimo60 >= 0 ? 'amarillo' : 'rojo'

  const aprobado = eps.filter((e) => e.tipo === 'avance' && e.aprobado != null && e.aprobado <= T).reduce((s, e) => s + e.bruto, 0)
  const porPagar30 = -movs.filter((m) => m.origen === 'comprometido' && m.monto < 0 && m.fecha <= T + 30).reduce((s, m) => s + m.monto, 0)

  return {
    condiciones: cond, movimientos: movs, capital, saldoHoy, disponibleHoy, minimo60, fechaMinimo60, colchon, estado,
    cxc, cxcVencida, epVencidos, porPagar30, avanceNoCobrado: Math.max(0, valReal - aprobado), retenciones,
    semanas: semanasDe(movs, obra.fechaInicio, T, capital, retenciones),
  }
}

/** Movimientos agrupados por semana (lunes), desde el inicio de la obra hasta el último movimiento. */
export function semanasDe(movs: Movimiento[], inicio: Dia, corte: Dia, capital = 0, retenciones: MovRetencion[] = []): SemanaCaja[] {
  if (movs.length === 0) return []
  const lunes = (t: Dia) => t - ((new Date(t * 86_400_000).getUTCDay() + 6) % 7)
  const desde = lunes(Math.min(inicio, movs[0].fecha))
  const hasta = movs.at(-1)!.fecha
  const out: SemanaCaja[] = []
  let saldo = capital
  let i = 0
  for (let s = desde; s <= hasta; s += 7) {
    let ingresos = 0
    let egresos = 0
    while (i < movs.length && movs[i].fecha < s + 7) {
      if (movs[i].monto >= 0) ingresos += movs[i].monto
      else egresos -= movs[i].monto
      i++
    }
    saldo += ingresos - egresos
    const retenido = retenciones.reduce((a, r) => a + (r.fecha < s + 7 ? r.monto : 0), 0)
    out.push({ desde: s, ingresos, egresos, saldo, real: s + 6 <= corte, retenido: Math.max(0, retenido) })
  }
  return out
}

/** Suma las cajas de varias obras (vista de cartera). */
export function consolidarCaja(cajas: ResumenCaja[], corte: Dia): Omit<ResumenCaja, 'condiciones' | 'estado'> & { estado: EstadoSemaforo } {
  const movimientos = cajas.flatMap((c) => c.movimientos).sort((a, b) => a.fecha - b.fecha || b.monto - a.monto)
  const saldoHoy = cajas.reduce((s, c) => s + c.saldoHoy, 0)
  const capital = cajas.reduce((s, c) => s + c.capital, 0)
  const disponibleHoy = capital + saldoHoy
  let saldo = disponibleHoy
  let minimo60 = disponibleHoy
  let fechaMinimo60 = corte
  for (const m of movimientos) {
    if (m.origen === 'real' || m.fecha > corte + 60) continue
    saldo += m.monto
    if (saldo < minimo60) { minimo60 = saldo; fechaMinimo60 = m.fecha }
  }
  const colchon = cajas.reduce((s, c) => s + c.colchon, 0)
  const inicio = Math.min(...cajas.map((c) => c.semanas[0]?.desde ?? corte))
  return {
    movimientos, capital, saldoHoy, disponibleHoy, minimo60, fechaMinimo60, colchon,
    estado: minimo60 >= colchon ? 'verde' : minimo60 >= 0 ? 'amarillo' : 'rojo',
    cxc: cajas.reduce((s, c) => s + c.cxc, 0),
    cxcVencida: cajas.reduce((s, c) => s + c.cxcVencida, 0),
    epVencidos: cajas.flatMap((c) => c.epVencidos),
    porPagar30: cajas.reduce((s, c) => s + c.porPagar30, 0),
    avanceNoCobrado: cajas.reduce((s, c) => s + c.avanceNoCobrado, 0),
    retenciones: cajas.flatMap((c) => c.retenciones),
    semanas: semanasDe(movimientos, inicio, corte, capital, cajas.flatMap((c) => c.retenciones)),
  }
}
