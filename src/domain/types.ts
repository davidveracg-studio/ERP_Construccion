// Modelo de dominio del MVP de OBRAI (docs 08, 10). Las fechas se guardan como
// "día" (entero: días desde 1970-01-01, ver fechas.ts) para simplificar cálculos.

export type Dia = number

export type Rol = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R11'

export const ROLES: Record<Rol, string> = {
  R01: 'Gerencia',
  R02: 'Administrador de Obra',
  R03: 'Jefe de Terreno',
  R04: 'Capataz',
  R05: 'Oficina Técnica / Control',
  R11: 'Mandante / ITO',
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
  /** Cantidad vigente (contratada + órdenes de cambio aprobadas). */
  cantidad: number
  puVenta: number
  recursos: Recurso[]
  /** Partida extraordinaria creada por una orden de cambio: no cuenta hasta que el mandante la aprueba. */
  ordenCambioId?: string
  /** Desde cuándo se programa una partida sin actividad en la Carta Gantt (por defecto, el inicio de obra). */
  inicioProgramado?: Dia
}

export type TipoOrdenCambio = 'aumento' | 'extraordinaria' | 'disminucion' | 'plazo'

/** Línea de una orden de cambio: ajuste de una partida existente o partida nueva (extraordinaria). */
export interface LineaOrdenCambio {
  /** Partida existente que se ajusta; vacío si la línea crea una partida nueva. */
  partidaId?: string
  nueva?: { codigo: string; descripcion: string; unidad: string; tipoCosto: TipoRecurso }
  /** Variación de cantidad: positiva en aumentos y obras nuevas, negativa en disminuciones. */
  cantidad: number
  /** Precio de venta: el de contrato en partidas existentes; el acordado en las nuevas. */
  puVenta: number
  /** Costo unitario (APU); no lo ve el mandante. */
  puCosto: number
}

/** Orden de cambio del contrato (10 §10): valorización, aprobación interna y del mandante. */
export interface OrdenCambio {
  id: string
  obraId: string
  numero: number
  tipo: TipoOrdenCambio
  titulo: string
  causa: 'mandante' | 'proyecto' | 'imprevisto' | 'mayor_obra'
  descripcion: string
  lineas: LineaOrdenCambio[]
  /** Días de aumento (o reducción, si es negativo) del plazo contractual. */
  diasPlazo: number
  creada: Dia
  valorizada?: Dia
  aprobadaInterna?: Dia
  aprobadaInternaPor?: string
  presentada?: Dia
  aprobadaMandante?: Dia
  rechazada?: Dia
  motivoRechazo?: string
  anulada?: Dia
  motivoAnulacion?: string
  devoluciones: { fecha: Dia; autor: string; texto: string }[]
}

export type EstadoObra = 'planificacion' | 'en_ejecucion' | 'paralizada' | 'terminada' | 'recepcion_provisoria' | 'en_garantia' | 'cerrada'

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
  /** Modelo 4D guardado; si no existe se infiere desde el programa. */
  modelo4d?: Modelo4D
  /** Condiciones de pago del contrato; si no hay, se usan las de CONDICIONES_PAGO_DEFECTO. */
  condicionesPago?: CondicionesPago
  /** Tope de multas del contrato como fracción de la venta (por defecto 10 %). */
  topeMultas?: number
}

export type TipoObligacion = 'garantia' | 'programa' | 'planos' | 'poliza' | 'informe' | 'respuesta' | 'otra'

/** Compromiso del contrato con fecha (08 Obligación Contractual): responsable, estado y multa si aplica. */
export interface Obligacion {
  id: string
  obraId: string
  tipo: TipoObligacion
  titulo: string
  responsable: string
  fechaLimite: Dia
  multa?: { tipo: 'diaria' | 'fija'; monto: number }
  cumplida?: Dia
  evidencia?: string
  creada: Dia
}

export type ObjetoGarantia = 'fiel_cumplimiento' | 'anticipo' | 'correcta_ejecucion' | 'canje_retenciones' | 'seriedad_oferta'

/** Garantía entregada al mandante (08 Garantía Contractual, 10 §20). */
export interface Garantia {
  id: string
  obraId: string
  tipo: 'boleta' | 'poliza' | 'vale_vista'
  objeto: ObjetoGarantia
  numero: string
  emisor: string
  monto: number
  emision: Dia
  vencimiento: Dia
  /** Garantía anterior que esta renueva. */
  reemplazaA?: string
  devuelta?: Dia
  cobrada?: Dia
  creada: Dia
}

export interface ObservacionRecepcion {
  id: string
  texto: string
  plazo: Dia
  subsanada?: Dia
  /** V°B° del mandante/ITO a la subsanación. */
  vistoBueno?: Dia
}

/** Recepción provisoria o definitiva de la obra (10 §16). */
export interface RecepcionObra {
  id: string
  obraId: string
  tipo: 'provisoria' | 'definitiva'
  fecha: Dia
  acta?: string
  resultado: 'recibida' | 'rechazada'
  motivoRechazo?: string
  observaciones: ObservacionRecepcion[]
  registradaPor: string
}

export type CategoriaRiesgo = 'plazo' | 'costo' | 'tecnico' | 'abastecimiento' | 'subcontrato' | 'seguridad' | 'contractual' | 'externo'
export type EstadoRiesgo = 'identificado' | 'en_analisis' | 'abierto' | 'en_mitigacion' | 'materializado' | 'cerrado'
/** Escala 1–5 (muy baja … muy alta). */
export type Escala5 = 1 | 2 | 3 | 4 | 5

/** Evaluación (o reevaluación) de un riesgo: probabilidad, impacto y su estimación en dinero y días. */
export interface EvaluacionRiesgo {
  fecha: Dia
  probabilidad: Escala5
  impacto: Escala5
  impactoMonto: number
  impactoDias: number
  autor: string
  nota?: string
}

/** Acción del plan de mitigación, con responsable y fecha. */
export interface AccionMitigacion {
  id: string
  descripcion: string
  responsable: string
  fecha: Dia
  creada: Dia
  cumplida?: Dia
}

/** Paso del ciclo de vida del riesgo (10 §25); el estado vigente es el último paso a la fecha. */
export interface PasoRiesgo {
  fecha: Dia
  estado: EstadoRiesgo
  por: string
  nota?: string
}

/** Riesgo del registro de la obra (08 Riesgo, RF-CTL-08). */
export interface Riesgo {
  id: string
  obraId: string
  numero: number
  titulo: string
  causa: string
  categoria: CategoriaRiesgo
  responsable?: string
  origen: 'manual' | 'motor'
  evaluaciones: EvaluacionRiesgo[]
  plan: AccionMitigacion[]
  /** Próxima revisión; obligatoria en `abierto` y `en_mitigacion` (RULE-611). */
  fechaRevision?: Dia
  historial: PasoRiesgo[]
  partidaIds: string[]
  /** Impacto real, al materializarse o al cerrar uno materializado. */
  impactoReal?: { monto: number; dias: number }
  creado: Dia
  creadoPor: string
}

export type Especialidad = 'arquitectura' | 'estructura' | 'sanitaria' | 'electrica' | 'climatizacion' | 'general'
export type TipoDocumento = 'plano' | 'eett' | 'memoria' | 'otro'

/** Archivo adjunto guardado en el bucket "documentos-obra" (o en el dispositivo, en modo local). */
export interface ArchivoDoc {
  ruta: string
  nombre: string
  bytes: number
}

export interface RevisionDocumento {
  id: string
  /** A, B, C… en desarrollo; 0, 1, 2… para construcción. */
  revision: string
  fecha: Dia
  motivo?: string
  publicadaPor: string
  archivo?: ArchivoDoc
}

/** Plano, EETT o memoria con control de revisiones (08 Documento): una sola revisión vigente. */
export interface Documento {
  id: string
  obraId: string
  codigo: string
  titulo: string
  tipo: TipoDocumento
  especialidad: Especialidad
  revisiones: RevisionDocumento[]
  partidaIds: string[]
  /** Revisión que terreno confirmó tener en uso (RULE-905). */
  enTerreno?: { revisionId: string; fecha: Dia; por: string }
  creado: Dia
}

/** Paso del ciclo de vida de un documento de oficina técnica; el estado es el último a la fecha. */
export interface PasoDoc<E extends string> {
  fecha: Dia
  estado: E
  por: string
  texto?: string
}

export type EstadoRFI = 'borrador' | 'emitido' | 'respondido' | 'cerrado' | 'anulado'

/** Consulta técnica formal (08 RFI, 10 §26). La respuesta y las repreguntas quedan en el historial. */
export interface RFI {
  id: string
  obraId: string
  numero: number
  asunto: string
  pregunta: string
  disciplina: Especialidad
  destinatario: 'mandante' | 'proyectista' | 'ito'
  fechaLimite?: Dia
  /** Impacto potencial en costo y plazo. */
  impacto?: { monto: number; dias: number }
  partidaIds: string[]
  documentoId?: string
  historial: PasoDoc<EstadoRFI>[]
  ordenCambioId?: string
  riesgoId?: string
  creado: Dia
  creadoPor: string
}

export type EstadoSubmittal = 'borrador' | 'enviado' | 'aprobado' | 'aprobado_con_observaciones' | 'rechazado' | 'anulado'
export type TipoSubmittal = 'ficha_tecnica' | 'muestra' | 'plano_taller' | 'otro'

/** Envío a aprobación del mandante (08 Submittal, 10 §27). Al rechazarse nace la revisión siguiente. */
export interface Submittal {
  id: string
  obraId: string
  numero: number
  revision: number
  titulo: string
  tipo: TipoSubmittal
  descripcion: string
  proveedor?: string
  partidaIds: string[]
  /** Fecha en que la aprobación se necesita para la compra o la actividad. */
  fechaRequerida?: Dia
  reemplazaA?: string
  historial: PasoDoc<EstadoSubmittal>[]
  creado: Dia
  creadoPor: string
}

export type TipoFolio = 'instruccion' | 'observacion' | 'comunicacion' | 'respuesta'

/** Anotación del Libro de Obra: numerada, fechada, firmada e inmutable (RN-P03). */
export interface Folio {
  id: string
  obraId: string
  numero: number
  fecha: Dia
  autor: string
  emisor: 'mandante' | 'contratista'
  tipo: TipoFolio
  texto: string
  /** Plazo de respuesta indicado en el folio (si no, 3 días hábiles para instrucciones y observaciones del ITO). */
  plazoRespuesta?: Dia
  respondeA?: string
}

/** Condiciones de pago del contrato con el mandante y plazo de pago a proveedores. */
export interface CondicionesPago {
  /** Anticipo como fracción de la venta; se amortiza en cada EP con el mismo porcentaje. */
  anticipo: number
  /** Retención de cada EP (fracción); se devuelve al término. */
  retencion: number
  /** Días entre la presentación del EP y su aprobación. */
  diasAprobacion: number
  /** Días entre la factura y el pago del mandante (vencimiento). */
  diasPago: number
  /** Días de pago a proveedores y subcontratistas desde su factura. */
  diasPagoProveedores: number
  /** Días después del término en que se devuelven las retenciones. */
  diasDevolucionRetencion: number
  /**
   * Capital de trabajo que la empresa asigna a la obra (fracción de la venta): financia la
   * brecha entre pagar costos y cobrar los EP. Caja disponible = capital + cobros − pagos.
   */
  capitalTrabajo: number
  /** Reajuste del contrato por índice (p. ej. IPC): reajuste = bruto × (índice del período / base − 1). */
  reajuste?: { indice: string; base: number }
}

/** Respaldo de una cantidad cubicada: por eje, nivel, recinto o elemento (08 Generador). */
export interface Generador {
  id: string
  ubicacion: string
  descripcion: string
  /** Fórmula de respaldo, p. ej. "24 × 16 × 0,18". */
  formula?: string
  cantidad: number
}

/** Línea de cubicación del EP: avance de una partida en el período, a precio de venta. */
export interface LineaEP {
  partidaId: string
  cantidad: number
  monto: number
  generadores?: Generador[]
}

export interface ObservacionEP {
  fecha: Dia
  autor: string
  texto: string
  /** Versión del EP observada. */
  version: number
  /** mandante: observación del ITO (vuelve a "observado"); interna: devolución en la revisión interna. */
  origen: 'mandante' | 'interna'
}

/**
 * Estado de pago (EP) al mandante (10 §9). La etapa a cualquier fecha se deriva de las fechas
 * registradas: borrador → en revisión interna → presentado ⇄ observado → aprobado → facturado →
 * pagado parcial → pagado, o anulado. Montos netos de IVA.
 */
export interface EstadoPago {
  id: string
  obraId: string
  numero: number
  tipo: 'anticipo' | 'avance'
  fechaCorte: Dia
  /** Sube en 1 cada vez que se reingresa tras una observación del mandante. */
  version: number
  /** Cubicación del período (vacía en el anticipo). */
  lineas: LineaEP[]
  /** Valor del avance del período (o del anticipo). */
  bruto: number
  /** Índice del período para el reajuste (ver CondicionesPago.reajuste). */
  indiceReajuste?: number
  reajuste: number
  /** Descuentos y multas acordados con el mandante. */
  descuentos: { concepto: string; monto: number }[]
  retencion: number
  amortizacion: number
  /** A cobrar: bruto + reajuste − retención − amortización − descuentos. */
  neto: number
  creado: Dia
  enRevision?: Dia
  /** Fecha de cada presentación al mandante (una por versión). */
  presentaciones: Dia[]
  observaciones: ObservacionEP[]
  aprobado?: Dia
  facturado?: Dia
  factura?: string
  vencimiento?: Dia
  pagos: { fecha: Dia; monto: number }[]
  /** Fecha en que se completó el pago del neto. */
  pagado?: Dia
  anulado?: Dia
  motivoAnulacion?: string
}

/** Capa constructiva del modelo 4D paramétrico. */
export type Capa = 'terreno' | 'fundaciones' | 'estructura' | 'muros' | 'instalaciones' | 'terminaciones'

/** Actividad del programa enlazada a una capa de uno o más pisos (piso 0 = nivel de terreno). */
export interface EnlaceModelo {
  actividadId: string
  capa: Capa
  pisos: number[]
}

/** Nivel (IfcBuildingStorey) de un modelo BIM y el piso del modelo 4D al que corresponde (0 = terreno). */
export interface NivelIfc {
  nombre: string
  elevacion: number
  piso: number
}

/** Modelo BIM (IFC) subido para la obra. El archivo vive en Supabase Storage (o en el navegador en modo local). */
export interface ArchivoIfc {
  ruta: string
  nombre: string
  bytes: number
  fecha: Dia
  subidoPor: string
  niveles: NivelIfc[]
}

/**
 * Modelo 4D: el edificio se genera desde la planta y el número de pisos (paramétrico) o
 * se lee de un IFC. En ambos casos las actividades se enlazan a capas y pisos.
 */
export interface Modelo4D {
  pisos: number
  /** Planta en metros (solo modelo paramétrico). */
  largo: number
  ancho: number
  alturaPiso: number
  enlaces: EnlaceModelo[]
  ifc?: ArchivoIfc
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
  /** Día en que se generaron los datos de demostración (la demo se renueva cada día). */
  demoGenerada?: Dia
  /** Versión del generador con que se crearon (ver VERSION_DEMO). */
  demoVersion?: number
  umbrales: {
    /** Colchón de caja por obra como fracción de su venta (KFI-06): bajo él, amarillo; bajo 0, rojo. */
    cajaColchon?: number
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
