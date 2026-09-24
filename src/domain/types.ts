// Modelo de dominio del MVP de OBRAI (docs 08, 10). Las fechas se guardan como
// "día" (entero: días desde 1970-01-01, ver fechas.ts) para simplificar cálculos.

export type Dia = number

export type Rol = 'R01' | 'R02' | 'R03' | 'R04' | 'R05'

export const ROLES: Record<Rol, string> = {
  R01: 'Gerencia',
  R02: 'Administrador de Obra',
  R03: 'Jefe de Terreno',
  R04: 'Capataz',
  R05: 'Oficina Técnica / Control',
}

export type TipoRecurso = 'MO' | 'MAT' | 'EQ' | 'SUB' | 'OTRO'

export const TIPOS_RECURSO: Record<TipoRecurso, string> = {
  MO: 'Mano de obra',
  MAT: 'Materiales',
  EQ: 'Equipos',
  SUB: 'Subcontratos',
  OTRO: 'Otros',
}

/** Recurso del APU simplificado (08 RecursoPartida). */
export interface Recurso {
  tipo: TipoRecurso
  descripcion: string
  /** Consumo por unidad de partida: HH/u, m³/u, H-M/u, etc. */
  cantPorUnidad: number
  unidad: string
  /** Precio del recurso: costo HH, precio por m³, costo hora, etc. */
  precio: number
}

export interface Partida {
  id: string
  obraId: string
  codigo: string
  capitulo: string
  descripcion: string
  unidad: string
  /** Cantidad vigente (contratada + órdenes de cambio). */
  cantidad: number
  puVenta: number
  recursos: Recurso[]
}

export type EstadoObra = 'planificacion' | 'en_ejecucion' | 'paralizada' | 'terminada'

export interface Obra {
  id: string
  nombre: string
  mandante: string
  lineaNegocio: string
  administrador: string
  jefeTerreno: string
  oficinaTecnica: string
  moneda: 'CLP' | 'UF'
  fechaInicio: Dia
  plazoDias: number
  multaDiaria: number
  margenOfertado: number
  /** Presupuesto de gastos generales (indirectos) total. */
  ggPresupuesto: number
  estado: EstadoObra
}

export type TipoDependencia = 'FC' | 'CC' | 'FF' | 'CF'

export interface Dependencia {
  actividadId: string
  tipo: TipoDependencia
  desfase: number
}

export interface Actividad {
  id: string
  codigo: string
  nombre: string
  duracion: number
  predecesoras: Dependencia[]
  /** Partidas cubiertas con la cantidad asignada a esta actividad. */
  partidas: { partidaId: string; cantidad: number }[]
  esHito?: boolean
  hitoContractual?: boolean
  /** Fechas de la versión (calculadas por CPM al guardar la versión). */
  inicio: Dia
  fin: Dia
  inicioReal?: Dia
  finReal?: Dia
  /** Avance manual (0–1) para actividades sin partidas. */
  avanceManual?: number
}

export type TipoPrograma = 'contractual' | 'lineaBase' | 'actualizado'
export type EstadoPrograma = 'vigente' | 'en_aprobacion' | 'reemplazado'

export interface Programa {
  id: string
  obraId: string
  tipo: TipoPrograma
  version: number
  estado: EstadoPrograma
  motivo?: string
  creadoPor: string
  fecha: Dia
  actividades: Actividad[]
}

export interface Cuadrilla {
  id: string
  obraId: string
  nombre: string
  capataz: string
  trabajadores: number
  /** Costo HH normal promedio de la cuadrilla. */
  costoHH: number
}

export type CausaNoProductiva = 'espera_material' | 'espera_frente' | 'clima' | 'capacitacion' | 'otra'

export const CAUSAS_NP: Record<CausaNoProductiva, string> = {
  espera_material: 'Espera de material',
  espera_frente: 'Espera de frente',
  clima: 'Clima',
  capacitacion: 'Capacitación',
  otra: 'Otra',
}

export interface RegistroHH {
  partidaId: string | null
  trabajadores: number
  horasNormales: number
  horasExtra: number
  causaNoProductiva?: CausaNoProductiva
}

export type EstadoRDO = 'borrador' | 'enviado' | 'validado' | 'rechazado'
export type Clima = 'despejado' | 'nublado' | 'lluvia' | 'viento'

export interface RDO {
  id: string
  obraId: string
  cuadrillaId: string
  fecha: Dia
  clima: Clima
  estado: EstadoRDO
  autor: string
  avances: { partidaId: string; cantidad: number }[]
  hh: RegistroHH[]
  observaciones: string
  motivoRechazo?: string
  validadoPor?: string
}

export type OrigenCosto = 'importacion' | 'manual'

export interface CostoReal {
  id: string
  obraId: string
  fecha: Dia
  partidaId: string | null
  /** 'GG' = gasto general; null partida y tipo != GG = sin imputar. */
  tipo: TipoRecurso | 'GG'
  cantidad?: number
  precio?: number
  monto: number
  descripcion: string
  proveedor?: string
  documento?: string
  cuenta?: string
  centroCosto?: string
  compromisoId?: string
  origen: OrigenCosto
  loteId?: string
}

export interface Compromiso {
  id: string
  obraId: string
  partidaId: string | null
  tipo: TipoRecurso
  descripcion: string
  proveedor?: string
  documento: string
  monto: number
  fecha: Dia
}

export interface ReglaMapeo {
  id: string
  cuenta?: string
  centroCosto?: string
  obraId: string
  partidaId: string | null
  tipo: TipoRecurso | 'GG'
}

export interface AjusteForecast {
  id: string
  obraId: string
  partidaId: string
  etc: number
  motivo: string
  autor: string
  fecha: Dia
  estado: 'aprobado' | 'pendiente_r01' | 'rechazado'
}

export type Severidad = 'critica' | 'alta' | 'media' | 'baja'
export type EstadoAlerta = 'activa' | 'reconocida' | 'en_accion' | 'resuelta' | 'descartada'
export type EstadoAccion = 'pendiente' | 'en_curso' | 'completada' | 'verificada_efectiva' | 'verificada_inefectiva' | 'cancelada'

export interface AccionCorrectiva {
  id: string
  descripcion: string
  responsable: string
  fechaCompromiso: Dia
  estado: EstadoAccion
  /** KPI objetivo para verificar efectividad. */
  kpi?: string
  valorBase?: number
  valorEsperado?: number
  mejorSiMenor?: boolean
  completadaEnPeriodo?: number
}

export interface Alerta {
  id: string
  obraId: string
  regla: string
  clave: string
  severidad: Severidad
  titulo: string
  entidad: string
  datos: { etiqueta: string; valor: string }[]
  porQue: string
  queProvoca?: string
  queExplica?: string
  accionRequerida: string
  responsable: string
  estado: EstadoAlerta
  creadaEn: Dia
  periodo: number
  actualizadaEnPeriodo: number
  motivoDescarte?: string
  acciones: AccionCorrectiva[]
  /** Valor del KPI al generarse, para verificar acciones. */
  kpi?: string
  valorKpi?: number
}

export interface SnapshotPartida {
  partidaId: string
  bac: number
  pv: number
  ev: number
  ac: number
  eac: number
  cpi: number | null
  rendimientoReal: number | null
  rendimientoPres: number | null
}

export interface SnapshotObra {
  pv: number
  ev: number
  ac: number
  bac: number
  eac: number
  cpi: number | null
  spi: number | null
  avanceReal: number
  avancePlan: number
  plazoConsumido: number
  atrasoProyectado: number
  margenProyectado: number
  productividadDesv: number | null
  semaforo: Record<string, EstadoSemaforo>
  confianza: Confianza
}

export interface PeriodoControl {
  id: string
  obraId: string
  numero: number
  fechaCorte: Dia
  cerradoPor: string
  cerradoEn: Dia
  obra: SnapshotObra
  partidas: SnapshotPartida[]
  lineaBaseVersion: number
}

export type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo' | 'na'
export type Confianza = 'alta' | 'media' | 'baja'

export interface Config {
  empresa: string
  rut: string
  umbrales: {
    spi: [number, number]
    cpi: [number, number]
    avancePp: [number, number]
    productividad: [number, number]
    toleranciaPartida: [number, number]
    montoMinimoAlerta: number
    rendimientoMO: [number, number]
    avanceVsPlazoPp: [number, number]
    margenMinimo: number
    vac: [number, number]
    recargoExtra: number
  }
  metodoEAC: 'cpi' | 'presupuesto' | 'cpi_spi'
  /** Provisionar costo de subcontratos según avance validado. */
  devengarSubcontratos: boolean
  diasHabiles: number[]
}
