// Postventa (v2: 04, 10 §7, 11 RecepcionDefinitivaRegistrada, 12 RULE-503, 14 KCA-06).
// Garantía del art. 18 LGUC: fallas de la estructura 10 años, de instalaciones y elementos
// constructivos 5 años, de terminaciones 3 años, contados desde la recepción de la obra (definitiva si
// existe; si no, la provisoria). Cada solicitud se clasifica, se verifica su vigencia y se asigna: si la
// partida es subcontratada, al subcontratista, que la ve en su portal.
import { recepcionProvisoria } from './contrato'
import type { Datos } from './datos'
import type { CategoriaPostventa, Dia, EstadoPostventa, Rol, SolicitudPostventa } from './types'

export const CATEGORIAS_POSTVENTA: Record<CategoriaPostventa, { nombre: string; anos: number; ejemplo: string }> = {
  estructura: { nombre: 'Estructura', anos: 10, ejemplo: 'fundaciones, muros, losas, vigas y cubierta estructural' },
  instalaciones: { nombre: 'Instalaciones y elementos constructivos', anos: 5, ejemplo: 'redes eléctricas y sanitarias, cubiertas, ventanas y puertas' },
  terminaciones: { nombre: 'Terminaciones', anos: 3, ejemplo: 'pinturas, revestimientos, pavimentos y cielos' },
}
export const ESTADOS_POSTVENTA: Record<EstadoPostventa, string> = {
  recibida: 'Recibida', en_evaluacion: 'En evaluación', en_reparacion: 'En reparación', resuelta: 'Resuelta', rechazada: 'Rechazada',
}
export const TONO_POSTVENTA: Record<EstadoPostventa, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  recibida: 'gris', en_evaluacion: 'azul', en_reparacion: 'ambar', resuelta: 'verde', rechazada: 'rojo',
}
/** Plazos de servicio: evaluar (visita) en 3 días; resolver en 30. */
export const DIAS_EVALUACION = 3
export const DIAS_SOLUCION = 30

export const estadoPostventa = (s: SolicitudPostventa, t: Dia): EstadoPostventa | null => (s.creado > t ? null : s.historial.filter((h) => h.fecha <= t).at(-1)?.estado ?? 'recibida')
export const abiertaPostventa = (e: EstadoPostventa | null) => e === 'recibida' || e === 'en_evaluacion' || e === 'en_reparacion'
const fechaDe = (s: SolicitudPostventa, e: EstadoPostventa) => s.historial.find((h) => h.estado === e)?.fecha ?? null

/** Inicio de la garantía: recepción definitiva de la obra o, si aún no existe, la provisoria. */
export function inicioGarantia(d: Pick<Datos, 'recepciones'>, obraId: string, t: Dia): Dia | null {
  const def = d.recepciones.filter((r) => r.obraId === obraId && r.tipo === 'definitiva' && r.resultado === 'recibida' && r.fecha <= t).sort((a, b) => b.fecha - a.fecha)[0]
  return def?.fecha ?? recepcionProvisoria(d.recepciones, obraId, t)?.fecha ?? null
}
export const finGarantia = (inicio: Dia, c: CategoriaPostventa) => inicio + Math.round(CATEGORIAS_POSTVENTA[c].anos * 365.25)
/** RULE-503: la solicitud está dentro del plazo legal de su categoría. */
export function enGarantia(d: Pick<Datos, 'recepciones'>, obraId: string, c: CategoriaPostventa, fecha: Dia) {
  const ini = inicioGarantia(d, obraId, fecha)
  return ini != null && fecha <= finGarantia(ini, c)
}
export const obrasEnGarantia = (d: Pick<Datos, 'obras' | 'recepciones'>, t: Dia) => d.obras.filter((o) => inicioGarantia(d, o.id, t) != null)

/** RULE-503: si la partida está subcontratada, responde el subcontratista. */
export function responsableDe(d: Pick<Datos, 'subcontratos' | 'proveedores' | 'obras'>, obraId: string, partidaId?: string) {
  const sc = partidaId ? d.subcontratos.find((s) => s.obraId === obraId && s.lineas.some((l) => l.partidaId === partidaId)) : undefined
  const prov = sc && d.proveedores.find((p) => p.id === sc.subcontratistaId)
  return prov ? { responsable: prov.nombre, subcontratistaId: prov.id } : { responsable: d.obras.find((o) => o.id === obraId)?.administrador ?? 'Constructora' }
}

// --- Permisos: la gestiona la constructora; el mandante la ingresa; el subcontratista repara la suya ---
export const puedeIngresarPostventa = (rol: Rol) => rol === 'R11' || rol === 'R02' || rol === 'R01'
export const puedeGestionarPostventa = (rol: Rol) => rol === 'R02' || rol === 'R01'

export type AccionPostventa = 'evaluar' | 'reparar' | 'resolver' | 'rechazar'
export const ACCIONES_POSTVENTA: Record<AccionPostventa, string> = { evaluar: 'Registrar visita', reparar: 'Iniciar reparación', resolver: 'Dar por resuelta', rechazar: 'Rechazar' }

export function accionesPostventa(s: SolicitudPostventa, t: Dia, rol: Rol, esSuya = false): AccionPostventa[] {
  const e = estadoPostventa(s, t)
  const gestiona = puedeGestionarPostventa(rol)
  if (e === 'recibida') return gestiona ? ['evaluar', 'rechazar'] : []
  if (e === 'en_evaluacion') return gestiona ? ['reparar', 'rechazar'] : []
  if (e === 'en_reparacion') return gestiona || (rol === 'R10' && esSuya) ? ['resolver'] : []
  return []
}

// --- Indicadores (14 KCA-06) ---
export function indicadoresPostventa(d: Pick<Datos, 'solicitudesPostventa' | 'obras' | 'partidas' | 'config'>, obraIds: string[], t: Dia) {
  const ss = d.solicitudesPostventa.filter((s) => obraIds.includes(s.obraId) && s.creado <= t)
  const abiertas = ss.filter((s) => abiertaPostventa(estadoPostventa(s, t)))
  const evaluadas = ss.map((s) => fechaDe(s, 'en_evaluacion') ?? fechaDe(s, 'rechazada')).map((f, i) => (f != null && f <= t ? f - ss[i].fecha : null)).filter((x): x is number => x != null)
  const resueltas = ss.filter((s) => estadoPostventa(s, t) === 'resuelta')
  const diasSolucion = resueltas.map((s) => fechaDe(s, 'resuelta')! - s.fecha)
  const venta = d.partidas.filter((p) => obraIds.includes(p.obraId) && !p.ordenCambioId).reduce((s, p) => s + p.cantidad * p.puVenta, 0)
  const muf = venta / (d.config.valorUF ?? 40_000) / 1000
  const costo = resueltas.reduce((s, x) => s + (x.cargoSubcontratista ? 0 : x.costoReparacion ?? 0), 0)
  const prom = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return {
    total: ss.length,
    abiertas: abiertas.length,
    fueraDePlazo: abiertas.filter((s) => vencidaPostventa(s, t)).length,
    /** KCA-06 */
    porMUF: muf > 0 ? ss.length / muf : null,
    diasEvaluacion: prom(evaluadas),
    diasSolucion: prom(diasSolucion),
    enPlazo: diasSolucion.length ? diasSolucion.filter((x) => x <= DIAS_SOLUCION).length / diasSolucion.length : null,
    costo,
    cargoSubcontratistas: resueltas.filter((x) => x.cargoSubcontratista).reduce((s, x) => s + (x.costoReparacion ?? 0), 0),
    porCategoria: (Object.keys(CATEGORIAS_POSTVENTA) as CategoriaPostventa[]).map((c) => ({ c, n: ss.filter((s) => s.categoria === c).length })),
  }
}

/** Fuera de plazo: sin evaluar a los 3 días o sin resolver a los 30. */
export function vencidaPostventa(s: SolicitudPostventa, t: Dia) {
  const e = estadoPostventa(s, t)
  return (e === 'recibida' && t - s.fecha > DIAS_EVALUACION) || (abiertaPostventa(e) && t - s.fecha > DIAS_SOLUCION)
}
