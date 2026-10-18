// Bodega de obra y control de materiales (v1.2: 08 Bodega/Stock/Movimiento, RF-ABA-02, 12 RULE-201…203,
// 14 KAB-05/10/11/13). El stock sale de movimientos inmutables y se valoriza a costo promedio. Cada
// recepción de OC es una entrada (el costo real ya se registró al recibir); la salida a partida mide el
// consumo físico. La cobertura cruza lo que piden las tareas del plan semanal con stock + OC en curso.
import type { CalcObra } from './evm'
import { estadoOC, pendienteLinea, recibidoLinea } from './compras'
import { estadoTarea } from './lastPlanner'
import type { Compromiso, Dia, Material, MovimientoStock, OrdenCompra, Partida, Rol, TareaSemanal, TipoMovimiento } from './types'

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, string> = { entrada: 'Entrada', salida: 'Salida a partida', traspaso: 'Traspaso a otra obra', merma: 'Merma', ajuste: 'Ajuste de inventario' }
/** RULE-202: tolerancia del consumo sobre lo presupuestado según avance. */
export const TOLERANCIA_CONSUMO = 0.05
/** RULE-201 / KAB-13: horizonte de cobertura de las tareas por iniciar. */
export const DIAS_COBERTURA = 7
/** KAB-05: material inmovilizado sobre el costo de materiales. */
export const INMOVILIZADO_VERDE = 0.02
export const INMOVILIZADO_ROJO = 0.1

export const puedeMoverStock = (rol: Rol) => rol === 'R07'

/** Efecto del movimiento en el stock de la obra donde se registró. */
export function signo(m: MovimientoStock): number {
  if (m.tipo === 'entrada') return m.cantidad
  if (m.tipo === 'ajuste') return m.cantidad
  return -m.cantidad
}

export interface Stock { cantidad: number; costoPromedio: number; valor: number; ultimo?: Dia }

/** Stock y valor a costo promedio ponderado de un material en la obra al día t. */
export function stockMaterial(movs: MovimientoStock[], obraId: string, materialId: string, t: Dia): Stock {
  let cantidad = 0
  let promedio = 0
  let ultimo: Dia | undefined
  const propios = movs.filter((m) => m.obraId === obraId && m.materialId === materialId && m.fecha <= t).sort((a, b) => a.fecha - b.fecha || (a.tipo === 'entrada' ? -1 : 1))
  for (const m of propios) {
    const q = signo(m)
    if (q > 0 && m.costoUnitario != null) promedio = cantidad + q > 0 ? (cantidad * promedio + q * m.costoUnitario) / (cantidad + q) : m.costoUnitario
    cantidad += q
    ultimo = m.fecha
  }
  cantidad = Math.round(cantidad * 100) / 100
  return { cantidad, costoPromedio: promedio, valor: Math.round(Math.max(0, cantidad) * promedio), ultimo }
}

export function stockObra(movs: MovimientoStock[], materiales: Material[], obraId: string, t: Dia) {
  const ids = new Set(movs.filter((m) => m.obraId === obraId && m.fecha <= t).map((m) => m.materialId))
  return materiales.filter((m) => ids.has(m.id)).map((m) => ({ material: m, ...stockMaterial(movs, obraId, m.id, t) }))
}

/** Consumo por partida y material para la cobertura y el control (cantidad de material por unidad de partida). */
export const consumoUnitario = (p: Partida) => p.recursos.find((r) => r.tipo === 'MAT')?.cantPorUnidad ?? null

/** Valida una salida, merma o traspaso: no puede dejar el stock negativo (RULE-203). */
export function validarSalida(movs: MovimientoStock[], obraId: string, materialId: string, cantidad: number, t: Dia, otrasObras: string[] = []): string | null {
  const s = stockMaterial(movs, obraId, materialId, t)
  if (cantidad <= s.cantidad + 1e-9) return null
  const con = otrasObras.filter((o) => stockMaterial(movs, o, materialId, t).cantidad >= cantidad - s.cantidad)
  return `RULE-203: stock insuficiente (${s.cantidad} disponible).${con.length ? ' Hay stock en otra obra: solicita un traspaso.' : ''}`
}

// ───────────────────────── Control por partida (KAB-11) ─────────────────────────

export interface ControlPartida {
  partida: Partida
  material: Material
  /** Cantidad de material del presupuesto vigente de la partida. */
  presupuestado: number
  /** Presupuestado × avance de la partida: lo que debería haberse consumido. */
  segunAvance: number
  comprado: number
  recibido: number
  consumido: number
  /** Consumido / según avance − 1 (RULE-202 sobre la tolerancia). */
  desvio: number | null
}

/** Material que abastece cada partida (el de sus OC o salidas más recientes). */
export function materialesPorPartida(ocs: OrdenCompra[], movs: MovimientoStock[], obraId: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const oc of [...ocs].filter((o) => o.obraId === obraId).sort((a, b) => a.creado - b.creado)) for (const l of oc.lineas) out.set(l.partidaId, l.materialId)
  for (const m of movs.filter((x) => x.obraId === obraId && x.partidaId)) if (!out.has(m.partidaId!)) out.set(m.partidaId!, m.materialId)
  return out
}

export function controlMateriales(
  x: { ordenesCompra: OrdenCompra[]; movimientosStock: MovimientoStock[]; materiales: Material[] }, c: CalcObra, t: Dia,
): ControlPartida[] {
  const obraId = c.obra.id
  const mapa = materialesPorPartida(x.ordenesCompra, x.movimientosStock, obraId)
  const out: ControlPartida[] = []
  for (const cp of c.partidas) {
    const matId = mapa.get(cp.p.id)
    const material = x.materiales.find((m) => m.id === matId)
    const cpu = consumoUnitario(cp.p)
    if (!material || cpu == null) continue
    let comprado = 0
    let recibido = 0
    for (const oc of x.ordenesCompra) {
      const e = estadoOC(oc, t)
      if (oc.obraId !== obraId || !e || e === 'borrador' || e === 'anulada') continue
      for (const l of oc.lineas) if (l.partidaId === cp.p.id && l.materialId === material.id) { comprado += l.cantidad; recibido += recibidoLinea(oc, l.id, t) }
    }
    const consumido = x.movimientosStock.filter((m) => m.obraId === obraId && m.tipo === 'salida' && m.partidaId === cp.p.id && m.materialId === material.id && m.fecha <= t).reduce((s, m) => s + m.cantidad, 0)
    const presupuestado = cp.p.cantidad * cpu
    const segunAvance = cp.cantEjec * cpu
    out.push({
      partida: cp.p, material, presupuestado, segunAvance, comprado, recibido, consumido: Math.round(consumido * 100) / 100,
      desvio: segunAvance > 0 ? consumido / segunAvance - 1 : null,
    })
  }
  return out
}

// ───────────────────────── Cobertura de las tareas por iniciar (RULE-201, KAB-13) ─────────────────────────

export interface Faltante {
  material: Material
  requerido: number
  stock: number
  enCompra: number
  tareas: TareaSemanal[]
  critico: boolean
}

/**
 * Material que piden las tareas del plan semanal que parten en los próximos 7 días contra stock + OC en curso
 * (por aprobar en adelante, saldo por recibir). Una partida con contrato marco vigente (compromiso importado
 * de material con saldo) se considera cubierta.
 */
export function faltantes(
  x: { tareasSemanales: TareaSemanal[]; ordenesCompra: OrdenCompra[]; movimientosStock: MovimientoStock[]; materiales: Material[]; partidas: Partida[]; compromisos: Compromiso[]; costos: { compromisoId?: string; monto: number }[] },
  obraId: string, t: Dia, dias = DIAS_COBERTURA,
): Faltante[] {
  const mapa = materialesPorPartida(x.ordenesCompra, x.movimientosStock, obraId)
  const pagado = (k: Compromiso) => x.costos.filter((c) => c.compromisoId === k.id).reduce((s, c) => s + c.monto, 0)
  const marco = new Set(x.compromisos.filter((k) => k.obraId === obraId && k.tipo === 'MAT' && k.partidaId && k.monto - pagado(k) > 0).map((k) => k.partidaId!))
  const porMaterial = new Map<string, { requerido: number; tareas: TareaSemanal[] }>()
  for (const tarea of x.tareasSemanales) {
    const e = estadoTarea(tarea, t)
    if (tarea.obraId !== obraId || !tarea.partidaId || (e !== 'propuesta' && e !== 'comprometida') || tarea.inicio < t || tarea.inicio > t + dias) continue
    if (marco.has(tarea.partidaId)) continue
    const p = x.partidas.find((y) => y.id === tarea.partidaId)
    const matId = mapa.get(tarea.partidaId)
    const cpu = p ? consumoUnitario(p) : null
    if (!matId || cpu == null) continue
    const v = porMaterial.get(matId) ?? { requerido: 0, tareas: [] }
    v.requerido += tarea.meta * cpu
    v.tareas.push(tarea)
    porMaterial.set(matId, v)
  }
  const out: Faltante[] = []
  for (const [matId, v] of porMaterial) {
    const material = x.materiales.find((m) => m.id === matId)
    if (!material) continue
    const stock = stockMaterial(x.movimientosStock, obraId, matId, t).cantidad
    let enCompra = 0
    for (const oc of x.ordenesCompra) {
      const e = estadoOC(oc, t)
      if (oc.obraId !== obraId || !e || !['por_aprobar', 'aprobada', 'enviada', 'recibida_parcial'].includes(e)) continue
      for (const l of oc.lineas) if (l.materialId === matId) enCompra += pendienteLinea(oc, l, t)
    }
    if (stock + enCompra + 1e-9 < v.requerido) out.push({ material, requerido: Math.round(v.requerido * 10) / 10, stock, enCompra, tareas: v.tareas, critico: material.critico })
  }
  return out
}

// ───────────────────────── Indicadores ─────────────────────────

export interface IndicadoresBodega {
  valorStock: number
  /** KAB-05: valor en bodega / costo de materiales ejecutado. */
  inmovilizado: number | null
  /** KAB-13 */
  criticosSinCobertura: number
  faltantes: Faltante[]
  /** RULE-202: partidas con consumo sobre lo presupuestado según avance. */
  sobreconsumo: ControlPartida[]
  materialesConStock: number
}

export function indicadoresBodega(
  d: Parameters<typeof faltantes>[0] & { materiales: Material[] }, c: CalcObra, t: Dia,
): IndicadoresBodega {
  const stock = stockObra(d.movimientosStock, d.materiales, c.obra.id, t)
  const valor = stock.reduce((s, x) => s + x.valor, 0)
  const acMat = c.partidas.reduce((s, cp) => s + cp.acPorTipo.MAT, 0)
  const falt = faltantes(d, c.obra.id, t)
  const control = controlMateriales(d, c, t)
  return {
    valorStock: valor,
    inmovilizado: acMat > 0 ? valor / acMat : null,
    criticosSinCobertura: falt.filter((f) => f.critico).length,
    faltantes: falt,
    sobreconsumo: control.filter((x) => x.desvio != null && x.desvio > TOLERANCIA_CONSUMO && x.consumido > 0),
    materialesConStock: stock.filter((x) => x.cantidad > 0).length,
  }
}
