// Motor de Control de Obra (13 §5): EVM, forecast por partida, plazo y productividad.
// Fórmulas en docs 14 §3–§4.
import { calcularCaja, type ResumenCaja } from './caja'
import { compromisoOC, indicadoresCompras, type IndicadoresCompras } from './compras'
import { indicadoresCalidad, type IndicadoresCalidad } from './calidad'
import { calcularCPM, type ResultadoCPM } from './cpm'
import { programaDe, type Datos } from './datos'
import { diaSemana, diasHabilesEntre } from './fechas'
import { bacPartida, costoHHPres, hhPorUnidad, puCosto, puCostoTipo, ventaPartida } from './presupuesto'
import { partidaVigente } from './ordenesCambio'
import { avanceActividades, cantidadesProgramadas } from './programa'
import type { Actividad, AjusteForecast, Confianza, Cuadrilla, Dia, Obra, Partida, Programa, TipoRecurso } from './types'

export interface CalcPartida {
  p: Partida
  bac: number
  venta: number
  cantEjec: number
  cantProg: number
  avance: number
  avanceProg: number
  pv: number
  ev: number
  ac: number
  acPorTipo: Record<TipoRecurso, number>
  qPorTipo: Record<TipoRecurso, number | null>
  comprometido: number
  /** Costo de subcontrato provisionado por avance aún no facturado. */
  provisionSub: number
  cpi: number | null
  etc: number
  eac: number
  vac: number
  ajuste?: AjusteForecast
  hhReal: number
  hhPres: number
  rendReal: number | null
  rendPres: number | null
}

export interface HitoCalc {
  act: Actividad
  comprometida: Dia
  proyectada: Dia
  real?: Dia
  estado: 'cumplido' | 'cumplido_con_atraso' | 'en_riesgo' | 'vencido' | 'a_tiempo'
  atraso: number
}

export interface CalcObra {
  obra: Obra
  corte: Dia
  partidas: CalcPartida[]
  // Totales directos
  bacDir: number
  pvDir: number
  evDir: number
  acDir: number
  eacDir: number
  // Gastos generales, no productivas y sin imputar
  ggBac: number
  ggPv: number
  ggAc: number
  ggEac: number
  acNoProd: number
  acSinImputar: number
  provisionSub: number
  /** Partidas extraordinarias con avance o costo cuya orden de cambio no aprobó el mandante (RULE-105). */
  extraNoAprobado: { p: Partida; cantEjec: number; monto: number; costo: number }[]
  acExtraNoAprobado: number
  // Totales obra
  bac: number
  pv: number
  ev: number
  ac: number
  cv: number
  sv: number
  cpi: number | null
  spi: number | null
  eac: number
  etc: number
  vac: number
  tcpi: number | null
  venta: number
  margenProyectado: number
  margenDirecto: number
  resultado: number
  comprometido: number
  avanceReal: number
  avancePlan: number
  desvAvance: number
  plazoConsumido: number
  diasTranscurridos: number
  diasRestantes: number
  terminoContractual: Dia
  terminoProyectado: Dia
  atrasoProyectado: number
  holguraMin: number | null
  hhTotal: number
  hhProductivas: number
  hhNoProd: number
  hhExtra: number
  hhPresAvance: number
  productividadDesv: number | null
  pctNoImputado: number
  diasSinRDO: Dia[]
  rdoPendientes: number
  confianza: Confianza
  // Planificación
  lb?: Programa
  actualizado?: Programa
  cpm: Map<string, ResultadoCPM>
  cpmLB: Map<string, ResultadoCPM>
  avanceAct: Map<string, number>
  hitos: HitoCalc[]
  /** Flujo de caja de la obra (v1.3). */
  caja: ResumenCaja
  /** Indicadores de abastecimiento (v1.2, semáforo Compras). */
  compras: IndicadoresCompras
  calidad: IndicadoresCalidad
}

const TIPOS: TipoRecurso[] = ['MO', 'MAT', 'EQ', 'SUB', 'OTRO']
const ceroTipos = (): Record<TipoRecurso, number> => ({ MO: 0, MAT: 0, EQ: 0, SUB: 0, OTRO: 0 })

/** Inicio programado propio de las partidas que lo tienen (obras extraordinarias aprobadas). */
function desdePartidas(partidas: Partida[]) {
  return new Map(partidas.filter((p) => p.inicioProgramado != null).map((p) => [p.id, p.inicioProgramado!]))
}

export function hhDeRegistro(r: { trabajadores: number; horasNormales: number; horasExtra: number }) {
  return r.trabajadores * (r.horasNormales + r.horasExtra)
}

export function costoRegistro(
  r: { trabajadores: number; horasNormales: number; horasExtra: number },
  c: Cuadrilla | undefined,
  recargo: number,
) {
  const tarifa = c?.costoHH ?? 0
  return r.trabajadores * (r.horasNormales * tarifa + r.horasExtra * tarifa * (1 + recargo))
}

export function calcularObra(d: Datos, obraId: string, corte: Dia): CalcObra {
  const obra = d.obras.find((o) => o.id === obraId)
  if (!obra) throw new Error(`Obra ${obraId} no existe`)
  const u = d.config.umbrales
  // Las partidas extraordinarias de órdenes de cambio no aprobadas por el mandante no cuentan en
  // presupuesto, venta ni avance; su costo sí (ver extraNoAprobado y RULE-105)
  const todas = d.partidas.filter((p) => p.obraId === obraId)
  const partidas = todas.filter((p) => partidaVigente(p, d.ordenesCambio, corte))
  const pendientes = todas.filter((p) => !partidas.includes(p))
  const cuadrillas = new Map(d.cuadrillas.filter((c) => c.obraId === obraId).map((c) => [c.id, c]))
  const lb = programaDe(d, obraId, 'lineaBase')
  const actualizado = programaDe(d, obraId, 'actualizado') ?? lb

  // --- Avance y HH (solo RDO validados hasta el corte) ---
  const cantEjec = new Map<string, number>()
  const hhReal = new Map<string, number>()
  const acMO = new Map<string, number>()
  let hhNoProd = 0
  let hhExtra = 0
  let acNoProd = 0
  let rdoPendientes = 0
  const diasConRDO = new Set<Dia>()
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.fecha > corte) continue
    if (r.estado === 'enviado') rdoPendientes++
    if (r.estado === 'enviado' || r.estado === 'validado') diasConRDO.add(r.fecha)
    if (r.estado !== 'validado') continue
    for (const a of r.avances) cantEjec.set(a.partidaId, (cantEjec.get(a.partidaId) ?? 0) + a.cantidad)
    const c = cuadrillas.get(r.cuadrillaId)
    for (const h of r.hh) {
      const hh = hhDeRegistro(h)
      const costo = costoRegistro(h, c, u.recargoExtra)
      hhExtra += h.trabajadores * h.horasExtra
      if (h.partidaId && !h.causaNoProductiva) {
        hhReal.set(h.partidaId, (hhReal.get(h.partidaId) ?? 0) + hh)
        acMO.set(h.partidaId, (acMO.get(h.partidaId) ?? 0) + costo)
      } else {
        hhNoProd += hh
        acNoProd += costo
      }
    }
  }

  // --- Costos reales ---
  const acTipo = new Map<string, Record<TipoRecurso, number>>()
  const qTipo = new Map<string, Record<TipoRecurso, number | null>>()
  let ggAc = 0
  let acSinImputar = 0
  const pagadoCompromiso = new Map<string, number>()
  for (const c of d.costos) {
    if (c.obraId !== obraId || c.fecha > corte) continue
    if (c.compromisoId) pagadoCompromiso.set(c.compromisoId, (pagadoCompromiso.get(c.compromisoId) ?? 0) + c.monto)
    if (c.tipo === 'GG') { ggAc += c.monto; continue }
    if (!c.partidaId) { acSinImputar += c.monto; continue }
    const t = acTipo.get(c.partidaId) ?? ceroTipos()
    t[c.tipo] += c.monto
    acTipo.set(c.partidaId, t)
    const q = qTipo.get(c.partidaId) ?? { MO: 0, MAT: 0, EQ: 0, SUB: 0, OTRO: 0 }
    // La cantidad solo es utilizable si todos los registros del tipo la traen
    q[c.tipo] = q[c.tipo] == null || c.cantidad == null ? null : (q[c.tipo] as number) + c.cantidad
    qTipo.set(c.partidaId, q)
  }
  ggAc += acNoProd

  // --- Compromisos (saldo pendiente) ---
  const comprometido = new Map<string, number>()
  const compromisoSub = new Map<string, { monto: number; pagado: number }>()
  for (const k of d.compromisos) {
    if (k.obraId !== obraId || k.fecha > corte || !k.partidaId) continue
    const pagado = pagadoCompromiso.get(k.id) ?? 0
    if (k.tipo === 'SUB' && d.config.devengarSubcontratos) {
      const s = compromisoSub.get(k.partidaId) ?? { monto: 0, pagado: 0 }
      s.monto += k.monto
      s.pagado += pagado
      compromisoSub.set(k.partidaId, s)
      continue
    }
    comprometido.set(k.partidaId, (comprometido.get(k.partidaId) ?? 0) + Math.max(0, k.monto - pagado))
  }
  // Saldo por recibir de las órdenes de compra aprobadas (v1.2)
  for (const [pid, monto] of compromisoOC(d.ordenesCompra, obraId, corte)) comprometido.set(pid, (comprometido.get(pid) ?? 0) + monto)

  // --- Programado ---
  const cantidades = new Map(partidas.map((p) => [p.id, p.cantidad]))
  const cantProg = cantidadesProgramadas(lb, obra, cantidades, corte, desdePartidas(partidas))

  // --- Plazo (CPM sobre programa actualizado con reales) ---
  const pesos = new Map(partidas.map((p) => [p.id, puCosto(p)]))
  const actsAct = actualizado?.actividades ?? []
  const avanceAct = avanceActividades(actsAct, cantEjec, pesos)
  const terminoContractual = obra.fechaInicio + obra.plazoDias
  let cpm = new Map<string, ResultadoCPM>()
  let cpmLB = new Map<string, ResultadoCPM>()
  try {
    // Los hitos contractuales actúan como fecha límite (su fecha comprometida en la línea base)
    const limites = new Map((lb?.actividades ?? []).filter((a) => a.esHito && a.hitoContractual).map((a) => [a.id, a.inicio]))
    cpm = calcularCPM(actsAct, obra.fechaInicio, { usarReales: true, hoy: corte + 1, avance: avanceAct, fechaLimite: terminoContractual, limites })
    cpmLB = calcularCPM(lb?.actividades ?? [], obra.fechaInicio, { fechaLimite: terminoContractual, limites })
  } catch {
    // Programa con ciclos: se informa en la pantalla de programa
  }
  const terminoProyectado = cpm.size ? Math.max(...[...cpm.values()].map((r) => r.ef)) : terminoContractual
  const holguras = [...cpm.values()].map((r) => r.holgura).filter((h): h is number => h != null)
  const holguraMin = holguras.length ? Math.min(...holguras) : null

  const diasTranscurridos = Math.max(0, Math.min(obra.plazoDias, corte + 1 - obra.fechaInicio))
  const plazoConsumido = obra.plazoDias > 0 ? diasTranscurridos / obra.plazoDias : 0

  // SPI de obra (directos) para el método EAC cpi_spi
  let pvDir0 = 0
  let evDir0 = 0
  for (const p of partidas) {
    const pc = puCosto(p)
    pvDir0 += Math.min(p.cantidad, cantProg.get(p.id) ?? 0) * pc
    evDir0 += Math.min(p.cantidad, cantEjec.get(p.id) ?? 0) * pc
  }
  const spiObra = pvDir0 > 0 ? evDir0 / pvDir0 : null

  // --- Partidas ---
  const ajustes = new Map<string, AjusteForecast>()
  for (const a of d.ajustes.filter((x) => x.obraId === obraId && x.estado === 'aprobado' && x.fecha <= corte).sort((x, y) => x.fecha - y.fecha))
    ajustes.set(a.partidaId, a)

  let provisionSub = 0
  const calc: CalcPartida[] = partidas.map((p) => {
    const pc = puCosto(p)
    const bac = bacPartida(p)
    const ce = Math.min(p.cantidad, cantEjec.get(p.id) ?? 0)
    const cp = Math.min(p.cantidad, cantProg.get(p.id) ?? 0)
    const at = { ...(acTipo.get(p.id) ?? ceroTipos()) }
    at.MO += acMO.get(p.id) ?? 0
    const qt = { ...(qTipo.get(p.id) ?? { MO: 0, MAT: 0, EQ: 0, SUB: 0, OTRO: 0 }) }
    qt.MO = hhReal.get(p.id) ?? 0
    // Costo devengado de subcontratos: el avance validado se provisiona aunque
    // el EP del subcontratista aún no se haya contabilizado.
    let provision = 0
    let comp = comprometido.get(p.id) ?? 0
    if (d.config.devengarSubcontratos) {
      const devengado = ce * puCostoTipo(p, 'SUB')
      if (devengado > at.SUB) { provision = devengado - at.SUB; at.SUB = devengado; qt.SUB = null }
      const cs = compromisoSub.get(p.id)
      if (cs) comp += Math.max(0, cs.monto - Math.max(cs.pagado, at.SUB))
    }
    provisionSub += provision
    const ac = TIPOS.reduce((s, t) => s + at[t], 0)
    const ev = ce * pc
    const pv = cp * pc
    const avance = p.cantidad > 0 ? ce / p.cantidad : 0
    const cpiP = ac > 0 ? ev / ac : null
    const ajuste = ajustes.get(p.id)
    let etc: number
    if (ajuste) etc = ajuste.etc
    else if (avance >= 1) etc = 0
    else if (d.config.metodoEAC === 'presupuesto' || cpiP == null || avance < 0.1) etc = bac - ev
    else {
      const f = d.config.metodoEAC === 'cpi_spi' && spiObra ? cpiP * spiObra : cpiP
      etc = (bac - ev) / Math.min(2, Math.max(0.5, f))
    }
    etc = Math.max(0, etc)
    const eac = ac + etc
    const hpu = hhPorUnidad(p)
    const hr = hhReal.get(p.id) ?? 0
    return {
      p, bac, venta: ventaPartida(p), cantEjec: ce, cantProg: cp, avance,
      avanceProg: p.cantidad > 0 ? cp / p.cantidad : 0,
      pv, ev, ac, acPorTipo: at, qPorTipo: qt, comprometido: comp, provisionSub: provision,
      cpi: cpiP, etc, eac, vac: bac - eac, ajuste,
      hhReal: hr, hhPres: ce * hpu,
      rendReal: ce > 0 && hr > 0 ? hr / ce : null,
      rendPres: hpu > 0 ? hpu : null,
    }
  })

  // Trabajo extraordinario sin orden aprobada: costo incurrido sin venta ni presupuesto
  const extraNoAprobado = pendientes
    .map((p) => {
      const at = acTipo.get(p.id) ?? ceroTipos()
      const ce = cantEjec.get(p.id) ?? 0
      return { p, cantEjec: ce, monto: ce * p.puVenta, costo: TIPOS.reduce((s, t) => s + at[t], 0) + (acMO.get(p.id) ?? 0) }
    })
    .filter((x) => x.cantEjec > 0 || x.costo > 0)
  const acExtraNoAprobado = extraNoAprobado.reduce((s, x) => s + x.costo, 0)

  const suma = (f: (c: CalcPartida) => number) => calc.reduce((s, c) => s + f(c), 0)
  const bacDir = suma((c) => c.bac)
  const pvDir = suma((c) => c.pv)
  const evDir = suma((c) => c.ev)
  const acDir = suma((c) => c.ac)
  const eacDir = suma((c) => c.eac)

  // Gastos generales como nivel de esfuerzo (EV = PV)
  const ggBac = obra.ggPresupuesto
  const ggPv = ggBac * Math.min(1, plazoConsumido)
  const ggMensual = obra.plazoDias > 0 ? ggBac / obra.plazoDias : 0
  const ggEac = ggAc + ggMensual * Math.max(0, terminoProyectado - (corte + 1))

  const bac = bacDir + ggBac
  const pv = pvDir + ggPv
  const ev = evDir + ggPv
  const ac = acDir + ggAc + acSinImputar + acExtraNoAprobado
  const eac = eacDir + ggEac + acSinImputar + acExtraNoAprobado
  const venta = suma((c) => c.venta)
  const hhProductivas = [...hhReal.values()].reduce((s, v) => s + v, 0)
  const hhPresAvance = suma((c) => (c.rendPres != null && c.hhReal > 0 ? c.hhPres : 0))
  const hhRealConPres = suma((c) => (c.rendPres != null ? c.hhReal : 0))

  // Días hábiles sin RDO en los últimos 7 días
  const desde = Math.max(obra.fechaInicio, corte - 6)
  const diasSinRDO = obra.estado === 'en_ejecucion'
    ? diasHabilesEntre(desde, corte, d.config.diasHabiles).filter((x) => !diasConRDO.has(x))
    : []
  const pctNoImputado = ac > 0 ? acSinImputar / ac : 0
  let problemas = 0
  if (diasSinRDO.length > 1) problemas++
  if (pctNoImputado > 0.1) problemas++
  if (rdoPendientes > 5) problemas++
  if (diasSinRDO.length > 3) problemas++
  const confianza: Confianza = problemas === 0 ? 'alta' : problemas === 1 ? 'media' : 'baja'

  // Hitos
  const hitos: HitoCalc[] = actsAct
    .filter((a) => a.esHito)
    .map((a) => {
      const comprometida = lb?.actividades.find((x) => x.id === a.id)?.inicio ?? a.inicio
      const proyectada = cpm.get(a.id)?.es ?? a.inicio
      const real = a.finReal ?? a.inicioReal
      let estado: HitoCalc['estado']
      if (real != null) estado = real <= comprometida ? 'cumplido' : 'cumplido_con_atraso'
      else if (corte > comprometida) estado = 'vencido'
      else if (proyectada > comprometida) estado = 'en_riesgo'
      else estado = 'a_tiempo'
      return { act: a, comprometida, proyectada, real, estado, atraso: (real ?? proyectada) - comprometida }
    })

  const calculado = {
    obra, corte, partidas: calc,
    bacDir, pvDir, evDir, acDir, eacDir,
    ggBac, ggPv, ggAc, ggEac, acNoProd, acSinImputar, provisionSub, extraNoAprobado, acExtraNoAprobado,
    bac, pv, ev, ac,
    cv: ev - ac, sv: ev - pv,
    cpi: ac > 0 ? ev / ac : null,
    spi: pvDir > 0 ? evDir / pvDir : null,
    eac, etc: eac - ac, vac: bac - eac,
    tcpi: bac - ac !== 0 ? (bac - ev) / (bac - ac) : null,
    venta,
    margenProyectado: venta > 0 ? (venta - eac) / venta : 0,
    margenDirecto: venta > 0 ? (venta - eacDir) / venta : 0,
    resultado: venta - eac,
    comprometido: suma((c) => c.comprometido),
    avanceReal: bacDir > 0 ? evDir / bacDir : 0,
    avancePlan: bacDir > 0 ? pvDir / bacDir : 0,
    desvAvance: bacDir > 0 ? (evDir - pvDir) / bacDir : 0,
    plazoConsumido, diasTranscurridos,
    diasRestantes: Math.max(0, terminoContractual - (corte + 1)),
    terminoContractual, terminoProyectado,
    atrasoProyectado: terminoProyectado - terminoContractual,
    holguraMin,
    hhTotal: hhProductivas + hhNoProd, hhProductivas, hhNoProd, hhExtra, hhPresAvance,
    productividadDesv: hhPresAvance > 0 ? hhRealConPres / hhPresAvance - 1 : null,
    pctNoImputado, diasSinRDO, rdoPendientes, confianza,
    lb, actualizado, cpm, cpmLB, avanceAct, hitos,
  } as CalcObra
  // La caja usa el EVM ya calculado (costo por completar, término proyectado)
  calculado.caja = calcularCaja(d, calculado)
  calculado.compras = indicadoresCompras(d.ordenesCompra, d.solicitudesMaterial, obraId, corte)
  calculado.calidad = indicadoresCalidad(d, obraId, corte, calculado.ac)
  return calculado
}

export interface PuntoSerie {
  fecha: Dia
  pv: number
  ev?: number
  ac?: number
  avancePlan: number
  avanceReal?: number
}

/** Serie semanal para la Curva S: PV hasta el término contractual; EV/AC hasta el corte. */
export function serieCurvaS(d: Datos, obraId: string, corte: Dia): PuntoSerie[] {
  const obra = d.obras.find((o) => o.id === obraId)!
  const fin = obra.fechaInicio + obra.plazoDias
  const puntos: PuntoSerie[] = []
  const paso = obra.plazoDias > 200 ? 14 : 7
  for (let t = obra.fechaInicio + paso - 1; ; t += paso) {
    const tt = Math.min(t, fin - 1)
    const c = calcularObra(d, obraId, Math.min(tt, corte))
    if (tt <= corte) puntos.push({ fecha: tt, pv: c.pv, ev: c.ev, ac: c.ac, avancePlan: c.avancePlan, avanceReal: c.avanceReal })
    else {
      const f = calcularObraPlan(d, obraId, tt)
      puntos.push({ fecha: tt, pv: f.pv, avancePlan: f.avancePlan })
    }
    if (tt >= fin - 1) break
  }
  const c = calcularObra(d, obraId, corte)
  if (!puntos.some((p) => p.fecha === corte) && corte < fin)
    puntos.push({ fecha: corte, pv: c.pv, ev: c.ev, ac: c.ac, avancePlan: c.avancePlan, avanceReal: c.avanceReal })
  return puntos.sort((a, b) => a.fecha - b.fecha)
}

/** Solo lo planificado (PV) a una fecha futura, sin recorrer registros reales. */
export function calcularObraPlan(d: Datos, obraId: string, t: Dia) {
  const obra = d.obras.find((o) => o.id === obraId)!
  const partidas = d.partidas.filter((p) => p.obraId === obraId && partidaVigente(p, d.ordenesCambio, t))
  const lb = programaDe(d, obraId, 'lineaBase')
  const cp = cantidadesProgramadas(lb, obra, new Map(partidas.map((p) => [p.id, p.cantidad])), t, desdePartidas(partidas))
  let pvDir = 0
  let bacDir = 0
  for (const p of partidas) {
    pvDir += Math.min(p.cantidad, cp.get(p.id) ?? 0) * puCosto(p)
    bacDir += bacPartida(p)
  }
  const frac = Math.min(1, Math.max(0, (t + 1 - obra.fechaInicio) / obra.plazoDias))
  return { pv: pvDir + obra.ggPresupuesto * frac, avancePlan: bacDir > 0 ? pvDir / bacDir : 0 }
}

/** Rendimiento real de MO por partida y cuadrilla en una ventana de días. */
export function rendimientosPorCuadrilla(d: Datos, obraId: string, desde: Dia, hasta: Dia) {
  const partidas = new Map(d.partidas.filter((p) => p.obraId === obraId).map((p) => [p.id, p]))
  const acum = new Map<string, { cuadrillaId: string; partidaId: string; cant: number; hh: number }>()
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.estado !== 'validado' || r.fecha < desde || r.fecha > hasta) continue
    for (const a of r.avances) {
      const k = `${r.cuadrillaId}|${a.partidaId}`
      const e = acum.get(k) ?? { cuadrillaId: r.cuadrillaId, partidaId: a.partidaId, cant: 0, hh: 0 }
      e.cant += a.cantidad
      acum.set(k, e)
    }
    for (const h of r.hh) {
      if (!h.partidaId || h.causaNoProductiva) continue
      const k = `${r.cuadrillaId}|${h.partidaId}`
      const e = acum.get(k) ?? { cuadrillaId: r.cuadrillaId, partidaId: h.partidaId, cant: 0, hh: 0 }
      e.hh += hhDeRegistro(h)
      acum.set(k, e)
    }
  }
  return [...acum.values()]
    .map((e) => {
      const p = partidas.get(e.partidaId)
      const pres = p ? hhPorUnidad(p) : 0
      return {
        ...e,
        partida: p,
        rendReal: e.cant > 0 ? e.hh / e.cant : null,
        rendPres: pres || null,
        desv: e.cant > 0 && pres > 0 ? e.hh / e.cant / pres - 1 : null,
        costoExceso: p && pres > 0 ? (e.hh - e.cant * pres) * costoHHPres(p) : 0,
      }
    })
    .filter((e) => e.rendPres != null && (e.cant > 0 || e.hh > 0))
}

export function esDiaHabil(d: Datos, dia: Dia) {
  return d.config.diasHabiles.includes(diaSemana(dia))
}

export { puCostoTipo }
