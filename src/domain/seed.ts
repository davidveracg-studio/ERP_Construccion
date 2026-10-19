// Datos de demostración: simula día a día dos obras (producción, HH, clima,
// costos semanales importados) y cierra los períodos semanales pasados con el
// mismo motor que usa la aplicación.
import { RUTA_IFC_DEMO } from './bim'
import { programarActividades } from './cpm'
import { CONFIG_DEFECTO, programaDe, type Datos } from './datos'
import { anticipoPorAmortizar, DIAS_PREPARACION_EP, lineasEP, montosEP } from './estadosPago'
import { diaSemana, finDeMes, iso } from './fechas'
import { conIdsDeterministas } from './formato'
import { inferirModelo } from './modelo4d'
import { aplicarAprobacion, etapaOC, partidasNuevas } from './ordenesCambio'
import { estadoObraPorRecepcion } from './contrato'
import { f301Vigente } from './cumplimiento'
import { PLAZO_NCR } from './calidad'
import { RIESGOS_TAREA, TAREAS_CRITICAS, TEMAS_CHARLA } from './seguridad'
import { hhPorUnidad, puCosto } from './presupuesto'
import { cerrarPeriodo } from './periodos'
import type {
  Actividad, CategoriaRiesgo, Compromiso, CondicionesPago, CostoReal, Cuadrilla, Dia, Escala5, EstadoPago, EstadoRiesgo, Garantia, Generador, Obligacion, Obra, OrdenCambio,
  Partida, Programa, RDO, Recurso, ReglaMapeo, Riesgo, TipoRecurso, Documento, RFI, Submittal, Folio, TareaSemanal, Restriccion, CausaNoCumplimiento, Proveedor, Material, SolicitudMaterial, OrdenCompra, MovimientoStock, Subcontrato, EPSubcontrato, Trabajador, DocumentoLaboral, Equipo, ParteMaquinaria, CajaChica, Rendicion, ItemRendicion,
  ProtocoloCalidad, NoConformidad, InspeccionCalidad, PasoDoc, EstadoProtocolo,
  TipoTareaCritica, ObservacionPreventiva, Incidente,
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

/** Obra terminada y en recepción provisoria: muestra el cierre del contrato (recepción, garantías). */
const OBRA_BODEGAS: SpecObra = {
  semilla: 13,
  condiciones: { anticipo: 0, retencion: 0.05, diasAprobacion: 10, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.25 },
  inicioHaceDias: 175,
  prefijoCC: 'BP',
  obra: {
    id: 'obra_bodegas', nombre: 'Bodegas Puerto Coquimbo', mandante: 'Logística Puerto Coquimbo S.A.',
    lineaNegocio: 'Industrial', administrador: 'Marcela Rojas', jefeTerreno: 'Diego Vega',
    oficinaTecnica: 'Andrés Muñoz', moneda: 'CLP', plazoDias: 120, multaDiaria: 300_000,
    margenOfertado: 0.12, ggPresupuesto: 14_000_000, estado: 'recepcion_provisoria',
  },
  cuadrillas: [{ id: 'cq_vega', nombre: 'Cuadrilla Vega', capataz: 'Héctor Vega', trabajadores: 10, costoHH: 9200 }],
  partidas: [
    { codigo: '1.1', capitulo: '1 Obras preliminares', descripcion: 'Instalación de faena', unidad: 'gl', cantidad: 1, puVenta: 12_000_000, recursos: [OTRO('Instalación de faena', 'gl', 9_500_000)], proveedor: 'Contenedores del Norte' },
    { codigo: '2.1', capitulo: '2 Movimiento de tierra', descripcion: 'Excavación y rellenos', unidad: 'm³', cantidad: 1800, puVenta: 3100, recursos: [MO(0.06, 9000), EQ('Excavadora', 0.04, 45_000)], proveedor: 'Maquinarias Elqui' },
    { codigo: '3.1', capitulo: '3 Obra gruesa', descripcion: 'Radier H-25 e = 15 cm', unidad: 'm²', cantidad: 3200, puVenta: 21_000, recursos: [MO(0.25), MAT('Hormigón H-25', 0.155, 'm³', 92_000)], proveedor: 'Hormigones Sur Ltda.' },
    { codigo: '4.1', capitulo: '4 Estructura', descripcion: 'Estructura metálica', unidad: 'kg', cantidad: 95_000, puVenta: 2900, recursos: [SUB('Subcontrato estructura metálica', 'kg', 2350)], proveedor: 'Maestranza Elqui' },
    { codigo: '5.1', capitulo: '5 Cubierta', descripcion: 'Cubierta y revestimientos', unidad: 'm²', cantidad: 3600, puVenta: 18_500, recursos: [SUB('Subcontrato cubierta', 'm²', 15_000)], proveedor: 'Cubiertas del Pacífico' },
    { codigo: '6.1', capitulo: '6 Instalaciones', descripcion: 'Instalaciones eléctricas', unidad: 'gl', cantidad: 1, puVenta: 48_000_000, recursos: [SUB('Subcontrato eléctrico', 'gl', 39_000_000)], proveedor: 'Eléctrica Norte Ltda.' },
  ],
  actividades: [
    { codigo: 'C01', nombre: 'Instalación de faena', duracion: 7, partidas: [['1.1', 1]], cuadrilla: 'cq_vega' },
    { codigo: 'C02', nombre: 'Movimiento de tierra', duracion: 15, pred: ['C01'], partidas: [['2.1', 1800]], cuadrilla: 'cq_vega' },
    { codigo: 'C03', nombre: 'Radier', duracion: 25, pred: ['C02'], partidas: [['3.1', 3200]], cuadrilla: 'cq_vega' },
    { codigo: 'C04', nombre: 'Estructura metálica', duracion: 30, pred: ['C03FC-10'], partidas: [['4.1', 95_000]], cuadrilla: 'cq_vega' },
    { codigo: 'C05', nombre: 'Cubierta y revestimientos', duracion: 30, pred: ['C04FC-10'], partidas: [['5.1', 3600]], cuadrilla: 'cq_vega' },
    { codigo: 'C06', nombre: 'Instalaciones eléctricas', duracion: 45, pred: ['C03'], partidas: [['6.1', 1]], cuadrilla: 'cq_vega' },
    { codigo: 'HC', nombre: 'Término de obras', duracion: 0, pred: ['C05', 'C06'], hito: true, contractual: true },
  ],
  compromisos: [
    { documento: 'SC-201', partida: '4.1', tipo: 'SUB', proveedor: 'Maestranza Elqui', factor: 2350 },
    { documento: 'SC-202', partida: '5.1', tipo: 'SUB', proveedor: 'Cubiertas del Pacífico', factor: 15_000 },
    { documento: 'SC-203', partida: '6.1', tipo: 'SUB', proveedor: 'Eléctrica Norte Ltda.', factor: 39_000_000 },
  ],
}

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

  // Término real de la obra (si terminó): después ya no hay gastos generales de faena
  const terminada = lbActs.every((a) => finReal.has(a.id))
  const finObra = terminada ? Math.max(...finReal.values()) : hoyDia

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
    // Gastos generales semanales y varios sin centro de costo cada 4 semanas, mientras dure la obra
    if (v > finObra + 7) continue
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

/** Garantías y obligaciones de las tres obras, y recepción provisoria (con observaciones) de las bodegas. */
function contratoDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'obligaciones' | 'garantias' | 'recepciones'> {
  const obra = (id: string) => d.obras.find((o) => o.id === id)!
  const venta = (id: string) => d.partidas.filter((p) => p.obraId === id).reduce((s, p) => s + p.cantidad * p.puVenta, 0)
  const fin = (id: string) => Math.max(...(d.programas.find((p) => p.obraId === id && p.tipo === 'actualizado')?.actividades ?? []).map((a) => a.finReal ?? 0))
  const aromos = obra('obra_aromos')
  const clinica = obra('obra_clinica')
  const bodegas = obra('obra_bodegas')
  const recepcion = fin('obra_bodegas') + 12
  const ob = (id: string, obraId: string, tipo: Obligacion['tipo'], titulo: string, responsable: string, fechaLimite: Dia, cumplida?: Dia, multa?: Obligacion['multa']): Obligacion =>
    ({ id: `ob_${obraId}_${id}`, obraId, tipo, titulo, responsable, fechaLimite, cumplida, multa, creada: Math.min(fechaLimite - 30, hoyDia - 1) })
  const ga = (id: string, obraId: string, objeto: Garantia['objeto'], emisor: string, monto: number, emision: Dia, vencimiento: Dia, extra: Partial<Garantia> = {}): Garantia =>
    ({ id: `ga_${obraId}_${id}`, obraId, tipo: 'boleta', objeto, numero: `${470_000 + id.length * 1000 + emision % 997}`, emisor, monto: Math.round(monto), emision, vencimiento, creada: emision, ...extra })
  return {
    obligaciones: [
      ob('1', 'obra_aromos', 'garantia', 'Entregar boletas de fiel cumplimiento y anticipo', aromos.administrador, aromos.fechaInicio + 5, aromos.fechaInicio + 2),
      ob('2', 'obra_aromos', 'programa', 'Programa de trabajo actualizado con la OC N° 1', aromos.oficinaTecnica, aromos.fechaInicio + 66, aromos.fechaInicio + 68),
      ob('3', 'obra_aromos', 'informe', 'Informe mensual de avance al mandante', aromos.oficinaTecnica, finDeMes(hoyDia) + 5, undefined, { tipo: 'diaria', monto: 150_000 }),
      ob('4', 'obra_aromos', 'poliza', 'Renovar póliza de responsabilidad civil', aromos.administrador, hoyDia + 25),
      ob('1', 'obra_clinica', 'informe', 'Fichas técnicas de los equipos de climatización', clinica.oficinaTecnica, clinica.fechaInicio + 25, clinica.fechaInicio + 24),
      ob('2', 'obra_clinica', 'otra', 'Plan de mitigación de ruidos en horario clínico', clinica.administrador, hoyDia + 18),
      ob('1', 'obra_bodegas', 'otra', 'Manual de uso y mantención de las bodegas', bodegas.oficinaTecnica, recepcion, recepcion - 3),
      ob('2', 'obra_bodegas', 'planos', 'Entregar planos as-built', bodegas.oficinaTecnica, Math.max(recepcion + 75, hoyDia + 16)),
    ],
    garantias: [
      ga('fc', 'obra_aromos', 'fiel_cumplimiento', 'Banco de Chile', venta('obra_aromos') * 0.1, aromos.fechaInicio - 5, aromos.fechaInicio + aromos.plazoDias + 90),
      ga('an', 'obra_aromos', 'anticipo', 'Banco de Chile', venta('obra_aromos') * 0.1, aromos.fechaInicio - 5, aromos.fechaInicio + 200),
      ga('fc', 'obra_clinica', 'fiel_cumplimiento', 'Banco Estado', venta('obra_clinica') * 0.05, clinica.fechaInicio - 3, clinica.fechaInicio + clinica.plazoDias + 60),
      ga('an', 'obra_clinica', 'anticipo', 'Banco Estado', venta('obra_clinica') * 0.15, clinica.fechaInicio - 3, clinica.fechaInicio + 120),
      // En la recepción, la de fiel cumplimiento se canjea por una de correcta ejecución
      ga('fc', 'obra_bodegas', 'fiel_cumplimiento', 'Banco Santander', venta('obra_bodegas') * 0.1, bodegas.fechaInicio - 5, bodegas.fechaInicio + bodegas.plazoDias + 90, { devuelta: recepcion + 20 }),
      ga('ce', 'obra_bodegas', 'correcta_ejecucion', 'Banco Santander', venta('obra_bodegas') * 0.03, recepcion + 5, recepcion + 365),
    ],
    recepciones: [{
      id: 'rc_obra_bodegas_1', obraId: 'obra_bodegas', tipo: 'provisoria', fecha: recepcion, acta: 'Acta N° 1', resultado: 'recibida', registradaPor: bodegas.administrador,
      observaciones: [
        { id: 'o1', texto: 'Sellar juntas de dilatación del radier en el acceso norte', plazo: recepcion + 20, subsanada: recepcion + 12, vistoBueno: recepcion + 15 },
        { id: 'o2', texto: 'Reponer 6 planchas de revestimiento abolladas en la fachada oriente', plazo: recepcion + 30, subsanada: recepcion + 25, vistoBueno: recepcion + 28 },
        { id: 'o3', texto: 'Certificado TE1 de la instalación eléctrica', plazo: Math.max(recepcion + 70, hoyDia + 12) },
      ],
    }],
  }
}

/** Usuario de Bodega y Adquisiciones (R07) en la demo. */
const USUARIO_R07 = 'Patricia Lagos'

/** Proveedores y catálogo de materiales de la demo (a nivel de empresa). */
const PROVEEDORES_DEMO: Proveedor[] = [
  { id: 'prov_hormigones', rut: '76.410.220-3', nombre: 'Hormigones Sur Ltda.', rubro: 'Hormigones premezclados', contacto: 'Rodrigo Díaz', estado: 'activo' },
  { id: 'prov_moldajes', rut: '77.125.300-K', nombre: 'Moldajes Pacífico', rubro: 'Arriendo de moldajes', contacto: 'Fernanda Ríos', estado: 'activo' },
  { id: 'prov_ladrillos', rut: '96.540.110-2', nombre: 'Ladrillos del Norte S.A.', rubro: 'Albañilería', contacto: 'Jaime Ortiz', estado: 'activo' },
  { id: 'prov_morteros', rut: '76.880.450-1', nombre: 'Morteros Elqui', rubro: 'Morteros y estucos', contacto: 'Claudia Paz', estado: 'activo' },
  { id: 'prov_ceramicas', rut: '78.230.900-5', nombre: 'Cerámicas del Pacífico', rubro: 'Revestimientos', contacto: 'Ignacio Vera', estado: 'activo' },
  { id: 'prov_aridos', rut: '76.050.770-8', nombre: 'Áridos Coquimbo', rubro: 'Áridos y estabilizado', contacto: 'Marcela Soto', estado: 'activo' },
  { id: 'prov_volcan', rut: '96.700.330-4', nombre: 'Distribuidora Volcán Norte', rubro: 'Perfiles y placas', contacto: 'Pablo Godoy', estado: 'activo' },
  { id: 'prov_cielos', rut: '77.640.120-6', nombre: 'Cielos Modulares Norte', rubro: 'Cielos modulares', contacto: 'Andrea Muñoz', estado: 'activo' },
  { id: 'prov_andina', rut: '76.330.010-9', nombre: 'Comercial Andina SpA', rubro: 'Ferretería', estado: 'bloqueado', motivoBloqueo: 'Deuda previsional informada en el F30' },
  { id: 'prov_ferreteria', rut: '76.990.540-7', nombre: 'Ferretería La Serena', rubro: 'Ferretería', estado: 'inactivo' },
]

/** Material del catálogo y proveedor habitual por descripción del recurso del presupuesto. */
const MATERIALES_DEMO: (Material & { recurso: string; proveedor: string })[] = [
  { id: 'mat_h25', codigo: 'M-101', nombre: 'Hormigón H-25', unidad: 'm³', categoria: 'Hormigones', critico: true, recurso: 'Hormigón H-25', proveedor: 'prov_hormigones' },
  { id: 'mat_h30', codigo: 'M-102', nombre: 'Hormigón H-30', unidad: 'm³', categoria: 'Hormigones', critico: true, recurso: 'Hormigón H-30', proveedor: 'prov_hormigones' },
  { id: 'mat_estab', codigo: 'M-110', nombre: 'Estabilizado', unidad: 'm³', categoria: 'Áridos', critico: false, recurso: 'Estabilizado', proveedor: 'prov_aridos' },
  { id: 'mat_moldaje', codigo: 'M-201', nombre: 'Arriendo de moldaje', unidad: 'm²', categoria: 'Moldajes', critico: true, recurso: 'Arriendo moldaje', proveedor: 'prov_moldajes' },
  { id: 'mat_ladrillo', codigo: 'M-301', nombre: 'Ladrillo y mortero de pega', unidad: 'm²', categoria: 'Albañilería', critico: false, recurso: 'Ladrillo y mortero', proveedor: 'prov_ladrillos' },
  { id: 'mat_mortero', codigo: 'M-302', nombre: 'Mortero de estuco', unidad: 'm²', categoria: 'Terminaciones', critico: false, recurso: 'Mortero', proveedor: 'prov_morteros' },
  { id: 'mat_ceramico', codigo: 'M-401', nombre: 'Cerámico 60×60 y adhesivo', unidad: 'm²', categoria: 'Terminaciones', critico: false, recurso: 'Cerámico y adhesivo', proveedor: 'prov_ceramicas' },
  { id: 'mat_perfiles', codigo: 'M-501', nombre: 'Perfiles y placas de yeso-cartón', unidad: 'm²', categoria: 'Tabiquería', critico: false, recurso: 'Perfiles y placas', proveedor: 'prov_volcan' },
  { id: 'mat_cielo', codigo: 'M-502', nombre: 'Cielo modular 60×60', unidad: 'm²', categoria: 'Terminaciones', critico: false, recurso: 'Cielo modular', proveedor: 'prov_cielos' },
  { id: 'mat_epp', codigo: 'M-901', nombre: 'Elementos de protección personal', unidad: 'kit', categoria: 'EPP', critico: false, recurso: '', proveedor: 'prov_ferreteria' },
]

/**
 * Compras de la demo armadas con el avance real de los RDO: cada semana, cada partida con material tuvo
 * su OC entregada el día anterior al lunes (una con atraso y una en dos entregas). Las OC en curso no
 * tocan las partidas de hormigón (ya comprometidas con el contrato marco OC-1021).
 */
function comprasDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'solicitudesMaterial' | 'ordenesCompra'> {
  const solicitudes: SolicitudMaterial[] = []
  const ordenes: OrdenCompra[] = []
  const lunesHoy = hoyDia - ((diaSemana(hoyDia) + 6) % 7)
  // Desde la 1101: la OC-1021 es el contrato marco de hormigón (compromiso importado)
  let numero = 1100
  const bodeguero = USUARIO_R07
  const precioVar = (precio: number, k: number) => Math.round(precio * (1 + (((k * 37) % 7) - 3) / 100))
  const paso = <E extends string>(fecha: Dia, estado: E, por: string) => ({ fecha, estado, por })
  for (const obra of d.obras) {
    const semanas: number[] = []
    // Toda la vida de la obra, incluida la semana en curso (con lo consumido la semana anterior como pronóstico)
    for (let k = 26; k >= 0; k--) semanas.push(lunesHoy - 7 * k)
    let nSol = 0
    let k = 0
    let moldajes = 0
    // Las partidas con contrato marco de material (compromiso importado) se abastecen contra ese contrato
    const marco = new Set(d.compromisos.filter((x) => x.obraId === obra.id && x.tipo === 'MAT').map((x) => x.partidaId))
    for (const L of semanas) {
      for (const p of d.partidas.filter((x) => x.obraId === obra.id)) {
        const rec = p.recursos.find((r) => r.tipo === 'MAT')
        const mat = rec && MATERIALES_DEMO.find((m) => m.recurso === rec.descripcion)
        if (!rec || !mat || marco.has(p.id)) continue
        const desde = L === lunesHoy ? L - 7 : L
        const avance = d.rdos.filter((r) => r.obraId === obra.id && r.fecha >= desde && r.fecha <= desde + 6).reduce((s, r) => s + r.avances.filter((a) => a.partidaId === p.id).reduce((x, a) => x + a.cantidad, 0), 0)
        const hecho = L === lunesHoy ? d.rdos.filter((r) => r.obraId === obra.id && r.estado === 'validado').reduce((s, r) => s + r.avances.filter((a) => a.partidaId === p.id).reduce((x, a) => x + a.cantidad, 0), 0) : 0
        // La de la semana en curso cubre también la próxima (sin pasar lo que queda de la partida)
        const cantidad = L === lunesHoy ? Math.ceil(Math.min(2 * avance, Math.max(0, p.cantidad - hecho) + avance) * rec.cantPorUnidad) : Math.ceil(avance * rec.cantPorUnidad)
        if (cantidad < 1 || L < obra.fechaInicio - 7 || (L === lunesHoy && obra.estado !== 'en_ejecucion')) continue
        k++
        numero++
        const id = `oc_${obra.id}_${numero}`
        const conSolicitud = k % 2 === 0
        const solId = `sm_${obra.id}_${numero}`
        if (conSolicitud) {
          nSol++
          solicitudes.push({
            id: solId, obraId: obra.id, numero: nSol, materialId: mat.id, cantidad, partidaId: p.id, fechaRequerida: L - 1, urgencia: 'planificada',
            historial: [paso(L - 5, 'en_compra' as const, bodeguero)], ordenCompraId: id, creado: L - 6, creadoPor: obra.jefeTerreno,
          })
        }
        // Una entrega con atraso, del proveedor con más OC (no baja su OTIF de 90 días del mínimo)
        if (mat.proveedor === 'prov_moldajes') moldajes++
        const atrasada = obra.id === 'obra_aromos' && mat.proveedor === 'prov_moldajes' && moldajes === 8
        const enDos = obra.id === 'obra_aromos' && k === 4
        const linea = { id: 'l1', materialId: mat.id, cantidad, precio: precioVar(rec.precio, k), partidaId: p.id, ...(conSolicitud ? { solicitudId: solId } : {}) }
        const mitad = Math.round(cantidad / 2)
        ordenes.push({
          id, obraId: obra.id, numero, proveedorId: mat.proveedor, lineas: [linea], fechaEntrega: L - 1, urgente: k % 11 === 0, cotizaciones: 3,
          historial: [paso(L - 5, 'por_aprobar' as const, bodeguero), paso(L - 4, 'aprobada' as const, obra.administrador), paso(L - 4, 'enviada' as const, bodeguero)],
          recepciones: enDos
            ? [{ id: 'r1', fecha: L - 4, guia: `${40_000 + numero}`, cantidades: { l1: mitad }, recibidoPor: bodeguero }, { id: 'r2', fecha: L - 3, guia: `${40_500 + numero}`, cantidades: { l1: cantidad - mitad }, recibidoPor: bodeguero }]
            : [{ id: 'r1', fecha: atrasada ? L + 1 : L - 3, guia: `${40_000 + numero}`, cantidades: { l1: cantidad }, recibidoPor: bodeguero }],
          creado: L - 5, creadoPor: bodeguero,
        })
      }
    }
  }
  // En curso en las obras en ejecución: OC enviada, aprobada, por aprobar (sobre el límite: Gerencia) y solicitudes por atender
  const curso = (obraId: string, n: number, materialId: string, partidaCod: string, cantidad: number, estados: OrdenCompra['historial'], entrega: Dia, extra: Partial<OrdenCompra> = {}) => {
    const mat = MATERIALES_DEMO.find((m) => m.id === materialId)!
    const p = d.partidas.find((x) => x.id === `${obraId}_p${partidaCod}`)!
    const precio = p.recursos.find((r) => r.tipo === 'MAT')!.precio
    ordenes.push({
      id: `oc_${obraId}_${n}`, obraId, numero: n, proveedorId: mat.proveedor, lineas: [{ id: 'l1', materialId, cantidad, precio, partidaId: p.id }],
      fechaEntrega: entrega, urgente: false, cotizaciones: 3, historial: estados, recepciones: [], creado: estados[0]?.fecha ?? hoyDia - 1, creadoPor: bodeguero, ...extra,
    })
  }
  const aromos = d.obras.find((o) => o.id === 'obra_aromos')!
  const clinica = d.obras.find((o) => o.id === 'obra_clinica')!
  curso('obra_aromos', 1301, 'mat_moldaje', '3.4', 1700, [paso(hoyDia - 4, 'por_aprobar', bodeguero), paso(hoyDia - 3, 'aprobada', aromos.administrador), paso(hoyDia - 3, 'enviada', bodeguero)], hoyDia + 3)
  curso('obra_aromos', 1302, 'mat_ceramico', '5.2', 300, [paso(hoyDia - 2, 'por_aprobar', bodeguero), paso(hoyDia - 1, 'aprobada', aromos.administrador)], hoyDia + 8)
  curso('obra_aromos', 1303, 'mat_ladrillo', '4.1', 600, [paso(hoyDia - 1, 'por_aprobar', bodeguero)], hoyDia + 6)
  curso('obra_clinica', 1304, 'mat_cielo', '2.2', 250, [paso(hoyDia - 3, 'por_aprobar', bodeguero), paso(hoyDia - 2, 'aprobada', clinica.administrador), paso(hoyDia - 2, 'enviada', bodeguero)], hoyDia + 2)
  const sol = (obraId: string, materialId: string, partidaCod: string, cantidad: number, requerida: Dia, extra: Partial<SolicitudMaterial> = {}) => {
    const obra = d.obras.find((o) => o.id === obraId)!
    const numeroSol = solicitudes.filter((s) => s.obraId === obraId).length + 1
    solicitudes.push({
      id: `sm_${obraId}_c${numeroSol}`, obraId, numero: numeroSol, materialId, cantidad, partidaId: `${obraId}_p${partidaCod}`, fechaRequerida: requerida, urgencia: 'planificada',
      historial: [], creado: hoyDia - 1, creadoPor: obra.jefeTerreno, ...extra,
    })
  }
  sol('obra_aromos', 'mat_mortero', '5.1', 420, hoyDia + 9)
  sol('obra_aromos', 'mat_epp', '1.1', 12, hoyDia + 4, { nota: 'Reposición de kits para cuadrilla nueva', historial: [paso(hoyDia - 1, 'rechazada', bodeguero)], creadoPor: aromos.jefeTerreno })
  sol('obra_clinica', 'mat_perfiles', '2.1', 60, hoyDia + 10)
  solicitudes.at(-2)!.historial[0] = { ...solicitudes.at(-2)!.historial[0], texto: 'Hay stock de EPP en bodega central; se despacha desde allá.' }
  return { solicitudesMaterial: solicitudes, ordenesCompra: ordenes }
}

/** Especialidad y RUT de los subcontratistas de la demo (por nombre del compromiso importado). */
const SUBCONTRATISTAS_DEMO: Record<string, { rut: string; especialidad: string; contacto: string }> = {
  'Fierros del Norte SpA': { rut: '76.220.110-4', especialidad: 'Enfierradura', contacto: 'Raúl Contreras' },
  'Sanitarios Coquimbo': { rut: '77.310.450-2', especialidad: 'Instalaciones sanitarias', contacto: 'Marta Lillo' },
  'Eléctrica Norte Ltda.': { rut: '76.885.020-6', especialidad: 'Instalaciones eléctricas', contacto: 'Sergio Pizarro' },
  'Pinturas Andes': { rut: '78.112.330-1', especialidad: 'Pintura', contacto: 'Camila Rojas' },
  'Clima Norte SpA': { rut: '76.540.900-3', especialidad: 'Climatización', contacto: 'Felipe Arancibia' },
  'Maestranza Elqui': { rut: '96.330.210-8', especialidad: 'Estructuras metálicas', contacto: 'Héctor Cortés' },
  'Cubiertas del Pacífico': { rut: '77.990.115-5', especialidad: 'Cubiertas y revestimientos', contacto: 'Daniela Fuentes' },
}

/**
 * Subcontratos de la demo: uno por compromiso de subcontrato importado (SC-…), con su EP mensual por el
 * avance validado de cada mes. Los meses anteriores están pagados y el último va en curso. Los de la obra
 * terminada quedan terminados o cerrados. Sin costos nuevos: los del subcontrato ya vienen importados.
 */
function subcontratosDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'proveedores' | 'subcontratos' | 'epsSubcontrato' | 'compromisos'> {
  const proveedores = [...d.proveedores]
  const compromisos = d.compromisos.map((k) => ({ ...k }))
  const subcontratos: Subcontrato[] = []
  const eps: EPSubcontrato[] = []
  const paso = <E extends string>(fecha: Dia, estado: E, por: string) => ({ fecha, estado, por })
  // Avance validado por partida y día (una sola pasada por los RDO)
  const validadoDia = new Map<string, [Dia, number][]>()
  for (const r of d.rdos) {
    if (r.estado !== 'validado') continue
    for (const a of r.avances) {
      const v = validadoDia.get(a.partidaId) ?? []
      v.push([r.fecha, a.cantidad])
      validadoDia.set(a.partidaId, v)
    }
  }
  const acumuladoHasta = (pid: string, corte: Dia) => (validadoDia.get(pid) ?? []).reduce((s, [f, q]) => (f <= corte ? s + q : s), 0)
  for (const obra of d.obras) {
    const subs = compromisos.filter((k) => k.obraId === obra.id && k.tipo === 'SUB' && k.partidaId)
    subs.forEach((k, i) => {
      const nombre = k.proveedor ?? 'Subcontratista'
      let prov = proveedores.find((p) => p.nombre === nombre)
      const info = SUBCONTRATISTAS_DEMO[nombre]
      if (!prov) {
        prov = { id: `prov_sub_${proveedores.length}`, rut: info?.rut ?? '76.000.000-0', nombre, rubro: info?.especialidad ?? 'Subcontratos', contacto: info?.contacto, estado: 'activo' }
        proveedores.push(prov)
      }
      prov.esSubcontratista = true
      prov.especialidad = info?.especialidad
      const p = d.partidas.find((x) => x.id === k.partidaId)!
      const validados = (validadoDia.get(p.id) ?? []).map(([f]) => f)
      const primero = validados.length ? Math.min(...validados) : Math.max(obra.fechaInicio, hoyDia - 1)
      const firma = Math.min(primero - 10, hoyDia - 3)
      const id = `sc_${obra.id}_${k.documento}`
      const terminado = obra.estado !== 'en_ejecucion'
      const ultimo = validados.length ? Math.max(...validados) : primero
      const historial = [paso(firma, 'en_acreditacion' as const, obra.administrador), paso(firma + 4, 'vigente' as const, obra.administrador)]
      const sc: Subcontrato = {
        id, obraId: obra.id, numero: i + 1, codigo: k.documento, subcontratistaId: prov.id, descripcion: p.descripcion,
        lineas: [{ partidaId: p.id, cantidad: p.cantidad, pu: Math.round((k.monto / p.cantidad) * 100) / 100 }], retencion: 0.05,
        inicio: primero, termino: obra.fechaInicio + obra.plazoDias, ajustes: [], historial, compromisos: { [p.id]: k.id }, creado: firma - 2, creadoPor: obra.oficinaTecnica,
      }
      // EP mensuales por el avance validado de cada mes
      let previo = 0
      let n = 0
      for (let corte = finDeMes(obra.fechaInicio); corte + 2 <= hoyDia - 1; corte = finDeMes(corte + 1)) {
        const acumulado = Math.min(p.cantidad, acumuladoHasta(p.id, corte))
        const cantidad = Math.round((acumulado - previo) * 1000) / 1000
        if (cantidad <= 0) continue
        previo += cantidad
        n++
        const pasos = [paso(corte + 2, 'presentado' as const, obra.administrador), paso(corte + 4, 'validado' as const, obra.jefeTerreno), paso(corte + 6, 'aprobado' as const, obra.administrador), paso(corte + 30, 'pagado' as const, obra.administrador)]
        eps.push({
          id: `eps_${id}_${n}`, obraId: obra.id, subcontratoId: id, numero: n, fechaCorte: corte, lineas: [{ partidaId: p.id, cantidad }], descuentos: 0,
          historial: pasos.filter((x) => x.fecha <= hoyDia - 1), creado: corte + 1, creadoPor: obra.administrador,
        })
      }
      if (terminado && previo >= p.cantidad - 1e-6) {
        sc.historial.push(paso(Math.min(ultimo + 3, hoyDia - 2), 'terminado' as const, obra.administrador))
        // La estructura metálica ya se cerró con la retención devuelta
        const pagados = eps.filter((e) => e.subcontratoId === id).every((e) => e.historial.at(-1)?.estado === 'pagado')
        if (k.documento === 'SC-201' && pagados) {
          const cierre = Math.min(Math.max(...eps.filter((e) => e.subcontratoId === id).map((e) => e.historial.at(-1)!.fecha)) + 5, hoyDia - 1)
          sc.historial.push(paso(cierre, 'cerrado' as const, obra.administrador))
          sc.retencionDevuelta = cierre
        }
      }
      subcontratos.push(sc)
    })
  }
  // Una multa aplicada en un EP (enfierradura) y un descuento (escombros en la clínica), que baja el compromiso
  const fierros = subcontratos.find((x) => x.codigo === 'SC-003')
  const epF = fierros && eps.filter((e) => e.subcontratoId === fierros.id).at(-2)
  if (fierros && epF) {
    fierros.ajustes.push({ id: 'aj1', tipo: 'multa', fecha: epF.fechaCorte, monto: 350_000, descripcion: 'Atraso en la entrega de la enfierradura de la losa del piso 3' })
    epF.descuentos = 350_000
  }
  const electrica = subcontratos.find((x) => x.codigo === 'SC-101')
  if (electrica) {
    const fecha = Math.min(electrica.inicio + 20, hoyDia - 1)
    electrica.ajustes.push({ id: 'aj1', tipo: 'descuento', fecha, monto: 500_000, descripcion: 'Retiro de escombros de su faena cargado al subcontratista' })
    const k = compromisos.find((x) => x.id === electrica.compromisos[electrica.lineas[0].partidaId])
    if (k) k.monto -= 500_000
  }
  return { proveedores, subcontratos, epsSubcontrato: eps, compromisos }
}

const NOMBRES_DEMO = ['Juan Araya', 'Pedro Muñoz', 'Luis Tapia', 'Jorge Rojas', 'Manuel Castillo', 'Carlos Vega', 'Diego Flores', 'Andrés Torres', 'Víctor Soto', 'Francisco Díaz', 'Cristián Pérez', 'José Morales']
const OFICIOS_DEMO: Record<string, string[]> = {
  Enfierradura: ['Maestro enfierrador', 'Enfierrador', 'Ayudante enfierrador'],
  'Instalaciones sanitarias': ['Maestro gásfiter', 'Gásfiter', 'Ayudante'],
  'Instalaciones eléctricas': ['Maestro electricista', 'Electricista', 'Ayudante eléctrico'],
  Pintura: ['Maestro pintor', 'Pintor'],
  Climatización: ['Técnico en climatización', 'Instalador'],
  'Estructuras metálicas': ['Maestro soldador', 'Montajista', 'Rigger'],
  'Cubiertas y revestimientos': ['Maestro cubiertero', 'Instalador de revestimientos'],
}

/**
 * Cumplimiento laboral de la demo: trabajadores acreditados (contrato, información de riesgos y EPP),
 * F30 vigente y F30-1 mensual de cada subcontratista. Eléctrica Norte (la empresa del usuario R10) no tiene
 * validados los F30-1 de sus dos últimos meses en las bodegas (el último está cargado sin revisar): su EP
 * final queda aprobado pero bloqueado para el pago (RULE-701). El F30 de Eléctrica
 * Norte en el edificio está por vencer.
 */
function cumplimientoDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'trabajadores' | 'documentosLaborales'> {
  const trabajadores: Trabajador[] = []
  const docs: DocumentoLaboral[] = []
  const H = hoyDia
  let n = 0
  const doc = (sc: Subcontrato, tipo: DocumentoLaboral['tipo'], cargado: Dia, validado: Dia | null, extra: Partial<DocumentoLaboral> = {}) => {
    if (cargado > H - 1) return
    const obra = d.obras.find((o) => o.id === sc.obraId)!
    docs.push({
      id: `dl_${++n}`, obraId: sc.obraId, subcontratistaId: sc.subcontratistaId, tipo, creado: cargado, creadoPor: 'Subcontratista',
      historial: [{ fecha: cargado, estado: 'cargado', por: 'Subcontratista' }, ...(validado != null && validado <= H - 1 ? [{ fecha: validado, estado: 'validado' as const, por: obra.administrador }] : [])],
      ...extra,
    })
  }
  for (const sc of d.subcontratos) {
    const prov = d.proveedores.find((p) => p.id === sc.subcontratistaId)
    const firma = sc.historial.find((h) => h.estado === 'en_acreditacion')?.fecha ?? sc.creado
    const termino = sc.historial.find((h) => h.estado === 'terminado')?.fecha
    // Trabajadores acreditados antes de entrar a la obra
    const oficios = OFICIOS_DEMO[prov?.especialidad ?? ''] ?? ['Maestro', 'Ayudante']
    const dotacion = 3 + (sc.numero % 3)
    for (let k = 0; k < dotacion; k++) {
      const id = `tr_${sc.id}_${k + 1}`
      const ingreso = firma + 1
      trabajadores.push({
        id, obraId: sc.obraId, subcontratistaId: sc.subcontratistaId, rut: `${15 + ((sc.numero * 7 + k * 3) % 9)}.${String(100 + ((k * 37 + sc.numero * 11) % 900)).padStart(3, '0')}.${String(200 + k * 17).padStart(3, '0')}-${(k + sc.numero) % 10}`,
        nombre: NOMBRES_DEMO[(sc.numero * 3 + k + sc.obraId.length) % NOMBRES_DEMO.length], oficio: oficios[Math.min(k, oficios.length - 1)], ingreso,
        ...(termino != null ? { salida: termino + 3 } : {}),
      })
      for (const tipo of ['contrato', 'informacion_riesgos', 'epp'] as const) doc(sc, tipo, firma, firma + 1, { trabajadorId: id })
    }
    // F30 de ingreso y su renovación vigente
    doc(sc, 'f30', firma - 1, firma, { vencimiento: firma + 30 })
    // Se renueva antes de vencer (salvo el de Eléctrica Norte en el edificio, que queda por vencer)
    if (termino == null && firma + 30 < H + 10) doc(sc, 'f30', Math.max(H - 12, firma + 1), Math.max(H - 11, firma + 2), { vencimiento: sc.codigo === 'SC-005' ? H + 3 : H + 18 })
    // F30-1 de cada mes trabajado, cargado el 8 y validado el 10 del mes siguiente
    const bloqueado = sc.codigo === 'SC-203' && sc.obraId === 'obra_bodegas'
    const hasta = termino ?? H
    for (let m = finDeMes(firma); m < hasta; m = finDeMes(m + 1)) {
      const siguiente = m + 1
      if (siguiente + 7 > H - 1) break
      const per = iso(m).slice(0, 7)
      const reciente = m >= finDeMes(finDeMes(hasta) - 62)
      if (bloqueado && reciente) {
        // Sin validar: el último está cargado y espera revisión
        if (m === finDeMes(finDeMes(hasta) - 31)) doc(sc, 'f30_1', siguiente + 7, null, { periodo: per })
        continue
      }
      doc(sc, 'f30_1', siguiente + 7, siguiente + 9, { periodo: per })
    }
  }
  // Sin F30-1 vigente al momento del pago no hay pago (RULE-701): esos EP quedan aprobados
  for (const ep of d.epsSubcontrato) {
    const sc = d.subcontratos.find((s) => s.id === ep.subcontratoId)!
    const pago = ep.historial.find((h) => h.estado === 'pagado')
    if (pago && !f301Vigente(docs, sc.obraId, sc.subcontratistaId, ep.fechaCorte, pago.fecha)) ep.historial = ep.historial.filter((h) => h.estado !== 'pagado')
  }
  return { trabajadores, documentosLaborales: docs }
}

/**
 * Maquinaria de la demo: los equipos del presupuesto (bomba de hormigón, excavadoras, placa, demoledor),
 * con partes diarios de las últimas 8 semanas por las horas que corresponden al avance de los RDO, y una
 * grúa torre propia de costo fijo (utilización cercana al 78 %) con mantención quincenal.
 */
function maquinariaDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'equipos' | 'partesMaquinaria'> {
  const H = hoyDia
  const equipos: Equipo[] = []
  const partes: ParteMaquinaria[] = []
  const desde = H - 56
  const diasPartida = (obraId: string, pids: string[]) => {
    const m = new Map<Dia, Map<string, number>>()
    for (const r of d.rdos) {
      if (r.obraId !== obraId || r.estado === 'rechazado') continue
      for (const a of r.avances) {
        if (!pids.includes(a.partidaId) || a.cantidad <= 0) continue
        const dia = m.get(r.fecha) ?? new Map<string, number>()
        dia.set(a.partidaId, (dia.get(a.partidaId) ?? 0) + a.cantidad)
        m.set(r.fecha, dia)
      }
    }
    return m
  }
  const historial = (fecha: Dia, operador: string, jefe: string) =>
    [{ fecha, estado: 'enviado' as const, por: operador }, ...(fecha + 1 <= H - 1 ? [{ fecha: fecha + 1, estado: 'validado' as const, por: jefe }] : [])]
  // Equipos del presupuesto: horas = avance × horas de equipo por unidad
  const delPresupuesto: [string, string, string, string, Equipo['propiedad'], number, number][] = [
    ['obra_aromos', '3.2', 'EQ-02', 'Bomba de hormigón estacionaria', 'arrendado', 60_000, 9],
    ['obra_aromos', '2.1', 'EQ-03', 'Excavadora CAT 320', 'arrendado', 48_000, 16],
    ['obra_aromos', '2.2', 'EQ-04', 'Placa compactadora', 'arrendado', 40_000, 2],
    ['obra_clinica', '1.1', 'EQ-11', 'Demoledor eléctrico', 'arrendado', 15_000, 0],
    ['obra_bodegas', '2.1', 'EQ-21', 'Excavadora CAT 320', 'arrendado', 45_000, 16],
  ]
  for (const [obraId, cod, codigo, nombre, propiedad, tarifa, consumo] of delPresupuesto) {
    const obra = d.obras.find((o) => o.id === obraId)!
    const p = d.partidas.find((x) => x.id === `${obraId}_p${cod}`)!
    const cpu = p.recursos.find((r) => r.tipo === 'EQ')!.cantPorUnidad
    const dias = diasPartida(obraId, [p.id])
    const fechas = [...dias.keys()].sort((a, b) => a - b)
    if (!fechas.length) continue
    const id = `eq_${obraId}_${codigo}`
    const ultimo = fechas.at(-1)!
    const enUso = ultimo >= H - 3 && obra.estado === 'en_ejecucion'
    equipos.push({
      id, codigo, nombre, tipo: nombre.split(' ')[0], propiedad, tarifa: { modalidad: 'hora', monto: tarifa }, costoHoraPresupuesto: p.recursos.find((r) => r.tipo === 'EQ')!.precio,
      consumoEstandar: consumo || undefined, obraId, asignado: fechas[0] - 1, liberado: enUso ? undefined : ultimo + 1, mantenciones: [],
    })
    let horometro = 1200 + codigo.length * 37
    for (const f of fechas.filter((x) => x > desde && x <= H - 1)) {
      const horas = Math.max(0.5, Math.round(dias.get(f)!.get(p.id)! * cpu * 10) / 10)
      partes.push({
        id: `pm_${id}_${f}`, obraId, equipoId: id, fecha: f, operador: `Operador ${codigo}`, horometroInicial: horometro, horometroFinal: Math.round((horometro + horas) * 10) / 10,
        horasDisponibles: horas, trabajos: [{ partidaId: p.id, horas }], improductivas: [], horasMantencion: 0,
        combustible: Math.round(horas * consumo * (1 + ((f % 5) - 2) / 50) * 10) / 10, historial: historial(f, obra.jefeTerreno, obra.jefeTerreno), creado: f, creadoPor: obra.jefeTerreno,
      })
      horometro = Math.round((horometro + horas) * 10) / 10
    }
  }
  // Grúa torre propia del edificio: costo fijo mensual, 9 h disponibles por día de obra gruesa
  const aromos = d.obras.find((o) => o.id === 'obra_aromos')!
  const estructura = ['3.2', '3.3', '3.4'].map((c) => `obra_aromos_p${c}`)
  const diasGrua = diasPartida('obra_aromos', estructura)
  const fechasGrua = [...diasGrua.keys()].sort((a, b) => a - b)
  if (fechasGrua.length) {
    const id = 'eq_obra_aromos_EQ-01'
    const asignado = fechasGrua[0] - 3
    const mantenciones: Equipo['mantenciones'] = []
    for (let m = asignado + 14, k = 1; m <= H + 14; m += 14, k++) mantenciones.push({ id: `mt${k}`, descripcion: 'Mantención preventiva quincenal (frenos, cables y lubricación)', programada: m, ...(m <= H - 1 ? { realizada: m } : {}) })
    equipos.push({
      id, codigo: 'EQ-01', nombre: 'Grúa torre Liebherr 132 EC-H', tipo: 'Grúa', propiedad: 'propio', tarifa: { modalidad: 'mes', monto: 4_400_000 }, costoHoraPresupuesto: 28_000,
      obraId: 'obra_aromos', asignado, mantenciones,
    })
    let horometro = 8450
    fechasGrua.filter((x) => x > desde && x <= H - 1).forEach((f, k) => {
      const mant = mantenciones.some((m) => m.programada === f) ? 2 : 0
      const espera = k % 3 === 2 ? 1 : 0
      const trab = Math.round((7 - mant * 0.8 - espera * 0.5 + ((f % 3) - 1) * 0.3) * 10) / 10
      const reparto = estructura.filter((pid) => diasGrua.get(f)!.has(pid))
      partes.push({
        id: `pm_${id}_${f}`, obraId: 'obra_aromos', equipoId: id, fecha: f, operador: 'Ramón Fuentes', horometroInicial: horometro, horometroFinal: Math.round((horometro + trab) * 10) / 10,
        horasDisponibles: 9 - mant, trabajos: reparto.map((pid) => ({ partidaId: pid, horas: Math.round((trab / reparto.length) * 10) / 10 })),
        improductivas: espera ? [{ horas: espera, causa: 'espera_frente' as const }] : [], horasMantencion: mant, combustible: 0,
        historial: historial(f, 'Ramón Fuentes', aromos.jefeTerreno), creado: f, creadoPor: aromos.jefeTerreno,
      })
      horometro = Math.round((horometro + trab) * 10) / 10
    })
  }
  return { equipos, partesMaquinaria: partes }
}

/** Usuario de Finanzas (R09) en la demo. */
const USUARIO_R09 = 'Lorena Castro'

/** Gastos típicos de caja chica: [descripción, proveedor, comprobante, monto base, imputación (código de partida o GG)]. */
const GASTOS_CAJA: [string, string, ItemRendicion['comprobante'], number, string][] = [
  ['Discos de corte y brocas', 'Ferretería La Serena', 'boleta', 38_500, '3.3'],
  ['Clavos, alambre y amarras', 'Ferretería La Serena', 'boleta', 46_200, '3.4'],
  ['Flete de materiales menores', 'Fletes Coquimbo', 'factura', 85_000, 'GG'],
  ['Combustible camioneta de obra', 'Copec Ruta 5', 'boleta', 62_000, 'GG'],
  ['Copias de planos', 'Centro de Copiado Elqui', 'boleta', 18_900, 'GG'],
  ['Insumos de aseo de instalación de faena', 'Supermercado Unimarc', 'boleta', 27_300, 'GG'],
  ['Reparación de vibrador de inmersión', 'Servitec Herramientas', 'factura', 95_000, '3.2'],
  ['Candados y cadenas para bodega', 'Ferretería La Serena', 'boleta', 31_800, 'GG'],
]

/**
 * Caja chica de la demo: una por obra en ejecución con rendiciones cada tres semanas repuestas por Finanzas
 * (una colación sin documento rechazada), una rendición recién presentada y otra en preparación. La de
 * la obra terminada quedó cerrada con devolución del saldo.
 */
function cajaChicaDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'cajasChicas' | 'rendiciones'> {
  const H = hoyDia
  const cajas: CajaChica[] = []
  const rendiciones: Rendicion[] = []
  for (const obra of d.obras) {
    const fondo = obra.id === 'obra_aromos' ? 1_500_000 : 800_000
    const id = `cc_${obra.id}`
    const terminada = obra.estado !== 'en_ejecucion'
    const fin = terminada ? Math.min(H - 20, obra.fechaInicio + obra.plazoDias) : H
    cajas.push({ id, obraId: obra.id, responsable: obra.jefeTerreno, fondo, abierta: obra.fechaInicio, ...(terminada ? { cerrada: { fecha: fin, devolucion: Math.round(fondo * 0.18) } } : {}) })
    const partida = (cod: string) => (cod === 'GG' ? 'GG' : d.partidas.find((p) => p.id === `${obra.id}_p${cod}`)?.id ?? 'GG')
    let n = 0
    for (let ini = obra.fechaInicio; ini + 21 <= fin; ini += 21) {
      n++
      const presentada = ini + 20
      const ultima = !terminada && presentada + 21 > H
      const items: ItemRendicion[] = GASTOS_CAJA.slice(0, 5 + (n % 3)).map(([descripcion, proveedor, comprobante, base, imp], k) => ({
        id: `it${k + 1}`, fecha: ini + 2 + k * 3, proveedor, comprobante, numero: `${(n * 131 + k * 17) % 9000 + 1000}`, descripcion,
        monto: Math.round((base * (1 + ((n + k) % 5) / 10)) / 100) * 100, imputacion: partida(imp),
      }))
      const reponer = presentada + 3 <= H - 1 && !ultima
      // En la segunda rendición (si ya se repuso), una colación sin documento que se rechazó
      if (n === 2 && reponer) items.push({ id: 'it9', fecha: ini + 15, proveedor: 'Restaurante El Faro', comprobante: 'sin_documento', descripcion: 'Colación de cuadrilla', monto: 54_000, imputacion: 'GG' })
      const revisado = (i: ItemRendicion): ItemRendicion => ({
        ...i, revision: i.comprobante === 'sin_documento'
          ? { estado: 'rechazado', fecha: presentada + 2, por: obra.administrador, motivo: 'Sin documento de respaldo' }
          : { estado: 'aprobado', fecha: presentada + 2, por: obra.administrador },
      })
      if (presentada > H - 1) {
        // Rendición en preparación (aún no se presenta)
        rendiciones.push({ id: `rd_${obra.id}_${n}`, obraId: obra.id, cajaId: id, numero: n, items: items.filter((i) => i.fecha <= H - 1), historial: [], creado: ini + 1, creadoPor: obra.jefeTerreno })
        continue
      }
      rendiciones.push({
        id: `rd_${obra.id}_${n}`, obraId: obra.id, cajaId: id, numero: n, items: reponer ? items.map(revisado) : items,
        historial: [{ fecha: presentada, estado: 'presentada', por: obra.jefeTerreno }, ...(reponer ? [{ fecha: presentada + 3, estado: 'aprobada' as const, por: USUARIO_R09 }] : [])],
        creado: ini + 1, creadoPor: obra.jefeTerreno,
      })
    }
  }
  return { cajasChicas: cajas, rendiciones }
}

/** Tareas críticas de las partidas de la demo (RULE-803). */
const CRITICAS_DEMO: [RegExp, TipoTareaCritica][] = [[/^Excavación/, 'excavacion'], [/^Hormigón estructural|^Moldaje/, 'altura'], [/^Estructura metálica/, 'izaje'], [/^Cubierta/, 'altura']]
const PREVENCIONISTA = 'Marcela Ríos'

/**
 * Seguridad de la demo: charla diaria de cada cuadrilla y ART de cada tarea crítica en todos los días
 * con RDO, inspección semanal de Prevención, observaciones preventivas cerradas en plazo e incidentes:
 * cuasi accidentes y un accidente sin tiempo perdido en el edificio (el último en investigación, con su
 * medida en curso), un cuasi accidente en la clínica y un accidente con tiempo perdido, ya cerrado, en
 * las bodegas. Hoy aún no hay charlas: el capataz la registra antes de enviar su reporte.
 */
function seguridadDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'charlasSeguridad' | 'arts' | 'inspeccionesSeguridad' | 'observacionesPreventivas' | 'incidentes' | 'medidasCorrectivas'> {
  const H = hoyDia
  for (const p of d.partidas) {
    const t = CRITICAS_DEMO.find(([re]) => re.test(p.descripcion))?.[1]
    if (t) p.tareaCritica = t
  }
  const cuadrillas = new Map(d.cuadrillas.map((c) => [c.id, c]))
  const partidas = new Map(d.partidas.map((p) => [p.id, p]))
  const out: ReturnType<typeof seguridadDemo> = { charlasSeguridad: [], arts: [], inspeccionesSeguridad: [], observacionesPreventivas: [], incidentes: [], medidasCorrectivas: [] }
  // Charla y ART de cada día con reporte
  for (const r of d.rdos) {
    if (r.fecha > H - 1 || (r.estado !== 'validado' && r.estado !== 'enviado')) continue
    const cq = cuadrillas.get(r.cuadrillaId)
    if (!cq) continue
    const k = r.fecha + cq.nombre.length
    out.charlasSeguridad.push({
      id: `ch_${r.cuadrillaId}_${r.fecha}`, obraId: r.obraId, fecha: r.fecha, cuadrillaId: r.cuadrillaId, tema: TEMAS_CHARLA[k % TEMAS_CHARLA.length],
      relator: cq.capataz, asistentes: cq.trabajadores - (k % 7 === 0 ? 1 : 0), creadoPor: cq.capataz,
    })
    const ids = new Set([...r.avances.filter((a) => a.cantidad > 0).map((a) => a.partidaId), ...r.hh.filter((h) => h.partidaId && !h.causaNoProductiva).map((h) => h.partidaId!)])
    for (const id of ids) {
      const p = partidas.get(id)
      if (!p?.tareaCritica) continue
      const base = RIESGOS_TAREA[p.tareaCritica]
      out.arts.push({
        id: `art_${r.cuadrillaId}_${id}_${r.fecha}`, obraId: r.obraId, fecha: r.fecha, cuadrillaId: r.cuadrillaId, partidaId: id, tarea: p.tareaCritica,
        descripcion: `${p.descripcion} (${TAREAS_CRITICAS[p.tareaCritica].toLowerCase()})`, riesgos: base.riesgos, medidas: base.medidas,
        firmantes: Math.max(2, r.hh.filter((h) => h.partidaId === id).reduce((s, h) => Math.max(s, h.trabajadores), 0) || cq.trabajadores), responsable: cq.capataz, creadoPor: cq.capataz,
      })
    }
  }
  const OBS: [ObservacionPreventiva['tipo'], boolean, string][] = [
    ['conducta', false, 'Trabajador sin barbiquejo en el casco en zona de izaje'],
    ['condicion', false, 'Extensión eléctrica sin protección cruzando el acceso'],
    ['conducta', true, 'Cuadrilla revisa arneses antes de subir: buena práctica'],
    ['condicion', false, 'Borde de losa sin baranda en sector norte'],
    ['condicion', false, 'Acopio de fierro obstruyendo vía de evacuación'],
    ['conducta', true, 'Señalero dirige correctamente la descarga del camión'],
  ]
  let nInc = 0
  for (const obra of d.obras) {
    const enCurso = obra.estado === 'en_ejecucion'
    const fin = enCurso ? H - 1 : Math.max(obra.fechaInicio, ...d.rdos.filter((r) => r.obraId === obra.id).map((r) => r.fecha))
    const capataz = d.cuadrillas.find((q) => q.obraId === obra.id)?.capataz ?? obra.jefeTerreno
    const cuadrilla = d.cuadrillas.find((q) => q.obraId === obra.id)?.nombre ?? 'Cuadrilla'
    // Inspección semanal de Prevención
    for (let f = obra.fechaInicio + 3, k = 0; f <= fin; f += 7, k++) {
      out.inspeccionesSeguridad.push({
        id: `is_${obra.id}_${f}`, obraId: obra.id, programada: f, inspector: PREVENCIONISTA,
        realizada: { fecha: f, cumplimiento: [0.96, 0.92, 1, 0.94, 0.9][k % 5], hallazgos: k % 3 === 1 ? 'Orden y aseo deficiente en acopios; se instruyó a la cuadrilla' : 'Sin hallazgos relevantes' },
      })
    }
    if (enCurso) out.inspeccionesSeguridad.push({ id: `is_${obra.id}_prox`, obraId: obra.id, programada: H + 1, inspector: PREVENCIONISTA })
    // Observaciones preventivas cada 4 días, las inseguras corregidas dentro del plazo
    for (let f = obra.fechaInicio + 2, k = 0; f <= fin; f += 4, k++) {
      const [tipo, segura, descripcion] = OBS[(k + obra.nombre.length) % OBS.length]
      const cierre = f + 1 + (k % 2)
      out.observacionesPreventivas.push({
        id: `op_${obra.id}_${f}`, obraId: obra.id, fecha: f, tipo, segura, descripcion, responsable: segura ? '' : obra.jefeTerreno, plazo: f + 3,
        ...(segura ? { cerrada: f } : cierre <= H - 1 ? { cerrada: cierre } : {}), creadoPor: k % 2 ? PREVENCIONISTA : obra.jefeTerreno,
      })
    }
    // Incidentes
    const inc = (fecha: Dia, tipo: Incidente['tipo'], descripcion: string, lugar: string, extra: Partial<Incidente>, pasos: [number, Incidente['historial'][number]['estado']][]): Incidente => {
      const i: Incidente = {
        id: `in_${obra.id}_${++nInc}`, obraId: obra.id, numero: 0, fecha, tipo, descripcion, lugar, empresa: d.config.empresa || 'Constructora', ...extra,
        historial: pasos.map(([dd, estado]) => ({ fecha: fecha + dd, estado, por: PREVENCIONISTA })), creado: fecha, creadoPor: capataz,
      }
      out.incidentes.push(i)
      return i
    }
    const medida = (i: Incidente, descripcion: string, plazo: Dia, cumplida?: Dia) => out.medidasCorrectivas.push({
      id: `mc_${i.id}_${out.medidasCorrectivas.length}`, obraId: obra.id, origen: { tipo: 'incidente', id: i.id }, descripcion, responsable: obra.jefeTerreno, plazo,
      ...(cumplida != null ? { cumplida: { fecha: cumplida, evidencia: 'Verificado en terreno con registro fotográfico', por: PREVENCIONISTA } } : {}), creado: i.fecha + 2, creadoPor: PREVENCIONISTA,
    })
    const propios = out.incidentes.length
    if (obra.id === 'obra_aromos') {
      for (const f of [obra.fechaInicio + 30, obra.fechaInicio + 65])
        if (f <= H - 10) inc(f, 'cuasi', 'Caída de herramienta desde andamio sin rodapié, sin personas en la zona', 'Frente de obra gruesa', { potencial: 'bajo' }, [[1, 'clasificado'], [1, 'cerrado']])
      const stp = inc(H - 20, 'sin_tiempo_perdido', 'Corte superficial en la mano al manipular panel de moldaje', 'Losa piso 3', { afectado: NOMBRES_DEMO[3], diasPerdidos: 0, causas: 'Guantes de cabritilla en mal estado' }, [[1, 'clasificado'], [2, 'en_investigacion'], [4, 'medidas_en_curso'], [8, 'cerrado']])
      medida(stp, 'Reponer guantes anticorte a la cuadrilla de moldajes', H - 14, H - 15)
      const cuasi = inc(H - 2, 'cuasi', 'Paño de moldaje se desprendió del gancho de la grúa durante el izaje', 'Grúa torre, sector norte', { potencial: 'alto', causas: 'Estrobo con desgaste no detectado en la revisión' }, [[0, 'clasificado'], [1, 'en_investigacion'], [1, 'medidas_en_curso']])
      medida(cuasi, 'Reemplazar estrobos y registrar revisión diaria de elementos de izaje', H + 5)
    } else if (obra.id === 'obra_clinica') {
      if (H - 9 > obra.fechaInicio) inc(H - 9, 'cuasi', 'Plancha de cielo cae desde el andamio móvil, sin personas debajo', 'Pasillo de pabellones', { potencial: 'bajo' }, [[1, 'clasificado'], [1, 'cerrado']])
    } else {
      const f = obra.fechaInicio + 40
      const ctp = inc(f, 'con_tiempo_perdido', 'Esguince de tobillo al bajar del andamio sin usar la escala', 'Montaje de estructura', {
        afectado: NOMBRES_DEMO[7], empresa: cuadrilla, diasPerdidos: 5, causas: 'Acceso al andamio sin escala fija', protocolo: { diat: f + 1 },
      }, [[0, 'clasificado'], [1, 'en_investigacion'], [3, 'medidas_en_curso'], [15, 'cerrado']])
      medida(ctp, 'Instalar escalas fijas en todos los andamios y charla de acceso seguro', f + 7, f + 6)
    }
    out.incidentes.slice(propios).sort((a, b) => a.fecha - b.fecha).forEach((i, k) => { i.numero = k + 1 })
  }
  return out
}

/** Protocolos de la demo según la partida: checklist, frecuencia (días) y la observación típica de un rechazo. */
const PROTOCOLOS_DEMO: {
  re: RegExp; nombre: string; tipo: ProtocoloCalidad['tipo']; obligatorio: boolean; ito: boolean; cada: number; checklist: string[]
  obs: string; causa: string; accion: string; materiales: number
}[] = [
  {
    re: /^Hormigón|^Radier/, nombre: 'Liberación antes de hormigonar', tipo: 'liberacion', obligatorio: true, ito: true, cada: 10,
    checklist: ['Enfierradura según plano, traslapos y recubrimientos', 'Moldaje aplomado, estanco y con desmoldante', 'Pasadas e insertos de instalaciones', 'Ejes y niveles verificados'],
    obs: 'Recubrimiento insuficiente en vigas del eje B: faltan separadores', causa: 'Separadores no instalados antes del cierre del moldaje', accion: 'Instalar separadores de 2,5 cm y reinspeccionar antes del vaciado', materiales: 85_000,
  },
  {
    re: /Excavación|Relleno/, nombre: 'Control de sello y compactación', tipo: 'control', obligatorio: true, ito: true, cada: 14,
    checklist: ['Sello o capa a cota de proyecto', 'Densidad ≥ 95 % del Proctor modificado (laboratorio)', 'Sin agua ni material suelto'],
    obs: 'Densidad de 92 % en la capa 3, bajo el mínimo', causa: 'Capa de 30 cm, sobre el espesor especificado', accion: 'Escarificar y recompactar en capas de 20 cm con nuevo ensayo', materiales: 160_000,
  },
  {
    re: /^Estructura metálica/, nombre: 'Control de montaje y soldaduras', tipo: 'control', obligatorio: true, ito: true, cada: 14,
    checklist: ['Aplome y alineación de columnas', 'Pernos de anclaje con torque especificado', 'Soldaduras sin poros (inspección visual)', 'Pintura anticorrosiva en uniones'],
    obs: 'Soldadura con poros en la unión de la cercha 4', causa: 'Electrodos húmedos', accion: 'Esmerilar y resoldar la unión con electrodos secos', materiales: 120_000,
  },
  {
    re: /Albañilería|Tabiquería/, nombre: 'Control de plomo, nivel y fijaciones', tipo: 'control', obligatorio: false, ito: false, cada: 10,
    checklist: ['Plomo y nivel dentro de ±3 mm/m', 'Trabas y fijaciones según detalle', 'Juntas uniformes y llenas'],
    obs: 'Paño fuera de plomo (6 mm/m) en el eje 3', causa: 'Escantillón mal aplomado al inicio del paño', accion: 'Demoler y rehacer el paño con escantillón verificado', materiales: 140_000,
  },
  {
    re: /Estucos|Cerámicos|Pavimento|Cielos|Pintura|Cubierta/, nombre: 'Control de terminaciones', tipo: 'control', obligatorio: false, ito: false, cada: 14,
    checklist: ['Planeidad con regla de 2 m (≤ 3 mm)', 'Sin fisuras, sopladuras ni manchas', 'Encuentros y remates según detalle'],
    obs: 'Fisuras y sopladuras en el paño norte', causa: 'Curado insuficiente por viento', accion: 'Picar las zonas afectadas, reparar y curar 3 días', materiales: 60_000,
  },
  {
    re: /^Instalaciones|^Climatización/, nombre: 'Prueba de instalaciones', tipo: 'control', obligatorio: true, ito: true, cada: 21,
    checklist: ['Prueba de presión o aislación aprobada', 'Trazado según plano vigente', 'Certificado del instalador'],
    obs: 'Pérdida de presión en el ramal del baño 2', causa: 'Unión mal soldada', accion: 'Rehacer la unión y repetir la prueba por 24 h', materiales: 45_000,
  },
]

/**
 * Calidad de la demo: protocolos por partida según su avance (los de liberación antes de cada vaciado),
 * aprobados y visados por el ITO; uno de cada doce se rechaza, abre una NCR que se corrige con HH de
 * retrabajo (separadas de las HH del RDO, sin cambiar el total) y se aprueba en la reinspección.
 * Hoy: en el edificio, una liberación por aprobar y un protocolo rechazado en corrección; en la clínica,
 * una NCR abierta por una inspección. Inspecciones semanales realizadas.
 */
function calidadDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'protocolosCalidad' | 'inspeccionesCalidad' | 'noConformidades'> {
  const H = hoyDia
  const protocolos: ProtocoloCalidad[] = []
  const ncrs: NoConformidad[] = []
  const inspecciones: InspeccionCalidad[] = []
  const cuadrillas = new Map(d.cuadrillas.map((c) => [c.id, c]))
  for (const obra of d.obras) {
    const propios: ProtocoloCalidad[] = []
    const propiasNcr: NoConformidad[] = []
    const ito = `ITO ${obra.mandante.replace(/ S\.A\.$/, '')}`
    const acts = programaDe(d, obra.id, 'actualizado')?.actividades ?? []
    const dias = new Map<string, { fecha: Dia; cuadrillaId: string }[]>()
    let ultimoRDO = obra.fechaInicio
    for (const r of d.rdos) {
      if (r.obraId !== obra.id || r.estado !== 'validado' || r.fecha > H - 1) continue
      ultimoRDO = Math.max(ultimoRDO, r.fecha)
      for (const a of r.avances) if (a.cantidad > 0) dias.set(a.partidaId, [...(dias.get(a.partidaId) ?? []), { fecha: r.fecha, cuadrillaId: r.cuadrillaId }])
    }
    const responsableDe = (partidaId: string, cuadrillaId: string) => {
      const sub = d.subcontratos.find((s) => s.obraId === obra.id && s.compromisos?.[partidaId])
      return d.proveedores.find((p) => p.id === sub?.subcontratistaId)?.nombre ?? cuadrillas.get(cuadrillaId)?.nombre ?? 'Cuadrilla'
    }
    const ubicacion = (partidaId: string, f: Dia, n: number) =>
      acts.find((a) => a.partidas.some((x) => x.partidaId === partidaId) && (a.inicioReal ?? a.inicio) <= f && f <= (a.finReal ?? a.fin))?.nombre ?? `Frente ${n}`
    // Retrabajo: 2 trabajadores de la cuadrilla pasan a corregir la NCR (mismas HH totales del RDO)
    const retrabajo = (partidaId: string, cuadrillaId: string, desde: Dia, hasta: Dia, ncrId: string, horas: number) => {
      for (const r of d.rdos) {
        if (r.obraId !== obra.id || r.cuadrillaId !== cuadrillaId || r.estado !== 'validado' || r.fecha < desde || r.fecha > hasta) continue
        const h = r.hh.find((x) => x.partidaId === partidaId && !x.causaNoProductiva && !x.ncrId && x.trabajadores >= 3 && x.horasNormales > horas)
        if (!h) continue
        h.horasNormales = Math.round(((h.trabajadores * h.horasNormales - 2 * horas) / h.trabajadores) * 1000) / 1000
        r.hh.push({ partidaId, trabajadores: 2, horasNormales: horas, horasExtra: 0, ncrId })
      }
    }
    const aprobado = (f: Dia, por: string, def: (typeof PROTOCOLOS_DEMO)[number]): PasoDoc<EstadoProtocolo>[] => [
      { fecha: f, estado: 'en_inspeccion', por }, { fecha: f, estado: 'aprobado', por: obra.jefeTerreno },
      ...(def.ito && f + 1 <= H - 1 ? [{ fecha: f + 1, estado: 'aprobado_ito' as const, por: ito }] : []),
    ]
    const rechazar = (base: Omit<ProtocoloCalidad, 'id' | 'numero' | 'checklist' | 'programado' | 'historial' | 'creado'>, def: (typeof PROTOCOLOS_DEMO)[number], f: Dia, cuadrillaId: string, enCurso: boolean) => {
      const id = `pq_${obra.id}_${propios.length + 1}`
      const por = cuadrillas.get(cuadrillaId)?.capataz ?? obra.jefeTerreno
      propios.push({
        ...base, id, numero: 0, checklist: def.checklist.map((texto, i) => ({ texto, ok: i !== 0 })), programado: f, creado: f - 2, observaciones: def.obs,
        historial: [{ fecha: f, estado: 'en_inspeccion', por }, { fecha: f, estado: 'rechazado', por: obra.jefeTerreno, texto: def.obs }],
      })
      const ncrId = `nc_${obra.id}_${propiasNcr.length + 1}`
      propiasNcr.push({
        id: ncrId, obraId: obra.id, partidaId: base.partidaId, numero: 0, origen: 'protocolo', protocoloId: id, descripcion: `${def.nombre} (${base.ubicacion}): ${def.obs}`,
        causa: def.causa, responsable: base.responsable, accionCorrectiva: def.accion, plazo: f + PLAZO_NCR,
        ...(enCurso ? {} : { costoMateriales: def.materiales }),
        historial: [{ fecha: f, estado: 'en_correccion', por: base.responsable }, ...(enCurso ? [] : [{ fecha: f + 1, estado: 'verificada' as const, por: obra.jefeTerreno }, { fecha: f + 2, estado: 'cerrada' as const, por: obra.jefeTerreno }])],
        creado: f, creadoPor: obra.jefeTerreno,
      })
      retrabajo(base.partidaId, cuadrillaId, f, enCurso ? H - 1 : f + 1, ncrId, 4)
      propios.push({
        ...base, id: `pq_${obra.id}_${propios.length + 1}`, numero: 0, checklist: def.checklist.map((texto) => enCurso ? { texto } : { texto, ok: true }), programado: enCurso ? H + 1 : f + 1, reinspeccionDe: id, creado: f,
        historial: enCurso ? [] : aprobado(f + 1, por, def),
      })
    }
    let k = 0
    let liberacionHoy = false
    let rechazoHoy = false
    for (const p of d.partidas.filter((x) => x.obraId === obra.id && !x.ordenCambioId)) {
      const def = PROTOCOLOS_DEMO.find((x) => x.re.test(p.descripcion))
      if (!def) continue
      const lista = (dias.get(p.id) ?? []).sort((a, b) => a.fecha - b.fecha)
      let prox = -Infinity
      for (const x of lista) {
        if (x.fecha < prox) continue
        prox = x.fecha + def.cada
        k++
        const base = {
          obraId: obra.id, partidaId: p.id, nombre: def.nombre, tipo: def.tipo, obligatorio: def.obligatorio, requiereITO: def.ito,
          responsable: responsableDe(p.id, x.cuadrillaId), ubicacion: ubicacion(p.id, x.fecha, k), creadoPor: obra.jefeTerreno,
        }
        if (k % 12 === 11 && x.fecha + 2 <= H - 1) { rechazar(base, def, x.fecha, x.cuadrillaId, false); continue }
        propios.push({
          ...base, id: `pq_${obra.id}_${propios.length + 1}`, numero: 0, checklist: def.checklist.map((texto) => ({ texto, ok: true })), programado: x.fecha, creado: x.fecha - 2,
          historial: aprobado(x.fecha, cuadrillas.get(x.cuadrillaId)?.capataz ?? obra.jefeTerreno, def),
        })
      }
      const ult = lista.at(-1)
      // (los RDO de los últimos días pueden estar aún por validar)
      if (obra.estado !== 'en_ejecucion' || obra.id !== 'obra_aromos' || !ult || ult.fecha < H - 6) continue
      const base = {
        obraId: obra.id, partidaId: p.id, nombre: def.nombre, tipo: def.tipo, obligatorio: def.obligatorio, requiereITO: def.ito,
        responsable: responsableDe(p.id, ult.cuadrillaId), ubicacion: ubicacion(p.id, H, k + 1), creadoPor: obra.jefeTerreno,
      }
      // Liberación del próximo vaciado: programada hoy, aún sin inspeccionar (bloquea el avance hasta aprobarse)
      if (def.tipo === 'liberacion' && !liberacionHoy) {
        liberacionHoy = true
        propios.push({ ...base, id: `pq_${obra.id}_${propios.length + 1}`, numero: 0, checklist: def.checklist.map((texto) => ({ texto })), programado: H, creado: H - 1, historial: [] })
      } else if (def.tipo === 'control' && !def.obligatorio && !rechazoHoy) {
        // Protocolo rechazado en el último día validado: NCR en corrección y reinspección mañana (RULE-104)
        rechazoHoy = true
        rechazar(base, def, ult.fecha, ult.cuadrillaId, true)
      }
    }
    // Inspecciones semanales de Oficina Técnica (realizadas) y la próxima programada
    const fin = obra.estado === 'en_ejecucion' ? H - 1 : ultimoRDO
    for (let f = obra.fechaInicio + 7; f <= fin; f += 7)
      inspecciones.push({ id: `iq_${obra.id}_${f}`, obraId: obra.id, partidaId: null, tipo: 'programada', programada: f, inspector: obra.oficinaTecnica, realizada: { fecha: f, conforme: true, hallazgos: 'Sin observaciones' } })
    if (obra.estado === 'en_ejecucion') inspecciones.push({ id: `iq_${obra.id}_prox`, obraId: obra.id, partidaId: null, tipo: 'programada', programada: H + 2, inspector: obra.oficinaTecnica })
    // Clínica: inspección no programada con hallazgo que abre una NCR
    if (obra.id === 'obra_clinica') {
      const p = d.partidas.find((x) => x.obraId === obra.id && /Tabiquería|Cielos/.test(x.descripcion) && (dias.get(x.id)?.at(-1)?.fecha ?? -Infinity) >= H - 10)
      if (p) {
        const cq = dias.get(p.id)!.at(-1)!.cuadrillaId
        const hallazgos = 'Tabique del pasillo de pabellón con placas sin junta invertida y tornillos a más de 30 cm'
        inspecciones.push({ id: `iq_${obra.id}_np`, obraId: obra.id, partidaId: p.id, tipo: 'no_programada', programada: H - 2, inspector: obra.jefeTerreno, realizada: { fecha: H - 2, conforme: false, hallazgos } })
        propiasNcr.push({
          id: `nc_${obra.id}_${propiasNcr.length + 1}`, obraId: obra.id, partidaId: p.id, numero: 0, origen: 'inspeccion', inspeccionId: `iq_${obra.id}_np`,
          descripcion: hallazgos, responsable: cuadrillas.get(cq)?.nombre ?? 'Cuadrilla', plazo: H + 5, historial: [], creado: H - 2, creadoPor: obra.jefeTerreno,
        })
      }
    }
    // Numeración correlativa por obra en orden de creación
    propios.sort((a, b) => a.creado - b.creado || a.programado - b.programado).forEach((p, i) => { p.numero = i + 1 })
    propiasNcr.sort((a, b) => a.creado - b.creado).forEach((n, i) => { n.numero = i + 1 })
    protocolos.push(...propios)
    ncrs.push(...propiasNcr)
  }
  return { protocolosCalidad: protocolos, inspeccionesCalidad: inspecciones, noConformidades: ncrs }
}

/**
 * Bodega de la demo: entradas por cada recepción de OC y salidas diarias a partida según el avance de los
 * RDO. Si un día no alcanza el stock, el consumo se registra cuando llega el material (nunca queda negativo).
 */
function bodegaDemo(d: Datos, hoyDia: Dia): MovimientoStock[] {
  const out: MovimientoStock[] = []
  let n = 0
  const id = () => `mv_${++n}`
  for (const obra of d.obras) {
    const ocs = d.ordenesCompra.filter((o) => o.obraId === obra.id)
    const materialDe = new Map<string, string>()
    for (const oc of ocs) for (const l of oc.lineas) materialDe.set(l.partidaId, l.materialId)
    const materiales = [...new Set(materialDe.values())]
    for (const matId of materiales) {
      const partidas = [...materialDe].filter(([, m]) => m === matId).map(([pid]) => d.partidas.find((p) => p.id === pid)!).filter((p) => p.recursos.some((r) => r.tipo === 'MAT'))
      const entradas = ocs.flatMap((oc) => oc.recepciones.filter((r) => r.fecha <= hoyDia - 1).flatMap((r) => oc.lineas.filter((l) => l.materialId === matId && r.cantidades[l.id]).map((l) => ({ oc, r, l, q: r.cantidades[l.id] }))))
      const consumos = new Map<string, number>()
      // Solo RDO validados: es lo que cuenta como avance de la partida
      for (const r of d.rdos.filter((x) => x.obraId === obra.id && x.estado === 'validado')) {
        for (const a of r.avances) {
          const p = partidas.find((x) => x.id === a.partidaId)
          if (p) consumos.set(`${r.fecha}|${p.id}`, (consumos.get(`${r.fecha}|${p.id}`) ?? 0) + a.cantidad * p.recursos.find((x) => x.tipo === 'MAT')!.cantPorUnidad)
        }
      }
      const dias = [...new Set([...entradas.map((e) => e.r.fecha), ...[...consumos.keys()].map((k) => Number(k.split('|')[0]))])].sort((a, b) => a - b)
      let stock = 0
      const pendiente = new Map<string, number>()
      for (const dia of dias) {
        for (const e of entradas.filter((x) => x.r.fecha === dia)) {
          out.push({ id: id(), obraId: obra.id, materialId: matId, fecha: dia, tipo: 'entrada', cantidad: e.q, costoUnitario: e.l.precio, ordenCompraId: e.oc.id, recepcionId: e.r.id, motivo: `OC-${String(e.oc.numero).padStart(4, '0')} · guía ${e.r.guia}`, autor: USUARIO_R07 })
          stock += e.q
        }
        for (const p of partidas) {
          const quiere = (pendiente.get(p.id) ?? 0) + (consumos.get(`${dia}|${p.id}`) ?? 0)
          const sale = Math.floor(Math.min(quiere, stock) * 100) / 100
          if (sale >= 0.01) {
            out.push({ id: id(), obraId: obra.id, materialId: matId, fecha: dia, tipo: 'salida', cantidad: sale, partidaId: p.id, autor: USUARIO_R07 })
            stock = Math.round((stock - sale) * 100) / 100
          }
          pendiente.set(p.id, quiere - sale)
        }
      }
    }
  }
  // Una merma registrada: cerámicos quebrados en la descarga
  const ceramico = 'mat_ceramico'
  const disponible = out.filter((m) => m.obraId === 'obra_aromos' && m.materialId === ceramico && m.fecha <= hoyDia - 2).reduce((s, m) => s + (m.tipo === 'entrada' ? m.cantidad : -m.cantidad), 0)
  if (disponible >= 4) out.push({ id: id(), obraId: 'obra_aromos', materialId: ceramico, fecha: hoyDia - 2, tipo: 'merma', cantidad: 4, motivo: 'Cajas de cerámico quebradas en la descarga', autor: USUARIO_R07 })
  return out
}

/**
 * Plan semanal de la demo, armado con los RDO reales: en cada semana cerrada cada cuadrilla tuvo una tarea
 * por partida trabajada, con meta bajo lo logrado (cumplida) o sobre lo logrado (no cumplida, con causa).
 * La semana en curso queda comprometida y la próxima propuesta; las restricciones abiertas (RFI y
 * submittal) quedan en la semana subsiguiente, lejos del aviso de 48 h.
 */
function lastPlannerDemo(d: Datos, hoyDia: Dia): TareaSemanal[] {
  const out: TareaSemanal[] = []
  const lunesHoy = hoyDia - ((diaSemana(hoyDia) + 6) % 7)
  const CAUSAS: CausaNoCumplimiento[] = ['material', 'clima', 'tarea_previa', 'mano_obra', 'equipo', 'diseno']
  for (const obra of d.obras.filter((o) => o.estado === 'en_ejecucion')) {
    const partida = (id: string) => d.partidas.find((p) => p.id === id)
    const cuadrilla = (id: string) => d.cuadrillas.find((c) => c.id === id)
    const paso = (fecha: Dia, estado: TareaSemanal['historial'][number]['estado'], por: string) => ({ fecha, estado, por })
    const paso1 = (unidad: string) => (unidad === 'kg' ? 100 : 1)
    /** Cantidad por cuadrilla, partida y tramo (lun–mié, jue–vie) en los RDO de la semana (sin partidas globales). */
    const TRAMOS: [number, number][] = [[0, 2], [3, 4]]
    const pares = (lunes: Dia) => {
      const m = new Map<string, { cid: string; pid: string; cant: number; desde: number; hasta: number }>()
      for (const r of d.rdos) {
        if (r.obraId !== obra.id || r.fecha < lunes || r.fecha > lunes + 4 || r.estado === 'rechazado') continue
        const [desde, hasta] = TRAMOS.find(([a, b]) => r.fecha - lunes >= a && r.fecha - lunes <= b)!
        for (const a of r.avances) {
          const p = partida(a.partidaId)
          if (!p || p.unidad === 'gl' || a.cantidad <= 0) continue
          const k = `${r.cuadrillaId}|${a.partidaId}|${desde}`
          m.set(k, { cid: r.cuadrillaId, pid: a.partidaId, desde, hasta, cant: (m.get(k)?.cant ?? 0) + a.cantidad })
        }
      }
      return [...m.values()].sort((a, b) => a.cid.localeCompare(b.cid) || a.pid.localeCompare(b.pid) || a.desde - b.desde).slice(0, 9)
    }
    const DIAS_TRAMO = ['lun–mié', 'jue–vie']
    const tarea = (lunes: Dia, n: number, cid: string, pid: string, meta: number, extra: Partial<TareaSemanal> = {}, tramo: [number, number] = [0, 4]): TareaSemanal => {
      const p = partida(pid)!
      const c = cuadrilla(cid)!
      const sufijo = tramo[1] - tramo[0] < 4 ? ` (${DIAS_TRAMO[tramo[0] === 0 ? 0 : 1]})` : ''
      return {
        id: `ts_${obra.id}_${lunes}_${n}`, obraId: obra.id, semana: lunes, descripcion: `${p.descripcion} · ${c.nombre}${sufijo}`, partidaId: pid, cuadrillaId: cid,
        responsable: c.capataz, meta, inicio: lunes + tramo[0], fin: lunes + tramo[1], restricciones: [], historial: [], creado: lunes - 4, creadoPor: obra.jefeTerreno, ...extra,
      }
    }
    // Semanas cerradas (hasta 6), con el cierre del viernes
    let ultimas: ReturnType<typeof pares> = []
    for (let k = 6; k >= 1; k--) {
      const lunes = lunesHoy - 7 * k + (hoyDia >= lunesHoy + 5 ? 7 : 0)
      if (lunes < obra.fechaInicio) continue
      const ps = pares(lunes)
      if (!ps.length) continue
      ultimas = ps
      const falla = ps.length >= (k === 1 ? 6 : 4) && (k + obra.id.length) % 2 === 0 ? ps.length - 1 : -1
      ps.forEach((x, n) => {
        const st = paso1(partida(x.pid)!.unidad)
        const real = Math.round(x.cant * 100) / 100
        const meta = n === falla ? Math.ceil((real * 1.25) / st) * st : Math.floor((real * 0.95) / st) * st
        if (!(meta > 0)) return
        const c = cuadrilla(x.cid)!
        out.push(tarea(lunes, n, x.cid, x.pid, meta, {
          logrado: real, causa: n === falla ? CAUSAS[k % CAUSAS.length] : undefined,
          historial: [paso(lunes - 3, 'comprometida', obra.jefeTerreno), paso(lunes + x.desde, 'en_ejecucion', c.capataz), paso(lunes + x.hasta, n === falla ? 'no_cumplida' : 'cumplida', obra.jefeTerreno)],
        }, [x.desde, x.hasta]))
      })
    }
    // Semana en curso (si no terminó) y la siguiente, con las mismas cuadrillas y partidas
    const actual = hoyDia >= lunesHoy + 5 ? lunesHoy + 7 : lunesHoy
    // Saldo por ejecutar de cada partida (avance validado), para no planificar más de lo que queda
    const saldo = new Map<string, number>()
    for (const x of ultimas) {
      if (saldo.has(x.pid)) continue
      const hecho = d.rdos.filter((r) => r.obraId === obra.id && r.estado === 'validado').reduce((s, r) => s + r.avances.filter((a) => a.partidaId === x.pid).reduce((q, a) => q + a.cantidad, 0), 0)
      saldo.set(x.pid, Math.max(0, partida(x.pid)!.cantidad - hecho))
    }
    const porPartida = (pid: string) => ultimas.filter((y) => y.pid === pid).reduce((s, y) => s + y.cant, 0)
    ultimas.forEach((x, n) => {
      const st = paso1(partida(x.pid)!.unidad)
      // Dos semanas por delante (en curso y próxima) no pueden pasar el saldo de la partida
      const tope = (saldo.get(x.pid)! / 2) * (x.cant / Math.max(1e-9, porPartida(x.pid)))
      const meta = Math.max(st, Math.round(Math.min(x.cant, tope) / st) * st)
      const c = cuadrilla(x.cid)!
      const enCurso = actual + x.desde <= hoyDia - 1
      out.push(tarea(actual, n, x.cid, x.pid, meta, {
        historial: [paso(actual - 3, 'comprometida', obra.jefeTerreno), ...(enCurso ? [paso(actual + x.desde, 'en_ejecucion', c.capataz)] : [])],
      }, [x.desde, x.hasta]))
      // Próxima semana: comprometida si ya pasó la reunión del viernes; restricciones ya liberadas
      const prox = actual + 7
      const reunion = actual + 4 <= hoyDia - 1
      out.push(tarea(prox, n, x.cid, x.pid, meta, {
        creado: Math.min(actual, hoyDia - 1),
        historial: reunion ? [paso(actual + 4, 'comprometida', obra.jefeTerreno)] : [],
        restricciones: n === 0 ? [{
          id: 'rx1', tipo: 'material', descripcion: `Material disponible en bodega para ${partida(x.pid)!.descripcion.toLowerCase()}`, responsable: obra.administrador,
          fechaCompromiso: Math.min(actual + 2, hoyDia - 1), liberada: Math.min(actual + 1, hoyDia - 1),
        }] : [],
      }, [x.desde, x.hasta]))
    })
    // Semana subsiguiente: tareas con restricciones abiertas de RFI y submittal (lookahead)
    const lookahead = actual + 14
    const rx = (id: string, tipo: Restriccion['tipo'], descripcion: string, responsable: string, extra: Partial<Restriccion>): Restriccion =>
      ({ id, tipo, descripcion, responsable, fechaCompromiso: lookahead - 3, ...extra })
    if (obra.id === 'obra_aromos' && ultimas.length) {
      const cid = ultimas.find((x) => x.pid.endsWith('p3.2'))?.cid ?? ultimas[0].cid
      out.push(tarea(lookahead, 0, cid, `${obra.id}_p3.2`, 60, {
        descripcion: 'Hormigonado de vigas del piso 5', creado: hoyDia - 1,
        restricciones: [
          rx('rx1', 'rfi', 'Respuesta del RFI N° 5 (anclajes de vigas)', obra.oficinaTecnica, { rfiId: `rfi_${obra.id}_5` }),
          rx('rx2', 'equipo', 'Bomba de hormigón reservada', obra.administrador, { liberada: hoyDia - 1 }),
        ],
      }))
      out.push(tarea(lookahead, 1, 'cq_soto', `${obra.id}_p4.1`, 120, {
        descripcion: 'Antepechos de balcones con anclajes de barandas', creado: hoyDia - 1,
        restricciones: [rx('rx1', 'submittal', 'Aprobación del plano de taller de barandas (submittal N° 3)', obra.oficinaTecnica, { submittalId: `sub_${obra.id}_3_0` })],
      }))
    }
    if (obra.id === 'obra_clinica' && ultimas.length) {
      out.push(tarea(lookahead, 0, ultimas[0].cid, `${obra.id}_p3.1`, 150, {
        descripcion: 'Pavimento vinílico en pabellones', creado: hoyDia - 1,
        restricciones: [rx('rx1', 'submittal', 'Aprobación de la muestra de pavimento vinílico (submittal N° 2)', obra.oficinaTecnica, { submittalId: `sub_${obra.id}_2_0` })],
      }))
    }
  }
  return out
}

/** Gestión documental de la demo: planos con revisiones al día en terreno, RFI, submittals y Libro de Obra, sin vencidos. */
function documentalDemo(d: Datos, hoyDia: Dia): Pick<Datos, 'documentos' | 'rfis' | 'submittals' | 'folios'> {
  const obra = (id: string) => d.obras.find((o) => o.id === id)!
  const H = hoyDia
  const ito = (o: Obra) => `ITO ${o.mandante}`
  const documentos: Documento[] = []
  const rfis: RFI[] = []
  const submittals: Submittal[] = []
  const folios: Folio[] = []

  const doc = (obraId: string, codigo: string, titulo: string, tipo: Documento['tipo'], especialidad: Documento['especialidad'], revs: [string, Dia, string?][], partidas: string[] = []) => {
    const o = obra(obraId)
    const revisiones = revs.map(([revision, fecha, motivo], k) => ({ id: `rev${k + 1}`, revision, fecha, motivo, publicadaPor: o.oficinaTecnica }))
    const vig = revisiones.at(-1)!
    documentos.push({
      id: `doc_${obraId}_${codigo}`, obraId, codigo, titulo, tipo, especialidad, revisiones, partidaIds: partidas.map((p) => `${obraId}_p${p}`),
      enTerreno: { revisionId: vig.id, fecha: Math.min(vig.fecha + 1, H - 1), por: o.jefeTerreno }, creado: revisiones[0].fecha,
    })
  }
  const rfi = (obraId: string, numero: number, x: Pick<RFI, 'asunto' | 'pregunta' | 'disciplina' | 'destinatario'> & {
    creado: Dia; limite?: Dia; pasos?: [RFI['historial'][number]['estado'], Dia, string?][]; partidas?: string[]; impacto?: RFI['impacto']; ordenCambioId?: string; riesgoId?: string; documento?: string
  }) => {
    const o = obra(obraId)
    rfis.push({
      id: `rfi_${obraId}_${numero}`, obraId, numero, asunto: x.asunto, pregunta: x.pregunta, disciplina: x.disciplina, destinatario: x.destinatario, fechaLimite: x.limite,
      impacto: x.impacto, partidaIds: (x.partidas ?? []).map((p) => `${obraId}_p${p}`), documentoId: x.documento ? `doc_${obraId}_${x.documento}` : undefined,
      historial: (x.pasos ?? []).map(([estado, fecha, texto]) => ({ fecha, estado, por: estado === 'respondido' ? (x.destinatario === 'proyectista' ? 'Oficina de cálculo' : ito(o)) : o.oficinaTecnica, ...(texto ? { texto } : {}) })),
      ordenCambioId: x.ordenCambioId, riesgoId: x.riesgoId, creado: x.creado, creadoPor: o.oficinaTecnica,
    })
  }
  const sub = (obraId: string, numero: number, revision: number, x: Pick<Submittal, 'titulo' | 'tipo' | 'descripcion'> & {
    proveedor?: string; partidas?: string[]; requerida?: Dia; creado: Dia; pasos?: [Submittal['historial'][number]['estado'], Dia, string?][]
  }) => {
    const o = obra(obraId)
    const id = `sub_${obraId}_${numero}_${revision}`
    submittals.push({
      id, obraId, numero, revision, titulo: x.titulo, tipo: x.tipo, descripcion: x.descripcion, proveedor: x.proveedor, partidaIds: (x.partidas ?? []).map((p) => `${obraId}_p${p}`),
      fechaRequerida: x.requerida, reemplazaA: revision > 0 ? `sub_${obraId}_${numero}_${revision - 1}` : undefined,
      historial: (x.pasos ?? []).map(([estado, fecha, texto]) => ({ fecha, estado, por: estado === 'enviado' ? o.oficinaTecnica : ito(o), ...(texto ? { texto } : {}) })),
      creado: x.creado, creadoPor: o.oficinaTecnica,
    })
  }
  const folio = (obraId: string, fecha: Dia, emisor: Folio['emisor'], tipo: Folio['tipo'], texto: string, extra: Partial<Pick<Folio, 'plazoRespuesta' | 'respondeA'>> = {}) => {
    const o = obra(obraId)
    const numero = folios.filter((f) => f.obraId === obraId).length + 1
    const f: Folio = { id: `fol_${obraId}_${numero}`, obraId, numero, fecha, autor: emisor === 'mandante' ? ito(o) : o.administrador, emisor, tipo, texto, ...extra }
    folios.push(f)
    return f.id
  }

  // Edificio Los Aromos
  const a = obra('obra_aromos'), A = a.fechaInicio
  doc('obra_aromos', 'A-101', 'Planta de arquitectura pisos tipo', 'plano', 'arquitectura', [['A', A - 20], ['0', A + 5, 'Emitido para construcción'], ['1', H - 30, 'Albañilería en shafts en vez de tabiquería (OC N° 2)']], ['4.1'])
  doc('obra_aromos', 'E-201', 'Planta de losas y vigas', 'plano', 'estructura', [['A', A - 20], ['0', A + 3, 'Emitido para construcción'], ['1', A + 60, 'Refuerzo de vigas del eje 4']], ['3.2', '3.3'])
  doc('obra_aromos', 'E-301', 'Muro de contención deslinde poniente', 'plano', 'estructura', [['0', A + 44, 'Obra extraordinaria OC N° 1']])
  doc('obra_aromos', 'S-101', 'Instalaciones sanitarias, planta tipo', 'plano', 'sanitaria', [['0', A + 2, 'Emitido para construcción']], ['6.1'])
  doc('obra_aromos', 'EL-101', 'Instalaciones eléctricas, planta tipo', 'plano', 'electrica', [['0', A + 2, 'Emitido para construcción'], ['1', H - 5, 'Reubicación de tableros de piso']], ['6.2'])
  doc('obra_aromos', 'EETT-AR', 'Especificaciones técnicas de arquitectura', 'eett', 'arquitectura', [['0', A, 'Versión de licitación']], ['5.1', '5.2', '5.3'])
  rfi('obra_aromos', 1, {
    asunto: 'Nivel de sello de fundación en sector norte', pregunta: 'El estudio de suelos indica sello a −2,40 m, pero en la excavación aparece suelo competente a −2,10 m. ¿Se acepta el sello a −2,10 m?',
    disciplina: 'estructura', destinatario: 'proyectista', creado: A + 8, limite: A + 15, partidas: ['2.1', '3.1'],
    pasos: [['emitido', A + 8], ['respondido', A + 12, 'Se acepta sello a −2,10 m previa visita del mecánico de suelos.'], ['cerrado', A + 13]],
  })
  rfi('obra_aromos', 2, {
    asunto: 'Relleno no informado en deslinde poniente', pregunta: 'La excavación dejó expuesto un relleno no informado en el deslinde poniente. Se solicita definir la solución de contención.',
    disciplina: 'estructura', destinatario: 'mandante', creado: A + 38, limite: A + 45, partidas: ['2.1'], impacto: { monto: 10_830_000, dias: 5 }, documento: 'E-301', ordenCambioId: 'oc_obra_aromos_1',
    pasos: [['emitido', A + 38], ['respondido', A + 41, 'Ejecutar muro de contención H-25 según plano E-301 que emitirá la oficina de cálculo.'], ['cerrado', A + 44, 'Origina la OC N° 1.']],
  })
  rfi('obra_aromos', 3, {
    asunto: 'Formato cerámico equivalente', pregunta: 'El cerámico especificado está con quiebre de stock. ¿Se acepta un formato nacional equivalente en tono y PEI?',
    disciplina: 'arquitectura', destinatario: 'mandante', creado: A + 76, limite: A + 83, partidas: ['5.2'], riesgoId: 'rs_obra_aromos_5', documento: 'EETT-AR',
    pasos: [['emitido', A + 76], ['respondido', A + 81, 'Se acepta el formato equivalente sujeto a aprobación de muestra (submittal).'], ['cerrado', A + 82]],
  })
  rfi('obra_aromos', 4, {
    asunto: 'Altura de shafts en albañilería', pregunta: 'Con el cambio a albañilería en shafts, ¿la altura de los muros llega a losa o a cielo falso?',
    disciplina: 'arquitectura', destinatario: 'mandante', creado: H - 12, limite: H - 5, partidas: ['4.1'], documento: 'A-101',
    pasos: [['emitido', H - 12], ['respondido', H - 6, 'Los muros de shaft llegan a losa, con sello cortafuego en el encuentro.']],
  })
  rfi('obra_aromos', 5, {
    asunto: 'Armadura de vigas del piso 5', pregunta: 'El revisor independiente observó la armadura de las vigas del piso 5. Se solicita confirmar la armadura definitiva antes del hormigonado.',
    disciplina: 'estructura', destinatario: 'proyectista', creado: H - 18, limite: H + 4, partidas: ['3.2', '3.3'], impacto: { monto: 14_000_000, dias: 6 }, documento: 'E-201', riesgoId: 'rs_obra_aromos_7',
    pasos: [['emitido', H - 18], ['respondido', H - 10, 'Se mantiene la armadura; el revisor pide detalle de anclajes.'], ['emitido', H - 8, 'Falta el detalle de anclajes solicitado por el revisor.']],
  })
  rfi('obra_aromos', 6, {
    asunto: 'Ubicación de tableros eléctricos del piso 3', pregunta: 'El tablero del piso 3 queda sobre el shaft de aguas lluvias. ¿Se puede desplazar 1,2 m hacia el pasillo?',
    disciplina: 'electrica', destinatario: 'proyectista', creado: H - 1, partidas: ['6.2'], documento: 'EL-101',
  })
  sub('obra_aromos', 1, 0, {
    titulo: 'Dosificación de hormigón H-30', tipo: 'ficha_tecnica', descripcion: 'Diseño de mezcla y certificados de áridos de la planta.', proveedor: 'Hormigones del Norte', partidas: ['3.2'],
    creado: A + 4, requerida: A + 12, pasos: [['enviado', A + 5], ['aprobado', A + 9]],
  })
  sub('obra_aromos', 2, 0, {
    titulo: 'Muestra de cerámico equivalente', tipo: 'muestra', descripcion: 'Cerámico nacional 60×60 en reemplazo del importado.', proveedor: 'Cerámicas del Pacífico', partidas: ['5.2'],
    creado: A + 78, requerida: H + 20, pasos: [['enviado', A + 79], ['rechazado', A + 85, 'El tono no coincide con la muestra de referencia.']],
  })
  sub('obra_aromos', 2, 1, {
    titulo: 'Muestra de cerámico equivalente', tipo: 'muestra', descripcion: 'Cerámico nacional 60×60, tono corregido.', proveedor: 'Cerámicas del Pacífico', partidas: ['5.2'],
    creado: A + 86, requerida: H + 20, pasos: [['enviado', A + 88], ['aprobado_con_observaciones', A + 92, 'Aprobado. Comprar en un solo lote para asegurar el tono.']],
  })
  sub('obra_aromos', 3, 0, {
    titulo: 'Plano de taller de barandas metálicas', tipo: 'plano_taller', descripcion: 'Barandas de balcones y escaleras, con detalle de anclajes.', proveedor: 'Maestranza Elqui',
    creado: H - 7, requerida: H + 10, pasos: [['enviado', H - 6]],
  })
  sub('obra_aromos', 4, 0, { titulo: 'Ficha técnica de grifería', tipo: 'ficha_tecnica', descripcion: 'Grifería de baños y cocinas.', partidas: ['6.1'], creado: H - 2, requerida: H + 30 })
  folio('obra_aromos', A, 'contratista', 'comunicacion', 'Se inician las obras. Entrega de terreno conforme según acta.')
  const f1 = folio('obra_aromos', A + 20, 'mandante', 'instruccion', 'Tras las lluvias, reforzar la entibación del talud norte antes de continuar la excavación.')
  folio('obra_aromos', A + 21, 'contratista', 'respuesta', 'Se refuerza la entibación con tablestacas y se retoma la excavación con visto bueno del calculista.', { respondeA: f1 })
  const f2 = folio('obra_aromos', A + 60, 'mandante', 'observacion', 'Recubrimiento de la enfierradura de vigas del eje 4 bajo lo especificado. Corregir antes de hormigonar.')
  folio('obra_aromos', A + 61, 'contratista', 'respuesta', 'Se reponen separadores de 2,5 cm en todas las vigas del eje 4. Se solicita nueva inspección.', { respondeA: f2 })
  folio('obra_aromos', H - 12, 'contratista', 'comunicacion', 'Se emite el RFI N° 4 por la altura de los muros de shaft.')
  folio('obra_aromos', H - 2, 'mandante', 'instruccion', 'Presentar el programa de terminaciones actualizado con la OC N° 2.', { plazoRespuesta: H + 5 })

  // Remodelación clínica
  const c = obra('obra_clinica'), C = c.fechaInicio
  doc('obra_clinica', 'AR-01', 'Planta de arquitectura, sector remodelado', 'plano', 'arquitectura', [['0', C - 5, 'Emitido para construcción'], ['1', C + 20, 'Reubicación del box de procedimientos']], ['2.1', '2.2'])
  doc('obra_clinica', 'CL-01', 'Climatización, planta y esquema', 'plano', 'climatizacion', [['0', C + 2, 'Emitido para construcción']], ['4.2'])
  doc('obra_clinica', 'EL-01', 'Instalaciones eléctricas y tableros', 'plano', 'electrica', [['0', C + 2, 'Emitido para construcción'], ['1', H - 10, 'Tablero de respaldo con grupo electrógeno']], ['4.1'])
  rfi('obra_clinica', 1, {
    asunto: 'Cielos modulares sobre el pabellón 2', pregunta: 'Sobre el pabellón 2 hay ductos existentes a 2,45 m. ¿Se baja el cielo a 2,40 m en ese recinto?',
    disciplina: 'arquitectura', destinatario: 'mandante', creado: C + 8, limite: C + 15, partidas: ['2.2'],
    pasos: [['emitido', C + 8], ['respondido', C + 13, 'Se acepta cielo a 2,40 m solo en el pabellón 2.'], ['cerrado', C + 14]],
  })
  rfi('obra_clinica', 2, {
    asunto: 'Conexión de climatización al chiller existente', pregunta: 'Se solicita confirmar el punto de conexión al chiller existente y la ventana de corte del sistema.',
    disciplina: 'climatizacion', destinatario: 'mandante', creado: H - 5, limite: H + 5, partidas: ['4.2'], documento: 'CL-01', pasos: [['emitido', H - 5]],
  })
  sub('obra_clinica', 1, 0, {
    titulo: 'Fichas técnicas de equipos de climatización', tipo: 'ficha_tecnica', descripcion: 'Unidades manejadoras y fan coils.', proveedor: 'Clima Norte SpA', partidas: ['4.2'],
    creado: C + 20, requerida: C + 28, pasos: [['enviado', C + 21], ['aprobado', C + 24]],
  })
  sub('obra_clinica', 2, 0, {
    titulo: 'Muestra de pavimento vinílico', tipo: 'muestra', descripcion: 'Pavimento vinílico conductivo para áreas clínicas.', proveedor: 'Pisos Clínicos Ltda.', partidas: ['3.1'],
    creado: H - 5, requerida: H + 12, pasos: [['enviado', H - 4]],
  })
  folio('obra_clinica', C, 'contratista', 'comunicacion', 'Se inician los trabajos en el sector a remodelar, aislado del área clínica.')
  const f3 = folio('obra_clinica', C + 10, 'mandante', 'instruccion', 'Los trabajos ruidosos se ejecutarán solo entre las 20:00 y las 07:00.')
  folio('obra_clinica', C + 11, 'contratista', 'respuesta', 'Se reprograma la tabiquería y las demoliciones en turno nocturno desde mañana.', { respondeA: f3 })
  folio('obra_clinica', H - 3, 'mandante', 'comunicacion', 'Se informa visita del comité de infecciones intrahospitalarias para la próxima semana.')

  // Centro de bodegas (terminado)
  const b = obra('obra_bodegas'), B = b.fechaInicio
  const recepcion = d.recepciones.find((r) => r.obraId === 'obra_bodegas')?.fecha ?? H - 30
  doc('obra_bodegas', 'AR-01', 'Planta general de bodegas', 'plano', 'arquitectura', [['0', B - 10, 'Emitido para construcción']])
  doc('obra_bodegas', 'ES-01', 'Estructura metálica, marcos y costaneras', 'plano', 'estructura', [['0', B - 10, 'Emitido para construcción'], ['1', B + 25, 'Arriostramiento adicional por viento']], ['4.1'])
  doc('obra_bodegas', 'CU-01', 'Cubierta y revestimientos', 'plano', 'arquitectura', [['0', B - 10, 'Emitido para construcción']], ['5.1'])
  rfi('obra_bodegas', 1, {
    asunto: 'Arriostramiento de marcos por viento', pregunta: 'Con el viento de la zona, ¿se refuerza el arriostramiento de los marcos extremos?',
    disciplina: 'estructura', destinatario: 'proyectista', creado: B + 18, limite: B + 25, partidas: ['4.1'], documento: 'ES-01',
    pasos: [['emitido', B + 18], ['respondido', B + 24, 'Se agregan diagonales en los marcos extremos según revisión 1 del ES-01.'], ['cerrado', B + 25]],
  })
  sub('obra_bodegas', 1, 0, {
    titulo: 'Plano de taller de estructura metálica', tipo: 'plano_taller', descripcion: 'Despiece de marcos, uniones apernadas y placas base.', proveedor: 'Maestranza Elqui', partidas: ['4.1'],
    creado: B + 26, requerida: B + 35, pasos: [['enviado', B + 27], ['aprobado', B + 31]],
  })
  folio('obra_bodegas', B, 'contratista', 'comunicacion', 'Se inician las obras. Entrega de terreno conforme.')
  const f4 = folio('obra_bodegas', recepcion, 'mandante', 'observacion', 'Se recibe provisoriamente la obra con las observaciones del acta N° 1.')
  folio('obra_bodegas', recepcion + 1, 'contratista', 'respuesta', 'Se programan las subsanaciones del acta N° 1 dentro de los plazos indicados.', { respondeA: f4 })
  return { documentos, rfis, submittals, folios }
}

/** Registro de riesgos de la demo: vivos en distintas etapas (exposición bajo la contingencia) y cerrados. */
function riesgosDemo(d: Datos, hoyDia: Dia): Riesgo[] {
  const obra = (id: string) => d.obras.find((o) => o.id === id)!
  type Ev = [fecha: Dia, p: Escala5, i: Escala5, monto: number, dias: number]
  type Acc = [descripcion: string, responsable: string, creada: Dia, fecha: Dia, cumplida?: Dia]
  const rs = (obraId: string, numero: number, x: {
    titulo: string; causa: string; categoria: CategoriaRiesgo; responsable?: string; creado: Dia; pasos?: [EstadoRiesgo, Dia, string?][]
    evals?: Ev[]; plan?: Acc[]; revision?: Dia; partidas?: string[]; impactoReal?: Riesgo['impactoReal']
  }): Riesgo => {
    const o = obra(obraId)
    return {
      id: `rs_${obraId}_${numero}`, obraId, numero, titulo: x.titulo, causa: x.causa, categoria: x.categoria, responsable: x.responsable, origen: 'manual',
      evaluaciones: (x.evals ?? []).map(([fecha, probabilidad, impacto, impactoMonto, impactoDias]) => ({ fecha, probabilidad, impacto, impactoMonto, impactoDias, autor: x.responsable ?? o.administrador })),
      plan: (x.plan ?? []).map(([descripcion, responsable, creada, fecha, cumplida], k) => ({ id: `ac${k + 1}`, descripcion, responsable, creada, fecha, cumplida })),
      fechaRevision: x.revision,
      historial: [
        { fecha: x.creado, estado: 'identificado', por: o.oficinaTecnica },
        ...(x.pasos ?? []).map(([estado, fecha, nota]) => ({ fecha, estado, por: estado === 'cerrado' ? o.administrador : x.responsable ?? o.administrador, ...(nota ? { nota } : {}) })),
      ],
      partidaIds: (x.partidas ?? []).map((cod) => `${obraId}_p${cod}`), impactoReal: x.impactoReal, creado: x.creado, creadoPor: o.oficinaTecnica,
    }
  }
  const H = hoyDia
  const a = obra('obra_aromos'), A = a.fechaInicio
  const c = obra('obra_clinica'), C = c.fechaInicio
  const b = obra('obra_bodegas'), B = b.fechaInicio
  return [
    // Edificio Los Aromos
    rs('obra_aromos', 1, {
      titulo: 'Permiso de ruptura de pavimento para el empalme sanitario', causa: 'La DOM puede demorar el permiso y atrasar la conexión de la red de agua potable.',
      categoria: 'contractual', responsable: a.administrador, creado: A + 1, pasos: [['en_analisis', A + 1], ['abierto', A + 2], ['cerrado', A + 15, 'Permiso otorgado por la DOM.']],
      evals: [[A + 2, 2, 2, 3_000_000, 6]],
    }),
    rs('obra_aromos', 2, {
      titulo: 'Lluvias intensas durante la excavación masiva', causa: 'Frente de mal tiempo pronosticado durante la excavación; taludes expuestos.', categoria: 'externo',
      responsable: a.jefeTerreno, creado: A + 3,
      pasos: [['en_analisis', A + 3], ['abierto', A + 4], ['en_mitigacion', A + 5], ['materializado', A + 20, 'Dos días de lluvia: derrumbe parcial del talud norte.'], ['cerrado', A + 28]],
      evals: [[A + 4, 3, 2, 5_000_000, 4]], plan: [['Cubrir taludes con polietileno y disponer bombas de achique', a.jefeTerreno, A + 5, A + 8, A + 7]],
      partidas: ['2.1'], impactoReal: { monto: 3_800_000, dias: 3 },
    }),
    rs('obra_aromos', 3, {
      titulo: 'Quiebra del subcontratista de enfierradura', causa: 'El subcontratista arrastra atrasos en el pago de cotizaciones (F30-1 observado).', categoria: 'subcontrato',
      responsable: a.administrador, creado: A + 30, pasos: [['en_analisis', A + 30], ['abierto', A + 31], ['en_mitigacion', A + 32], ['cerrado', A + 75, 'Subcontratista al día y enfierradura sobre 80 %.']],
      evals: [[A + 31, 2, 4, 20_000_000, 10]], plan: [['Exigir F30-1 mensual y pagar contra certificado; identificar un subcontratista de respaldo', a.administrador, A + 32, A + 40, A + 38]],
      partidas: ['3.3'],
    }),
    rs('obra_aromos', 4, {
      titulo: 'Falla de la grúa torre en el peak de hormigonado', causa: 'Grúa con 12 años de uso; una detención frena losas y moldajes.', categoria: 'tecnico',
      responsable: a.jefeTerreno, creado: A + 40, pasos: [['en_analisis', A + 40], ['abierto', A + 41], ['en_mitigacion', A + 42], ['cerrado', A + 90, 'Obra gruesa en pisos superiores; la grúa ya no es crítica.']],
      evals: [[A + 41, 2, 3, 9_000_000, 6]], plan: [['Mantención preventiva quincenal y grúa móvil de respaldo en convenio', a.jefeTerreno, A + 42, A + 50, A + 47]],
    }),
    rs('obra_aromos', 5, {
      titulo: 'Atraso del proveedor de cerámicos importados', causa: 'Quiebre de stock del formato especificado; el proveedor informa 6 semanas adicionales de importación.',
      categoria: 'abastecimiento', responsable: a.oficinaTecnica, creado: A + 68, pasos: [['en_analisis', A + 68], ['abierto', A + 70], ['en_mitigacion', A + 71]],
      evals: [[A + 70, 3, 4, 30_000_000, 12], [H - 10, 2, 4, 30_000_000, 12]],
      plan: [
        ['Cotizar un formato equivalente con proveedor nacional y presentarlo a la ITO', a.oficinaTecnica, A + 71, A + 80, A + 78],
        ['Adelantar la compra del 60 % del cerámico de los pisos 1 a 3', a.administrador, H - 10, H + 12],
      ],
      revision: H + 9, partidas: ['5.2'],
    }),
    rs('obra_aromos', 6, {
      titulo: 'Moldaje insuficiente para las losas de los pisos superiores', causa: 'Moldajes Pacífico tiene comprometido su stock con otra obra en la misma semana.', categoria: 'abastecimiento',
      responsable: a.jefeTerreno, creado: H - 24, pasos: [['en_analisis', H - 24], ['abierto', H - 22], ['en_mitigacion', H - 21]],
      evals: [[H - 22, 3, 3, 8_000_000, 5]], plan: [['Reservar 1.700 m² adicionales con contrato de arriendo firmado', a.jefeTerreno, H - 21, H + 5]],
      revision: H + 4, partidas: ['3.4'],
    }),
    rs('obra_aromos', 7, {
      titulo: 'Cambio en planos de estructuras por observación del revisor', causa: 'El revisor independiente observó la armadura de las vigas del piso 5 (RFI pendiente).', categoria: 'tecnico',
      responsable: a.oficinaTecnica, creado: H - 20, pasos: [['en_analisis', H - 20], ['abierto', H - 18]],
      evals: [[H - 18, 2, 3, 14_000_000, 6]], revision: H + 6, partidas: ['3.2', '3.3'],
    }),
    rs('obra_aromos', 8, {
      titulo: 'Restricción de horario por reclamo de vecinos', causa: 'La junta de vecinos reclamó ruidos de faena antes de las 8:00 ante la municipalidad.', categoria: 'externo', creado: H - 1,
    }),
    // Remodelación clínica
    rs('obra_clinica', 1, {
      titulo: 'Asbesto en cielos a demoler', causa: 'Edificio de 1985: los cielos pueden contener asbesto.', categoria: 'seguridad', responsable: c.administrador, creado: C + 1,
      pasos: [['en_analisis', C + 1], ['abierto', C + 2], ['en_mitigacion', C + 2], ['cerrado', C + 9, 'Análisis de laboratorio negativo.']],
      evals: [[C + 2, 2, 4, 6_000_000, 10]], plan: [['Tomar muestras y enviarlas a laboratorio acreditado', c.administrador, C + 2, C + 6, C + 6]], partidas: ['1.1'],
    }),
    rs('obra_clinica', 2, {
      titulo: 'Acceso de camiones en horario de atención', causa: 'El único acceso de carga es compartido con ambulancias.', categoria: 'externo', responsable: c.jefeTerreno, creado: C + 2,
      pasos: [['en_analisis', C + 2], ['abierto', C + 3], ['cerrado', C + 12, 'Mandante habilitó acceso nocturno de carga.']], evals: [[C + 3, 3, 2, 2_000_000, 4]],
    }),
    rs('obra_clinica', 3, {
      titulo: 'Atraso de equipos de climatización de suministro del mandante', causa: 'El importador del mandante no confirmó la fecha de despacho.', categoria: 'abastecimiento',
      responsable: c.oficinaTecnica, creado: C + 5,
      pasos: [['en_analisis', C + 5], ['abierto', C + 6], ['materializado', C + 18, 'Los equipos llegaron 10 días tarde.'], ['cerrado', C + 30, 'Aumento de plazo gestionado con orden de cambio.']],
      evals: [[C + 6, 3, 3, 4_000_000, 10]], partidas: ['4.2'], impactoReal: { monto: 0, dias: 10 },
    }),
    rs('obra_clinica', 4, {
      titulo: 'Polvo de obra sobre equipos médicos', causa: 'Pabellones contiguos en funcionamiento durante la demolición.', categoria: 'seguridad', responsable: c.jefeTerreno, creado: C + 3,
      pasos: [['en_analisis', C + 3], ['abierto', C + 4], ['en_mitigacion', C + 4], ['cerrado', C + 20, 'Demoliciones terminadas sin incidentes.']],
      evals: [[C + 4, 2, 3, 5_000_000, 3]], plan: [['Sellar con polietileno y presión negativa el sector intervenido', c.jefeTerreno, C + 4, C + 6, C + 5]],
    }),
    rs('obra_clinica', 5, {
      titulo: 'Corte de suministro eléctrico al conectar los tableros nuevos', causa: 'La conexión exige cortar energía a un sector con pacientes.', categoria: 'contractual',
      responsable: c.administrador, creado: H - 15, pasos: [['en_analisis', H - 15], ['abierto', H - 14], ['en_mitigacion', H - 13]],
      evals: [[H - 14, 2, 4, 8_000_000, 3]],
      plan: [['Arrendar grupo electrógeno de respaldo', c.administrador, H - 13, H - 6, H - 7], ['Acordar con el mandante ventanas de corte en domingo', c.administrador, H - 13, H + 7]],
      revision: H + 5, partidas: ['4.1'],
    }),
    rs('obra_clinica', 6, {
      titulo: 'Bajo rendimiento de tabiquería en turno nocturno', causa: 'El trabajo de noche, por restricción de ruido, rinde menos que lo presupuestado.', categoria: 'costo',
      responsable: c.jefeTerreno, creado: H - 9, pasos: [['en_analisis', H - 9], ['abierto', H - 8]], evals: [[H - 8, 2, 2, 3_000_000, 4]], revision: H + 8, partidas: ['2.1'],
    }),
    rs('obra_clinica', 7, {
      titulo: 'Interferencias con instalaciones no catastradas', causa: 'Los planos de las instalaciones existentes están desactualizados.', categoria: 'tecnico',
      responsable: c.oficinaTecnica, creado: H - 3, pasos: [['en_analisis', H - 3]],
    }),
    // Centro de bodegas (terminado)
    rs('obra_bodegas', 1, {
      titulo: 'Suelo con baja capacidad de soporte', causa: 'La mecánica de suelos tiene pocos sondajes en el sector oriente.', categoria: 'tecnico', responsable: b.oficinaTecnica, creado: B + 1,
      pasos: [['en_analisis', B + 1], ['abierto', B + 3], ['cerrado', B + 25, 'Ensayos de placa conformes.']], evals: [[B + 3, 2, 4, 15_000_000, 12]],
    }),
    rs('obra_bodegas', 2, {
      titulo: 'Atraso en la entrega de la estructura metálica', causa: 'La maestranza tiene la planta copada por otro proyecto.', categoria: 'subcontrato', responsable: b.administrador, creado: B + 20,
      pasos: [['en_analisis', B + 20], ['abierto', B + 21], ['en_mitigacion', B + 22], ['materializado', B + 60, 'La estructura llegó 6 días tarde.'], ['cerrado', B + 75]],
      evals: [[B + 21, 3, 3, 12_000_000, 8]], plan: [['Fabricación por etapas con despacho semanal comprometido', b.administrador, B + 22, B + 30, B + 29]],
      partidas: ['4.1'], impactoReal: { monto: 4_500_000, dias: 6 },
    }),
    rs('obra_bodegas', 3, {
      titulo: 'Viento durante el montaje de la cubierta', causa: 'Viento puelche frecuente en la temporada de montaje.', categoria: 'externo', responsable: b.jefeTerreno, creado: B + 70,
      pasos: [['en_analisis', B + 70], ['abierto', B + 71], ['en_mitigacion', B + 71], ['cerrado', B + 110, 'Cubierta montada.']],
      evals: [[B + 71, 3, 2, 4_000_000, 5]], plan: [['Montaje en las mañanas y anemómetro con límite de operación', b.jefeTerreno, B + 71, B + 75, B + 73]], partidas: ['5.1'],
    }),
    rs('obra_bodegas', 4, {
      titulo: 'Recepción municipal condicionada a obras de urbanización', causa: 'La DOM puede exigir la pavimentación del frente antes de la recepción.', categoria: 'contractual', responsable: b.administrador, creado: B + 90,
      pasos: [['en_analisis', B + 90], ['abierto', B + 91], ['cerrado', B + 140, 'Recepción municipal obtenida sin condiciones.']], evals: [[B + 91, 2, 3, 10_000_000, 15]],
    }),
    rs('obra_bodegas', 5, {
      titulo: 'Certificado TE1 observado por la SEC', causa: 'La SEC puede observar el proyecto eléctrico y atrasar la recepción definitiva.', categoria: 'contractual',
      responsable: b.oficinaTecnica, creado: H - 30, pasos: [['en_analisis', H - 30], ['abierto', H - 28]], evals: [[H - 28, 2, 2, 3_000_000, 15]], revision: H + 10,
    }),
  ]
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
export const VERSION_DEMO = 16

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
    compromisos: [], reglasMapeo: [], ajustes: [], periodos: [], alertas: [], estadosPago: [], ordenesCambio: [], obligaciones: [], garantias: [], recepciones: [], riesgos: [], documentos: [], rfis: [], submittals: [], folios: [], tareasSemanales: [], proveedores: [], materiales: [], solicitudesMaterial: [], ordenesCompra: [], movimientosStock: [], subcontratos: [], epsSubcontrato: [], trabajadores: [], documentosLaborales: [], equipos: [], partesMaquinaria: [], cajasChicas: [], rendiciones: [], protocolosCalidad: [], inspeccionesCalidad: [], noConformidades: [], charlasSeguridad: [], arts: [], inspeccionesSeguridad: [], observacionesPreventivas: [], incidentes: [], medidasCorrectivas: [],
  }
  for (const spec of [OBRA_AROMOS, OBRA_CLINICA, OBRA_BODEGAS]) {
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
  // Contrato: obligaciones, garantías y la recepción provisoria de la obra terminada
  const contrato = contratoDemo(d, hoyDia)
  d.obligaciones.push(...contrato.obligaciones)
  d.garantias.push(...contrato.garantias)
  d.recepciones.push(...contrato.recepciones)
  d.obras = d.obras.map((o) => ({ ...o, estado: estadoObraPorRecepcion(d.recepciones, o.id, hoyDia - 1, o.estado) }))
  // Registro de riesgos
  d.riesgos.push(...riesgosDemo(d, hoyDia))
  // Planos, RFI, submittals y Libro de Obra
  Object.assign(d, documentalDemo(d, hoyDia))
  // Plan semanal Last Planner (sale de los RDO)
  d.tareasSemanales = lastPlannerDemo(d, hoyDia)
  // Abastecimiento: proveedores, catálogo, solicitudes y órdenes de compra (salen de los RDO)
  d.proveedores = PROVEEDORES_DEMO.map((x) => ({ ...x }))
  d.materiales = MATERIALES_DEMO.map(({ recurso: _r, proveedor: _p, ...m }) => m)
  Object.assign(d, comprasDemo(d, hoyDia))
  d.movimientosStock = bodegaDemo(d, hoyDia)
  // Subcontratos y sus estados de pago (desde los compromisos SC-… y el avance validado)
  Object.assign(d, subcontratosDemo(d, hoyDia))
  // Cumplimiento laboral: trabajadores, F30 y F30-1 de cada subcontratista
  Object.assign(d, cumplimientoDemo(d, hoyDia))
  // Maquinaria: equipos y partes diarios de las últimas 8 semanas
  Object.assign(d, maquinariaDemo(d, hoyDia))
  // Caja chica y rendiciones
  Object.assign(d, cajaChicaDemo(d, hoyDia))
  // Calidad: protocolos, NCR (con HH de retrabajo en los RDO) e inspecciones
  Object.assign(d, calidadDemo(d, hoyDia))
  // Seguridad: charlas, ART, inspecciones, observaciones, incidentes y medidas
  Object.assign(d, seguridadDemo(d, hoyDia))
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
