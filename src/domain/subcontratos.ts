// Subcontratos (v1.2: 08 Dominio 12, 10 §14–15, 12 RULE-703/704, 14 KSU, 19 RN-P04).
// Contrato → presupuesto (partidas con cantidad y PU del subcontrato) → avance validado (RDO) → EP del
// período → retención → pago. El saldo es compromiso (un compromiso por partida, como los importados) y
// cada EP aprobado genera el costo real de sus partidas. La acreditación y el bloqueo por F30-1 (RULE-701/
// 702) llegan con la documentación laboral (paquete J).
import type { CalcObra } from './evm'
import type { Config, Dia, EPSubcontrato, EstadoEPSub, EstadoSubcontrato, RDO, Rol, Subcontrato } from './types'

export const ESTADOS_SUB: Record<EstadoSubcontrato, string> = {
  borrador: 'Borrador', en_acreditacion: 'En acreditación', vigente: 'Vigente', suspendido: 'Suspendido', terminado: 'Terminado', cerrado: 'Cerrado', resuelto: 'Resuelto',
}
export const TONO_SUB: Record<EstadoSubcontrato, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', en_acreditacion: 'ambar', vigente: 'azul', suspendido: 'rojo', terminado: 'verde', cerrado: 'gris', resuelto: 'rojo',
}
export const ESTADOS_EPSUB: Record<EstadoEPSub, string> = {
  borrador: 'Borrador', presentado: 'Presentado', validado: 'Validado por terreno', aprobado: 'Aprobado', bloqueado: 'Bloqueado', pagado: 'Pagado', rechazado: 'Rechazado',
}
export const TONO_EPSUB: Record<EstadoEPSub, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  borrador: 'gris', presentado: 'ambar', validado: 'azul', aprobado: 'azul', bloqueado: 'rojo', pagado: 'verde', rechazado: 'gris',
}

/** KSU-08: adicionales sobre el monto original (verde ≤ 5 %, rojo > 20 %). */
export const ADICIONALES_AMBAR = 0.1
export const ADICIONALES_ROJO = 0.2

export const limiteSubcontrato = (cfg: Config) => (cfg.umbrales.limiteSubcontratoUf ?? 500) * (cfg.valorUF ?? 40_000)

export const estadoSub = (sc: Subcontrato, t: Dia): EstadoSubcontrato | null =>
  sc.creado > t ? null : sc.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'borrador'
export const estadoEPSub = (ep: EPSubcontrato, t: Dia): EstadoEPSub | null =>
  ep.creado > t ? null : ep.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'borrador'

// ───────────────────────── Montos ─────────────────────────

export const montoOriginal = (sc: Pick<Subcontrato, 'lineas'>) => Math.round(sc.lineas.reduce((s, l) => s + l.cantidad * l.pu, 0))
const ajustes = (sc: Subcontrato, tipo: 'adicional' | 'descuento' | 'multa', t: Dia) => sc.ajustes.filter((a) => a.tipo === tipo && a.fecha <= t).reduce((s, a) => s + a.monto, 0)
/** KSU-05: contratado + adicionales − descuentos. */
export const montoVigente = (sc: Subcontrato, t: Dia) => montoOriginal(sc) + ajustes(sc, 'adicional', t) - ajustes(sc, 'descuento', t)
export const multas = (sc: Subcontrato, t: Dia) => ajustes(sc, 'multa', t)

export const puPartida = (sc: Subcontrato, partidaId: string) => sc.lineas.find((l) => l.partidaId === partidaId)?.pu ?? 0

export function montosEPSub(ep: EPSubcontrato, sc: Subcontrato) {
  const bruto = Math.round(ep.lineas.reduce((s, l) => s + l.cantidad * puPartida(sc, l.partidaId), 0))
  const retencion = Math.round(bruto * sc.retencion)
  return { bruto, retencion, descuentos: ep.descuentos, neto: bruto - retencion - ep.descuentos }
}

/** EP que cuentan como cobrados (presentados y no rechazados). */
const COBRADOS: EstadoEPSub[] = ['presentado', 'validado', 'aprobado', 'bloqueado', 'pagado']
const APROBADOS: EstadoEPSub[] = ['aprobado', 'bloqueado', 'pagado']

export const epsDe = (eps: EPSubcontrato[], scId: string) => eps.filter((e) => e.subcontratoId === scId)

/** Cantidad cobrada acumulada de una partida en los EP del subcontrato (sin contar uno). */
export function cobradoPartida(eps: EPSubcontrato[], scId: string, partidaId: string, t: Dia, excluir?: string, hastaCorte = Infinity) {
  return epsDe(eps, scId).filter((e) => e.id !== excluir && e.fechaCorte <= hastaCorte && COBRADOS.includes(estadoEPSub(e, t) ?? 'borrador'))
    .reduce((s, e) => s + e.lineas.filter((l) => l.partidaId === partidaId).reduce((x, l) => x + l.cantidad, 0), 0)
}

/** Avance validado acumulado de la partida (RDO validados hasta el corte). */
export function avanceValidado(rdos: RDO[], obraId: string, partidaId: string, corte: Dia) {
  let s = 0
  for (const r of rdos) if (r.obraId === obraId && r.estado === 'validado' && r.fecha <= corte) for (const a of r.avances) if (a.partidaId === partidaId) s += a.cantidad
  return Math.round(s * 1000) / 1000
}

/** RULE-703: por partida, lo cobrado acumulado (con este EP) no puede superar el avance validado al corte. */
export function excesosRULE703(ep: EPSubcontrato, eps: EPSubcontrato[], rdos: RDO[], t: Dia) {
  const out: { partidaId: string; cobrado: number; validado: number; exceso: number }[] = []
  for (const l of ep.lineas) {
    // Solo los EP con corte hasta el de este: los posteriores cobran avance de después
    const cobrado = cobradoPartida(eps, ep.subcontratoId, l.partidaId, t, ep.id, ep.fechaCorte) + l.cantidad
    const validado = avanceValidado(rdos, ep.obraId, l.partidaId, ep.fechaCorte)
    if (cobrado > validado + 1e-6) out.push({ partidaId: l.partidaId, cobrado, validado, exceso: cobrado - validado })
  }
  return out
}

/** Cantidades sugeridas del EP: avance validado al corte − ya cobrado, por partida. */
export function sugerirLineas(sc: Subcontrato, eps: EPSubcontrato[], rdos: RDO[], corte: Dia, t: Dia) {
  return sc.lineas.map((l) => ({
    partidaId: l.partidaId,
    cantidad: Math.max(0, Math.round((Math.min(l.cantidad, avanceValidado(rdos, sc.obraId, l.partidaId, corte)) - cobradoPartida(eps, sc.id, l.partidaId, t)) * 1000) / 1000),
  })).filter((l) => l.cantidad > 0)
}

/** RULE-704: retención acumulada de los EP aprobados (se devuelve al cierre). */
export function retencionAcumulada(sc: Subcontrato, eps: EPSubcontrato[], t: Dia) {
  return epsDe(eps, sc.id).filter((e) => APROBADOS.includes(estadoEPSub(e, t) ?? 'borrador')).reduce((s, e) => s + montosEPSub(e, sc).retencion, 0)
}

// ───────────────────────── Transiciones ─────────────────────────

export type AccionSub = 'firmar' | 'acreditar' | 'suspender' | 'reanudar' | 'terminar' | 'cerrar' | 'resolver'
export const ACCIONES_SUB: Record<AccionSub, string> = {
  firmar: 'Firmar', acreditar: 'Acreditar', suspender: 'Suspender', reanudar: 'Reanudar', terminar: 'Terminar', cerrar: 'Cerrar (devolver retención)', resolver: 'Resolver (término anticipado)',
}
const PERMISOS_SUB: Partial<Record<EstadoSubcontrato, Partial<Record<AccionSub, Rol[]>>>> = {
  borrador: { firmar: ['R02', 'R01'] },
  en_acreditacion: { acreditar: ['R02'] },
  vigente: { suspender: ['R02'], terminar: ['R02'], resolver: ['R01'] },
  suspendido: { reanudar: ['R02'], resolver: ['R01'] },
  terminado: { cerrar: ['R02'] },
}
export const puedeCrearSubcontrato = (rol: Rol) => rol === 'R02' || rol === 'R05'
export const puedeEditarSubcontratistas = (rol: Rol) => rol === 'R01' || rol === 'R02'
/** RN-P04: sobre el límite firma Gerencia. */
export const requiereGerenciaSub = (sc: Subcontrato, cfg: Config) => montoOriginal(sc) > limiteSubcontrato(cfg)

export function accionesSub(sc: Subcontrato, t: Dia, rol: Rol, cfg: Config): AccionSub[] {
  const e = estadoSub(sc, t)
  if (!e) return []
  return (Object.entries(PERMISOS_SUB[e] ?? {}) as [AccionSub, Rol[]][])
    .filter(([a, roles]) => roles.includes(rol) && !(a === 'firmar' && rol === 'R02' && requiereGerenciaSub(sc, cfg)))
    .map(([a]) => a)
}

export function aplicarAccionSub(
  sc: Subcontrato, accion: AccionSub, x: { fecha: Dia; autor: string; texto?: string; eps: EPSubcontrato[]; rdos: RDO[] },
): Subcontrato {
  const e = estadoSub(sc, x.fecha)
  if (!e || !(accion in (PERMISOS_SUB[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_SUB[accion].toLowerCase()} un subcontrato ${e ? ESTADOS_SUB[e].toLowerCase() : 'inexistente'}.`)
  const texto = x.texto?.trim()
  const paso = (estado: EstadoSubcontrato) => [...sc.historial, { fecha: x.fecha, estado, por: x.autor, ...(texto ? { texto } : {}) }]
  switch (accion) {
    case 'firmar':
      if (sc.lineas.length === 0 || sc.lineas.some((l) => !(l.cantidad > 0) || !(l.pu > 0))) throw new Error('Cada partida necesita cantidad y precio unitario.')
      return { ...sc, historial: paso('en_acreditacion') }
    case 'acreditar':
      return { ...sc, historial: paso('vigente') }
    case 'suspender':
    case 'resolver':
      if (!texto) throw new Error('Indica el motivo.')
      return { ...sc, historial: paso(accion === 'suspender' ? 'suspendido' : 'resuelto') }
    case 'reanudar':
      return { ...sc, historial: paso('vigente') }
    case 'terminar': {
      const pendiente = sc.lineas.filter((l) => avanceValidado(x.rdos, sc.obraId, l.partidaId, x.fecha) < l.cantidad - 1e-6)
      if (pendiente.length) throw new Error('Las partidas asignadas deben estar 100 % validadas para terminar el subcontrato.')
      return { ...sc, historial: paso('terminado') }
    }
    case 'cerrar': {
      const abiertos = epsDe(x.eps, sc.id).filter((ep) => !['pagado', 'rechazado'].includes(estadoEPSub(ep, x.fecha) ?? 'borrador'))
      if (abiertos.length) throw new Error('Todos los estados de pago deben estar pagados para cerrar.')
      return { ...sc, retencionDevuelta: x.fecha, historial: paso('cerrado') }
    }
  }
}

export type AccionEPSub = 'presentar' | 'validar' | 'rechazar' | 'aprobar' | 'pagar'
export const ACCIONES_EPSUB: Record<AccionEPSub, string> = { presentar: 'Presentar', validar: 'Validar cantidades', rechazar: 'Rechazar', aprobar: 'Aprobar', pagar: 'Registrar pago' }
const PERMISOS_EP: Partial<Record<EstadoEPSub, Partial<Record<AccionEPSub, Rol[]>>>> = {
  borrador: { presentar: ['R02', 'R10'] },
  presentado: { validar: ['R03'], rechazar: ['R03', 'R02'] },
  validado: { aprobar: ['R02'], rechazar: ['R02'] },
  // El pago lo registra Finanzas (19, RN-P06: quien aprueba no paga)
  aprobado: { pagar: ['R09'] },
}

export function accionesEPSub(ep: EPSubcontrato, t: Dia, rol: Rol): AccionEPSub[] {
  const e = estadoEPSub(ep, t)
  if (!e) return []
  return (Object.entries(PERMISOS_EP[e] ?? {}) as [AccionEPSub, Rol[]][]).filter(([, roles]) => roles.includes(rol)).map(([a]) => a)
}

export function aplicarAccionEPSub(
  ep: EPSubcontrato, accion: AccionEPSub, x: { fecha: Dia; autor: string; texto?: string; eps: EPSubcontrato[]; rdos: RDO[]; sc: Subcontrato },
): EPSubcontrato {
  const e = estadoEPSub(ep, x.fecha)
  if (!e || !(accion in (PERMISOS_EP[e] ?? {}))) throw new Error(`No se puede ${ACCIONES_EPSUB[accion].toLowerCase()} un EP ${e ? ESTADOS_EPSUB[e].toLowerCase() : 'inexistente'}.`)
  const texto = x.texto?.trim()
  const paso = (estado: EstadoEPSub) => [...ep.historial, { fecha: x.fecha, estado, por: x.autor, ...(texto ? { texto } : {}) }]
  switch (accion) {
    case 'presentar': {
      if (!['vigente', 'terminado'].includes(estadoSub(x.sc, x.fecha) ?? '')) throw new Error('El subcontrato debe estar vigente.')
      if (ep.lineas.every((l) => !(l.cantidad > 0))) throw new Error('El EP no tiene cantidades.')
      return { ...ep, historial: paso('presentado') }
    }
    case 'validar': {
      const ex = excesosRULE703(ep, x.eps, x.rdos, x.fecha)
      if (ex.length) throw new Error(`RULE-703: se cobra más que el avance validado (exceso de ${ex.map((y) => Math.round(y.exceso * 100) / 100).join(', ')}).`)
      return { ...ep, historial: paso('validado') }
    }
    case 'rechazar':
      if (!texto) throw new Error('Indica el motivo.')
      return { ...ep, historial: paso('rechazado') }
    case 'aprobar':
      return { ...ep, historial: paso('aprobado') }
    case 'pagar':
      return { ...ep, historial: paso('pagado') }
  }
}

// ───────────────────────── Indicadores KSU ─────────────────────────

export interface IndicadoresSub {
  original: number
  vigente: number
  adicionales: number
  descuentosMultas: number
  /** Monto bruto de los EP pagados. */
  pagado: number
  /** Monto bruto de los EP aprobados (incluye pagados). */
  aprobado: number
  /** KSU-05 */
  saldo: number
  /** KSU-06: pagado / (avance validado × PU). */
  pagadoVsAvance: number | null
  /** KSU-07 */
  multasDescuentos: number | null
  /** KSU-08 */
  adicionalesPct: number | null
  /** KSU-03: avance físico vs programa de sus partidas. */
  avanceVsPrograma: number | null
  avance: number | null
  retencion: number
  epsPendientes: number
}

export function indicadoresSub(sc: Subcontrato, eps: EPSubcontrato[], rdos: RDO[], c: CalcObra | null, t: Dia): IndicadoresSub {
  const original = montoOriginal(sc)
  const vigente = montoVigente(sc, t)
  const propios = epsDe(eps, sc.id)
  const enEstado = (est: EstadoEPSub[]) => propios.filter((e) => est.includes(estadoEPSub(e, t) ?? 'borrador')).reduce((s, e) => s + montosEPSub(e, sc).bruto, 0)
  const pagado = enEstado(['pagado'])
  const aprobado = enEstado(APROBADOS)
  const valorAvance = sc.lineas.reduce((s, l) => s + Math.min(l.cantidad, avanceValidado(rdos, sc.obraId, l.partidaId, t)) * l.pu, 0)
  const adicionales = ajustes(sc, 'adicional', t)
  const descMultas = ajustes(sc, 'descuento', t) + ajustes(sc, 'multa', t)
  const cps = c ? sc.lineas.map((l) => c.partidas.find((p) => p.p.id === l.partidaId)).filter((p) => !!p) : []
  const ejec = cps.reduce((s, p) => s + p.cantEjec * puPartida(sc, p.p.id), 0)
  const prog = cps.reduce((s, p) => s + p.cantProg * puPartida(sc, p.p.id), 0)
  return {
    original,
    vigente,
    adicionales,
    descuentosMultas: descMultas,
    pagado,
    aprobado,
    saldo: vigente - pagado,
    pagadoVsAvance: valorAvance > 0 ? pagado / valorAvance : null,
    multasDescuentos: original ? descMultas / original : null,
    adicionalesPct: original ? adicionales / original : null,
    avanceVsPrograma: prog > 0 ? ejec / prog : null,
    avance: original ? valorAvance / original : null,
    retencion: retencionAcumulada(sc, eps, t) - (sc.retencionDevuelta != null && sc.retencionDevuelta <= t ? retencionAcumulada(sc, eps, t) : 0),
    epsPendientes: propios.filter((e) => ['presentado', 'validado', 'aprobado', 'bloqueado'].includes(estadoEPSub(e, t) ?? '')).length,
  }
}

/** KSU-04: peso del costo de subcontratos en el costo real de la obra. */
export const pesoSubcontratos = (c: CalcObra) => (c.ac > 0 ? c.partidas.reduce((s, p) => s + p.acPorTipo.SUB, 0) / c.ac : null)
