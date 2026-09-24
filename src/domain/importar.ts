// Importadores (RF-PRE-02/03, RF-COS-01/04, RF-PLA-05). Aceptan texto pegado desde
// Excel (tabulado) o CSV (; o ,). La primera fila es el encabezado.
import { programarActividades } from './cpm'
import { dia } from './fechas'
import { uid } from './formato'
import type { Actividad, Compromiso, CostoReal, Obra, Partida, ReglaMapeo, Recurso, TipoDependencia, TipoRecurso } from './types'

export interface Tabla {
  encabezados: string[]
  filas: string[][]
}

export function parsearTabla(texto: string): Tabla {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (lineas.length === 0) return { encabezados: [], filas: [] }
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].split(';').length > lineas[0].split(',').length ? ';' : ','
  const split = (l: string) => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === sep && !q) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const [h, ...rest] = lineas.map(split)
  return { encabezados: h.map(normalizar), filas: rest }
}

export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Número en formato chileno o internacional: "1.234,56", "1234.56", "$ 12.000". */
export function parsearNumero(s: string | undefined): number | undefined {
  if (s == null) return undefined
  let t = s.replace(/[$\s%]/g, '').replace(/UF/i, '')
  if (t === '' || t === '-') return undefined
  const coma = t.includes(',')
  const puntos = (t.match(/\./g) ?? []).length
  if (coma && puntos > 0) t = t.replace(/\./g, '').replace(',', '.')
  else if (coma) t = t.replace(',', '.')
  else if (puntos > 1 || /^-?\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return isFinite(n) ? n : undefined
}

/** Fecha 'dd-mm-aaaa', 'dd/mm/aaaa' o 'aaaa-mm-dd'. */
export function parsearFecha(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m1) return dia(`${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`)
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return dia(`${m2[1]}-${m2[2]}-${m2[3]}`)
  return undefined
}

function col(t: Tabla, ...alias: string[]): number {
  for (const a of alias) {
    const i = t.encabezados.indexOf(a)
    if (i >= 0) return i
  }
  for (const a of alias) {
    const i = t.encabezados.findIndex((h) => h.startsWith(a))
    if (i >= 0) return i
  }
  return -1
}

export interface ResultadoImport<T> {
  items: T[]
  errores: string[]
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Itemizado + APU simplificado
// Columnas: codigo | descripcion | unidad | cantidad | pu (venta)
// Opcionales APU: hh_unidad, costo_hh, mat_cantidad, mat_precio, mat_unidad,
//                 eq_cantidad, eq_precio, sub_precio, otro_precio
// Filas sin cantidad = títulos de capítulo.
// ---------------------------------------------------------------------------
export function importarItemizado(texto: string, obraId: string): ResultadoImport<Partida> {
  const t = parsearTabla(texto)
  const c = {
    codigo: col(t, 'codigo', 'item', 'cod'),
    desc: col(t, 'descripcion', 'designacion', 'partida'),
    unidad: col(t, 'unidad', 'un', 'ud'),
    cant: col(t, 'cantidad', 'cant'),
    pu: col(t, 'pu', 'p_u', 'precio_unitario', 'pu_venta'),
    hh: col(t, 'hh_unidad', 'hh_u', 'rendimiento_hh'),
    costoHH: col(t, 'costo_hh'),
    matC: col(t, 'mat_cantidad'),
    matP: col(t, 'mat_precio'),
    matU: col(t, 'mat_unidad'),
    eqC: col(t, 'eq_cantidad'),
    eqP: col(t, 'eq_precio'),
    subP: col(t, 'sub_precio'),
    otroP: col(t, 'otro_precio'),
  }
  const errores: string[] = []
  const avisos: string[] = []
  if (c.codigo < 0 || c.desc < 0 || c.cant < 0 || c.pu < 0) {
    errores.push('Faltan columnas obligatorias: codigo, descripcion, unidad, cantidad, pu.')
    return { items: [], errores, avisos }
  }
  const capitulos = new Map<string, string>()
  const items: Partida[] = []
  t.filas.forEach((f, i) => {
    const codigo = f[c.codigo]?.trim()
    const desc = f[c.desc]?.trim()
    if (!codigo && !desc) return
    const cant = parsearNumero(f[c.cant])
    const pu = parsearNumero(f[c.pu])
    if (cant == null || cant === 0) {
      if (codigo) capitulos.set(codigo.split('.')[0], desc ?? codigo)
      return
    }
    if (pu == null) { errores.push(`Fila ${i + 2}: precio unitario inválido`); return }
    const recursos: Recurso[] = []
    const n = (k: number) => (k >= 0 ? parsearNumero(f[k]) : undefined)
    const hh = n(c.hh)
    if (hh) recursos.push({ tipo: 'MO', descripcion: 'Mano de obra', cantPorUnidad: hh, unidad: 'HH', precio: n(c.costoHH) ?? 9000 })
    const mc = n(c.matC)
    const mp = n(c.matP)
    if (mp) recursos.push({ tipo: 'MAT', descripcion: 'Materiales', cantPorUnidad: mc ?? 1, unidad: (c.matU >= 0 && f[c.matU]) || 'u', precio: mp })
    const ep = n(c.eqP)
    if (ep) recursos.push({ tipo: 'EQ', descripcion: 'Equipos', cantPorUnidad: n(c.eqC) ?? 1, unidad: 'H-M', precio: ep })
    const sp = n(c.subP)
    if (sp) recursos.push({ tipo: 'SUB', descripcion: 'Subcontrato', cantPorUnidad: 1, unidad: f[c.unidad] ?? 'u', precio: sp })
    const op = n(c.otroP)
    if (op) recursos.push({ tipo: 'OTRO', descripcion: 'Otros', cantPorUnidad: 1, unidad: f[c.unidad] ?? 'u', precio: op })
    if (recursos.length === 0) avisos.push(`${codigo}: sin APU (se usará 80% del PU como costo; completar después)`)
    if (recursos.length === 0) recursos.push({ tipo: 'OTRO', descripcion: 'Costo estimado (sin APU)', cantPorUnidad: 1, unidad: f[c.unidad] ?? 'u', precio: pu * 0.8 })
    const cap = codigo.split('.')[0]
    items.push({
      id: uid('pa'), obraId, codigo, capitulo: cap, descripcion: desc ?? codigo,
      unidad: (c.unidad >= 0 && f[c.unidad]) || 'u', cantidad: cant, puVenta: pu, recursos,
    })
  })
  for (const p of items) p.capitulo = `${p.capitulo} ${capitulos.get(p.capitulo) ?? ''}`.trim()
  return { items, errores, avisos }
}

// ---------------------------------------------------------------------------
// Costos reales desde contabilidad/ERP
// Columnas: fecha | cuenta | centro_costo | descripcion | proveedor | documento |
//           cantidad | precio | monto | [partida] | [tipo]
// ---------------------------------------------------------------------------
export function aplicarReglas(
  reglas: ReglaMapeo[],
  cuenta?: string,
  centro?: string,
): ReglaMapeo | undefined {
  return (
    reglas.find((r) => r.cuenta && r.centroCosto && r.cuenta === cuenta && r.centroCosto === centro) ??
    reglas.find((r) => r.cuenta && !r.centroCosto && r.cuenta === cuenta) ??
    reglas.find((r) => !r.cuenta && r.centroCosto && r.centroCosto === centro)
  )
}

const TIPOS_VALIDOS = ['MO', 'MAT', 'EQ', 'SUB', 'OTRO', 'GG']

export function importarCostos(
  texto: string,
  obra: Obra,
  partidas: Partida[],
  reglas: ReglaMapeo[],
  compromisos: Compromiso[],
): ResultadoImport<CostoReal> & { sinMapeo: number } {
  const t = parsearTabla(texto)
  const c = {
    fecha: col(t, 'fecha'),
    cuenta: col(t, 'cuenta'),
    centro: col(t, 'centro_costo', 'centro_de_costo', 'cc'),
    desc: col(t, 'descripcion', 'glosa', 'detalle'),
    prov: col(t, 'proveedor'),
    doc: col(t, 'documento', 'doc', 'folio'),
    cant: col(t, 'cantidad'),
    precio: col(t, 'precio'),
    monto: col(t, 'monto', 'total', 'neto'),
    partida: col(t, 'partida', 'codigo_partida'),
    tipo: col(t, 'tipo'),
  }
  const errores: string[] = []
  const avisos: string[] = []
  if (c.fecha < 0 || c.monto < 0) {
    errores.push('Faltan columnas obligatorias: fecha, monto.')
    return { items: [], errores, avisos, sinMapeo: 0 }
  }
  const porCodigo = new Map(partidas.map((p) => [p.codigo, p]))
  const loteId = uid('lote')
  const items: CostoReal[] = []
  let sinMapeo = 0
  t.filas.forEach((f, i) => {
    const fecha = parsearFecha(f[c.fecha])
    const monto = parsearNumero(f[c.monto])
    if (fecha == null || monto == null) { errores.push(`Fila ${i + 2}: fecha o monto inválido`); return }
    const cuenta = c.cuenta >= 0 ? f[c.cuenta] : undefined
    const centro = c.centro >= 0 ? f[c.centro] : undefined
    let partidaId: string | null = null
    let tipo: CostoReal['tipo'] = 'OTRO'
    const codigo = c.partida >= 0 ? f[c.partida] : undefined
    const tipoTxt = c.tipo >= 0 ? f[c.tipo]?.toUpperCase() : undefined
    if (codigo && porCodigo.has(codigo)) partidaId = porCodigo.get(codigo)!.id
    if (tipoTxt && TIPOS_VALIDOS.includes(tipoTxt)) tipo = tipoTxt as CostoReal['tipo']
    if (!partidaId && !(tipoTxt === 'GG')) {
      const r = aplicarReglas(reglas.filter((x) => x.obraId === obra.id), cuenta, centro)
      if (r) { partidaId = r.partidaId; tipo = r.tipo }
      else sinMapeo++
    }
    const doc = c.doc >= 0 ? f[c.doc] : undefined
    const comp = doc ? compromisos.find((k) => k.obraId === obra.id && k.documento === doc) : undefined
    items.push({
      id: uid('co'), obraId: obra.id, fecha, partidaId, tipo,
      cantidad: c.cant >= 0 ? parsearNumero(f[c.cant]) : undefined,
      precio: c.precio >= 0 ? parsearNumero(f[c.precio]) : undefined,
      monto, descripcion: (c.desc >= 0 && f[c.desc]) || '',
      proveedor: c.prov >= 0 ? f[c.prov] || undefined : undefined,
      documento: doc || undefined, cuenta, centroCosto: centro,
      compromisoId: comp?.id, origen: 'importacion', loteId,
    })
  })
  if (sinMapeo) avisos.push(`${sinMapeo} registros sin regla de mapeo quedan "sin imputar". Asígnalos en Costos → Sin imputar.`)
  return { items, errores, avisos, sinMapeo }
}

// ---------------------------------------------------------------------------
// Compromisos: documento | proveedor | partida | tipo | monto | descripcion | fecha
// ---------------------------------------------------------------------------
export function importarCompromisos(texto: string, obra: Obra, partidas: Partida[]): ResultadoImport<Compromiso> {
  const t = parsearTabla(texto)
  const c = {
    doc: col(t, 'documento', 'oc', 'contrato'),
    prov: col(t, 'proveedor', 'subcontratista'),
    partida: col(t, 'partida', 'codigo_partida'),
    tipo: col(t, 'tipo'),
    monto: col(t, 'monto', 'total'),
    desc: col(t, 'descripcion'),
    fecha: col(t, 'fecha'),
  }
  const errores: string[] = []
  if (c.doc < 0 || c.monto < 0) return { items: [], errores: ['Faltan columnas obligatorias: documento, monto.'], avisos: [] }
  const porCodigo = new Map(partidas.map((p) => [p.codigo, p]))
  const items: Compromiso[] = []
  t.filas.forEach((f, i) => {
    const monto = parsearNumero(f[c.monto])
    if (monto == null) { errores.push(`Fila ${i + 2}: monto inválido`); return }
    const tipo = (f[c.tipo]?.toUpperCase() as TipoRecurso) || 'MAT'
    items.push({
      id: uid('cm'), obraId: obra.id,
      partidaId: porCodigo.get(f[c.partida])?.id ?? null,
      tipo: ['MO', 'MAT', 'EQ', 'SUB', 'OTRO'].includes(tipo) ? tipo : 'MAT',
      descripcion: (c.desc >= 0 && f[c.desc]) || f[c.doc],
      proveedor: c.prov >= 0 ? f[c.prov] : undefined,
      documento: f[c.doc], monto,
      fecha: (c.fecha >= 0 && parsearFecha(f[c.fecha])) || obra.fechaInicio,
    })
  })
  return { items, errores, avisos: [] }
}

// ---------------------------------------------------------------------------
// Programa (Carta Gantt) desde Excel/CSV o exportación de MS Project a Excel:
// codigo | nombre | duracion | predecesoras | partidas | hito | contractual
//   predecesoras: "A01;A02FC+2;A03CC-1"   partidas: "3.2:370;3.3:30000"
// ---------------------------------------------------------------------------
export function importarPrograma(texto: string, obra: Obra, partidas: Partida[]): ResultadoImport<Actividad> {
  const t = parsearTabla(texto)
  const c = {
    codigo: col(t, 'codigo', 'id', 'wbs'),
    nombre: col(t, 'nombre', 'actividad', 'tarea'),
    dur: col(t, 'duracion', 'dias'),
    pred: col(t, 'predecesoras', 'predecesores'),
    part: col(t, 'partidas'),
    hito: col(t, 'hito'),
    contr: col(t, 'contractual'),
  }
  const errores: string[] = []
  const avisos: string[] = []
  if (c.codigo < 0 || c.nombre < 0 || c.dur < 0) return { items: [], errores: ['Faltan columnas obligatorias: codigo, nombre, duracion.'], avisos }
  const porCodigoP = new Map(partidas.map((p) => [p.codigo, p]))
  const ids = new Map<string, string>()
  t.filas.forEach((f) => { if (f[c.codigo]) ids.set(f[c.codigo], uid('ac')) })
  const acts: Actividad[] = []
  t.filas.forEach((f, i) => {
    const codigo = f[c.codigo]
    if (!codigo) return
    const dur = parsearNumero(f[c.dur]) ?? 0
    const preds = (c.pred >= 0 ? f[c.pred] ?? '' : '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    const predecesoras = preds.flatMap((s) => {
      const m = s.match(/^(.+?)(FC|CC|FF|CF|FS|SS|SF)?([+-]\d+)?$/i)
      if (!m || !ids.has(m[1])) { errores.push(`Fila ${i + 2}: predecesora "${s}" no existe`); return [] }
      const mapa: Record<string, TipoDependencia> = { FC: 'FC', FS: 'FC', CC: 'CC', SS: 'CC', FF: 'FF', CF: 'CF', SF: 'CF' }
      return [{ actividadId: ids.get(m[1])!, tipo: mapa[(m[2] ?? 'FC').toUpperCase()], desfase: Number(m[3] ?? 0) }]
    })
    const parts = (c.part >= 0 ? f[c.part] ?? '' : '').split(';').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
      const [cod, cant] = s.split(':')
      const p = porCodigoP.get(cod.trim())
      if (!p) { avisos.push(`Fila ${i + 2}: partida ${cod} no existe`); return [] }
      return [{ partidaId: p.id, cantidad: cant ? parsearNumero(cant) ?? p.cantidad : p.cantidad }]
    })
    const esHito = (c.hito >= 0 && /^(s|si|x|1|true)$/i.test(f[c.hito] ?? '')) || dur === 0
    acts.push({
      id: ids.get(codigo)!, codigo, nombre: f[c.nombre], duracion: esHito ? 0 : dur,
      predecesoras, partidas: parts, esHito,
      hitoContractual: c.contr >= 0 && /^(s|si|x|1|true)$/i.test(f[c.contr] ?? ''),
      inicio: 0, fin: 0,
    })
  })
  try {
    return { items: programarActividades(acts, obra.fechaInicio), errores, avisos }
  } catch (e) {
    return { items: [], errores: [...errores, (e as Error).message], avisos }
  }
}

/** Valida que las cantidades asignadas a actividades cuadren con las partidas. */
export function validarVinculos(acts: Actividad[], partidas: Partida[]): string[] {
  const asignado = new Map<string, number>()
  for (const a of acts) for (const ap of a.partidas) asignado.set(ap.partidaId, (asignado.get(ap.partidaId) ?? 0) + ap.cantidad)
  const out: string[] = []
  for (const p of partidas) {
    const s = asignado.get(p.id) ?? 0
    if (s === 0) out.push(`${p.codigo} ${p.descripcion}: sin actividad (se programará linealmente en el plazo)`)
    else if (Math.abs(s - p.cantidad) > p.cantidad * 0.001) out.push(`${p.codigo}: asignado ${s} de ${p.cantidad} ${p.unidad}`)
  }
  return out
}
