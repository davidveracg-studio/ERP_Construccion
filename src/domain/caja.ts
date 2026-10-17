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
import type { CondicionesPago, Dia, EstadoPago, EstadoSemaforo, Partida } from './types'

export const CONDICIONES_PAGO_DEFECTO: CondicionesPago = {
  anticipo: 0, retencion: 0.05, diasAprobacion: 10, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.2,
}

/** Días entre el corte del EP y su presentación al mandante. */
export const DIAS_PREPARACION_EP = 3

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

export type EtapaEP = 'presentado' | 'aprobado' | 'facturado' | 'pagado'

export const ETAPAS_EP: Record<EtapaEP, string> = { presentado: 'Presentado', aprobado: 'Aprobado', facturado: 'Facturado', pagado: 'Pagado' }

/** Etapa del EP al cierre del día t (null si aún no se presentaba). */
export function etapaEP(ep: EstadoPago, t: Dia): EtapaEP | null {
  if (ep.pagado != null && ep.pagado <= t) return 'pagado'
  if (ep.facturado != null && ep.facturado <= t) return 'facturado'
  if (ep.aprobado != null && ep.aprobado <= t) return 'aprobado'
  return ep.presentado <= t ? 'presentado' : null
}

/** Facturado, sin pagar y con el vencimiento superado al día t (RULE-402). */
export function epVencido(ep: EstadoPago, t: Dia): boolean {
  return etapaEP(ep, t) === 'facturado' && ep.vencimiento != null && ep.vencimiento < t
}

export function condicionesDe(obra: { condicionesPago?: CondicionesPago }): CondicionesPago {
  return { ...CONDICIONES_PAGO_DEFECTO, ...obra.condicionesPago }
}

/** Montos de un EP de avance a partir de su valor bruto y lo que queda por amortizar del anticipo. */
export function montosEP(bruto: number, cond: CondicionesPago, anticipoPorAmortizar: number) {
  const retencion = Math.round(bruto * cond.retencion)
  const amortizacion = Math.round(Math.min(bruto * cond.anticipo, Math.max(0, anticipoPorAmortizar)))
  return { retencion, amortizacion, neto: bruto - retencion - amortizacion }
}

/** Anticipo recibido menos lo amortizado en los EP presentados hasta t. */
export function anticipoPorAmortizar(eps: EstadoPago[], t: Dia) {
  const vigentes = eps.filter((e) => e.presentado <= t)
  return vigentes.filter((e) => e.tipo === 'anticipo').reduce((s, e) => s + e.bruto, 0) - vigentes.reduce((s, e) => s + e.amortizacion, 0)
}

/**
 * Líneas del próximo EP de avance al corte: lo ejecutado y validado hasta el corte que aún no
 * se ha incluido en un EP, valorizado a precio de venta.
 */
export function lineasEP(d: Pick<Datos, 'rdos' | 'estadosPago' | 'partidas'>, obraId: string, corte: Dia) {
  const ejecutado = new Map<string, number>()
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.estado !== 'validado' || r.fecha > corte) continue
    for (const a of r.avances) ejecutado.set(a.partidaId, (ejecutado.get(a.partidaId) ?? 0) + a.cantidad)
  }
  const incluido = new Map<string, number>()
  for (const e of d.estadosPago)
    if (e.obraId === obraId) for (const l of e.lineas) incluido.set(l.partidaId, (incluido.get(l.partidaId) ?? 0) + l.cantidad)
  const partidas = new Map(d.partidas.filter((p) => p.obraId === obraId).map((p) => [p.id, p]))
  const lineas: EstadoPago['lineas'] = []
  for (const [pid, q] of ejecutado) {
    const p = partidas.get(pid)
    const cantidad = Math.min(q, p?.cantidad ?? q) - (incluido.get(pid) ?? 0)
    if (!p || cantidad <= 1e-9) continue
    lineas.push({ partidaId: pid, cantidad: Math.round(cantidad * 10_000) / 10_000, monto: Math.round(cantidad * p.puVenta) })
  }
  return lineas
}

export interface SemanaCaja {
  desde: Dia
  ingresos: number
  egresos: number
  /** Caja disponible al final de la semana (capital + flujo acumulado). */
  saldo: number
  /** La semana terminó antes del corte (todo real). */
  real: boolean
}

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

  // --- Estados de pago presentados hasta el corte ---
  const eps = d.estadosPago.filter((e) => e.obraId === obra.id && e.presentado <= T).sort((a, b) => a.numero - b.numero)
  let cxc = 0
  let cxcVencida = 0
  const epVencidos: EstadoPago[] = []
  for (const ep of eps) {
    const tipo: TipoMovimiento = ep.tipo === 'anticipo' ? 'anticipo' : 'cobro_ep'
    const nombre = ep.tipo === 'anticipo' ? 'Anticipo' : `EP N° ${ep.numero}`
    const etapa = etapaEP(ep, T)
    if (etapa === 'pagado') { add(ep.pagado!, ep.neto, tipo, nombre); continue }
    let fecha: Dia
    if (etapa === 'facturado') {
      cxc += ep.neto
      fecha = ep.vencimiento ?? ep.facturado! + cond.diasPago
      if (fecha < T) { cxcVencida += ep.neto; epVencidos.push(ep) }
    } else if (etapa === 'aprobado') fecha = ep.aprobado! + 1 + cond.diasPago
    else fecha = ep.presentado + cond.diasAprobacion + 1 + cond.diasPago
    // Lo atrasado se espera cobrar la próxima semana
    add(Math.max(fecha, T + 7), ep.neto, tipo, `${nombre} (${etapa === 'facturado' ? 'facturado' : etapa === 'aprobado' ? 'aprobado' : 'en aprobación'})`)
  }

  // --- Avance futuro: curva de la línea base reescalada al término proyectado ---
  const partidas = d.partidas.filter((p) => p.obraId === obra.id)
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
    add(Math.max(corte + DIAS_PREPARACION_EP + cond.diasAprobacion + 1 + cond.diasPago, T + 7), m.neto, 'cobro_ep', `EP N° ${numero++} (estimado)`, 'estimado')
    previo = valor
  }
  if (retenido > 0) add(finProy + cond.diasDevolucionRetencion, retenido, 'retencion', 'Devolución de retenciones al término', 'estimado')

  // --- Egresos registrados: proveedores, subcontratos y GG al plazo de pago ---
  for (const k of d.costos) {
    // Las remuneraciones salen de los RDO (más abajo)
    if (k.obraId !== obra.id || k.fecha > T || k.tipo === 'MO') continue
    add(k.fecha + cond.diasPagoProveedores, -k.monto, k.tipo === 'GG' ? 'gastos_generales' : 'proveedores', k.proveedor ?? k.descripcion)
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

  const aprobado = eps.filter((e) => e.tipo === 'avance' && (etapaEP(e, T) ?? 'presentado') !== 'presentado').reduce((s, e) => s + e.bruto, 0)
  const porPagar30 = -movs.filter((m) => m.origen === 'comprometido' && m.monto < 0 && m.fecha <= T + 30).reduce((s, m) => s + m.monto, 0)

  return {
    condiciones: cond, movimientos: movs, capital, saldoHoy, disponibleHoy, minimo60, fechaMinimo60, colchon, estado,
    cxc, cxcVencida, epVencidos, porPagar30, avanceNoCobrado: Math.max(0, valReal - aprobado),
    semanas: semanasDe(movs, obra.fechaInicio, T, capital),
  }
}

/** Movimientos agrupados por semana (lunes), desde el inicio de la obra hasta el último movimiento. */
export function semanasDe(movs: Movimiento[], inicio: Dia, corte: Dia, capital = 0): SemanaCaja[] {
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
    out.push({ desde: s, ingresos, egresos, saldo, real: s + 6 <= corte })
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
    semanas: semanasDe(movimientos, inicio, corte, capital),
  }
}
