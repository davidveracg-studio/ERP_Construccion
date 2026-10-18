import type {
  AjusteForecast, Alerta, Compromiso, Config, CostoReal, Cuadrilla, EstadoPago, Garantia, Obligacion, Obra, OrdenCambio, Partida,
  PeriodoControl, Programa, RDO, RecepcionObra, ReglaMapeo, Riesgo, Documento, RFI, Submittal, Folio, TareaSemanal, Proveedor, Material, SolicitudMaterial, OrdenCompra, MovimientoStock, Subcontrato, EPSubcontrato, Trabajador, DocumentoLaboral,
} from './types'

/** Conjunto completo de datos de una empresa (lo que persiste el store). */
export interface Datos {
  config: Config
  obras: Obra[]
  partidas: Partida[]
  programas: Programa[]
  cuadrillas: Cuadrilla[]
  rdos: RDO[]
  costos: CostoReal[]
  compromisos: Compromiso[]
  reglasMapeo: ReglaMapeo[]
  ajustes: AjusteForecast[]
  periodos: PeriodoControl[]
  alertas: Alerta[]
  estadosPago: EstadoPago[]
  ordenesCambio: OrdenCambio[]
  obligaciones: Obligacion[]
  garantias: Garantia[]
  recepciones: RecepcionObra[]
  riesgos: Riesgo[]
  documentos: Documento[]
  rfis: RFI[]
  submittals: Submittal[]
  folios: Folio[]
  tareasSemanales: TareaSemanal[]
  proveedores: Proveedor[]
  materiales: Material[]
  solicitudesMaterial: SolicitudMaterial[]
  ordenesCompra: OrdenCompra[]
  movimientosStock: MovimientoStock[]
  subcontratos: Subcontrato[]
  epsSubcontrato: EPSubcontrato[]
  trabajadores: Trabajador[]
  documentosLaborales: DocumentoLaboral[]
}

export const CONFIG_DEFECTO: Config = {
  empresa: 'Constructora Demo SpA',
  rut: '76.123.456-7',
  umbrales: {
    cajaColchon: 0.02,
    spi: [0.95, 0.85],
    cpi: [0.98, 0.92],
    avancePp: [-0.02, -0.06],
    productividad: [0.05, 0.1],
    toleranciaPartida: [0.05, 0.1],
    montoMinimoAlerta: 2_000_000,
    rendimientoMO: [0.1, 0.25],
    avanceVsPlazoPp: [0.1, 0.2],
    margenMinimo: 0.06,
    vac: [0.03, 0.07],
    recargoExtra: 0.5,
    limiteOcUf: 150,
    cotizacionesUf: 100,
    limiteSubcontratoUf: 500,
  },
  valorUF: 40_000,
  metodoEAC: 'cpi',
  devengarSubcontratos: true,
  diasHabiles: [1, 2, 3, 4, 5],
}

export function programaDe(d: Datos, obraId: string, tipo: Programa['tipo']): Programa | undefined {
  const cands = d.programas.filter((p) => p.obraId === obraId && p.tipo === tipo && p.estado === 'vigente')
  return cands.sort((a, b) => b.version - a.version)[0]
}

/** Colecciones del dominio (una tabla por colección en Supabase). */
export const COLECCIONES = [
  'obras', 'partidas', 'programas', 'cuadrillas', 'rdos', 'costos', 'compromisos', 'reglasMapeo', 'ajustes', 'periodos', 'alertas', 'estadosPago', 'ordenesCambio', 'obligaciones', 'garantias', 'recepciones', 'riesgos',
  'documentos', 'rfis', 'submittals', 'folios', 'tareasSemanales',
  'proveedores', 'materiales', 'solicitudesMaterial', 'ordenesCompra', 'movimientosStock', 'subcontratos', 'epsSubcontrato', 'trabajadores', 'documentosLaborales',
] as const
export type Coleccion = (typeof COLECCIONES)[number]

export function datosVacios(): Datos {
  return {
    config: CONFIG_DEFECTO, obras: [], partidas: [], programas: [], cuadrillas: [], rdos: [], costos: [],
    compromisos: [], reglasMapeo: [], ajustes: [], periodos: [], alertas: [], estadosPago: [], ordenesCambio: [], obligaciones: [], garantias: [], recepciones: [], riesgos: [], documentos: [], rfis: [], submittals: [], folios: [], tareasSemanales: [], proveedores: [], materiales: [], solicitudesMaterial: [], ordenesCompra: [], movimientosStock: [], subcontratos: [], epsSubcontrato: [], trabajadores: [], documentosLaborales: [],
  }
}
