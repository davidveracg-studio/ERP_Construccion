// Caja chica de obra y rendiciones (v1.2: 08, 10 §17, 12 RULE-401, 19 RN-P04/RN-P06).
// Fondo fijo por obra a cargo de un responsable (R02/R03). Los gastos se rinden con su comprobante e
// imputación (partida o gastos generales); el administrador aprueba ítems hasta 10 UF y Finanzas (o
// Gerencia) los que superan ese tope. Finanzas repone el fondo por lo aprobado, que pasa a costo real.
import type { CajaChica, Config, Dia, EstadoRendicion, ItemRendicion, Rendicion, Rol } from './types'

export const ESTADOS_RENDICION: Record<EstadoRendicion, string> = { borrador: 'En preparación', presentada: 'Presentada', aprobada: 'Repuesta' }
export const TONO_RENDICION: Record<EstadoRendicion, 'gris' | 'ambar' | 'verde'> = { borrador: 'gris', presentada: 'ambar', aprobada: 'verde' }
export const COMPROBANTES: Record<ItemRendicion['comprobante'], string> = { boleta: 'Boleta', factura: 'Factura', sin_documento: 'Sin documento' }

export const limiteRendicion = (cfg: Config) => (cfg.umbrales.limiteRendicionUf ?? 10) * (cfg.valorUF ?? 40_000)

export const puedeRendir = (rol: Rol) => rol === 'R02' || rol === 'R03'
export const puedeAdministrarCaja = (rol: Rol) => rol === 'R09'
/** RN-P04: el administrador aprueba hasta el tope por ítem; sobre él, Finanzas o Gerencia. */
export const puedeRevisarItem = (rol: Rol, item: ItemRendicion, cfg: Config) =>
  rol === 'R09' || rol === 'R01' || (rol === 'R02' && item.monto <= limiteRendicion(cfg))

export const estadoRendicion = (r: Rendicion, t: Dia): EstadoRendicion | null => (r.creado > t ? null : r.historial.filter((h) => h.fecha <= t).at(-1)?.estado ?? 'borrador')
export const totalRendicion = (r: Rendicion) => r.items.reduce((s, i) => s + i.monto, 0)
export const aprobadoRendicion = (r: Rendicion) => r.items.filter((i) => i.revision?.estado === 'aprobado').reduce((s, i) => s + i.monto, 0)
export const rechazadoRendicion = (r: Rendicion) => r.items.filter((i) => i.revision?.estado === 'rechazado').reduce((s, i) => s + i.monto, 0)

/** RULE-401: observaciones de un ítem (sin documento, sin imputación, sobre el tope). */
export function observacionesItem(i: ItemRendicion, cfg: Config): string[] {
  const out: string[] = []
  if (i.comprobante === 'sin_documento') out.push('Sin documento de respaldo')
  if (!i.imputacion) out.push('Sin imputación a partida o GG')
  if (i.monto > limiteRendicion(cfg)) out.push(`Sobre el tope por ítem (${Math.round(limiteRendicion(cfg) / 1000)} mil)`)
  return out
}

/** RULE-401: observaciones de la rendición (ítems observados o suma mayor al fondo). */
export function observacionesRendicion(r: Rendicion, caja: CajaChica, cfg: Config) {
  const items = r.items.map((i) => ({ item: i, obs: observacionesItem(i, cfg) })).filter((x) => x.obs.length)
  return { items, sobreFondo: totalRendicion(r) > caja.fondo }
}

/** Saldo disponible: el fondo menos lo gastado en las rendiciones aún no repuestas. */
export function saldoCaja(caja: CajaChica, rendiciones: Rendicion[], t: Dia) {
  const pendiente = rendiciones.filter((r) => r.cajaId === caja.id && estadoRendicion(r, t) !== 'aprobada' && estadoRendicion(r, t) != null).reduce((s, r) => s + totalRendicion(r), 0)
  return { pendiente, saldo: caja.fondo - pendiente }
}

export const abiertaCaja = (caja: CajaChica, t: Dia) => caja.abierta <= t && (caja.cerrada == null || caja.cerrada.fecha > t)

export interface IndicadoresCaja {
  saldo: number
  usado: number
  /** Días desde la última reposición (o desde la apertura). */
  diasSinReponer: number
  presentadas: number
  /** Monto rechazado / rendido en los últimos 90 días. */
  rechazado: number | null
}

export function indicadoresCaja(caja: CajaChica, rendiciones: Rendicion[], t: Dia): IndicadoresCaja {
  const propias = rendiciones.filter((r) => r.cajaId === caja.id && r.creado <= t)
  const { saldo } = saldoCaja(caja, propias, t)
  const repos = propias.flatMap((r) => r.historial.filter((h) => h.estado === 'aprobada' && h.fecha <= t).map((h) => h.fecha))
  const recientes = propias.filter((r) => estadoRendicion(r, t) === 'aprobada' && r.historial.at(-1)!.fecha > t - 90)
  const rendido = recientes.reduce((s, r) => s + totalRendicion(r), 0)
  return {
    saldo,
    usado: caja.fondo ? 1 - saldo / caja.fondo : 0,
    diasSinReponer: t - Math.max(caja.abierta, ...repos),
    presentadas: propias.filter((r) => estadoRendicion(r, t) === 'presentada').length,
    rechazado: rendido ? recientes.reduce((s, r) => s + rechazadoRendicion(r), 0) / rendido : null,
  }
}
