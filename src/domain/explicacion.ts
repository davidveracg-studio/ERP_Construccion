// Motor de Explicación de Desviaciones (13 §8). Determinista: la suma de los
// componentes es exactamente la desviación total (con residuo explícito).
import type { Datos } from './datos'
import { rendimientosPorCuadrilla, type CalcObra, type CalcPartida } from './evm'
import { costoHHPres, hhPorUnidad } from './presupuesto'
import type { Dia, TipoRecurso } from './types'
import { TIPOS_RECURSO } from './types'

export type TipoComponente = 'rendimiento' | 'consumo' | 'precio' | 'no_descompuesto' | 'gg' | 'no_productivas' | 'sin_imputar'

export interface Componente {
  tipo: TipoComponente
  recurso?: TipoRecurso
  etiqueta: string
  /** Positivo = sobrecosto. */
  monto: number
  detalle?: string
}

const TIPOS: TipoRecurso[] = ['MO', 'MAT', 'EQ', 'SUB', 'OTRO']

/** Desviación de costo de una partida: AC − EV descompuesta por recurso. */
export function desglosePartida(c: CalcPartida): Componente[] {
  const p = c.p
  const out: Componente[] = []
  for (const t of TIPOS) {
    const recs = p.recursos.filter((r) => r.tipo === t)
    const evT = c.cantEjec * recs.reduce((s, r) => s + r.cantPorUnidad * r.precio, 0)
    const acT = c.acPorTipo[t]
    if (Math.abs(acT - evT) < 1) continue
    const nombre = TIPOS_RECURSO[t]
    if (t === 'MO' && recs.length > 0) {
      const hhPres = c.cantEjec * hhPorUnidad(p)
      const precioPres = costoHHPres(p)
      const hhR = c.hhReal
      const consumo = (hhR - hhPres) * precioPres
      out.push({
        tipo: 'rendimiento', recurso: t, etiqueta: `${nombre}: rendimiento`, monto: consumo,
        detalle: c.cantEjec > 0 ? `${fmt(hhR / c.cantEjec)} HH/${p.unidad} real vs ${fmt(hhPorUnidad(p))} presupuestado` : undefined,
      })
      out.push({ tipo: 'precio', recurso: t, etiqueta: `${nombre}: costo HH`, monto: acT - evT - consumo })
      continue
    }
    const q = c.qPorTipo[t]
    if (recs.length === 1 && q != null && q > 0 && acT > 0) {
      const r = recs[0]
      const qPres = c.cantEjec * r.cantPorUnidad
      const consumo = (q - qPres) * r.precio
      const precioReal = acT / q
      out.push({
        tipo: 'consumo', recurso: t, etiqueta: `${nombre}: consumo`, monto: consumo,
        detalle: qPres > 0 ? `${fmt(q)} ${r.unidad} vs ${fmt(qPres)} presupuestado (${sgn(q / qPres - 1)})` : undefined,
      })
      out.push({
        tipo: 'precio', recurso: t, etiqueta: `${nombre}: precio`, monto: acT - evT - consumo,
        detalle: `$${fmt(precioReal, 0)} real vs $${fmt(r.precio, 0)} por ${r.unidad} (${sgn(precioReal / r.precio - 1)})`,
      })
      continue
    }
    out.push({
      tipo: 'no_descompuesto', recurso: t, etiqueta: `${nombre}: no descompuesto`, monto: acT - evT,
      detalle: acT === 0 ? 'Costo aún no registrado para el avance informado' : recs.length === 0 ? 'Recurso no presupuestado en el APU' : 'Los costos importados no traen cantidad y precio',
    })
  }
  return out
}

/** Desviación total de la obra (AC − EV) agrupada por componente. */
export function desgloseObra(c: CalcObra): Componente[] {
  const acc = new Map<string, Componente>()
  for (const cp of c.partidas)
    for (const comp of desglosePartida(cp)) {
      const k = `${comp.tipo}|${comp.recurso}`
      const e = acc.get(k)
      if (e) e.monto += comp.monto
      else acc.set(k, { ...comp, detalle: undefined })
    }
  const out = [...acc.values()]
  const ggDesv = c.ggAc - c.acNoProd - c.ggPv
  if (Math.abs(ggDesv) >= 1) out.push({ tipo: 'gg', etiqueta: 'Gastos generales', monto: ggDesv, detalle: 'Indirectos sobre lo planificado a la fecha' })
  if (c.acNoProd > 0) out.push({ tipo: 'no_productivas', etiqueta: 'HH no productivas', monto: c.acNoProd, detalle: `${fmt(c.hhNoProd)} HH (esperas, clima, otras)` })
  if (c.acSinImputar > 0) out.push({ tipo: 'sin_imputar', etiqueta: 'Costo sin imputar', monto: c.acSinImputar, detalle: 'Costos sin partida: revisar mapeo' })
  return out.filter((x) => Math.abs(x.monto) >= 1).sort((a, b) => b.monto - a.monto)
}

export interface ItemPareto {
  id: string
  etiqueta: string
  monto: number
  detalle?: string
  link?: string
}

export function paretoPartidas(c: CalcObra, criterio: 'cv' | 'vac' = 'cv'): ItemPareto[] {
  return c.partidas
    .map((p) => ({
      id: p.p.id,
      etiqueta: `${p.p.codigo} ${p.p.descripcion}`,
      monto: criterio === 'cv' ? p.ac - p.ev : p.eac - p.bac,
      detalle: `CPI ${p.cpi != null ? fmt(p.cpi, 2) : '—'} · avance ${fmt(p.avance * 100, 0)}%`,
      link: `/partida/${p.p.id}`,
    }))
    .filter((x) => x.monto > 0)
    .sort((a, b) => b.monto - a.monto)
}

export function paretoCuadrillas(d: Datos, c: CalcObra, desde: Dia): ItemPareto[] {
  const rs = rendimientosPorCuadrilla(d, c.obra.id, desde, c.corte)
  const cuad = new Map(d.cuadrillas.map((x) => [x.id, x]))
  const acc = new Map<string, ItemPareto>()
  for (const r of rs) {
    if (r.costoExceso <= 0) continue
    const cq = cuad.get(r.cuadrillaId)
    const e = acc.get(r.cuadrillaId) ?? { id: r.cuadrillaId, etiqueta: cq?.nombre ?? r.cuadrillaId, monto: 0, detalle: '' }
    e.monto += r.costoExceso
    e.detalle = `${e.detalle ? e.detalle + ' · ' : ''}${r.partida?.codigo}: ${fmt(r.rendReal ?? 0)} vs ${fmt(r.rendPres ?? 0)} HH/${r.partida?.unidad}`
    acc.set(r.cuadrillaId, e)
  }
  return [...acc.values()].sort((a, b) => b.monto - a.monto)
}

/** Variación de precio por proveedor (costos con cantidad y un único recurso del tipo). */
export function paretoProveedores(d: Datos, c: CalcObra): ItemPareto[] {
  const partidas = new Map(c.partidas.map((x) => [x.p.id, x.p]))
  const acc = new Map<string, ItemPareto>()
  for (const k of d.costos) {
    if (k.obraId !== c.obra.id || k.fecha > c.corte || !k.partidaId || k.tipo === 'GG' || !k.proveedor || !k.cantidad) continue
    const p = partidas.get(k.partidaId)
    const recs = p?.recursos.filter((r) => r.tipo === k.tipo) ?? []
    if (recs.length !== 1) continue
    const v = k.monto - k.cantidad * recs[0].precio
    const e = acc.get(k.proveedor) ?? { id: k.proveedor, etiqueta: k.proveedor, monto: 0 }
    e.monto += v
    acc.set(k.proveedor, e)
  }
  return [...acc.values()].filter((x) => x.monto > 0).sort((a, b) => b.monto - a.monto)
}

export interface ItemPlazo {
  id: string
  etiqueta: string
  atraso: number
  critica: boolean
  holgura: number | null
}

/** Actividades que explican el atraso: fin proyectado vs fin de línea base. */
export function paretoActividades(c: CalcObra): ItemPlazo[] {
  const lb = new Map((c.lb?.actividades ?? []).map((a) => [a.id, a]))
  return (c.actualizado?.actividades ?? [])
    .map((a) => {
      const r = c.cpm.get(a.id)
      const b = lb.get(a.id)
      return {
        id: a.id,
        etiqueta: `${a.codigo} ${a.nombre}`,
        atraso: r && b ? r.ef - b.fin : 0,
        critica: r?.critica ?? false,
        holgura: r?.holgura ?? null,
      }
    })
    .filter((x) => x.atraso > 0)
    .sort((a, b) => Number(b.critica) - Number(a.critica) || b.atraso - a.atraso)
}

export function causasNoProductivas(d: Datos, obraId: string, desde: Dia, hasta: Dia) {
  const acc = new Map<string, number>()
  let lluvia = 0
  const diasLluvia = new Set<Dia>()
  for (const r of d.rdos) {
    if (r.obraId !== obraId || r.estado !== 'validado' || r.fecha < desde || r.fecha > hasta) continue
    if (r.clima === 'lluvia' && !diasLluvia.has(r.fecha)) { diasLluvia.add(r.fecha); lluvia++ }
    for (const h of r.hh)
      if (h.causaNoProductiva) acc.set(h.causaNoProductiva, (acc.get(h.causaNoProductiva) ?? 0) + h.trabajadores * (h.horasNormales + h.horasExtra))
  }
  return { hhPorCausa: acc, diasLluvia: lluvia }
}

function fmt(v: number, dec = 2) {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v)
}
function sgn(v: number) {
  return `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v) * 100, 1)}%`
}
