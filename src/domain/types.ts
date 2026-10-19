// Modelo de dominio del MVP de OBRAI (docs 08, 10). Las fechas se guardan como
// "día" (entero: días desde 1970-01-01, ver fechas.ts) para simplificar cálculos.

export type Dia = number

export type Rol = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R07' | 'R08' | 'R09' | 'R10' | 'R11'

export const ROLES: Record<Rol, string> = {
  R01: 'Gerencia',
  R02: 'Administrador de Obra',
  R03: 'Jefe de Terreno',
  R04: 'Capataz',
  R05: 'Oficina Técnica / Control',
  R07: 'Bodega y Adquisiciones',
  R08: 'Prevención de Riesgos',
  R09: 'Finanzas',
  R10: 'Subcontratista',
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
  /** Tarea crítica de seguridad (v1.3): exige ART del día para reportar avance (RULE-803). */
  tareaCritica?: TipoTareaCritica
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

export type EstadoTarea = 'propuesta' | 'comprometida' | 'en_ejecucion' | 'cumplida' | 'no_cumplida'
/** Causas de no cumplimiento (11 TareaSemanalNoCumplida). */
export type CausaNoCumplimiento = 'material' | 'mano_obra' | 'equipo' | 'clima' | 'diseno' | 'subcontratista' | 'tarea_previa' | 'mandante'
export type TipoRestriccion = 'material' | 'plano' | 'rfi' | 'submittal' | 'equipo' | 'permiso' | 'mano_obra' | 'otra'

/** Restricción de una tarea: hasta liberarse, la tarea no se puede comprometer. */
export interface Restriccion {
  id: string
  tipo: TipoRestriccion
  descripcion: string
  responsable: string
  fechaCompromiso: Dia
  liberada?: Dia
  /** Se libera sola cuando el RFI se responde o el submittal se aprueba. */
  rfiId?: string
  submittalId?: string
}

/** Tarea del plan semanal (Last Planner, 08 Tarea Semanal, 10 §8). */
export interface TareaSemanal {
  id: string
  obraId: string
  /** Lunes de la semana del plan. */
  semana: Dia
  descripcion: string
  partidaId?: string
  cuadrillaId?: string
  responsable: string
  /** Meta de cantidad de la semana (en la unidad de la partida). */
  meta: number
  inicio: Dia
  fin: Dia
  restricciones: Restriccion[]
  historial: PasoDoc<EstadoTarea>[]
  /** Al cierre: cantidad lograda y causa si no se cumplió. */
  logrado?: number
  causa?: CausaNoCumplimiento
  reemplazaA?: string
  creado: Dia
  creadoPor: string
}

/** Proveedor de la empresa (08 Proveedor): evaluado por OTIF, lead time y precio. */
export interface Proveedor {
  id: string
  rut: string
  nombre: string
  rubro: string
  contacto?: string
  email?: string
  telefono?: string
  /** RULE-302: inactivo o bloqueado no puede recibir órdenes de compra. */
  estado: 'activo' | 'inactivo' | 'bloqueado'
  motivoBloqueo?: string
  /** También ejecuta partidas como subcontratista (08 Subcontratista). */
  esSubcontratista?: boolean
  especialidad?: string
}

/** Material del catálogo de la empresa (08 Material). */
export interface Material {
  id: string
  codigo: string
  nombre: string
  unidad: string
  categoria: string
  /** Su falta detiene actividades críticas o tiene lead time largo. */
  critico: boolean
}

export type Urgencia = 'planificada' | 'urgente'
export type EstadoSolicitud = 'enviada' | 'en_gestion' | 'atendida_bodega' | 'en_compra' | 'recibida_parcial' | 'completada' | 'rechazada'

/** Requerimiento de material desde terreno (08 Solicitud de Material, 10 §12). */
export interface SolicitudMaterial {
  id: string
  obraId: string
  numero: number
  materialId: string
  cantidad: number
  partidaId: string
  fechaRequerida: Dia
  urgencia: Urgencia
  nota?: string
  historial: PasoDoc<EstadoSolicitud>[]
  ordenCompraId?: string
  creado: Dia
  creadoPor: string
}

export type EstadoOC = 'borrador' | 'por_aprobar' | 'aprobada' | 'enviada' | 'recibida_parcial' | 'recibida' | 'cerrada' | 'anulada'

export interface LineaOC {
  id: string
  materialId: string
  cantidad: number
  precio: number
  partidaId: string
  solicitudId?: string
}

/** Recepción contra la OC, total o parcial, con guía de despacho (base de OTIF y lead time). */
export interface RecepcionOC {
  id: string
  fecha: Dia
  guia: string
  cantidades: Record<string, number>
  recibidoPor: string
}

/** Orden de compra imputada a obra y partida (08, 10 §13). */
export interface OrdenCompra {
  id: string
  obraId: string
  numero: number
  proveedorId: string
  lineas: LineaOC[]
  /** Fecha de entrega comprometida por el proveedor. */
  fechaEntrega: Dia
  urgente: boolean
  cotizaciones: number
  /** RULE-303: justificación si no hay cotizaciones mínimas (proveedor único, urgencia). */
  justificacion?: string
  /** Líneas que al enviarse a aprobación superaban el saldo de su partida (KAB-09; requiere Gerencia). */
  fueraPresupuesto?: string[]
  historial: PasoDoc<EstadoOC>[]
  recepciones: RecepcionOC[]
  factura?: string
  creado: Dia
  creadoPor: string
}

export type TipoMovimiento = 'entrada' | 'salida' | 'traspaso' | 'merma' | 'ajuste'

/** Movimiento inmutable de la bodega de obra (08 Bodega, Stock y Movimiento). */
export interface MovimientoStock {
  id: string
  obraId: string
  materialId: string
  fecha: Dia
  tipo: TipoMovimiento
  /** Siempre positiva, salvo en un ajuste (negativa si descuenta). */
  cantidad: number
  /** Costo unitario de la entrada (para valorizar el stock a costo promedio). */
  costoUnitario?: number
  /** Salida: partida que consume. */
  partidaId?: string
  /** Entrada: OC y recepción de origen. */
  ordenCompraId?: string
  recepcionId?: string
  /** Salida que atiende una solicitud de terreno. */
  solicitudId?: string
  /** Traspaso: obra de destino (en la de destino se registra la entrada). */
  obraDestinoId?: string
  motivo?: string
  autor: string
}

export type EstadoSubcontrato = 'borrador' | 'en_acreditacion' | 'vigente' | 'suspendido' | 'terminado' | 'cerrado' | 'resuelto'
export type EstadoEPSub = 'borrador' | 'presentado' | 'validado' | 'aprobado' | 'bloqueado' | 'pagado' | 'rechazado'

/** Partida asignada al subcontrato, con cantidad y precio unitario del subcontrato. */
export interface LineaSubcontrato {
  partidaId: string
  cantidad: number
  pu: number
}

/** Adicional, descuento o multa del subcontrato (KSU-07/08). */
export interface AjusteSubcontrato {
  id: string
  tipo: 'adicional' | 'descuento' | 'multa'
  fecha: Dia
  monto: number
  descripcion: string
}

/** Subcontrato (08, 10 §14): contrato → presupuesto → avance → EP → retenciones → pago. */
export interface Subcontrato {
  id: string
  obraId: string
  numero: number
  /** Documento del contrato (SC-003…); es el del compromiso que lo respalda. */
  codigo: string
  subcontratistaId: string
  descripcion: string
  lineas: LineaSubcontrato[]
  /** Retención de cada EP (fracción); se devuelve al cerrar (RULE-704). */
  retencion: number
  inicio: Dia
  termino: Dia
  ajustes: AjusteSubcontrato[]
  historial: PasoDoc<EstadoSubcontrato>[]
  /** Compromiso de cada partida (partidaId → compromiso): su saldo es compromiso en el control de costos. */
  compromisos: Record<string, string>
  /** Devolución de la retención acumulada (al cierre). */
  retencionDevuelta?: Dia
  creado: Dia
  creadoPor: string
}

/** Estado de pago de un subcontrato (08, 10 §15): cantidades del período por partida. */
export interface EPSubcontrato {
  id: string
  obraId: string
  subcontratoId: string
  numero: number
  fechaCorte: Dia
  lineas: { partidaId: string; cantidad: number }[]
  /** Multas y descuentos que se aplican en este EP. */
  descuentos: number
  historial: PasoDoc<EstadoEPSub>[]
  creado: Dia
  creadoPor: string
}

export type TipoDocLaboral = 'f30' | 'f30_1' | 'contrato' | 'informacion_riesgos' | 'epp'
export type EstadoDocLaboral = 'pendiente' | 'cargado' | 'validado' | 'rechazado' | 'por_vencer' | 'vencido'

/** Trabajador de un subcontratista en la obra (08 Trabajador). */
export interface Trabajador {
  id: string
  obraId: string
  subcontratistaId: string
  rut: string
  nombre: string
  oficio: string
  ingreso: Dia
  salida?: Dia
}

/** Documento laboral (08, 10 §19): de la empresa (F30, F30-1 del período) o de un trabajador. */
export interface DocumentoLaboral {
  id: string
  obraId: string
  subcontratistaId: string
  trabajadorId?: string
  tipo: TipoDocLaboral
  /** Mes al que corresponde (AAAA-MM), para el F30-1. */
  periodo?: string
  vencimiento?: Dia
  archivo?: ArchivoDoc
  historial: PasoDoc<'cargado' | 'validado' | 'rechazado'>[]
  creado: Dia
  creadoPor: string
}

export type CausaImproductiva = 'espera_frente' | 'falta_operador' | 'clima' | 'combustible' | 'otra'

/** Mantención programada de un equipo (KMQ-06). */
export interface Mantencion {
  id: string
  descripcion: string
  programada: Dia
  realizada?: Dia
}

/** Equipo o maquinaria (08 Equipo): propio, arrendado o de subcontratista, con su tarifa. */
export interface Equipo {
  id: string
  codigo: string
  nombre: string
  tipo: string
  propiedad: 'propio' | 'arrendado' | 'subcontratista'
  proveedorId?: string
  /** Tarifa: por hora trabajada, o costo fijo por día o mes (RULE-205 aplica a los de costo fijo). */
  tarifa: { modalidad: 'hora' | 'dia' | 'mes'; monto: number }
  /** Costo hora del presupuesto (KMQ-03). */
  costoHoraPresupuesto?: number
  /** Consumo estándar de combustible en l/h (KMQ-04). */
  consumoEstandar?: number
  obraId?: string
  asignado: Dia
  liberado?: Dia
  mantenciones: Mantencion[]
}

/** Parte diario de maquinaria (08, 10 §29): horas trabajadas por partida, improductivas con causa, mantención y combustible. */
export interface ParteMaquinaria {
  id: string
  obraId: string
  equipoId: string
  fecha: Dia
  operador: string
  horometroInicial: number
  horometroFinal: number
  horasDisponibles: number
  trabajos: { partidaId: string; horas: number }[]
  improductivas: { horas: number; causa: CausaImproductiva }[]
  horasMantencion: number
  combustible: number
  historial: PasoDoc<'enviado' | 'validado' | 'corregido'>[]
  creado: Dia
  creadoPor: string
}

/** Caja chica de obra (08, 10 §17.1): fondo fijo con un responsable. */
export interface CajaChica {
  id: string
  obraId: string
  responsable: string
  fondo: number
  abierta: Dia
  cerrada?: { fecha: Dia; devolucion: number }
}

/** Ítem de una rendición (10 §17.2): gasto con comprobante, imputado a partida o a gastos generales. */
export interface ItemRendicion {
  id: string
  fecha: Dia
  proveedor: string
  comprobante: 'boleta' | 'factura' | 'sin_documento'
  numero?: string
  descripcion: string
  monto: number
  /** Partida o 'GG' (gastos generales); vacío = sin imputar (RULE-401). */
  imputacion: string
  revision?: { estado: 'aprobado' | 'rechazado'; fecha: Dia; por: string; motivo?: string }
}

export type EstadoRendicion = 'borrador' | 'presentada' | 'aprobada'

/** Rendición de la caja chica: se presenta, se revisa ítem por ítem y Finanzas repone el fondo. */
export interface Rendicion {
  id: string
  obraId: string
  cajaId: string
  numero: number
  items: ItemRendicion[]
  historial: PasoDoc<EstadoRendicion>[]
  creado: Dia
  creadoPor: string
}

// --- Calidad (v1.3: 08 dominio 14, 10 §11 y §22) ---
export type EstadoProtocolo = 'pendiente' | 'en_inspeccion' | 'aprobado' | 'rechazado' | 'aprobado_ito'

export interface ItemChecklist {
  texto: string
  ok?: boolean
}

export interface ProtocoloCalidad {
  id: string
  obraId: string
  partidaId: string
  numero: number
  nombre: string
  /** liberación: bloquea el avance de la partida hasta aprobarse (ej.: antes de hormigonar). */
  tipo: 'liberacion' | 'control'
  /** RULE-103: obligatorio para la recepción provisoria. */
  obligatorio: boolean
  /** Requiere V°B° del ITO del mandante. */
  requiereITO: boolean
  /** Cuadrilla o subcontratista que ejecuta el trabajo. */
  responsable: string
  /** Ubicación o tramo inspeccionado (ej.: "Losa piso 3, ejes A–D"). */
  ubicacion: string
  checklist: ItemChecklist[]
  programado: Dia
  observaciones?: string
  /** Reinspección de un protocolo rechazado. */
  reinspeccionDe?: string
  historial: PasoDoc<EstadoProtocolo>[]
  creado: Dia
  creadoPor: string
}

export interface InspeccionCalidad {
  id: string
  obraId: string
  partidaId: string | null
  tipo: 'programada' | 'no_programada'
  programada: Dia
  inspector: string
  /** Fecha en que se realizó y su resultado. */
  realizada?: { fecha: Dia; conforme: boolean; hallazgos: string }
}

export type EstadoNCR = 'abierta' | 'en_correccion' | 'verificada' | 'cerrada' | 'anulada'
export type OrigenNCR = 'protocolo' | 'inspeccion' | 'ito' | 'hallazgo'

export interface NoConformidad {
  id: string
  obraId: string
  partidaId: string
  numero: number
  origen: OrigenNCR
  protocoloId?: string
  inspeccionId?: string
  descripcion: string
  causa?: string
  /** Cuadrilla o subcontratista que corrige. */
  responsable: string
  accionCorrectiva?: string
  /** Plazo de corrección (RULE-112). */
  plazo: Dia
  /** Materiales del retrabajo, consolidados al cerrar (las HH salen de los RDO). */
  costoMateriales?: number
  historial: PasoDoc<EstadoNCR>[]
  creado: Dia
  creadoPor: string
}

// --- Seguridad y salud en el trabajo (v1.3: 08 dominio 15, 10 §18) ---
export type TipoTareaCritica = 'altura' | 'excavacion' | 'izaje' | 'caliente' | 'confinado' | 'electrico'

export interface CharlaSeguridad {
  id: string
  obraId: string
  fecha: Dia
  /** null: charla para toda la obra. */
  cuadrillaId: string | null
  tema: string
  relator: string
  asistentes: number
  creadoPor: string
}

/** Análisis de Riesgo de la Tarea, firmado por la cuadrilla antes de una tarea crítica. */
export interface ART {
  id: string
  obraId: string
  fecha: Dia
  cuadrillaId: string | null
  partidaId: string | null
  tarea: TipoTareaCritica
  descripcion: string
  riesgos: string[]
  medidas: string[]
  /** Trabajadores que firmaron. */
  firmantes: number
  responsable: string
  creadoPor: string
}

export interface InspeccionSeguridad {
  id: string
  obraId: string
  programada: Dia
  inspector: string
  realizada?: { fecha: Dia; cumplimiento: number; hallazgos: string }
}

export interface ObservacionPreventiva {
  id: string
  obraId: string
  fecha: Dia
  tipo: 'conducta' | 'condicion'
  /** Conducta o condición segura (refuerzo positivo) o insegura (requiere corrección). */
  segura: boolean
  descripcion: string
  responsable: string
  plazo: Dia
  cerrada?: Dia
  creadoPor: string
}

export type TipoIncidente = 'cuasi' | 'sin_tiempo_perdido' | 'con_tiempo_perdido' | 'grave' | 'fatal' | 'danio_material' | 'enfermedad'
export type EstadoIncidente = 'reportado' | 'clasificado' | 'en_investigacion' | 'medidas_en_curso' | 'cerrado'

export interface Incidente {
  id: string
  obraId: string
  numero: number
  fecha: Dia
  tipo: TipoIncidente
  descripcion: string
  lugar: string
  /** Trabajador afectado (dato sensible: solo Prevención y Gerencia, RN-P08). */
  afectado?: string
  /** Empresa del afectado: la constructora o el subcontratista. */
  empresa: string
  diasPerdidos?: number
  /** Potencial de un cuasi accidente (los de bajo potencial se cierran sin investigación). */
  potencial?: 'bajo' | 'alto'
  causas?: string
  /** RULE-802: denuncia (DIAT) y protocolo legal de accidentes graves o fatales. */
  protocolo?: { diat?: Dia; suspension?: Dia; avisoInspeccion?: Dia; avisoSeremi?: Dia; reanudacion?: Dia }
  historial: PasoDoc<EstadoIncidente>[]
  creado: Dia
  creadoPor: string
}

export interface MedidaCorrectiva {
  id: string
  obraId: string
  origen: { tipo: 'incidente' | 'inspeccion' | 'observacion'; id: string }
  descripcion: string
  responsable: string
  plazo: Dia
  cumplida?: { fecha: Dia; evidencia: string; por: string }
  creado: Dia
  creadoPor: string
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
  /** HH de retrabajo (v1.3): corrección de la no conformidad indicada; se imputan a su partida. */
  ncrId?: string
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

export type OrigenCosto = 'importacion' | 'manual' | 'recepcion' | 'ep_subcontrato' | 'parte_maquinaria' | 'rendicion'

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
    /** RN-P04: el administrador de obra aprueba OC hasta este monto en UF; sobre él, Gerencia. */
    limiteOcUf?: number
    /** RULE-303: sobre este monto en UF se exigen 3 cotizaciones o una justificación. */
    cotizacionesUf?: number
    /** RN-P04: el administrador de obra firma subcontratos hasta este monto en UF; sobre él, Gerencia. */
    limiteSubcontratoUf?: number
    /** RN-P04: el administrador de obra aprueba ítems de rendición hasta este monto en UF. */
    limiteRendicionUf?: number
    /** RULE-801: el RDO no se envía sin la charla del día (si es false, solo alerta). */
    charlaObligatoria?: boolean
    /** KSE-01: meta de tasa de frecuencia (accidentes CTP por millón de HH). */
    metaIF?: number
  }
  /** Valor de la UF en pesos para los umbrales expresados en UF. */
  valorUF?: number
  metodoEAC: 'cpi' | 'presupuesto' | 'cpi_spi'
  /** Provisionar costo de subcontratos según avance validado. */
  devengarSubcontratos: boolean
  diasHabiles: number[]
}
