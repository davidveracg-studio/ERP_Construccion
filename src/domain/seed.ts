// Datos de demostración: simula día a día dos obras (producción, HH, clima,
// costos semanales importados) y cierra los períodos semanales pasados con el
// mismo motor que usa la aplicación.
import { RUTA_IFC_DEMO } from './bim'
import { programarActividades } from './cpm'
import { CONFIG_DEFECTO, type Datos } from './datos'
import { anticipoPorAmortizar, DIAS_PREPARACION_EP, lineasEP, montosEP } from './estadosPago'
import { diaSemana, finDeMes } from './fechas'
import { conIdsDeterministas } from './formato'
import { inferirModelo } from './modelo4d'
import { aplicarAprobacion, etapaOC, partidasNuevas } from './ordenesCambio'
import { hhPorUnidad, puCosto } from './presupuesto'
import { cerrarPeriodo } from './periodos'
import type {
  Actividad, Compromiso, CondicionesPago, CostoReal, Cuadrilla, Dia, EstadoPago, Generador, Obra, OrdenCambio, Partida, Programa, RDO, Recurso, ReglaMapeo, TipoRecurso,
} from './types'

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SpecPartida {
  codigo: string
  capitulo: string
  descripcion: string
  unidad: string
  cantidad: number
  puVenta: number
  recursos: Recurso[]
  /** Factores reales vs APU */
  consumo?: number
  precio?: number
  proveedor?: string
}

interface SpecActividad {
  codigo: string
  nombre: string
  duracion: number
  pred?: string[]
  partidas?: [string, number][]
  cuadrilla?: string
  eficiencia?: number
  factorHH?: number
  hito?: boolean
  contractual?: boolean
}

interface SpecObra {
  obra: Omit<Obra, 'fechaInicio'>
  inicioHaceDias: number
  partidas: SpecPartida[]
  actividades: SpecActividad[]
  cuadrillas: Omit<Cuadrilla, 'obraId'>[]
  prefijoCC: string
  compromisos: { documento: string; partida: string; tipo: TipoRecurso; proveedor: string; factor: number }[]
  semilla: number
  /** Ritmo de las cuadrillas respecto del programa (por defecto RITMO_BASE). */
  ritmo?: number
  condiciones: CondicionesPago
}

const MO = (hh: number, precio = 9500): Recurso => ({ tipo: 'MO', descripcion: 'Mano de obra', cantPorUnidad: hh, unidad: 'HH', precio })
const MAT = (desc: string, c: number, u: string, p: number): Recurso => ({ tipo: 'MAT', descripcion: desc, cantPorUnidad: c, unidad: u, precio: p })
const EQ = (desc: string, c: number, p: number): Recurso => ({ tipo: 'EQ', descripcion: desc, cantPorUnidad: c, unidad: 'H-M', precio: p })
const SUB = (desc: string, u: string, p: number): Recurso => ({ tipo: 'SUB', descripcion: desc, cantPorUnidad: 1, unidad: u, precio: p })
const OTRO = (desc: string, u: string, p: number): Recurso => ({ tipo: 'OTRO', descripcion: desc, cantPorUnidad: 1, unidad: u, precio: p })

const CUENTA: Record<TipoRecurso | 'GG', string> = { MO: '5-1-00', MAT: '5-1-01', EQ: '5-1-03', SUB: '5-1-04', OTRO: '5-1-05', GG: '5-2-01' }

const OBRA_AROMOS: SpecObra = {
  semilla: 42,
  condiciones: { anticipo: 0.1, retencion: 0.05, diasAprobacion: 10, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.25, reajuste: { indice: 'IPC', base: 100 } },
  ritmo: 1.08,
  inicioHaceDias: 112,
  prefijoCC: 'LA',
  obra: {
    id: 'obra_aromos', nombre: 'Edificio Los Aromos', mandante: 'Inmobiliaria Costa Norte S.A.',
    lineaNegocio: 'Edificación', administrador: 'Carolina Vega', jefeTerreno: 'Juan Soto',
    oficinaTecnica: 'Andrés Muñoz', moneda: 'CLP', plazoDias: 250, multaDiaria: 1_500_000,
    margenOfertado: 0.11, ggPresupuesto: 95_000_000, estado: 'en_ejecucion',
  },
  cuadrillas: [
    { id: 'cq_rojas', nombre: 'Cuadrilla Rojas', capataz: 'Pedro Rojas', trabajadores: 8, costoHH: 9000 },
    { id: 'cq_perez', nombre: 'Cuadrilla Pérez', capataz: 'Luis Pérez', trabajadores: 14, costoHH: 9500 },
    { id: 'cq_soto', nombre: 'Cuadrilla Díaz', capataz: 'Mario Díaz', trabajadores: 10, costoHH: 9300 },
  ],
  partidas: [
    { codigo: '1.1', capitulo: '1 Obras preliminares', descripcion: 'Instalación de faena', unidad: 'gl', cantidad: 1, puVenta: 45_000_000, recursos: [OTRO('Instalación de faena', 'gl', 38_000_000)], precio: 1.05, proveedor: 'Contenedores del Norte' },
    { codigo: '1.2', capitulo: '1 Obras preliminares', descripcion: 'Trazado y niveles', unidad: 'm²', cantidad: 1200, puVenta: 900, recursos: [MO(0.05, 9000)] },
    { codigo: '2.1', capitulo: '2 Movimiento de tierra', descripcion: 'Excavación masiva', unidad: 'm³', cantidad: 3200, puVenta: 4200, recursos: [MO(0.08, 9000), EQ('Excavadora', 0.05, 48_000)], consumo: 1.03, proveedor: 'Maquinarias Elqui' },
    { codigo: '2.2', capitulo: '2 Movimiento de tierra', descripcion: 'Relleno compactado', unidad: 'm³', cantidad: 900, puVenta: 29_000, recursos: [MO(0.3, 9000), MAT('Estabilizado', 1.25, 'm³', 16_000), EQ('Placa compactadora', 0.03, 40_000)], proveedor: 'Áridos La Serena' },
    { codigo: '3.1', capitulo: '3 Obra gruesa', descripcion: 'Hormigón fundaciones H-25', unidad: 'm³', cantidad: 420, puVenta: 118_000, recursos: [MO(0.22), MAT('Hormigón H-25', 1.03, 'm³', 92_000)], consumo: 1.02, proveedor: 'Hormigones Sur Ltda.' },
    { codigo: '3.2', capitulo: '3 Obra gruesa', descripcion: 'Hormigón estructural H-30', unidad: 'm³', cantidad: 1850, puVenta: 128_000, recursos: [MO(0.25), MAT('Hormigón H-30', 1.03, 'm³', 98_000), EQ('Bomba de hormigón', 0.04, 60_000)], consumo: 1.03, proveedor: 'Hormigones Sur Ltda.' },
    { codigo: '3.3', capitulo: '3 Obra gruesa', descripcion: 'Enfierradura', unidad: 'kg', cantidad: 185_000, puVenta: 1380, recursos: [SUB('Subcontrato enfierradura', 'kg', 1150)], proveedor: 'Fierros del Norte SpA' },
    { codigo: '3.4', capitulo: '3 Obra gruesa', descripcion: 'Moldaje', unidad: 'm²', cantidad: 9800, puVenta: 12_500, recursos: [MO(0.55), MAT('Arriendo moldaje', 1, 'm²', 4200)], proveedor: 'Moldajes Pacífico' },
    { codigo: '4.1', capitulo: '4 Albañilería', descripcion: 'Albañilería de ladrillo', unidad: 'm²', cantidad: 2600, puVenta: 29_500, recursos: [MO(0.9), MAT('Ladrillo y mortero', 1, 'm²', 14_500)], proveedor: 'Ladrillos Princesa' },
    { codigo: '5.1', capitulo: '5 Terminaciones', descripcion: 'Estucos', unidad: 'm²', cantidad: 5200, puVenta: 10_500, recursos: [MO(0.45, 9000), MAT('Mortero', 1, 'm²', 3800)], proveedor: 'Morteros Melón' },
    { codigo: '5.2', capitulo: '5 Terminaciones', descripcion: 'Cerámicos', unidad: 'm²', cantidad: 1900, puVenta: 24_500, recursos: [MO(0.6), MAT('Cerámico y adhesivo', 1.05, 'm²', 13_000)], proveedor: 'Cerámicas Cordillera' },
    { codigo: '5.3', capitulo: '5 Terminaciones', descripcion: 'Pintura', unidad: 'm²', cantidad: 12_000, puVenta: 4100, recursos: [SUB('Subcontrato pintura', 'm²', 3100)], proveedor: 'Pinturas Andes' },
    { codigo: '6.1', capitulo: '6 Instalaciones', descripcion: 'Instalaciones sanitarias', unidad: 'gl', cantidad: 1, puVenta: 175_000_000, recursos: [SUB('Subcontrato sanitario', 'gl', 145_000_000)], proveedor: 'Sanitarios Coquimbo' },
    { codigo: '6.2', capitulo: '6 Instalaciones', descripcion: 'Instalaciones eléctricas', unidad: 'gl', cantidad: 1, puVenta: 155_000_000, recursos: [SUB('Subcontrato eléctrico', 'gl', 128_000_000)], proveedor: 'Eléctrica Norte Ltda.' },
  ],
  actividades: [
    { codigo: 'A01', nombre: 'Instalación de faena', duracion: 10, partidas: [['1.1', 1]], cuadrilla: 'cq_rojas' },
    { codigo: 'A02', nombre: 'Trazado', duracion: 5, pred: ['A01'], partidas: [['1.2', 1200]], cuadrilla: 'cq_rojas' },
    { codigo: 'A03', nombre: 'Excavación masiva', duracion: 30, pred: ['A02'], partidas: [['2.1', 3200]], cuadrilla: 'cq_rojas' },
    { codigo: 'A05', nombre: 'Fundaciones', duracion: 25, pred: ['A03FC-5'], partidas: [['3.1', 420], ['3.3', 35_000], ['3.4', 1300]], cuadrilla: 'cq_perez', factorHH: 1.04 },
    { codigo: 'A04', nombre: 'Relleno compactado', duracion: 15, pred: ['A05'], partidas: [['2.2', 900]], cuadrilla: 'cq_rojas' },
    { codigo: 'A06', nombre: 'Estructura piso 1', duracion: 20, pred: ['A05'], partidas: [['3.2', 370], ['3.3', 30_000], ['3.4', 1700]], cuadrilla: 'cq_perez', factorHH: 1.06 },
    { codigo: 'A07', nombre: 'Estructura piso 2', duracion: 20, pred: ['A06'], partidas: [['3.2', 370], ['3.3', 30_000], ['3.4', 1700]], cuadrilla: 'cq_perez', factorHH: 1.07 },
    { codigo: 'A08', nombre: 'Estructura piso 3', duracion: 20, pred: ['A07'], partidas: [['3.2', 370], ['3.3', 30_000], ['3.4', 1700]], cuadrilla: 'cq_perez', factorHH: 1.13 },
    { codigo: 'A09', nombre: 'Estructura piso 4', duracion: 20, pred: ['A08'], partidas: [['3.2', 370], ['3.3', 30_000], ['3.4', 1700]], cuadrilla: 'cq_perez', factorHH: 1.07 },
    { codigo: 'A10', nombre: 'Estructura piso 5 y cubierta', duracion: 20, pred: ['A09'], partidas: [['3.2', 370], ['3.3', 30_000], ['3.4', 1700]], cuadrilla: 'cq_perez', factorHH: 1.07 },
    { codigo: 'H1', nombre: 'Término obra gruesa', duracion: 0, pred: ['A10'], hito: true, contractual: true },
    { codigo: 'A11', nombre: 'Albañilería', duracion: 60, pred: ['A07'], partidas: [['4.1', 2600]], cuadrilla: 'cq_soto', eficiencia: 1.0, factorHH: 0.98 },
    { codigo: 'A12', nombre: 'Instalaciones sanitarias', duracion: 120, pred: ['A07CC+10'], partidas: [['6.1', 1]], cuadrilla: 'cq_rojas' },
    { codigo: 'A13', nombre: 'Instalaciones eléctricas', duracion: 120, pred: ['A07CC+10'], partidas: [['6.2', 1]], cuadrilla: 'cq_rojas' },
    { codigo: 'A14', nombre: 'Estucos', duracion: 70, pred: ['A11CC+20'], partidas: [['5.1', 5200]], cuadrilla: 'cq_soto' },
    { codigo: 'A15', nombre: 'Cerámicos', duracion: 50, pred: ['A14CC+20'], partidas: [['5.2', 1900]], cuadrilla: 'cq_soto' },
    { codigo: 'A16', nombre: 'Pintura', duracion: 45, pred: ['A14'], partidas: [['5.3', 12_000]], cuadrilla: 'cq_soto' },
    { codigo: 'H2', nombre: 'Recepción provisoria', duracion: 0, pred: ['A16', 'A15', 'A12', 'A13', 'A04'], hito: true, contractual: true },
  ],
  compromisos: [
    { documento: 'OC-1021', partida: '3.2', tipo: 'MAT', proveedor: 'Hormigones Sur Ltda.', factor: 1.03 * 98_000 },
    { documento: 'SC-003', partida: '3.3', tipo: 'SUB', proveedor: 'Fierros del Norte SpA', factor: 1150 },
    { documento: 'SC-004', partida: '6.1', tipo: 'SUB', proveedor: 'Sanitarios Coquimbo', factor: 145_000_000 },
    { documento: 'SC-005', partida: '6.2', tipo: 'SUB', proveedor: 'Eléctrica Norte Ltda.', factor: 128_000_000 },
    { documento: 'SC-006', partida: '5.3', tipo: 'SUB', proveedor: 'Pinturas Andes', factor: 3100 },
  ],
}

const OBRA_CLINICA: SpecObra = {
  semilla: 7,
  condiciones: { anticipo: 0.15, retencion: 0.05, diasAprobacion: 7, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.25 },
  inicioHaceDias: 42,
  prefijoCC: 'CE',
  obra: {
    id: 'obra_clinica', nombre: 'Remodelación Clínica Elqui', mandante: 'Clínica Elqui S.A.',
    lineaNegocio: 'Remodelaciones', administrador: 'Rodrigo Tapia', jefeTerreno: 'Felipe Araya',
    oficinaTecnica: 'Andrés Muñoz', moneda: 'CLP', plazoDias: 100, multaDiaria: 400_000,
    margenOfertado: 0.13, ggPresupuesto: 18_000_000, estado: 'en_ejecucion',
  },
  cuadrillas: [{ id: 'cq_munoz', nombre: 'Cuadrilla Muñoz', capataz: 'Jorge Muñoz', trabajadores: 9, costoHH: 9200 }],
  partidas: [
    { codigo: '1.1', capitulo: '1 Demoliciones', descripcion: 'Demoliciones y retiros', unidad: 'm²', cantidad: 450, puVenta: 9800, recursos: [MO(0.35, 9000), EQ('Demoledor eléctrico', 0.05, 15_000)], proveedor: 'Arriendos Coquimbo' },
    { codigo: '2.1', capitulo: '2 Obra civil', descripcion: 'Tabiquería volcometal', unidad: 'm²', cantidad: 820, puVenta: 22_000, recursos: [MO(0.42, 9200), MAT('Perfiles y placas', 1, 'm²', 11_500)], consumo: 0.99, proveedor: 'Volcán Distribución' },
    { codigo: '2.2', capitulo: '2 Obra civil', descripcion: 'Cielos modulares', unidad: 'm²', cantidad: 610, puVenta: 19_500, recursos: [MO(0.3, 9200), MAT('Cielo modular', 1, 'm²', 9800)], proveedor: 'Volcán Distribución' },
    { codigo: '3.1', capitulo: '3 Terminaciones', descripcion: 'Pavimento vinílico', unidad: 'm²', cantidad: 700, puVenta: 21_000, recursos: [SUB('Subcontrato pavimentos', 'm²', 16_500)], proveedor: 'Pisos Clínicos SpA' },
    { codigo: '3.2', capitulo: '3 Terminaciones', descripcion: 'Pintura', unidad: 'm²', cantidad: 2400, puVenta: 4300, recursos: [SUB('Subcontrato pintura', 'm²', 3200)], proveedor: 'Pinturas Andes' },
    { codigo: '4.1', capitulo: '4 Instalaciones', descripcion: 'Instalaciones eléctricas', unidad: 'gl', cantidad: 1, puVenta: 52_000_000, recursos: [SUB('Subcontrato eléctrico', 'gl', 42_000_000)], proveedor: 'Eléctrica Norte Ltda.' },
    { codigo: '4.2', capitulo: '4 Instalaciones', descripcion: 'Climatización', unidad: 'gl', cantidad: 1, puVenta: 71_000_000, recursos: [SUB('Subcontrato climatización', 'gl', 58_000_000)], proveedor: 'Clima Norte SpA' },
  ],
  actividades: [
    { codigo: 'B01', nombre: 'Demoliciones', duracion: 15, partidas: [['1.1', 450]], cuadrilla: 'cq_munoz', eficiencia: 1.04, factorHH: 0.95 },
    { codigo: 'B02', nombre: 'Tabiquería', duracion: 30, pred: ['B01'], partidas: [['2.1', 820]], cuadrilla: 'cq_munoz', eficiencia: 1.02, factorHH: 0.96 },
    { codigo: 'B03', nombre: 'Instalaciones eléctricas', duracion: 45, pred: ['B02CC+10'], partidas: [['4.1', 1]], cuadrilla: 'cq_munoz', eficiencia: 1.12 },
    { codigo: 'B05', nombre: 'Climatización', duracion: 40, pred: ['B03CC+5'], partidas: [['4.2', 1]], cuadrilla: 'cq_munoz', eficiencia: 1.12 },
    { codigo: 'B04', nombre: 'Cielos modulares', duracion: 25, pred: ['B02FC-5'], partidas: [['2.2', 610]], cuadrilla: 'cq_munoz', eficiencia: 1.0 },
    { codigo: 'B06', nombre: 'Pavimentos', duracion: 20, pred: ['B04'], partidas: [['3.1', 700]], cuadrilla: 'cq_munoz' },
    { codigo: 'B07', nombre: 'Pintura', duracion: 20, pred: ['B04FC+5'], partidas: [['3.2', 2400]], cuadrilla: 'cq_munoz' },
    { codigo: 'HB', nombre: 'Entrega al mandante', duracion: 0, pred: ['B05', 'B06', 'B07'], hito: true, contractual: true },
  ],
  compromisos: [
    { documento: 'SC-101', partida: '4.1', tipo: 'SUB', proveedor: 'Eléctrica Norte Ltda.', factor: 42_000_000 },
    { documento: 'SC-102', partida: '4.2', tipo: 'SUB', proveedor: 'Clima Norte SpA', factor: 58_000_000 },
  ],
}

/**
 * Las cuadrillas trabajan algo sobre el ritmo del programa para compensar los días de lluvia
 * y el día que demora en partir cada actividad tras su predecesora: así una obra con
 * eficiencia 1 termina al día con su línea base.
 */
const RITMO_BASE = 1.1

function parsePred(s: string, ids: Map<string, string>) {
  const m = s.match(/^([A-Z0-9]+?)(FC|CC|FF|CF)?([+-]\d+)?$/)!
  return { actividadId: ids.get(m[1])!, tipo: (m[2] ?? 'FC') as 'FC', desfase: Number(m[3] ?? 0) }
}

function simular(spec: SpecObra, hoyDia: Dia) {
  const r = rng(spec.semilla)
  const rand = (a: number, b: number) => a + (b - a) * r()
  let inicio = hoyDia - spec.inicioHaceDias
  inicio -= (diaSemana(inicio) + 6) % 7 // lunes
  const obra: Obra = { ...spec.obra, fechaInicio: inicio, condicionesPago: spec.condiciones }
  const partidas: Partida[] = spec.partidas.map((p) => ({
    id: `${obra.id}_p${p.codigo}`, obraId: obra.id, codigo: p.codigo, capitulo: p.capitulo,
    descripcion: p.descripcion, unidad: p.unidad, cantidad: p.cantidad, puVenta: p.puVenta, recursos: p.recursos,
  }))
  const pid = new Map(partidas.map((p) => [p.codigo, p.id]))
  const pspec = new Map(spec.partidas.map((p) => [pid.get(p.codigo)!, p]))
  const ids = new Map(spec.actividades.map((a) => [a.codigo, `${obra.id}_${a.codigo}`]))
  const acts0: Actividad[] = spec.actividades.map((a) => ({
    id: ids.get(a.codigo)!, codigo: a.codigo, nombre: a.nombre, duracion: a.duracion,
    predecesoras: (a.pred ?? []).map((s) => parsePred(s, ids)),
    partidas: (a.partidas ?? []).map(([c, q]) => ({ partidaId: pid.get(c)!, cantidad: q })),
    esHito: a.hito, hitoContractual: a.contractual, inicio: 0, fin: 0,
  }))
  const lbActs = programarActividades(acts0, inicio)
  const aspec = new Map(spec.actividades.map((a) => [ids.get(a.codigo)!, a]))

  // --- Simulación diaria ---
  const hecho = new Map<string, number>() // actividad|partida → cantidad
  const inicioReal = new Map<string, Dia>()
  const finReal = new Map<string, Dia>()
  const rdos: RDO[] = []
  const produccionDia: { fecha: Dia; partidaId: string; cant: number }[] = []
  const cuadrillas = new Map(spec.cuadrillas.map((c) => [c.id, { ...c, obraId: obra.id }]))
  const progreso = (a: Actividad) =>
    a.partidas.length === 0 ? 0 : a.partidas.reduce((s, ap) => s + (hecho.get(`${a.id}|${ap.partidaId}`) ?? 0) / ap.cantidad, 0) / a.partidas.length
  for (let d = inicio; d < hoyDia; d++) {
    const habil = diaSemana(d) >= 1 && diaSemana(d) <= 5
    const lluvia = habil && r() < 0.06
    const porCuadrilla = new Map<string, { avances: Map<string, number>; hh: Map<string, number> }>()
    for (const a of lbActs) {
      if (finReal.has(a.id)) continue
      const s = aspec.get(a.id)!
      // ¿puede comenzar?
      let ok = true
      let desde = inicio
      for (const p of a.predecesoras) {
        const ps = inicioReal.get(p.actividadId)
        const pf = finReal.get(p.actividadId)
        if (p.tipo === 'CC') { if (ps == null) ok = false; else desde = Math.max(desde, ps + p.desfase) }
        else if (pf != null) desde = Math.max(desde, pf + p.desfase)
        else if (p.desfase < 0 && ps != null) {
          // Traslapo (FC negativo): puede partir cuando al predecesor le quedan |desfase| días
          const pa = lbActs.find((x) => x.id === p.actividadId)!
          if (progreso(pa) < 1 + p.desfase / Math.max(1, pa.duracion)) ok = false
        } else ok = false
      }
      if (!ok || d < desde) continue
      if (!inicioReal.has(a.id)) inicioReal.set(a.id, d)
      if (a.esHito || a.partidas.length === 0) { finReal.set(a.id, d); continue }
      if (!habil) continue
      const cq = s.cuadrilla ? porCuadrilla.get(s.cuadrilla) ?? { avances: new Map(), hh: new Map() } : undefined
      let completa = true
      for (const ap of a.partidas) {
        const k = `${a.id}|${ap.partidaId}`
        const ya = hecho.get(k) ?? 0
        const tasa = ap.cantidad / (a.duracion * 5 / 7)
        const prod = Math.min(ap.cantidad - ya, tasa * (spec.ritmo ?? RITMO_BASE) * (s.eficiencia ?? 1) * rand(0.85, 1.15) * (lluvia ? 0.4 : 1))
        if (prod > 0) {
          hecho.set(k, ya + prod)
          produccionDia.push({ fecha: d, partidaId: ap.partidaId, cant: prod })
          if (cq) {
            cq.avances.set(ap.partidaId, (cq.avances.get(ap.partidaId) ?? 0) + prod)
            const p = partidas.find((x) => x.id === ap.partidaId)!
            const hh = prod * hhPorUnidad(p) * (s.factorHH ?? 1) * rand(0.9, 1.1)
            if (hh > 0) cq.hh.set(ap.partidaId, (cq.hh.get(ap.partidaId) ?? 0) + hh)
          }
        }
        if ((hecho.get(k) ?? 0) < ap.cantidad - 1e-9) completa = false
      }
      if (cq && s.cuadrilla) porCuadrilla.set(s.cuadrilla, cq)
      if (completa) finReal.set(a.id, d + 1)
    }
    // RDO por cuadrilla
    for (const [cid, v] of porCuadrilla) {
      const c = cuadrillas.get(cid)!
      const hh: RDO['hh'] = []
      for (const [p, h] of v.hh) {
        const trab = Math.max(1, Math.min(c.trabajadores, Math.round(h / 9)))
        const horas = h / trab
        hh.push({ partidaId: p, trabajadores: trab, horasNormales: Math.min(9, horas), horasExtra: Math.max(0, horas - 9) })
      }
      if (lluvia) hh.push({ partidaId: null, trabajadores: c.trabajadores, horasNormales: 2, horasExtra: 0, causaNoProductiva: 'clima' })
      else if (cid === 'cq_perez' && r() < 0.08) hh.push({ partidaId: null, trabajadores: c.trabajadores, horasNormales: 1.5, horasExtra: 0, causaNoProductiva: 'espera_material' })
      rdos.push({
        id: `rdo_${cid}_${d}`, obraId: obra.id, cuadrillaId: cid, fecha: d,
        clima: lluvia ? 'lluvia' : r() < 0.3 ? 'nublado' : 'despejado',
        estado: d < hoyDia - 1 ? 'validado' : 'enviado', autor: c.capataz,
        // 4 decimales: en partidas globales (cantidad 1) el avance diario es ~0,01 y redondear a 2 lo distorsiona
        avances: [...v.avances].map(([partidaId, cantidad]) => ({ partidaId, cantidad: Math.round(cantidad * 10_000) / 10_000 })),
        hh, observaciones: lluvia ? 'Lluvia en la mañana, trabajo parcial.' : '',
        validadoPor: d < hoyDia - 1 ? obra.jefeTerreno : undefined,
      })
    }
  }

  // --- Compromisos ---
  const compromisos: Compromiso[] = spec.compromisos.map((k) => {
    const p = partidas.find((x) => x.codigo === k.partida)!
    return {
      id: `${obra.id}_${k.documento}`, obraId: obra.id, partidaId: p.id, tipo: k.tipo,
      descripcion: `${k.tipo === 'SUB' ? 'Subcontrato' : 'Orden de compra'} ${p.descripcion}`,
      proveedor: k.proveedor, documento: k.documento, monto: Math.round(p.cantidad * k.factor), fecha: inicio,
    }
  })
  const compPorPartida = new Map(compromisos.map((k) => [`${k.partidaId}|${k.tipo}`, k]))

  // --- Costos semanales (importación contable cada viernes) ---
  const costos: CostoReal[] = []
  const reglas: ReglaMapeo[] = []
  const cc = (p: Partida) => `${spec.prefijoCC}-${p.codigo.replace('.', '')}`
  for (const p of partidas)
    for (const t of new Set(p.recursos.map((x) => x.tipo)))
      if (t !== 'MO') reglas.push({ id: `rg_${p.id}_${t}`, cuenta: CUENTA[t], centroCosto: cc(p), obraId: obra.id, partidaId: p.id, tipo: t })
  reglas.push({ id: `rg_${obra.id}_gg`, cuenta: CUENTA.GG, obraId: obra.id, partidaId: null, tipo: 'GG' })

  let semana = 0
  const subAcum = new Map<string, number>()
  for (let v = inicio + 4; v < hoyDia; v += 7) {
    semana++
    // Generador propio por semana: los costos de semanas pasadas no cambian al avanzar los días
    const rs = rng(spec.semilla * 1000 + semana)
    const randSem = (a: number, b: number) => a + (b - a) * rs()
    const lote = `lote_${obra.id}_${semana}`
    const prodSemana = new Map<string, number>()
    for (const x of produccionDia) if (x.fecha > v - 7 && x.fecha <= v) prodSemana.set(x.partidaId, (prodSemana.get(x.partidaId) ?? 0) + x.cant)
    for (const [ppid, q] of prodSemana) {
      const p = partidas.find((x) => x.id === ppid)!
      const s = pspec.get(ppid)!
      for (const rec of p.recursos) {
        if (rec.tipo === 'MO') continue
        if (rec.tipo === 'SUB') {
          subAcum.set(ppid, (subAcum.get(ppid) ?? 0) + q)
          continue
        }
        const cant = q * rec.cantPorUnidad * (s.consumo ?? 1) * randSem(0.99, 1.02)
        const precio = rec.precio * (s.precio ?? 1)
        const k = compPorPartida.get(`${ppid}|${rec.tipo}`)
        costos.push({
          id: `co_${ppid}_${rec.tipo}_${semana}`, obraId: obra.id, fecha: v, partidaId: ppid, tipo: rec.tipo,
          cantidad: rec.tipo === 'OTRO' ? undefined : Math.round(cant * 100) / 100, precio: rec.tipo === 'OTRO' ? undefined : Math.round(precio),
          monto: Math.round(cant * precio), descripcion: rec.descripcion, proveedor: s.proveedor,
          documento: k?.documento ?? `FAC-${1000 + costos.length}`, cuenta: CUENTA[rec.tipo], centroCosto: cc(p),
          compromisoId: k?.id, origen: 'importacion', loteId: lote,
        })
      }
    }
    // Estados de pago de subcontratos cada 4 semanas
    if (semana % 4 === 0)
      for (const [ppid, q] of subAcum) {
        if (q <= 0) continue
        const p = partidas.find((x) => x.id === ppid)!
        const rec = p.recursos.find((x) => x.tipo === 'SUB')!
        const k = compPorPartida.get(`${ppid}|SUB`)
        costos.push({
          id: `co_${ppid}_SUB_${semana}`, obraId: obra.id, fecha: v, partidaId: ppid, tipo: 'SUB',
          cantidad: Math.round(q * 1000) / 1000, precio: rec.precio, monto: Math.round(q * rec.precio),
          descripcion: `EP subcontrato ${p.descripcion}`, proveedor: pspec.get(ppid)?.proveedor,
          documento: k?.documento, cuenta: CUENTA.SUB, centroCosto: cc(p), compromisoId: k?.id, origen: 'importacion', loteId: lote,
        })
        subAcum.set(ppid, 0)
      }
    // Gastos generales semanales y varios sin centro de costo cada 4 semanas
    costos.push({
      id: `co_${obra.id}_GG_${semana}`, obraId: obra.id, fecha: v, partidaId: null, tipo: 'GG',
      monto: Math.round((obra.ggPresupuesto / obra.plazoDias) * 7 * randSem(1.02, 1.07)),
      descripcion: 'Gastos generales de obra (remuneraciones staff, arriendos, consumos)', cuenta: CUENTA.GG,
      centroCosto: `${spec.prefijoCC}-GG`, origen: 'importacion', loteId: lote,
    })
    if (semana % 4 === 0) {
      costos.push({
        id: `co_${obra.id}_VAR_${semana}`, obraId: obra.id, fecha: v, partidaId: null, tipo: 'OTRO',
        monto: Math.round(randSem(400_000, 1_200_000)), descripcion: 'Compras varias ferretería', proveedor: 'Ferretería Central',
        cuenta: '5-1-99', centroCosto: `${spec.prefijoCC}-GEN`, origen: 'importacion', loteId: lote,
      })
    }
  }

  const actualActs = lbActs.map((a) => ({ ...a, inicioReal: inicioReal.get(a.id), finReal: finReal.get(a.id) }))
  const mk = (tipo: Programa['tipo'], actividades: Actividad[]): Programa => ({
    id: `${obra.id}_${tipo}`, obraId: obra.id, tipo, version: 1, estado: 'vigente',
    creadoPor: obra.oficinaTecnica, fecha: inicio, actividades,
    motivo: tipo === 'lineaBase' ? 'Línea base inicial (programa contractual)' : undefined,
  })
  // --- Estados de pago al mandante: anticipo al inicio y un EP por mes (ciclo de 10 §9) ---
  const cond = spec.condiciones
  const ayer = hoyDia - 1
  const estadosPago: EstadoPago[] = []
  const hasta = (f: Dia | undefined) => (f != null && f <= ayer ? f : undefined)
  const venta = partidas.reduce((s, p) => s + p.cantidad * p.puVenta, 0)
  if (cond.anticipo > 0) {
    const bruto = Math.round(venta * cond.anticipo)
    estadosPago.push({
      id: `ep_${obra.id}_0`, obraId: obra.id, numero: 0, tipo: 'anticipo', fechaCorte: inicio, version: 1, lineas: [],
      bruto, reajuste: 0, descuentos: [], retencion: 0, amortizacion: 0, neto: bruto,
      creado: inicio + 1, enRevision: inicio + 1, presentaciones: [inicio + 2], observaciones: [],
      aprobado: hasta(inicio + 7), facturado: hasta(inicio + 8), factura: hasta(inicio + 8) != null ? `F-${spec.prefijoCC}-1000` : undefined,
      vencimiento: hasta(inicio + 8) != null ? inicio + 8 + cond.diasPago : undefined,
      pagos: hasta(inicio + 15) != null ? [{ fecha: inicio + 15, monto: bruto }] : [], pagado: hasta(inicio + 15),
    })
  }
  const unidades = new Map(partidas.map((p) => [p.id, p]))
  for (let corte = finDeMes(inicio), n = 1; corte + 1 <= ayer; corte = finDeMes(corte + 1)) {
    const lineas = lineasEP({ rdos, estadosPago, partidas, ordenesCambio: [] }, obra.id, corte).map((l) => ({ ...l, generadores: generadoresDemo(unidades.get(l.partidaId)!, l.cantidad, n) }))
    const bruto = lineas.reduce((s, l) => s + l.monto, 0)
    if (bruto <= 0) continue
    const re = rng(spec.semilla * 31 + n)
    const presentado = corte + DIAS_PREPARACION_EP
    // Un EP de cada obra recibe una observación del ITO y se reingresa como versión 2
    const observado = n === 2 ? presentado + 4 : undefined
    const reingreso = observado != null ? observado + 2 : undefined
    const aprobado = (reingreso ?? presentado) + cond.diasAprobacion + Math.round(re() * 4 - 2) - (reingreso != null ? 6 : 0)
    const facturado = aprobado + 1
    const vencimiento = facturado + cond.diasPago
    // Mandante cumplidor: paga entre 0 y 4 días antes del vencimiento
    const pago = vencimiento - Math.round(re() * 4)
    const indiceReajuste = cond.reajuste ? Math.round(cond.reajuste.base * 1.003 ** n * 100) / 100 : undefined
    const montos = montosEP(bruto, cond, anticipoPorAmortizar(estadosPago, corte), { indiceReajuste })
    const presentaciones = [hasta(presentado), hasta(reingreso)].filter((f): f is Dia => f != null)
    const obs = hasta(observado) != null
      ? [{ fecha: observado!, autor: `ITO ${spec.obra.mandante}`, texto: 'Falta el respaldo de generadores del hormigón y la cubicación del moldaje no cuadra con el plano de losas. Corregir y reingresar.', version: 1, origen: 'mandante' as const }]
      : []
    estadosPago.push({
      id: `ep_${obra.id}_${n}`, obraId: obra.id, numero: n, tipo: 'avance', fechaCorte: corte, version: presentaciones.length > 1 ? 2 : 1,
      lineas, bruto, indiceReajuste, descuentos: [], ...montos,
      creado: corte + 1, enRevision: hasta(corte + 2), presentaciones, observaciones: obs,
      aprobado: hasta(aprobado), facturado: hasta(facturado), factura: hasta(facturado) != null ? `F-${spec.prefijoCC}-${1000 + n}` : undefined,
      vencimiento: hasta(facturado) != null ? vencimiento : undefined,
      pagos: hasta(pago) != null ? [{ fecha: pago, monto: montos.neto }] : [], pagado: hasta(pago),
    })
    n++
  }

  return {
    obra, partidas,
    programas: [mk('contractual', lbActs), mk('lineaBase', lbActs), mk('actualizado', actualActs)],
    cuadrillas: [...cuadrillas.values()], rdos, costos, compromisos, reglas, estadosPago,
  }
}

/** Órdenes de cambio de la demo: una aprobada, una esperando al mandante y una recién valorizada. */
function ordenesDemo(d: Datos, hoyDia: Dia): OrdenCambio[] {
  const obra = (id: string) => d.obras.find((o) => o.id === id)!
  const partida = (id: string) => d.partidas.find((p) => p.id === id)!
  const aromos = obra('obra_aromos').fechaInicio
  const clinica = obra('obra_clinica').fechaInicio
  const alb = partida('obra_aromos_p4.1')
  const base = { devoluciones: [] }
  return [
    {
      ...base, id: 'oc_obra_aromos_1', obraId: 'obra_aromos', numero: 1, tipo: 'extraordinaria', causa: 'imprevisto',
      titulo: 'Muro de contención en deslinde poniente',
      descripcion: 'La excavación dejó expuesto un relleno no informado en el deslinde poniente. Se agrega un muro de contención de hormigón armado.',
      lineas: [{ nueva: { codigo: 'OC1.1', descripcion: 'Muro de contención H-25 (incluye moldaje y enfierradura)', unidad: 'm³', tipoCosto: 'SUB' }, cantidad: 38, puVenta: 285_000, puCosto: 236_000 }],
      diasPlazo: 5, creada: aromos + 40, valorizada: aromos + 43, aprobadaInterna: aromos + 45, aprobadaInternaPor: 'Carolina Vega',
      presentada: aromos + 46, aprobadaMandante: aromos + 56,
    },
    {
      ...base, id: 'oc_obra_aromos_2', obraId: 'obra_aromos', numero: 2, tipo: 'aumento', causa: 'mandante',
      titulo: 'Albañilería en shafts en vez de tabiquería',
      descripcion: 'El mandante pidió cerrar los shafts sanitarios con albañilería de ladrillo en lugar de tabiquería, por resistencia al fuego.',
      lineas: [{ partidaId: alb.id, cantidad: 180, puVenta: alb.puVenta, puCosto: puCosto(alb) }],
      diasPlazo: 0, creada: hoyDia - 20, valorizada: hoyDia - 17, aprobadaInterna: hoyDia - 15, aprobadaInternaPor: 'Carolina Vega', presentada: hoyDia - 12,
    },
    {
      ...base, id: 'oc_obra_aromos_3', obraId: 'obra_aromos', numero: 3, tipo: 'extraordinaria', causa: 'mandante',
      titulo: 'Porcelanato en baños en vez de cerámico',
      descripcion: 'Diferencia de costo por cambio de cerámico 30×30 a porcelanato 60×60 en los baños de los departamentos.',
      lineas: [{ nueva: { codigo: 'OC3.1', descripcion: 'Diferencia porcelanato 60×60 sobre cerámico', unidad: 'm²', tipoCosto: 'MAT' }, cantidad: 420, puVenta: 9_800, puCosto: 7_900 }],
      diasPlazo: 0, creada: hoyDia - 4, valorizada: hoyDia - 2,
    },
    {
      ...base, id: 'oc_obra_clinica_1', obraId: 'obra_clinica', numero: 1, tipo: 'plazo', causa: 'mandante',
      titulo: 'Aumento de plazo por entrega tardía de equipos de clima',
      descripcion: 'Los equipos de climatización, de suministro del mandante, llegaron con 10 días de atraso.',
      lineas: [], diasPlazo: 10, creada: clinica + 20, valorizada: clinica + 21, aprobadaInterna: clinica + 22, aprobadaInternaPor: 'Rodrigo Tapia',
      presentada: clinica + 23, aprobadaMandante: clinica + 30,
    },
  ]
}

/** Respaldo de cantidades de ejemplo: la cantidad del período repartida por sector, con fórmula en m² y m³. */
function generadoresDemo(p: Partida, cantidad: number, n: number): Generador[] {
  const sectores = p.unidad === 'gl' ? [['Según avance validado en RDO', 1]] as const
    : [['Sector norte (ejes 1–3)', 0.45], ['Sector central (ejes 3–5)', 0.35], ['Sector sur (ejes 5–7)', 0.2]] as const
  const r2 = (x: number) => Math.round(x * 100) / 100
  return sectores.map(([ubicacion, f], i) => {
    const q = r2(cantidad * f)
    const lado = r2(Math.sqrt(q / (p.unidad === 'm³' ? 0.18 : 1)) * 1.2)
    const formula = p.unidad === 'm²' && lado > 0 ? `${lado} × ${r2(q / lado)}` : p.unidad === 'm³' && lado > 0 ? `${lado} × ${r2(q / 0.18 / lado)} × 0,18` : undefined
    return { id: `gen_${p.id}_${n}_${i}`, ubicacion, descripcion: p.descripcion, formula, cantidad: q }
  })
}

/**
 * Versión del generador: subirla cuando cambien los datos de la demo, para que la demo
 * compartida se regenere en la próxima visita aunque ya se haya renovado ese día.
 */
export const VERSION_DEMO = 4

/** La demo debe regenerarse: es de otro día o de otra versión del generador. */
export function demoDesactualizada(c: { demoGenerada?: Dia; demoVersion?: number }, hoyDia: Dia) {
  return c.demoGenerada !== hoyDia || c.demoVersion !== VERSION_DEMO
}

/**
 * Datos de demostración al día hoyDia. Es determinista (misma fecha → mismos datos e ids):
 * la demo compartida se renueva cada día y dos visitas simultáneas suben lo mismo.
 */
export function generarDemo(hoyDia: Dia): Datos {
  return conIdsDeterministas(`demo${hoyDia}`, () => generar(hoyDia))
}

function generar(hoyDia: Dia): Datos {
  const d: Datos = {
    config: { ...structuredClone(CONFIG_DEFECTO), demoGenerada: hoyDia, demoVersion: VERSION_DEMO },
    obras: [], partidas: [], programas: [], cuadrillas: [], rdos: [], costos: [],
    compromisos: [], reglasMapeo: [], ajustes: [], periodos: [], alertas: [], estadosPago: [], ordenesCambio: [],
  }
  for (const spec of [OBRA_AROMOS, OBRA_CLINICA]) {
    const s = simular(spec, hoyDia)
    d.obras.push(s.obra)
    d.partidas.push(...s.partidas)
    d.programas.push(...s.programas)
    d.cuadrillas.push(...s.cuadrillas)
    d.rdos.push(...s.rdos)
    d.costos.push(...s.costos)
    d.compromisos.push(...s.compromisos)
    d.reglasMapeo.push(...s.reglas)
    d.estadosPago.push(...s.estadosPago)
  }
  // Órdenes de cambio en distintas etapas, con los efectos de las ya aprobadas por el mandante
  for (const oc of ordenesDemo(d, hoyDia)) {
    d.ordenesCambio.push(oc)
    const etapa = etapaOC(oc, hoyDia - 1)
    if (etapa === 'aprobada_interna' || etapa === 'presentada' || etapa === 'aprobada_mandante') d.partidas.push(...partidasNuevas(oc))
    if (etapa === 'aprobada_mandante') {
      const obra = d.obras.find((o) => o.id === oc.obraId)!
      const efecto = aplicarAprobacion(d.partidas, obra, oc, oc.aprobadaMandante!)
      d.partidas = efecto.partidas
      d.obras = d.obras.map((o) => (o.id === obra.id ? efecto.obra : o))
    }
  }
  // El edificio trae un modelo BIM de ejemplo para la simulación 4D (public/demo)
  const aromos = d.obras.find((o) => o.id === 'obra_aromos')
  const actsAromos = d.programas.find((p) => p.obraId === 'obra_aromos' && p.tipo === 'actualizado')?.actividades
  if (aromos && actsAromos) {
    aromos.modelo4d = {
      ...inferirModelo(actsAromos),
      ifc: {
        ruta: RUTA_IFC_DEMO, nombre: 'edificio-los-aromos.ifc', bytes: 0, fecha: aromos.fechaInicio, subidoPor: aromos.oficinaTecnica,
        niveles: [{ nombre: 'Fundaciones', elevacion: -1.2, piso: 0 }, ...[1, 2, 3, 4, 5].map((k) => ({ nombre: `Piso ${k}`, elevacion: Math.round((k - 1) * 2.6 * 10) / 10, piso: k }))],
      },
    }
  }
  // Cierre de períodos semanales pasados (viernes)
  for (const o of d.obras) {
    for (let v = o.fechaInicio + 11; v < hoyDia - 2; v += 7) {
      const r = cerrarPeriodo(d, o.id, v, o.oficinaTecnica, v + 3)
      d.periodos.push(r.periodo)
      d.alertas = r.alertas
    }
  }
  // Una acción correctiva de ejemplo en curso
  const al = d.alertas.find((a) => a.regla === 'RULE-606' && a.estado === 'activa')
  if (al) {
    al.estado = 'en_accion'
    al.acciones.push({
      id: 'acc_demo', descripcion: 'Reforzar supervisión del vaciado y reorganizar cuadrilla en dos frentes',
      responsable: al.responsable, fechaCompromiso: hoyDia + 10, estado: 'en_curso',
      kpi: al.kpi, valorBase: al.valorKpi, valorEsperado: (al.valorKpi ?? 0) * 0.85, mejorSiMenor: true,
    })
  }
  return d
}
