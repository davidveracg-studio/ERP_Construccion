// Motor predictivo avanzado (v2: 13 "Motor Predictivo", 14 §18). Modelos estadísticos y de gestión de
// proyectos, sin IA generativa: EAC por tres métodos y por tendencia (regresión del CPI semanal), término
// probable con estacionalidad climática, simulación Monte Carlo del plazo sobre el CPM, curvas de
// aprendizaje de las actividades repetitivas, detección de anomalías en los RDO y escenarios.
import { calcularCPM } from './cpm'
import type { Datos } from './datos'
import { calcularObra, type CalcObra } from './evm'
import { totalesPropuesta } from './comercial'
import { cartera } from './benchmark'
import { periodosDe } from './periodos'
import { hhPorUnidad } from './presupuesto'
import type { Actividad, Dia, Propuesta } from './types'

// --- Utilidades estadísticas ---
/** Regresión lineal simple y = a + b·x (mínimos cuadrados). */
export function regresion(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = ys.reduce((s, y) => s + y, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  if (sxx === 0) return null
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx
  const a = my - b * mx
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0)
  const ssRes = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0)
  return { a, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 }
}
export const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null }
export const percentilDe = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : null }
/** Generador pseudoaleatorio determinista (mulberry32): la simulación es reproducible. */
export function rng(semilla: number) {
  let a = semilla >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const triangular = (r: () => number, min: number, moda: number, max: number) => {
  const u = r()
  const f = (moda - min) / (max - min)
  return u < f ? min + Math.sqrt(u * (max - min) * (moda - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - moda))
}
const poisson = (r: () => number, lambda: number) => { const L = Math.exp(-lambda); let k = 0; let p = 1; do { k++; p *= r() } while (p > L); return k - 1 }

// --- EAC (13: tres métodos) y tendencia ---
export function eacMetodos(c: CalcObra, d: Datos) {
  const { bac, ev, ac, cpi, spi } = c
  const eac1 = ac + (bac - ev)
  const eac2 = cpi ? bac / cpi : null
  const eac3 = cpi && spi ? ac + (bac - ev) / (cpi * spi) : null
  // Tendencia: regresión del CPI de los cierres semanales (últimos 8) proyectada a la mitad de lo que falta
  const serie = periodosDe(d, c.obra.id).filter((p) => p.obra.cpi != null).slice(-8)
  const reg = regresion(serie.map((p) => p.fechaCorte), serie.map((p) => p.obra.cpi!))
  const restante = Math.max(0, c.terminoProyectado - c.corte)
  const cpiTendencia = reg ? Math.min(1.3, Math.max(0.7, reg.a + reg.b * (c.corte + restante / 2))) : null
  const eac4 = cpiTendencia ? ac + (bac - ev) / cpiTendencia : null
  const todos = [c.eac, eac1, eac2, eac3, eac4].filter((x): x is number => x != null)
  return {
    metodos: [
      { id: 'partidas', nombre: 'EAC por partida (Σ partidas + GG)', detalle: `base del sistema: método "${({ cpi: 'CPI', presupuesto: 'presupuesto', cpi_spi: 'CPI·SPI' } as const)[d.config.metodoEAC]}" en cada partida, con los ajustes de Oficina Técnica`, eac: c.eac },
      { id: 'presupuesto', nombre: 'EAC₁ = AC + (BAC − EV)', detalle: 'lo que falta se ejecuta según presupuesto', eac: eac1 },
      { id: 'cpi', nombre: 'EAC₂ = BAC / CPI', detalle: 'el desempeño futuro es igual al pasado', eac: eac2 },
      { id: 'cpi_spi', nombre: 'EAC₃ = AC + (BAC − EV) / (CPI·SPI)', detalle: 'el desempeño depende de costo y plazo', eac: eac3 },
      { id: 'tendencia', nombre: 'EAC tendencia (regresión del CPI)', detalle: reg ? `CPI semanal ${reg.b >= 0 ? 'al alza' : 'a la baja'} (R² ${reg.r2.toFixed(2).replace('.', ',')}); CPI proyectado ${cpiTendencia!.toFixed(2).replace('.', ',')}` : 'faltan cierres semanales', eac: eac4 },
    ],
    configurado: d.config.metodoEAC,
    minimo: todos.length ? Math.min(...todos) : null,
    maximo: todos.length ? Math.max(...todos) : null,
    serie: serie.map((p) => ({ fecha: p.fechaCorte, cpi: p.obra.cpi, spi: p.obra.spi })),
    tendencia: reg,
  }
}

// --- Estacionalidad climática (13: término ajustado por clima de la región) ---
/** Días de lluvia que detienen faenas exteriores, promedio por mes (Región de Coquimbo, referencia). */
export const LLUVIA_MES = [0.3, 0.5, 0.6, 1.2, 2.5, 3.2, 3.0, 2.4, 1.2, 0.6, 0.4, 0.2]
const mesDe = (t: Dia) => new Date(t * 86_400_000).getUTCMonth()
/** Días esperados de lluvia entre dos fechas. */
export function diasLluvia(desde: Dia, hasta: Dia) {
  let s = 0
  for (let t = desde; t < hasta; t++) s += LLUVIA_MES[mesDe(t)] / 30.4
  return s
}

// --- Monte Carlo del plazo (14 §18) ---
export interface SimulacionPlazo {
  n: number
  p10: Dia; p50: Dia; p80: Dia; p90: Dia
  determinista: Dia
  contractual: Dia
  /** Probabilidad de terminar en o antes del plazo contractual. */
  probCumplir: number
  histograma: { desde: Dia; n: number }[]
  /** Actividades que más veces quedaron en la ruta crítica. */
  criticidad: { codigo: string; nombre: string; indice: number }[]
}

export function simularPlazo(c: CalcObra, n = 400, semilla = 7): SimulacionPlazo | null {
  const acts = c.actualizado?.actividades ?? []
  if (!acts.length) return null
  const r = rng(semilla + c.obra.id.length * 31)
  // Moda del factor de duración según el desempeño de plazo (SPI), con cola hacia el atraso
  const moda = Math.min(1.3, Math.max(0.85, 1 / (c.spi ?? 1)))
  const limites = new Map((c.lb?.actividades ?? []).filter((a) => a.esHito && a.hitoContractual).map((a) => [a.id, a.inicio]))
  const fines: number[] = []
  const veces = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const sim: Actividad[] = acts.map((a) => (a.finReal != null || a.esHito ? a : { ...a, duracion: Math.max(1, Math.round(a.duracion * triangular(r, moda * 0.9, moda, moda * 1.35))) }))
    try {
      const res = calcularCPM(sim, c.obra.fechaInicio, { usarReales: true, hoy: c.corte + 1, avance: c.avanceAct, fechaLimite: c.terminoContractual, limites })
      let fin = Math.max(...[...res.values()].map((x) => x.ef))
      // Lluvia: días perdidos por mes con distribución de Poisson
      for (let m = c.corte; m < fin; m += 30) fin += poisson(r, LLUVIA_MES[mesDe(m)] * Math.min(1, (fin - m) / 30) * 0.5)
      fines.push(fin)
      for (const [id, x] of res) if (x.critica && !x.terminada) veces.set(id, (veces.get(id) ?? 0) + 1)
    } catch { /* programa con ciclos */ }
  }
  if (!fines.length) return null
  const min = Math.min(...fines)
  const max = Math.max(...fines)
  const paso = Math.max(1, Math.ceil((max - min + 1) / 12))
  const histograma = Array.from({ length: Math.ceil((max - min + 1) / paso) }, (_, k) => ({ desde: min + k * paso, n: fines.filter((f) => f >= min + k * paso && f < min + (k + 1) * paso).length }))
  return {
    n: fines.length, p10: percentilDe(fines, 10)!, p50: percentilDe(fines, 50)!, p80: percentilDe(fines, 80)!, p90: percentilDe(fines, 90)!,
    determinista: c.terminoProyectado, contractual: c.terminoContractual,
    probCumplir: fines.filter((f) => f <= c.terminoContractual).length / fines.length,
    histograma,
    criticidad: [...veces].map(([id, v]) => { const a = acts.find((x) => x.id === id)!; return { codigo: a.codigo, nombre: a.nombre, indice: v / fines.length } })
      .filter((x) => x.indice >= 0.2).sort((a, b) => b.indice - a.indice).slice(0, 6),
  }
}

// --- Curvas de aprendizaje (14 §18): actividades repetitivas (mismas partidas, ej. "Estructura piso N") ---
export interface CurvaAprendizaje {
  grupo: string
  partida: string
  puntos: { rep: number; codigo: string; nombre: string; hhu: number | null; estado: 'terminada' | 'en_curso' | 'pendiente' }[]
  /** Tasa de aprendizaje (Wright): HH/u al duplicar las repeticiones; < 100 % = la cuadrilla aprende. */
  tasa: number | null
  r2: number | null
  presupuesto: number
}

export function curvasAprendizaje(d: Datos, c: CalcObra): CurvaAprendizaje[] {
  const acts = (c.actualizado?.actividades ?? []).filter((a) => !a.esHito && a.partidas.length)
  const grupos = new Map<string, Actividad[]>()
  for (const a of acts) {
    const clave = a.partidas.map((p) => p.partidaId).sort().join('|')
    grupos.set(clave, [...(grupos.get(clave) ?? []), a])
  }
  const out: CurvaAprendizaje[] = []
  for (const g of grupos.values()) {
    if (g.length < 3) continue
    // Partida principal: la de mano de obra propia con más HH presupuestadas
    const partida = g[0].partidas.map((x) => d.partidas.find((p) => p.id === x.partidaId)!).filter((p) => p && hhPorUnidad(p) > 0).sort((a, b) => hhPorUnidad(b) * b.cantidad - hhPorUnidad(a) * a.cantidad)[0]
    if (!partida) continue
    const ordenadas = [...g].sort((a, b) => (a.inicioReal ?? a.inicio) - (b.inicioReal ?? b.inicio))
    const puntos = ordenadas.map((a, k) => {
      const desde = a.inicioReal
      const hasta = a.finReal ?? c.corte
      let hh = 0
      let cant = 0
      if (desde != null) for (const r of d.rdos) {
        if (r.obraId !== c.obra.id || r.estado !== 'validado' || r.fecha < desde || r.fecha > hasta) continue
        for (const h of r.hh) if (h.partidaId === partida.id && !h.causaNoProductiva) hh += h.trabajadores * (h.horasNormales + h.horasExtra)
        for (const x of r.avances) if (x.partidaId === partida.id) cant += x.cantidad
      }
      return { rep: k + 1, codigo: a.codigo, nombre: a.nombre, hhu: cant > 0 && hh > 0 ? hh / cant : null, estado: (a.finReal != null ? 'terminada' : a.inicioReal != null ? 'en_curso' : 'pendiente') as CurvaAprendizaje['puntos'][number]['estado'] }
    })
    const con = puntos.filter((p) => p.hhu != null && p.estado === 'terminada')
    const reg = regresion(con.map((p) => Math.log2(p.rep)), con.map((p) => Math.log2(p.hhu!)))
    out.push({ grupo: g.map((a) => a.codigo).join(' · '), partida: `${partida.codigo} ${partida.descripcion}`, puntos, tasa: reg && con.length >= 2 ? 2 ** reg.b : null, r2: reg?.r2 ?? null, presupuesto: hhPorUnidad(partida) })
  }
  return out
}

// --- Anomalías en los RDO (14 §18): rendimientos atípicos frente a la mediana de la cuadrilla ---
export interface Anomalia { fecha: Dia; cuadrilla: string; partida: string; hhu: number; mediana: number; razon: number }

export function anomalias(d: Datos, c: CalcObra, dias = 30, umbral = 1.6): Anomalia[] {
  const cq = new Map(d.cuadrillas.map((q) => [q.id, q.nombre]))
  const pt = new Map(d.partidas.map((p) => [p.id, p]))
  const muestras = new Map<string, { fecha: Dia; hhu: number; cuadrillaId: string; partidaId: string }[]>()
  for (const r of d.rdos) {
    if (r.obraId !== c.obra.id || r.estado !== 'validado' || r.fecha > c.corte || r.fecha <= c.corte - 90) continue
    for (const a of r.avances) {
      if (a.cantidad <= 0) continue
      const hh = r.hh.filter((h) => h.partidaId === a.partidaId && !h.causaNoProductiva).reduce((s, h) => s + h.trabajadores * (h.horasNormales + h.horasExtra), 0)
      if (hh <= 0) continue
      const k = `${r.cuadrillaId}|${a.partidaId}`
      muestras.set(k, [...(muestras.get(k) ?? []), { fecha: r.fecha, hhu: hh / a.cantidad, cuadrillaId: r.cuadrillaId, partidaId: a.partidaId }])
    }
  }
  const out: Anomalia[] = []
  for (const xs of muestras.values()) {
    if (xs.length < 6) continue
    const med = mediana(xs.map((x) => x.hhu))!
    for (const x of xs.filter((y) => y.fecha > c.corte - dias)) {
      const razon = x.hhu / med
      if (razon > umbral || razon < 1 / umbral) {
        const p = pt.get(x.partidaId)
        out.push({ fecha: x.fecha, cuadrilla: cq.get(x.cuadrillaId) ?? '', partida: p ? `${p.codigo} ${p.descripcion}` : x.partidaId, hhu: x.hhu, mediana: med, razon })
      }
    }
  }
  return out.sort((a, b) => Math.abs(Math.log(b.razon)) - Math.abs(Math.log(a.razon))).slice(0, 10)
}

// --- Escenarios (14 §18) ---
/** ¿Qué pasa si agrego trabajadores a una actividad? Recalcula el CPM con la duración restante acortada. */
export function escenarioCuadrilla(d: Datos, c: CalcObra, actividadId: string, adicionales: number) {
  const acts = c.actualizado?.actividades ?? []
  const act = acts.find((a) => a.id === actividadId)
  if (!act || adicionales <= 0) return null
  const cqId = c.obra && d.rdos.filter((r) => r.obraId === c.obra.id && act.partidas.some((p) => r.avances.some((x) => x.partidaId === p.partidaId))).at(-1)?.cuadrillaId
  const cuadrilla = d.cuadrillas.find((q) => q.id === cqId) ?? d.cuadrillas.find((q) => q.obraId === c.obra.id)
  const dotacion = cuadrilla?.trabajadores ?? 10
  // Ley de rendimientos decrecientes: cada trabajador adicional rinde 80 %
  const factor = (dotacion + adicionales * 0.8) / dotacion
  const sim = acts.map((a) => (a.id === actividadId ? { ...a, duracion: Math.max(1, Math.round(a.duracion / factor)) } : a))
  const limites = new Map((c.lb?.actividades ?? []).filter((a) => a.esHito && a.hitoContractual).map((a) => [a.id, a.inicio]))
  const res = calcularCPM(sim, c.obra.fechaInicio, { usarReales: true, hoy: c.corte + 1, avance: c.avanceAct, fechaLimite: c.terminoContractual, limites })
  const nuevoTermino = Math.max(...[...res.values()].map((x) => x.ef))
  const r0 = c.cpm.get(actividadId)
  const r1 = res.get(actividadId)
  const diasActividad = r1 ? r1.ef - Math.max(r1.es, c.corte + 1) : 0
  const costo = Math.round(adicionales * 9 * (cuadrilla?.costoHH ?? 9500) * Math.max(0, diasActividad) * 5 / 7)
  const ganados = c.terminoProyectado - nuevoTermino
  const ggDiario = c.obra.plazoDias > 0 ? c.obra.ggPresupuesto / c.obra.plazoDias : 0
  const multaEvitada = Math.max(0, Math.min(ganados, c.terminoProyectado - c.terminoContractual)) * c.obra.multaDiaria
  // Hitos contractuales: la actividad puede adelantar un hito aunque no defina el término de la obra
  const hitos = acts.filter((a) => a.esHito && a.hitoContractual).map((a) => ({ hito: `${a.codigo} ${a.nombre}`, antes: c.cpm.get(a.id)?.ef ?? null, despues: res.get(a.id)?.ef ?? null }))
    .filter((h) => h.antes != null && h.despues != null)
  return {
    hitos,
    actividad: `${act.codigo} ${act.nombre}`, critica: !!r0?.critica, dotacion, adicionales, factor,
    terminoActual: c.terminoProyectado, nuevoTermino, ganados, costo, ahorroGG: Math.round(Math.max(0, ganados) * ggDiario), multaEvitada,
  }
}

/** ¿Qué pasa si tomo esta obra? Impacto de adjudicar una propuesta en backlog, concentración y dotación. */
export function escenarioPropuesta(d: Datos, t: Dia, p: Propuesta) {
  const xs = cartera(d, t).filter((x) => x.o.estado === 'en_ejecucion')
  const lead = d.leads.find((l) => l.id === p.leadId)
  const mandante = d.clientes.find((c) => c.id === lead?.clienteId)?.nombre ?? ''
  const backlogPorMandante = new Map<string, number>()
  for (const x of xs) backlogPorMandante.set(x.o.mandante, (backlogPorMandante.get(x.o.mandante) ?? 0) + x.c.venta * (1 - x.c.avanceReal))
  const antes = [...backlogPorMandante.values()].reduce((s, v) => s + v, 0)
  const conc = (m: Map<string, number>) => { const tot = [...m.values()].reduce((s, v) => s + v, 0); return tot > 0 ? Math.max(...m.values()) / tot : 0 }
  const concAntes = conc(backlogPorMandante)
  const precio = totalesPropuesta(p).precio
  const despues = new Map(backlogPorMandante)
  despues.set(mandante, (despues.get(mandante) ?? 0) + precio)
  const hh = p.lineas.reduce((s, l) => s + l.cantidad * l.recursos.filter((r) => r.tipo === 'MO').reduce((x, r) => x + r.cantPorUnidad, 0), 0)
  const diasHabiles = p.plazoDias * 5 / 7
  const dotacionActual = d.cuadrillas.filter((q) => xs.some((x) => x.o.id === q.obraId)).reduce((s, q) => s + q.trabajadores, 0)
  const ev90 = xs.reduce((s, x) => s + x.c.ev - (x.o.fechaInicio < t - 90 ? calcularObra(d, x.o.id, t - 90).ev : 0), 0) / 3
  return {
    mandante, precio, backlogAntes: antes, backlogDespues: antes + precio,
    mesesAntes: ev90 > 0 ? antes / ev90 : null, mesesDespues: ev90 > 0 ? (antes + precio) / (ev90 + precio / Math.max(1, p.plazoDias / 30)) : null,
    concAntes, concDespues: conc(despues),
    trabajadores: diasHabiles > 0 ? Math.ceil(hh / (diasHabiles * 9)) : 0, dotacionActual, margen: p.margen,
  }
}
