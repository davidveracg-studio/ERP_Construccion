// Cumplimiento laboral de subcontratistas (v1.2: 08 Documentación Laboral y Trabajador, 10 §19,
// 12 RULE-701/702, 14 KSU-01/02, 19 R10). La empresa acredita su F30 y el F30-1 de cada mes; cada
// trabajador, su contrato, la información de riesgos (DS 44) y la entrega de EPP. Sin eso el
// subcontrato no se acredita (RULE-702) y un EP aprobado queda bloqueado para el pago (RULE-701).
import { iso } from './fechas'
import { estadoEPSub, estadoSub } from './subcontratos'
import type { Dia, DocumentoLaboral, EPSubcontrato, EstadoDocLaboral, EstadoEPSub, Proveedor, Rol, Subcontrato, TipoDocLaboral, Trabajador } from './types'

export const TIPOS_DOC_LABORAL: Record<TipoDocLaboral, string> = {
  f30: 'F30 · antecedentes laborales y previsionales', f30_1: 'F30-1 · cumplimiento de obligaciones laborales', contrato: 'Contrato de trabajo',
  informacion_riesgos: 'Información de riesgos (DS 44)', epp: 'Entrega de EPP',
}
export const ESTADOS_DOC: Record<EstadoDocLaboral, string> = {
  pendiente: 'Pendiente', cargado: 'Por revisar', validado: 'Validado', rechazado: 'Rechazado', por_vencer: 'Por vencer', vencido: 'Vencido',
}
export const TONO_DOC: Record<EstadoDocLaboral, 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo'> = {
  pendiente: 'rojo', cargado: 'azul', validado: 'verde', rechazado: 'rojo', por_vencer: 'ambar', vencido: 'rojo',
}
/** Documentos que debe tener cada trabajador para quedar acreditado (RULE-702). */
export const DOCS_TRABAJADOR: TipoDocLaboral[] = ['contrato', 'informacion_riesgos', 'epp']
/** 10 §19: un documento validado pasa a "por vencer" 5 días antes. */
export const DIAS_AVISO_DOC = 5

export const puedeCargarDocumentos = (rol: Rol) => rol === 'R10' || rol === 'R02'
export const puedeRevisarDocumentos = (rol: Rol) => rol === 'R02'

/** En la demo el usuario R10 representa a este subcontratista (en producción vendría de su membresía). */
export const SUBCONTRATISTA_DEMO = 'Eléctrica Norte Ltda.'
export const subcontratistaDeR10 = (proveedores: Proveedor[]) =>
  proveedores.find((p) => p.esSubcontratista && p.nombre === SUBCONTRATISTA_DEMO) ?? proveedores.find((p) => p.esSubcontratista)

export const periodo = (t: Dia) => iso(t).slice(0, 7)
export function periodoAnterior(p: string) {
  const [a, m] = p.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

export function estadoDoc(doc: DocumentoLaboral | undefined, t: Dia): EstadoDocLaboral {
  if (!doc || doc.creado > t) return 'pendiente'
  const base = doc.historial.filter((p) => p.fecha <= t).at(-1)?.estado ?? 'cargado'
  if (base !== 'validado') return base
  if (doc.vencimiento != null && doc.vencimiento < t) return 'vencido'
  if (doc.vencimiento != null && doc.vencimiento - t <= DIAS_AVISO_DOC) return 'por_vencer'
  return 'validado'
}
export const vigente = (doc: DocumentoLaboral | undefined, t: Dia) => ['validado', 'por_vencer'].includes(estadoDoc(doc, t))

/** El documento más reciente de cada tipo (por empresa o trabajador). */
export function ultimoDoc(docs: DocumentoLaboral[], x: { obraId: string; subcontratistaId: string; trabajadorId?: string; tipo: TipoDocLaboral; periodo?: string }, t: Dia) {
  return docs
    .filter((d) => d.obraId === x.obraId && d.subcontratistaId === x.subcontratistaId && d.tipo === x.tipo && (d.trabajadorId ?? null) === (x.trabajadorId ?? null) && (x.periodo == null || d.periodo === x.periodo) && d.creado <= t)
    .sort((a, b) => b.creado - a.creado)[0]
}

/** RULE-701: hay F30-1 validado del mes del corte o del anterior (desfase de un período). */
export function f301Vigente(docs: DocumentoLaboral[], obraId: string, subcontratistaId: string, corte: Dia, t: Dia) {
  const p = periodo(corte)
  return [p, periodoAnterior(p)].some((per) => estadoDoc(ultimoDoc(docs, { obraId, subcontratistaId, tipo: 'f30_1', periodo: per }, t), t) === 'validado')
}

export const trabajadoresActivos = (ts: Trabajador[], obraId: string, subcontratistaId: string, t: Dia) =>
  ts.filter((w) => w.obraId === obraId && w.subcontratistaId === subcontratistaId && w.ingreso <= t && (w.salida == null || w.salida > t))

export function estadoTrabajador(w: Trabajador, docs: DocumentoLaboral[], t: Dia) {
  const req = DOCS_TRABAJADOR.map((tipo) => ({ tipo, estado: estadoDoc(ultimoDoc(docs, { obraId: w.obraId, subcontratistaId: w.subcontratistaId, trabajadorId: w.id, tipo }, t), t) }))
  return { req, acreditado: req.every((r) => r.estado === 'validado' || r.estado === 'por_vencer') }
}

export interface Acreditacion {
  f30: EstadoDocLaboral
  f301: boolean
  trabajadores: number
  acreditados: number
  /** RULE-702: F30 vigente y todos los trabajadores activos (al menos uno) acreditados. */
  ok: boolean
  /** KSU-01: al día = acreditación ok + F30-1 del mes anterior o del actual. */
  alDia: boolean
}

export function acreditacion(sc: Subcontrato, ts: Trabajador[], docs: DocumentoLaboral[], t: Dia): Acreditacion {
  const f30 = estadoDoc(ultimoDoc(docs, { obraId: sc.obraId, subcontratistaId: sc.subcontratistaId, tipo: 'f30' }, t), t)
  const activos = trabajadoresActivos(ts, sc.obraId, sc.subcontratistaId, t)
  const acreditados = activos.filter((w) => estadoTrabajador(w, docs, t).acreditado).length
  const ok = (f30 === 'validado' || f30 === 'por_vencer') && activos.length > 0 && acreditados === activos.length
  // El F30-1 se exige desde el mes siguiente a la firma (el del primer mes aún no puede existir)
  const firma = sc.historial.find((h) => h.estado === 'en_acreditacion')?.fecha ?? sc.creado
  const exigible = periodo(firma) < periodoAnterior(periodo(t))
  const f301 = !exigible || f301Vigente(docs, sc.obraId, sc.subcontratistaId, t, t)
  return { f30, f301, trabajadores: activos.length, acreditados, ok, alDia: ok && f301 }
}

/** Estado del EP con el bloqueo automático de RULE-701 (aprobado sin F30-1 vigente → bloqueado). */
export function estadoEPConDocs(ep: EPSubcontrato, sc: Subcontrato, docs: DocumentoLaboral[], t: Dia): EstadoEPSub | null {
  const e = estadoEPSub(ep, t)
  if (e === 'aprobado' && !f301Vigente(docs, sc.obraId, sc.subcontratistaId, ep.fechaCorte, t)) return 'bloqueado'
  return e
}

export interface IndicadoresCumplimiento {
  /** KSU-01 */
  alDia: number | null
  vigentes: number
  /** KSU-02 */
  bloqueados: number
  porRevisar: number
  porVencer: number
}

export function indicadoresCumplimiento(
  d: { subcontratos: Subcontrato[]; epsSubcontrato: EPSubcontrato[]; trabajadores: Trabajador[]; documentosLaborales: DocumentoLaboral[] }, obraId: string, t: Dia,
): IndicadoresCumplimiento {
  const vig = d.subcontratos.filter((s) => s.obraId === obraId && estadoSub(s, t) === 'vigente')
  const alDia = vig.filter((s) => acreditacion(s, d.trabajadores, d.documentosLaborales, t).alDia).length
  // Solo el último documento de cada tipo cuenta (las renovaciones reemplazan a los anteriores)
  const ultimos = new Map<string, DocumentoLaboral>()
  for (const x of d.documentosLaborales.filter((y) => y.obraId === obraId && y.creado <= t)) {
    const k = `${x.subcontratistaId}|${x.trabajadorId ?? ''}|${x.tipo}|${x.periodo ?? ''}`
    if (!ultimos.has(k) || ultimos.get(k)!.creado <= x.creado) ultimos.set(k, x)
  }
  const docs = [...ultimos.values()]
  return {
    alDia: vig.length ? alDia / vig.length : null,
    vigentes: vig.length,
    bloqueados: d.epsSubcontrato.filter((e) => {
      const sc = d.subcontratos.find((s) => s.id === e.subcontratoId)
      return e.obraId === obraId && sc && estadoEPConDocs(e, sc, d.documentosLaborales, t) === 'bloqueado'
    }).length,
    porRevisar: docs.filter((x) => estadoDoc(x, t) === 'cargado').length,
    porVencer: docs.filter((x) => estadoDoc(x, t) === 'por_vencer').length,
  }
}
