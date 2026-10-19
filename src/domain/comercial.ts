// Comercial (v2: 07, 08 dominio 3, 10 §2–4, 12 RULE-001/003/004/005/604, 14 KCM).
// Leads, visitas técnicas y propuestas con itemizado y APU. El APU se alimenta del catálogo de
// rendimientos reales de las obras (HH por unidad y costo unitario real por tipo de recurso, 13 §Motor
// Predictivo). Gerencia da el V°B° antes de enviar; al adjudicar se crea la obra con su presupuesto.
import type { Datos } from './datos'
import { fmtFecha } from './fechas'
import { calcularObra } from './evm'
import { costoHHPres, hhPorUnidad, puCosto } from './presupuesto'
import type { Dia, EstadoLead, EstadoPropuesta, Lead, LineaPropuesta, Propuesta, Recurso, Rol, TipoRecurso } from './types'

export const ESTADOS_LEAD: Record<EstadoLead, string> = {
  nuevo: 'Nuevo', en_estudio: 'En estudio', propuesta_enviada: 'Propuesta enviada', ganado: 'Ganado', perdido: 'Perdido', descartado: 'Descartado',
}
export const TONO_LEAD: Record<EstadoLead, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  nuevo: 'gris', en_estudio: 'azul', propuesta_enviada: 'ambar', ganado: 'verde', perdido: 'rojo', descartado: 'gris',
}
export const ESTADOS_PROPUESTA: Record<EstadoPropuesta, string> = {
  borrador: 'Borrador', en_revision: 'En revisión', enviada: 'Enviada', adjudicada: 'Adjudicada', rechazada: 'Rechazada', desierta: 'Desierta', anulada: 'Anulada',
}
export const TONO_PROPUESTA: Record<EstadoPropuesta, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', en_revision: 'azul', enviada: 'ambar', adjudicada: 'verde', rechazada: 'rojo', desierta: 'gris', anulada: 'gris',
}
export const ORIGENES_LEAD: Record<Lead['origen'], string> = { licitacion: 'Licitación', solicitud: 'Solicitud directa', referido: 'Referido' }
export const MOTIVOS_RECHAZO: Record<NonNullable<Propuesta['motivoRechazo']>, string> = { precio: 'Precio', plazo: 'Plazo', tecnico: 'Técnico', otro: 'Otro' }

/** RULE-001: días antes del cierre en que un lead nuevo sin estudio genera alerta. */
export const DIAS_CIERRE = 5
/** RULE-003: días sin respuesta tras el envío. */
export const DIAS_SIN_RESPUESTA = 10
/** KCM-02: meta de tasa de adjudicación. */
export const META_HIT_RATE = 0.2

const ultimo = <E extends string>(h: { fecha: Dia; estado: E }[], t: Dia) => h.filter((x) => x.fecha <= t).at(-1)?.estado ?? null
export const estadoLead = (l: Lead, t: Dia): EstadoLead | null => (l.creado > t ? null : ultimo(l.historial, t) ?? 'nuevo')
export const estadoPropuesta = (p: Propuesta, t: Dia): EstadoPropuesta | null => (p.creado > t ? null : ultimo(p.historial, t) ?? 'borrador')
/** Vencida: condición derivada (enviada con la validez superada), no un estado. */
export const propuestaVencida = (p: Propuesta, t: Dia) => estadoPropuesta(p, t) === 'enviada' && p.validezHasta < t
export const fechaEstado = <E extends string>(h: { fecha: Dia; estado: E }[], e: E) => h.find((x) => x.estado === e)?.fecha ?? null
const RESUELTAS: EstadoPropuesta[] = ['adjudicada', 'rechazada', 'desierta']

// --- Permisos (19: R06 comercial; R01 aprueba) ---
export const puedeComercial = (rol: Rol) => rol === 'R06' || rol === 'R01'
export const puedeVisita = (rol: Rol) => rol === 'R06' || rol === 'R05' || rol === 'R01'

export type AccionPropuesta = 'enviar_revision' | 'devolver' | 'aprobar' | 'enviar' | 'adjudicar' | 'rechazar' | 'desierta' | 'anular'
export const ACCIONES_PROPUESTA: Record<AccionPropuesta, string> = {
  enviar_revision: 'Enviar a revisión', devolver: 'Devolver a borrador', aprobar: 'Dar V°B° de Gerencia', enviar: 'Enviar al mandante',
  adjudicar: 'Registrar adjudicación', rechazar: 'Registrar rechazo', desierta: 'Declarar desierta', anular: 'Anular',
}

export function accionesPropuesta(p: Propuesta, t: Dia, rol: Rol): AccionPropuesta[] {
  const e = estadoPropuesta(p, t)
  const out: AccionPropuesta[] = []
  if (e === 'borrador' && puedeComercial(rol)) out.push('enviar_revision', 'anular')
  if (e === 'en_revision') {
    if (rol === 'R01') out.push(p.aprobacion ? 'devolver' : 'aprobar', ...(p.aprobacion ? [] : ['devolver' as const]))
    if (p.aprobacion && puedeComercial(rol)) out.push('enviar')
    if (puedeComercial(rol)) out.push('anular')
  }
  if (e === 'enviada' && puedeComercial(rol)) out.push('adjudicar', 'rechazar', 'desierta', 'anular')
  return [...new Set(out)]
}

// --- Precio de la oferta ---
const comoPartida = (l: LineaPropuesta) => ({ recursos: l.recursos }) as Parameters<typeof puCosto>[0]
export const puCostoLinea = (l: LineaPropuesta) => puCosto(comoPartida(l))
export function totalesPropuesta(p: Pick<Propuesta, 'lineas' | 'gg' | 'margen'>) {
  const cd = p.lineas.reduce((s, l) => s + l.cantidad * puCostoLinea(l), 0)
  const precio = p.margen < 1 ? (cd + p.gg) / (1 - p.margen) : 0
  return { cd, gg: p.gg, precio: Math.round(precio), utilidad: Math.round(precio - cd - p.gg), factor: cd > 0 ? precio / cd : 0 }
}
/** RULE-005: el margen bajo el mínimo exige justificación de Gerencia. */
export const margenBajo = (p: Pick<Propuesta, 'margen'>, minimo: number) => p.margen < minimo

/** RULE-004: cliente bloqueado o con EP vencidos hace más de 60 días en otra obra. */
export function clienteObservado(d: Pick<Datos, 'clientes' | 'obras' | 'estadosPago'>, clienteId: string, t: Dia): string | null {
  const c = d.clientes.find((x) => x.id === clienteId)
  if (!c) return null
  if (c.estado === 'bloqueado') return 'Cliente bloqueado'
  const obras = new Set(d.obras.filter((o) => o.mandante === c.nombre).map((o) => o.id))
  const vencido = d.estadosPago.some((e) => obras.has(e.obraId) && e.anulado == null && e.pagado == null && e.vencimiento != null && t - e.vencimiento > 60)
  return vencido ? 'EP vencidos hace más de 60 días en otra obra' : null
}

// --- Catálogo de rendimientos reales (13 §Motor Predictivo) ---
export interface FuenteRendimiento {
  obraId: string
  obra: string
  codigo: string
  avance: number
  cantEjec: number
  /** HH por unidad presupuestadas y reales (null si no tiene mano de obra propia). */
  hhPres: number | null
  hhReal: number | null
  puPres: number
  /** Costo unitario real: costo registrado / cantidad ejecutada. */
  puReal: number | null
  recursosReales: Recurso[]
}

export interface Rendimiento {
  clave: string
  descripcion: string
  unidad: string
  capitulo: string
  fuentes: FuenteRendimiento[]
}

/** Avance mínimo de una partida para que su costo unitario real sea representativo. */
export const AVANCE_MINIMO_RENDIMIENTO = 0.2

export function rendimientosReales(d: Datos, t: Dia): Rendimiento[] {
  const mapa = new Map<string, Rendimiento>()
  for (const o of d.obras) {
    if (!d.programas.some((p) => p.obraId === o.id)) continue
    const c = calcularObra(d, o.id, t)
    for (const cp of c.partidas) {
      const p = cp.p
      if (p.ordenCambioId || cp.cantEjec <= 0) continue
      const clave = `${p.descripcion.toLowerCase()}|${p.unidad}`
      const r = mapa.get(clave) ?? { clave, descripcion: p.descripcion, unidad: p.unidad, capitulo: p.capitulo, fuentes: [] }
      const representativo = cp.avance >= AVANCE_MINIMO_RENDIMIENTO
      const hhPres = hhPorUnidad(p) || null
      const hhReal = cp.rendReal
      // APU real: HH reales al costo HH presupuestado + costo real unitario de los demás recursos
      const tipos = (Object.keys(cp.acPorTipo) as TipoRecurso[]).filter((k) => k !== 'MO' && cp.acPorTipo[k] > 0)
      const recursosReales: Recurso[] = [
        ...(hhReal ? [{ tipo: 'MO' as const, descripcion: 'Mano de obra', cantPorUnidad: Math.round(hhReal * 1000) / 1000, unidad: 'HH', precio: costoHHPres(p) || 9500 }] : []),
        ...tipos.map((k) => ({ tipo: k, descripcion: p.recursos.find((x) => x.tipo === k)?.descripcion ?? k, cantPorUnidad: 1, unidad: p.unidad, precio: Math.round(cp.acPorTipo[k] / cp.cantEjec) })),
      ]
      const costoReal = cp.ac
      r.fuentes.push({
        obraId: o.id, obra: o.nombre, codigo: p.codigo, avance: cp.avance, cantEjec: cp.cantEjec, hhPres, hhReal, puPres: puCosto(p),
        puReal: representativo ? Math.round(costoReal / cp.cantEjec) : null, recursosReales: representativo ? recursosReales : [],
      })
      mapa.set(clave, r)
    }
  }
  return [...mapa.values()].sort((a, b) => a.capitulo.localeCompare(b.capitulo) || a.descripcion.localeCompare(b.descripcion))
}

/** Mejor fuente de un rendimiento: la de mayor avance con costo real representativo. */
export const mejorFuente = (r: Rendimiento) => [...r.fuentes].filter((f) => f.puReal != null).sort((a, b) => b.avance - a.avance)[0]

// --- Indicadores comerciales (14 KCM) ---
export interface IndicadoresComercial {
  /** KCM-01: monto de propuestas enviadas vigentes. */
  pipeline: number
  enviadas: number
  /** KCM-02: adjudicadas / resueltas (90 días). */
  hitRate: number | null
  resueltas90: number
  /** KCM-03: monto adjudicado / monto ofertado resuelto (12 meses). */
  hitMonto: number | null
  /** KCM-04: margen ofertado promedio ponderado por monto (12 meses). */
  margenPromedio: number | null
  /** KCM-06: mandantes con 2 o más obras en 24 meses / mandantes. */
  recurrentes: number | null
  leadsAbiertos: number
}

export function indicadoresComercial(d: Pick<Datos, 'propuestas' | 'leads' | 'obras' | 'clientes'>, t: Dia): IndicadoresComercial {
  const ps = d.propuestas.filter((p) => p.creado <= t)
  const enviadas = ps.filter((p) => estadoPropuesta(p, t) === 'enviada' && !propuestaVencida(p, t))
  const resueltaEn = (p: Propuesta) => { const e = estadoPropuesta(p, t)!; return RESUELTAS.includes(e) ? fechaEstado(p.historial, e) : null }
  const r90 = ps.filter((p) => { const f = resueltaEn(p); return f != null && f > t - 90 })
  const r365 = ps.filter((p) => { const f = resueltaEn(p); return f != null && f > t - 365 })
  const enviadas365 = ps.filter((p) => { const f = fechaEstado(p.historial, 'enviada'); return f != null && f > t - 365 })
  const monto = (xs: Propuesta[]) => xs.reduce((s, p) => s + totalesPropuesta(p).precio, 0)
  const porMandante = new Map<string, number>()
  for (const o of d.obras.filter((x) => x.fechaInicio > t - 730)) porMandante.set(o.mandante, (porMandante.get(o.mandante) ?? 0) + 1)
  return {
    pipeline: monto(enviadas),
    enviadas: enviadas.length,
    hitRate: r90.length ? r90.filter((p) => estadoPropuesta(p, t) === 'adjudicada').length / r90.length : null,
    resueltas90: r90.length,
    hitMonto: monto(r365) > 0 ? monto(r365.filter((p) => estadoPropuesta(p, t) === 'adjudicada')) / monto(r365) : null,
    margenPromedio: monto(enviadas365) > 0 ? enviadas365.reduce((s, p) => s + p.margen * totalesPropuesta(p).precio, 0) / monto(enviadas365) : null,
    recurrentes: porMandante.size ? [...porMandante.values()].filter((n) => n >= 2).length / porMandante.size : null,
    leadsAbiertos: d.leads.filter((l) => ['nuevo', 'en_estudio', 'propuesta_enviada'].includes(estadoLead(l, t) ?? '')).length,
  }
}

export interface AlertaComercial {
  regla: string
  severidad: 'alta' | 'media' | 'baja'
  titulo: string
  detalle: string
  leadId?: string
  propuestaId?: string
}

/** Alertas de la empresa (no de una obra): RULE-001, RULE-003 y RULE-604. */
export function alertasComerciales(d: Pick<Datos, 'propuestas' | 'leads' | 'obras' | 'clientes'>, t: Dia): AlertaComercial[] {
  const out: AlertaComercial[] = []
  for (const l of d.leads) {
    if (estadoLead(l, t) === 'nuevo' && l.fechaCierre != null && l.fechaCierre >= t && l.fechaCierre - t <= DIAS_CIERRE)
      out.push({ regla: 'RULE-001', severidad: 'media', titulo: `${l.nombre}: cierra en ${l.fechaCierre - t} días sin estudio`, detalle: 'Decidir si se estudia o se descarta.', leadId: l.id })
  }
  for (const p of d.propuestas) {
    if (estadoPropuesta(p, t) !== 'enviada') continue
    const enviada = fechaEstado(p.historial, 'enviada') ?? p.creado
    const lead = d.leads.find((l) => l.id === p.leadId)
    if (t - enviada >= DIAS_SIN_RESPUESTA || (p.validezHasta >= t && p.validezHasta - t <= 5))
      out.push({
        regla: 'RULE-003', severidad: 'media', titulo: `Propuesta N° ${p.numero} (${lead?.nombre ?? ''}) sin respuesta`,
        detalle: `Enviada hace ${t - enviada} días · validez hasta el ${fmtFecha(p.validezHasta)}${propuestaVencida(p, t) ? ' (vencida)' : ''}. Hacer seguimiento con el mandante.`, propuestaId: p.id,
      })
  }
  const k = indicadoresComercial(d, t)
  if (k.hitRate != null && k.resueltas90 >= 3 && k.hitRate < META_HIT_RATE)
    out.push({ regla: 'RULE-604', severidad: 'baja', titulo: `Tasa de adjudicación de ${Math.round(k.hitRate * 100)} % en el trimestre`, detalle: 'Analizar las causas de pérdida (precio, plazo, técnicas).' })
  return out
}
