// Benchmarking y scores estratégicos (v2: 14 §6–§13, 13 "Scores Estratégicos").
// El benchmark de la red OBRAI compara a la empresa con un agregado anónimo de constructoras de su
// segmento (n ≥ 10, ninguna > 30 %). Esta versión trae una REFERENCIA SECTORIAL DE DEMOSTRACIÓN con
// percentiles simulados: el cálculo de la posición es el definitivo; en producción la referencia vendrá
// del agregado de la red. Los scores (empresa, riesgo, mandante, administrador, subcontratista y
// proveedor) y los índices OBR se calculan con los datos propios.
import { estadoKpi, norm, normKpi, umbral } from './umbrales'
import { consolidarCaja } from './caja'
import { acreditacion, estadoEPConDocs } from './cumplimiento'
import { rendimientosReales } from './comercial'
import { otif } from './compras'
import type { Datos } from './datos'
import { epAtrasado, indicadoresEP } from './estadosPago'
import { calcularObra, type CalcObra } from './evm'
import { cuentasPorCobrar } from './finanzas'
import { etapaOC } from './ordenesCambio'
import { exposicionRiesgo, riesgoActivo } from './riesgos'
import { healthScore } from './semaforo'
import { esCTP } from './seguridad'
import type { Dia, Obra } from './types'

export interface ObraCalc { o: Obra; c: CalcObra }

/** Obras con programa calculadas al corte (las en planificación sin Carta Gantt no aportan). */
export function cartera(d: Datos, t: Dia): ObraCalc[] {
  return d.obras.filter((o) => d.programas.some((p) => p.obraId === o.id) && o.fechaInicio <= t).map((o) => ({ o, c: calcularObra(d, o.id, t) }))
}
const enEjecucion = (xs: ObraCalc[]) => xs.filter((x) => x.o.estado === 'en_ejecucion')
const ponderado = (xs: ObraCalc[], f: (x: ObraCalc) => number | null) => {
  const v = xs.map((x) => ({ v: f(x), w: x.c.venta })).filter((y) => y.v != null && y.w > 0)
  const w = v.reduce((s, y) => s + y.w, 0)
  return w > 0 ? v.reduce((s, y) => s + y.v! * y.w, 0) / w : null
}

// --- Segmento (14 §7) ---
export interface Segmento { tamano: string; linea: string; mandante: string; region: string; volumen: string; trabajadores: number; volumenUF: number }

export function segmento(d: Datos, xs: ObraCalc[], t: Dia): Segmento {
  const trabajadores = d.cuadrillas.filter((q) => enEjecucion(xs).some((x) => x.o.id === q.obraId)).reduce((s, q) => s + q.trabajadores, 0)
  const uf = d.config.valorUF ?? 40_000
  // Volumen ejecutado en 12 meses: valor ganado del período
  const volumenUF = xs.reduce((s, x) => s + x.c.ev - (x.o.fechaInicio < t - 365 ? calcularObra(d, x.o.id, t - 365).ev : 0), 0) / uf
  const porLinea = new Map<string, number>()
  for (const x of xs) porLinea.set(x.o.lineaNegocio, (porLinea.get(x.o.lineaNegocio) ?? 0) + x.c.venta)
  const linea = [...porLinea].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  const publico = d.clientes.filter((c) => c.tipo === 'publico').map((c) => c.nombre)
  const ventaPublica = xs.filter((x) => publico.includes(x.o.mandante)).reduce((s, x) => s + x.c.venta, 0)
  return {
    tamano: trabajadores < 10 ? 'Micro (< 10 trabajadores)' : trabajadores < 50 ? 'Pequeña (10–49 trabajadores)' : trabajadores < 200 ? 'Mediana (50–199 trabajadores)' : 'Grande (200+ trabajadores)',
    linea: linea === 'Edificación' ? 'Edificación habitacional' : linea === 'Remodelaciones' ? 'Remodelación / habilitación' : linea,
    mandante: ventaPublica > xs.reduce((s, x) => s + x.c.venta, 0) / 2 ? 'Público' : 'Inmobiliaria / empresa privada',
    region: d.config.region ?? 'Coquimbo',
    volumen: volumenUF < 20_000 ? '< 20.000 UF' : volumenUF < 100_000 ? '20.000 – 100.000 UF' : volumenUF < 500_000 ? '100.000 – 500.000 UF' : '> 500.000 UF',
    trabajadores, volumenUF,
  }
}

// --- Referencia sectorial (simulada para la demo) ---
/** Percentiles P10, P25, P50, P75 y P90 (valores crecientes) y si un valor menor es mejor. */
export interface Distribucion { p: [number, number, number, number, number]; menorMejor?: boolean }

export const REFERENCIA_DEMO = {
  fuente: 'Referencia sectorial de demostración (datos simulados)',
  empresas: 47,
  metricas: {
    spi: { p: [0.82, 0.9, 0.96, 1.0, 1.04] },
    cpi: { p: [0.88, 0.94, 0.99, 1.02, 1.06] },
    margen: { p: [-0.06, -0.03, -0.01, 0.005, 0.02] },
    aprobacionEP: { p: [5, 8, 12, 18, 25], menorMejor: true },
    cobroEP: { p: [26, 33, 42, 55, 75], menorMejor: true },
    accidentabilidad: { p: [0.5, 1.5, 2.8, 4.0, 6.0], menorMejor: true },
    rework: { p: [0.008, 0.017, 0.028, 0.045, 0.07], menorMejor: true },
    primera: { p: [0.7, 0.8, 0.87, 0.92, 0.96] },
    otif: { p: [0.72, 0.82, 0.89, 0.94, 0.97] },
    noProductivas: { p: [0.03, 0.05, 0.07, 0.1, 0.14], menorMejor: true },
  } satisfies Record<string, Distribucion>,
  /** BEN-007: HH por unidad P25 / P50 / P75 por partida estandarizada. */
  rendimientos: [
    { patron: /^Moldaje/, nombre: 'Moldaje de muros y losas (m²)', p: [0.48, 0.55, 0.66] },
    { patron: /^Hormigón/, nombre: 'Hormigón en elementos (m³)', p: [0.2, 0.25, 0.32] },
    { patron: /^Albañilería/, nombre: 'Albañilería de ladrillo (m²)', p: [0.75, 0.88, 1.02] },
    { patron: /^Excavación/, nombre: 'Excavación masiva (m³)', p: [0.06, 0.08, 0.11] },
    { patron: /^Relleno/, nombre: 'Relleno compactado (m³)', p: [0.25, 0.3, 0.38] },
    { patron: /^Tabiquería/, nombre: 'Tabiquería volcometal (m²)', p: [0.35, 0.42, 0.5] },
    { patron: /^Cielos/, nombre: 'Cielos modulares (m²)', p: [0.25, 0.3, 0.37] },
    { patron: /^Demoliciones/, nombre: 'Demoliciones y retiros (m²)', p: [0.28, 0.35, 0.42] },
    { patron: /^Estucos/, nombre: 'Estucos (m²)', p: [0.38, 0.45, 0.55] },
    { patron: /^Cerámicos/, nombre: 'Cerámicos (m²)', p: [0.5, 0.6, 0.72] },
  ] as { patron: RegExp; nombre: string; p: [number, number, number] }[],
}
export type Metrica = keyof typeof REFERENCIA_DEMO.metricas

/** Percentil (1–99) de un valor en la distribución; orientado para que más alto sea mejor. */
export function percentil(v: number, dist: Distribucion): number {
  const xs = dist.p
  const ps = [10, 25, 50, 75, 90]
  let pos: number
  if (v <= xs[0]) pos = Math.max(1, 10 * (xs[1] > xs[0] ? 1 - (xs[0] - v) / (xs[1] - xs[0]) : 1))
  else if (v >= xs[4]) pos = Math.min(99, 90 + 10 * (xs[4] > xs[3] ? Math.min(1, (v - xs[4]) / (xs[4] - xs[3])) : 1))
  else {
    let k = 0
    while (v > xs[k + 1]) k++
    pos = ps[k] + ((ps[k + 1] - ps[k]) * (v - xs[k])) / (xs[k + 1] - xs[k] || 1)
  }
  pos = Math.min(99, Math.max(1, pos))
  return Math.round(dist.menorMejor ? 100 - pos : pos)
}

export const NOMBRES_METRICA: Record<Metrica, { ben: string; nombre: string; formato: 'indice' | 'pct' | 'pp' | 'dias' | 'num' }> = {
  spi: { ben: 'BEN-002', nombre: 'Plazo (SPI)', formato: 'indice' },
  cpi: { ben: 'BEN-003', nombre: 'Costo (CPI)', formato: 'indice' },
  margen: { ben: 'BEN-003', nombre: 'Margen proyectado vs ofertado', formato: 'pp' },
  aprobacionEP: { ben: 'BEN-004', nombre: 'Días de aprobación de EP', formato: 'dias' },
  cobroEP: { ben: 'BEN-004', nombre: 'Días de cobro de EP', formato: 'dias' },
  accidentabilidad: { ben: 'BEN-005', nombre: 'Accidentabilidad (CTP por 100 trabajadores, 12 meses)', formato: 'num' },
  rework: { ben: 'BEN-006', nombre: 'Rework rate', formato: 'pct' },
  primera: { ben: 'BEN-006', nombre: 'Aprobación a la primera', formato: 'pct' },
  otif: { ben: 'BEN-008', nombre: 'OTIF de proveedores', formato: 'pct' },
  noProductivas: { ben: 'BEN-002', nombre: 'HH no productivas', formato: 'pct' },
}

/** Indicadores propios comparables con la referencia. */
export function metricasEmpresa(d: Datos, xs: ObraCalc[], t: Dia): Partial<Record<Metrica, number>> {
  const ej = enEjecucion(xs)
  const ids = xs.map((x) => x.o.id)
  const ctp = d.incidentes.filter((i) => ids.includes(i.obraId) && esCTP(i) && i.fecha > t - 365 && i.fecha <= t).length
  // KSE-03: trabajadores promedio = dotación de las cuadrillas que reportan, por día trabajado (12 meses)
  const cq = new Map(d.cuadrillas.map((q) => [q.id, q.trabajadores]))
  const porDia = new Map<Dia, number>()
  for (const r of d.rdos) if (ids.includes(r.obraId) && r.fecha > t - 365 && r.fecha <= t && r.estado === 'validado') porDia.set(r.fecha, (porDia.get(r.fecha) ?? 0) + (cq.get(r.cuadrillaId) ?? 0))
  const trabProm = porDia.size ? [...porDia.values()].reduce((s, x) => s + x, 0) / porDia.size : 0
  const hhTot = ej.reduce((s, x) => s + x.c.hhTotal, 0)
  const out: Partial<Record<Metrica, number | null>> = {
    spi: ponderado(ej, (x) => x.c.spi),
    cpi: ponderado(ej, (x) => x.c.cpi),
    margen: ponderado(ej, (x) => x.c.margenProyectado - x.o.margenOfertado),
    aprobacionEP: indicadoresEP(d.estadosPago.filter((e) => ids.includes(e.obraId)), t).diasAprobacion,
    cobroEP: cuentasPorCobrar(d, ids, t).dso,
    accidentabilidad: trabProm > 0 ? (ctp / trabProm) * 100 : null,
    rework: ponderado(ej, (x) => x.c.calidad.reworkRate),
    primera: ponderado(ej, (x) => x.c.calidad.primera),
    otif: otif(d.ordenesCompra.filter((oc) => ids.includes(oc.obraId)), t).valor,
    noProductivas: hhTot > 0 ? ej.reduce((s, x) => s + x.c.hhNoProd, 0) / hhTot : null,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null)) as Partial<Record<Metrica, number>>
}

export interface Posicion { m: Metrica; valor: number; percentil: number; p50: number }

export function benchmark(d: Datos, xs: ObraCalc[], t: Dia) {
  const ref = REFERENCIA_DEMO
  const met = metricasEmpresa(d, xs, t)
  const posiciones: Posicion[] = (Object.keys(met) as Metrica[]).map((m) => ({ m, valor: met[m]!, percentil: percentil(met[m]!, ref.metricas[m]), p50: ref.metricas[m].p[2] }))
  const promedio = posiciones.length ? posiciones.reduce((s, x) => s + x.percentil, 0) / posiciones.length : 50
  // BEN-007: rendimientos propios (HH/u reales) contra los de referencia
  const rendimientos = rendimientosReales(d, t).flatMap((r) => {
    const ref7 = ref.rendimientos.find((x) => x.patron.test(r.descripcion))
    const f = r.fuentes.filter((x) => x.hhReal != null && x.avance >= 0.2).sort((a, b) => b.avance - a.avance)[0]
    if (!ref7 || !f) return []
    return [{ nombre: ref7.nombre, partida: r.descripcion, obra: f.obra, propio: f.hhReal!, presupuesto: f.hhPres, p25: ref7.p[0], p50: ref7.p[1], p75: ref7.p[2] }]
  })
  return {
    fuente: ref.fuente, empresas: ref.empresas, posiciones, promedio,
    /** BEN-001: posición en el segmento (1 = mejor). */
    posicion: Math.max(1, Math.round(ref.empresas * (1 - promedio / 100)) + 1),
    rendimientos,
  }
}

// --- Scores (0–100) ---
/** crítico → 0, alerta → 60, objetivo → 100 (la misma normalización del Health Score, umbrales.ts). */
export { norm }
export const promedio = (xs: [number | null, number][]) => {
  const v = xs.filter((x): x is [number, number] => x[0] != null)
  const w = v.reduce((s, x) => s + x[1], 0)
  return w > 0 ? Math.round(v.reduce((s, x) => s + x[0] * x[1], 0) / w) : null
}
export const nivelScore = (s: number | null) => (s == null ? '—' : s >= 90 ? 'Excelente' : s >= 80 ? 'Muy bueno' : s >= 70 ? 'Bueno' : s >= 60 ? 'Riesgo' : 'Crítico')

/** Score Salud Empresa (14 §5.2): 60 % obras, 20 % liquidez, 10 % backlog, 10 % accidentabilidad. */
export function scoreEmpresa(d: Datos, xs: ObraCalc[], t: Dia) {
  const ej = enEjecucion(xs)
  const obras = ponderado(ej, (x) => healthScore(x.c, d.config))
  const caja = consolidarCaja(ej.map((x) => x.c.caja), t)
  const venta = ej.reduce((s, x) => s + x.c.venta, 0)
  const backlog = ej.reduce((s, x) => s + x.c.venta * (1 - x.c.avanceReal), 0)
  // Producción mensual: valor ganado de los últimos 90 días / 3
  const produccion = ej.reduce((s, x) => s + x.c.ev - (x.o.fechaInicio < t - 90 ? calcularObra(d, x.o.id, t - 90).ev : 0), 0) / 3
  const meses = produccion > 0 ? backlog / produccion : null
  const met = metricasEmpresa(d, xs, t)
  const componentes = {
    obras: obras != null ? Math.round(obras) : null,
    liquidez: venta > 0 ? norm(caja.minimo60 / venta, d.config.umbrales.cajaColchon ?? 0.02, 0, -0.05) : null,
    backlog: normKpi(d.config, 'KFI-07', meses),
    accidentabilidad: norm(met.accidentabilidad ?? 0, 2.8, 4, 6),
  }
  return {
    score: promedio([[componentes.obras, 0.6], [componentes.liquidez, 0.2], [componentes.backlog, 0.1], [componentes.accidentabilidad, 0.1]]),
    componentes, backlog, mesesBacklog: meses, caja,
  }
}

/** Score de Riesgo Empresarial (14 §13): Bajo · Medio · Alto · Crítico. */
export function riesgoEmpresarial(d: Datos, xs: ObraCalc[], t: Dia) {
  const ej = enEjecucion(xs)
  const factores: { factor: string; puntos: number; detalle: string }[] = []
  const caja = consolidarCaja(ej.map((x) => x.c.caja), t)
  if (caja.estado === 'rojo') factores.push({ factor: 'Liquidez', puntos: 3, detalle: 'Caja proyectada bajo cero en 60 días' })
  else if (caja.estado === 'amarillo') factores.push({ factor: 'Liquidez', puntos: 1, detalle: 'Caja proyectada bajo el colchón' })
  const cxc = cuentasPorCobrar(d, xs.map((x) => x.o.id), t)
  if (cxc.vencidos > 0) factores.push({ factor: 'EP vencidos', puntos: cxc.items.some((i) => (i.vencidoHace ?? 0) > 30) ? 2 : 1, detalle: `${cxc.items.filter((i) => i.vencidoHace != null).length} EP vencidos` })
  const backlog = new Map<string, number>()
  for (const x of ej) backlog.set(x.o.mandante, (backlog.get(x.o.mandante) ?? 0) + x.c.venta * (1 - x.c.avanceReal))
  const total = [...backlog.values()].reduce((s, v) => s + v, 0)
  const mayor = [...backlog].sort((a, b) => b[1] - a[1])[0]
  const concentracion = total > 0 && mayor ? mayor[1] / total : 0
  if (estadoKpi(d.config, 'KCM-05', concentracion) !== 'verde') factores.push({ factor: 'Concentración de mandante (KCM-05)', puntos: estadoKpi(d.config, 'KCM-05', concentracion) === 'rojo' ? 2 : 1, detalle: `${mayor![0]}: ${Math.round(concentracion * 100)} % del backlog` })
  const exposicion = d.riesgos.filter((r) => riesgoActivo(r, t)).reduce((s, r) => s + (exposicionRiesgo(r, t)?.monto ?? 0), 0)
  const contingencia = ej.reduce((s, x) => s + Math.max(0, x.c.venta * (x.c.margenProyectado - d.config.umbrales.margenMinimo)), 0)
  if (exposicion > contingencia) factores.push({ factor: 'Exposición de riesgos (KRI-04)', puntos: 2, detalle: 'La exposición supera la contingencia del margen' })
  if (ej.some((x) => x.c.seguridad.ctp > 0 || x.c.seguridad.graveMes)) factores.push({ factor: 'Accidentabilidad', puntos: 2, detalle: 'Accidente con tiempo perdido en el mes' })
  const bloqueados = d.epsSubcontrato.filter((e) => { const sc = d.subcontratos.find((s) => s.id === e.subcontratoId); return sc && estadoEPConDocs(e, sc, d.documentosLaborales, t) === 'bloqueado' }).length
  if (bloqueados > 0) factores.push({ factor: 'Cumplimiento laboral de subcontratistas', puntos: 1, detalle: `${bloqueados} EP retenidos por falta de F30-1` })
  const vac = ej.filter((x) => x.c.bac > 0 && estadoKpi(d.config, 'KCO-14', x.c.vac / x.c.bac) === 'rojo')
  if (vac.length) factores.push({ factor: 'Obras con VAC < −7 %', puntos: 2, detalle: vac.map((x) => x.o.nombre).join(', ') })
  const puntos = factores.reduce((s, f) => s + f.puntos, 0)
  return { nivel: puntos <= 1 ? 'Bajo' : puntos <= 3 ? 'Medio' : puntos <= 5 ? 'Alto' : 'Crítico', puntos, factores, concentracion, mandanteMayor: mayor?.[0] ?? null } as const
}

/** Score Mandante (13): puntualidad de pago, días de aprobación, adicionales rechazados, margen obtenido. */
export function scoresMandante(d: Datos, xs: ObraCalc[], t: Dia) {
  const mandantes = [...new Set(xs.map((x) => x.o.mandante))]
  return mandantes.map((m) => {
    const obras = xs.filter((x) => x.o.mandante === m)
    const ids = obras.map((x) => x.o.id)
    const eps = d.estadosPago.filter((e) => ids.includes(e.obraId) && e.anulado == null)
    const pagados = eps.filter((e) => e.pagado != null && e.vencimiento != null && e.pagado <= t)
    const atraso = pagados.length ? pagados.reduce((s, e) => s + Math.max(0, e.pagado! - e.vencimiento!), 0) / pagados.length : null
    const aprob = indicadoresEP(eps, t).diasAprobacion
    const ocs = d.ordenesCambio.filter((o) => ids.includes(o.obraId))
    const resueltas = ocs.filter((o) => ['aprobada_mandante', 'rechazada'].includes(etapaOC(o, t) ?? ''))
    const rechazo = resueltas.length ? resueltas.filter((o) => etapaOC(o, t) === 'rechazada').length / resueltas.length : null
    const margen = ponderado(obras, (x) => x.c.margenProyectado)
    const comp = { pago: norm(atraso ?? 0, 0, 10, 30), aprobacion: norm(aprob, 7, 15, 30), adicionales: norm(rechazo ?? 0, 0, 0.25, 0.5), margen: norm(margen, ponderado(obras, (x) => x.o.margenOfertado) ?? d.config.umbrales.margenMinimo, d.config.umbrales.margenMinimo, 0) }
    return { mandante: m, obras: obras.length, atraso, aprob, rechazo, margen, score: promedio([[comp.pago, 0.35], [comp.aprobacion, 0.25], [comp.adicionales, 0.15], [comp.margen, 0.25]]) }
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** Score Administrador de Obra (13; solo Gerencia): margen vs ofertado, plazo, accidentabilidad, RDO y EP a tiempo. */
export function scoresAdministrador(d: Datos, xs: ObraCalc[], t: Dia) {
  const admins = [...new Set(enEjecucion(xs).map((x) => x.o.administrador))]
  return admins.map((a) => {
    const obras = enEjecucion(xs).filter((x) => x.o.administrador === a)
    const margen = ponderado(obras, (x) => x.c.margenProyectado - x.o.margenOfertado)
    const spi = ponderado(obras, (x) => x.c.spi)
    const ctp = obras.reduce((s, x) => s + x.c.seguridad.ctp, 0)
    const sinRDO = obras.reduce((s, x) => s + x.c.diasSinRDO.length, 0)
    const epTarde = obras.filter((x) => epAtrasado(d, x.o.id, t) != null).length
    const comp = { margen: norm(margen, 0, -0.03, -0.08), plazo: normKpi(d.config, 'KPL-05', spi), seguridad: ctp ? 30 : 100, rdo: norm(sinRDO, 0, 2, 5), ep: epTarde ? 40 : 100 }
    return { administrador: a, obras: obras.map((x) => x.o.nombre), margen, spi, ctp, sinRDO, epTarde, score: promedio([[comp.margen, 0.3], [comp.plazo, 0.25], [comp.seguridad, 0.15], [comp.rdo, 0.15], [comp.ep, 0.15]]) }
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** Score Subcontratista (13): calidad (NCR), cumplimiento laboral (F30-1) y seguridad (incidentes). */
export function scoresSubcontratista(d: Datos, t: Dia) {
  return d.proveedores.filter((p) => p.esSubcontratista && d.subcontratos.some((s) => s.subcontratistaId === p.id)).map((p) => {
    const scs = d.subcontratos.filter((s) => s.subcontratistaId === p.id)
    const ncr = d.noConformidades.filter((n) => n.responsable === p.nombre && n.creado <= t && n.creado > t - 180).length
    const bloqueados = scs.reduce((s, sc) => s + d.epsSubcontrato.filter((e) => e.subcontratoId === sc.id && estadoEPConDocs(e, sc, d.documentosLaborales, t) === 'bloqueado').length, 0)
    const alDia = scs.filter((sc) => acreditacion(sc, d.trabajadores, d.documentosLaborales, t).alDia).length / scs.length
    const incidentes = d.incidentes.filter((i) => i.empresa === p.nombre && i.fecha <= t && i.fecha > t - 365).length
    const comp = { calidad: norm(ncr, 0, 2, 5), laboral: promedio([[norm(bloqueados, 0, 1, 3), 0.6], [alDia * 100, 0.4]]), seguridad: norm(incidentes, 0, 1, 3) }
    return { subcontratista: p.nombre, contratos: scs.length, ncr, bloqueados, alDia, incidentes, score: promedio([[comp.calidad, 0.35], [comp.laboral, 0.4], [comp.seguridad, 0.25]]) }
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** Score Proveedor (13): puntualidad y cumplimiento (OTIF de 90 días). */
export function scoresProveedor(d: Datos, t: Dia) {
  return d.proveedores.filter((p) => !p.esSubcontratista).map((p) => {
    const o = otif(d.ordenesCompra.filter((oc) => oc.proveedorId === p.id), t)
    return { proveedor: p.nombre, ocs: o.n, otif: o.valor, score: o.valor != null ? Math.round(normKpi(d.config, 'KAB-06', o.valor)!) : null }
  }).filter((x) => x.ocs > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** OBR-001 (1–5) y OBR-004 (0–100): madurez del control de gestión y calidad de los datos. */
export function indicesOBR(d: Datos, xs: ObraCalc[], t: Dia) {
  const ej = enEjecucion(xs)
  const ids = ej.map((x) => x.o.id)
  const checks = [
    { nombre: 'Presupuesto con APU por recursos', ok: d.partidas.filter((p) => ids.includes(p.obraId)).every((p) => p.recursos.length > 0) },
    { nombre: 'Línea base formal', ok: ej.every((x) => !!x.c.lb) },
    { nombre: 'Avance por cantidades (RDO)', ok: ej.every((x) => x.c.diasSinRDO.length <= 1) },
    { nombre: 'Costo imputado a partida (KCO-08 en meta)', ok: ej.every((x) => x.c.pctNoImputado <= umbral(d.config, 'KCO-08').objetivo!) },
    { nombre: 'Cierre semanal (EVM)', ok: ids.every((id) => d.periodos.some((p) => p.obraId === id && p.fechaCorte > t - 14)) },
    { nombre: 'Forecast por partida revisado', ok: d.ajustes.some((a) => ids.includes(a.obraId)) },
    { nombre: 'Alertas con acción correctiva', ok: d.alertas.some((a) => ids.includes(a.obraId) && a.acciones.length > 0) },
  ]
  const madurez = Math.round((1 + (4 * checks.filter((c) => c.ok).length) / checks.length) * 10) / 10
  const calidadDatos = promedio(ej.map((x) => [promedio([[normKpi(d.config, 'KCO-08', x.c.pctNoImputado), 0.4], [norm(x.c.diasSinRDO.length, 0, 2, 5), 0.3], [norm(x.c.rdoPendientes, 2, 6, 15), 0.3]]), x.c.venta] as [number | null, number]))
  return { madurez, checks, calidadDatos }
}
