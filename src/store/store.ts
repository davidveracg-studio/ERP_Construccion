import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { condicionesDe } from '../domain/caja'
import { AVANCE_MINIMO_RECEPCION, estadoObraPorRecepcion, estadoRecepcion, recepcionProvisoria } from '../domain/contrato'
import { accionesEP, aplicarAccion, editable, lineasEP, recalcularEP, type AccionEP } from '../domain/estadosPago'
import {
  accionesOC, aplicarAccionOC, aplicarAprobacion, editableOC, partidasNuevas, requiereGerencia, type AccionOC,
} from '../domain/ordenesCambio'
import { calcularCPM } from '../domain/cpm'
import { COLECCIONES, datosVacios, programaDe, type Datos } from '../domain/datos'
import { calcularObra } from '../domain/evm'
import { hoy } from '../domain/fechas'
import { uid } from '../domain/formato'
import { cerrarPeriodo, periodosDe } from '../domain/periodos'
import { aplicarAccionRiesgo, accionesRiesgo, puedeCrearRiesgo, type AccionRiesgo, type DatosAccionRiesgo } from '../domain/riesgos'
import {
  accionesRFI, accionesSubmittal, aplicarAccionRFI, aplicarAccionSubmittal, emisorFolio, estadoRFI, estadoSubmittal, nuevaRevisionSubmittal,
  puedeConfirmarTerreno, puedeCrearRFI, puedeCrearSubmittal, puedePublicarDocumento, revisionVigente, type AccionRFI, type AccionSubmittal,
} from '../domain/documental'
import {
  accionesTarea, aplicarAccionTarea, estadoTarea, puedeGestionarRestricciones, puedePlanificar, replanificar, type AccionTarea,
} from '../domain/lastPlanner'
import {
  accionesOC as accionesCompra, aplicarAccionOC as aplicarAccionCompra, codigoOC, estadoOC as estadoCompra, puedeComprar, puedeEditarCatalogo,
  puedeEditarProveedores, puedeRechazarSolicitud, puedeRecibir, puedeSolicitar, registrarRecepcion, type AccionOC as AccionCompra,
} from '../domain/compras'
import { puedeMoverStock, stockMaterial, validarSalida } from '../domain/bodega'
import {
  accionesEPSub, accionesSub, aplicarAccionEPSub, aplicarAccionSub, estadoEPSub, estadoSub, puPartida, puedeCrearSubcontrato, puedeEditarSubcontratistas,
  sugerirLineas, type AccionEPSub, type AccionSub,
} from '../domain/subcontratos'
import { acreditacion, f301Vigente, puedeCargarDocumentos, puedeRevisarDocumentos, subcontratistaDeR10 } from '../domain/cumplimiento'
import { accionesParte, costoParte, erroresParte, estadoParte, puedeEditarEquipos, puedeRegistrarParte, type AccionParte } from '../domain/maquinaria'
import {
  accionesNCR, accionesProtocolo, ESTADO_POR_ACCION, ESTADO_POR_ACCION_NCR, estadoProtocolo, PLAZO_NCR, protocolosFaltantes, puedeCrearNCR, puedeCrearProtocolo,
  puedeProgramarInspeccion, validarAccionProtocolo, type AccionNCR, type AccionProtocolo,
} from '../domain/calidad'
import {
  accionesIncidente, ESTADO_POR_ACCION_INC, puedeART, puedeCharla, puedeCumplirMedida, puedeGestionarSST, puedeMarcarCritica, puedeObservar, puedeReportarIncidente,
  validarAccionIncidente, type AccionIncidente,
} from '../domain/seguridad'
import {
  accionesPropuesta, clienteObservado, estadoLead, estadoPropuesta, margenBajo, puCostoLinea, puedeComercial, puedeVisita, totalesPropuesta, type AccionPropuesta,
} from '../domain/comercial'
import { accionesPostventa, inicioGarantia, puedeIngresarPostventa, responsableDe, type AccionPostventa } from '../domain/postventa'
import { codigoDTE, conIVA, estadoDTE, puedeAnularConNC, puedeFacturar, puedeTesoreria, siguienteFolio } from '../domain/finanzas'
import { abiertaCaja, estadoRendicion, puedeAdministrarCaja, puedeRendir, puedeRevisarItem, saldoCaja } from '../domain/cajaChica'
import { generarDemo } from '../domain/seed'
import { modoNube } from '../lib/supabase'
import type {
  AccionCorrectiva, Actividad, AjusteForecast, Compromiso, CondicionesPago, Config, CostoReal, Cuadrilla, Dia, EstadoAccion,
  EstadoPago, Garantia, Modelo4D, Obligacion, Obra, OrdenCambio, Partida, RecepcionObra, Programa, RDO, ReglaMapeo, Riesgo, Rol, TipoRecurso, Documento, RevisionDocumento, RFI, Submittal, Folio, TareaSemanal, Restriccion, CausaNoCumplimiento, Proveedor, Material, SolicitudMaterial, OrdenCompra, LineaOC, MovimientoStock, TipoMovimiento, Subcontrato, EPSubcontrato, AjusteSubcontrato, Trabajador, DocumentoLaboral, Equipo, ParteMaquinaria, CajaChica, ItemRendicion, ProtocoloCalidad, NoConformidad, InspeccionCalidad,
  CharlaSeguridad, ART, InspeccionSeguridad, ObservacionPreventiva, Incidente, MedidaCorrectiva, TipoTareaCritica, DocumentoTributario,
  Cliente, Lead, VisitaTecnica, Propuesta, EstadoLead, SolicitudPostventa,
} from '../domain/types'

export interface UI {
  rol: Rol
  obraId: string
  usuario: string
}

export const USUARIOS: Record<Rol, string> = {
  R01: 'Gerencia',
  R02: 'Carolina Vega',
  R03: 'Juan Soto',
  R04: 'Luis Pérez',
  R05: 'Andrés Muñoz',
  R06: 'Daniela Fuentes',
  R07: 'Patricia Lagos',
  R08: 'Marcela Ríos',
  R09: 'Lorena Castro',
  R10: 'Sergio Pizarro (Eléctrica Norte)',
  R11: 'ITO del mandante',
}

export interface Acciones {
  setRol: (r: Rol) => void
  setObra: (id: string) => void
  reiniciarDemo: () => void
  /** Reemplaza todos los datos (carga desde el servidor o cambios de otros usuarios). */
  cargarDatos: (d: Partial<Datos>) => void
  setSesion: (rol: Rol, usuario: string) => void
  guardarRDO: (r: RDO) => void
  validarRDO: (id: string) => void
  rechazarRDO: (id: string, motivo: string) => void
  agregarCostos: (items: CostoReal[]) => void
  asignarCosto: (id: string, partidaId: string | null, tipo: CostoReal['tipo'], regla?: Omit<ReglaMapeo, 'id'>) => void
  agregarCompromisos: (items: Compromiso[]) => void
  ajustarForecast: (a: Omit<AjusteForecast, 'id' | 'estado' | 'fecha' | 'autor'>) => AjusteForecast['estado']
  resolverAjuste: (id: string, aprobado: boolean) => void
  actualizarActividad: (actId: string, cambios: Partial<Pick<Actividad, 'inicioReal' | 'finReal' | 'avanceManual'>>) => void
  solicitarRebaseline: (motivo: string) => void
  resolverRebaseline: (programaId: string, aprobado: boolean) => void
  cerrarPeriodo: (fecha: Dia) => { nuevas: number; resueltas: number }
  reconocerAlerta: (id: string) => void
  descartarAlerta: (id: string, motivo: string) => void
  agregarAccion: (alertaId: string, a: Omit<AccionCorrectiva, 'id' | 'estado'>) => void
  cambiarEstadoAccion: (alertaId: string, accionId: string, estado: EstadoAccion) => void
  actualizarConfig: (c: Partial<Omit<Config, 'umbrales'>> & { umbrales?: Partial<Config['umbrales']> }) => void
  crearObra: (o: Obra, partidas: Partida[], actividades: Actividad[], cuadrillas: Cuadrilla[]) => void
  reemplazarPartidas: (obraId: string, partidas: Partida[]) => void
  cargarPrograma: (obraId: string, actividades: Actividad[]) => void
  /** Guarda el modelo 4D de la obra; undefined vuelve al modelo inferido del programa. */
  guardarModelo4D: (obraId: string, modelo: Modelo4D | undefined) => void
  /** Genera un EP en borrador con el avance validado no cobrado hasta el corte (null si no hay avance). */
  generarEstadoPago: (obraId: string, fechaCorte: Dia, indiceReajuste?: number) => EstadoPago | null
  /** Edita la cubicación, el índice de reajuste o los descuentos de un EP en borrador u observado. */
  editarEstadoPago: (id: string, cambios: Partial<Pick<EstadoPago, 'lineas' | 'descuentos' | 'indiceReajuste'>>) => void
  /** Aplica una acción del ciclo del EP; devuelve el motivo si no se pudo. */
  accionEstadoPago: (id: string, accion: AccionEP, datos?: { texto?: string; factura?: string; monto?: number; fecha?: Dia }) => string | null
  guardarCondicionesPago: (obraId: string, c: CondicionesPago) => void
  crearOrdenCambio: (obraId: string, datos: Pick<OrdenCambio, 'tipo' | 'titulo' | 'causa' | 'descripcion'>) => OrdenCambio
  /** Edita una orden en borrador. */
  editarOrdenCambio: (id: string, cambios: Partial<Pick<OrdenCambio, 'tipo' | 'titulo' | 'causa' | 'descripcion' | 'lineas' | 'diasPlazo'>>) => void
  /** Aplica una acción del ciclo y sus efectos sobre partidas y plazo; devuelve el motivo si no se pudo. */
  accionOrdenCambio: (id: string, accion: AccionOC, datos?: { texto?: string }) => string | null
  crearObligacion: (o: Omit<Obligacion, 'id' | 'creada'>) => void
  cumplirObligacion: (id: string, fecha: Dia, evidencia?: string) => void
  eliminarObligacion: (id: string) => void
  registrarGarantia: (g: Omit<Garantia, 'id' | 'creada'>) => void
  /** Registra la garantía que renueva a otra (la anterior queda "renovada"). */
  renovarGarantia: (id: string, nueva: Pick<Garantia, 'numero' | 'emisor' | 'monto' | 'emision' | 'vencimiento'>) => void
  cerrarGarantia: (id: string, como: 'devuelta' | 'cobrada', fecha: Dia) => void
  /** Registra una recepción y actualiza el estado de la obra; devuelve el motivo si no se pudo. */
  registrarRecepcion: (r: Omit<RecepcionObra, 'id' | 'registradaPor'>) => string | null
  /** Subsanación (R02) o V°B° del mandante (R11) a una observación de la recepción. */
  observacionRecepcion: (recepcionId: string, observacionId: string, accion: 'subsanar' | 'visto_bueno') => void
  /** Identifica un riesgo (con responsable queda en análisis); devuelve su id o el motivo del error. */
  crearRiesgo: (r: Pick<Riesgo, 'obraId' | 'titulo' | 'causa' | 'categoria' | 'partidaIds' | 'responsable'>) => { id?: string; error?: string }
  /** Transición del riesgo (10 §25); devuelve el motivo si no se pudo. */
  accionRiesgo: (id: string, accion: AccionRiesgo, datos?: Omit<DatosAccionRiesgo, 'fecha' | 'autor'>) => string | null
  /** Registra un plano o EETT con su primera revisión. */
  crearDocumento: (d: Pick<Documento, 'obraId' | 'codigo' | 'titulo' | 'tipo' | 'especialidad' | 'partidaIds'>, rev: Pick<RevisionDocumento, 'revision' | 'motivo' | 'archivo'>) => string | null
  /** Publica una revisión nueva: la anterior queda superada. */
  publicarRevision: (id: string, rev: Pick<RevisionDocumento, 'revision' | 'motivo' | 'archivo'>) => string | null
  /** Terreno confirma que recibió y usa la revisión vigente (RULE-905). */
  confirmarTerreno: (id: string) => string | null
  crearRFI: (r: Pick<RFI, 'obraId' | 'asunto' | 'pregunta' | 'disciplina' | 'destinatario' | 'fechaLimite' | 'impacto' | 'partidaIds' | 'documentoId'>) => { id?: string; error?: string }
  editarRFI: (id: string, cambios: Partial<Pick<RFI, 'asunto' | 'pregunta' | 'disciplina' | 'destinatario' | 'fechaLimite' | 'impacto' | 'partidaIds' | 'documentoId'>>) => void
  accionRFI: (id: string, accion: AccionRFI, datos?: { texto?: string; ordenCambioId?: string; riesgoId?: string }) => string | null
  /** Vincula el RFI a la orden de cambio o al riesgo que originó. */
  vincularRFI: (id: string, v: Partial<Pick<RFI, 'ordenCambioId' | 'riesgoId'>>) => void
  crearSubmittal: (s: Pick<Submittal, 'obraId' | 'titulo' | 'tipo' | 'descripcion' | 'proveedor' | 'partidaIds' | 'fechaRequerida'>) => { id?: string; error?: string }
  editarSubmittal: (id: string, cambios: Partial<Pick<Submittal, 'titulo' | 'tipo' | 'descripcion' | 'proveedor' | 'partidaIds' | 'fechaRequerida'>>) => void
  /** Transición del submittal; al rechazarse crea la revisión siguiente en borrador y devuelve su id. */
  accionSubmittal: (id: string, accion: AccionSubmittal, datos?: { texto?: string }) => { error?: string; nuevaRevision?: string }
  /** Agrega un folio al Libro de Obra (inmutable). */
  registrarFolio: (f: Pick<Folio, 'obraId' | 'tipo' | 'texto' | 'plazoRespuesta' | 'respondeA'>) => string | null
  /** Propone una tarea para el plan semanal. */
  crearTarea: (x: Pick<TareaSemanal, 'obraId' | 'semana' | 'descripcion' | 'partidaId' | 'cuadrillaId' | 'responsable' | 'meta' | 'inicio' | 'fin'>) => string | null
  agregarRestriccion: (tareaId: string, r: Omit<Restriccion, 'id' | 'liberada'>) => string | null
  liberarRestriccion: (tareaId: string, restriccionId: string) => string | null
  accionTarea: (id: string, accion: AccionTarea, datos?: { logrado?: number; causa?: CausaNoCumplimiento; nota?: string }) => string | null
  /** Crea en la semana siguiente una tarea con lo que faltó de una no cumplida. */
  replanificarTarea: (id: string) => string | null
  guardarProveedor: (p: Omit<Proveedor, 'id'> & { id?: string }) => string | null
  guardarMaterial: (m: Omit<Material, 'id'> & { id?: string }) => string | null
  crearSolicitud: (x: Pick<SolicitudMaterial, 'obraId' | 'materialId' | 'cantidad' | 'partidaId' | 'fechaRequerida' | 'urgencia' | 'nota'>) => string | null
  rechazarSolicitud: (id: string, motivo: string) => string | null
  /** Crea una OC en borrador (desde solicitudes o directa); devuelve su id o el error. */
  crearOrdenCompra: (oc: Pick<OrdenCompra, 'obraId' | 'proveedorId' | 'fechaEntrega' | 'urgente' | 'cotizaciones' | 'justificacion'> & { lineas: Omit<LineaOC, 'id'>[] }) => { id?: string; error?: string }
  editarOrdenCompra: (id: string, cambios: Partial<Pick<OrdenCompra, 'proveedorId' | 'fechaEntrega' | 'urgente' | 'cotizaciones' | 'justificacion' | 'lineas'>>) => void
  accionOrdenCompra: (id: string, accion: AccionCompra, texto?: string) => string | null
  /** Recepción con guía: suma la cantidad recibida y genera el costo real de cada línea. */
  recibirOrdenCompra: (id: string, r: { guia: string; cantidades: Record<string, number> }) => string | null
  /** Salida a partida, merma, ajuste o traspaso a otra obra (la entrada en destino se registra sola). */
  registrarMovimiento: (m: { obraId: string; materialId: string; tipo: Exclude<TipoMovimiento, 'entrada'>; cantidad: number; partidaId?: string; obraDestinoId?: string; motivo?: string }) => string | null
  /** Atiende una solicitud de terreno con stock de la bodega de obra. */
  despacharSolicitud: (id: string) => string | null
  guardarSubcontratista: (p: Omit<Proveedor, 'id' | 'estado' | 'esSubcontratista'> & { id?: string }) => string | null
  crearSubcontrato: (sc: Pick<Subcontrato, 'obraId' | 'subcontratistaId' | 'descripcion' | 'lineas' | 'retencion' | 'inicio' | 'termino'>) => { id?: string; error?: string }
  editarSubcontrato: (id: string, cambios: Partial<Pick<Subcontrato, 'descripcion' | 'lineas' | 'retencion' | 'inicio' | 'termino'>>) => void
  accionSubcontrato: (id: string, accion: AccionSub, texto?: string) => string | null
  /** Adicional, descuento o multa; los adicionales y descuentos ajustan el compromiso. */
  registrarAjusteSub: (id: string, a: Omit<AjusteSubcontrato, 'id' | 'fecha'>) => string | null
  /** EP del período con las cantidades sugeridas (avance validado − cobrado). */
  crearEPSub: (subcontratoId: string, fechaCorte: number) => { id?: string; error?: string }
  editarEPSub: (id: string, cambios: Partial<Pick<EPSubcontrato, 'lineas' | 'descuentos'>>) => void
  accionEPSub: (id: string, accion: AccionEPSub, texto?: string) => string | null
  registrarTrabajador: (w: Omit<Trabajador, 'id'>) => string | null
  /** Carga (o recarga) un documento laboral: queda por revisar. */
  cargarDocumento: (x: Pick<DocumentoLaboral, 'obraId' | 'subcontratistaId' | 'trabajadorId' | 'tipo' | 'periodo' | 'vencimiento' | 'archivo'>) => string | null
  revisarDocumento: (id: string, resultado: 'validado' | 'rechazado', motivo?: string) => string | null
  guardarEquipo: (e: Omit<Equipo, 'id' | 'mantenciones'> & { id?: string }) => string | null
  programarMantencion: (equipoId: string, descripcion: string, programada: number) => string | null
  realizarMantencion: (equipoId: string, mantencionId: string) => string | null
  /** Parte diario: queda enviado para validación de terreno. */
  registrarParte: (p: Omit<ParteMaquinaria, 'id' | 'historial' | 'creado' | 'creadoPor'>) => string | null
  /** Validar (genera el costo real de equipo por partida) o devolver para corregir. */
  accionParte: (id: string, accion: AccionParte, texto?: string) => string | null
  abrirCajaChica: (c: Pick<CajaChica, 'obraId' | 'responsable' | 'fondo'>) => string | null
  cerrarCajaChica: (id: string) => string | null
  /** Rendición nueva en preparación (una a la vez por caja). */
  crearRendicion: (cajaId: string) => string | null
  agregarItemRendicion: (rendicionId: string, item: Omit<ItemRendicion, 'id' | 'revision'>) => string | null
  quitarItemRendicion: (rendicionId: string, itemId: string) => void
  presentarRendicion: (id: string) => string | null
  revisarItemRendicion: (rendicionId: string, itemId: string, estado: 'aprobado' | 'rechazado', motivo?: string) => string | null
  /** Finanzas repone el fondo por lo aprobado: es costo real de las partidas o de GG. */
  reponerFondo: (id: string) => string | null
  crearProtocolo: (p: Omit<ProtocoloCalidad, 'id' | 'numero' | 'historial' | 'creado' | 'creadoPor'>) => string | null
  marcarChecklist: (id: string, indice: number, ok: boolean) => void
  /** Rechazar abre una NCR y programa la reinspección (RULE-104). */
  accionProtocolo: (id: string, accion: AccionProtocolo, observaciones?: string) => string | null
  crearNCR: (n: Pick<NoConformidad, 'obraId' | 'partidaId' | 'origen' | 'descripcion' | 'responsable' | 'plazo'> & Partial<Pick<NoConformidad, 'inspeccionId' | 'protocoloId'>>) => string | null
  accionNCR: (id: string, accion: AccionNCR, x?: { causa?: string; accionCorrectiva?: string; costoMateriales?: number; texto?: string }) => string | null
  programarInspeccion: (i: Omit<InspeccionCalidad, 'id' | 'realizada'>) => string | null
  /** Si no es conforme abre una NCR por los hallazgos. */
  realizarInspeccion: (id: string, r: { conforme: boolean; hallazgos: string; partidaId?: string; responsable?: string }) => string | null
  registrarCharla: (c: Omit<CharlaSeguridad, 'id' | 'creadoPor'>) => string | null
  registrarART: (a: Omit<ART, 'id' | 'creadoPor'>) => string | null
  programarInspeccionSeg: (i: Omit<InspeccionSeguridad, 'id' | 'realizada'>) => string | null
  realizarInspeccionSeg: (id: string, r: { cumplimiento: number; hallazgos: string }) => string | null
  registrarObservacion: (o: Omit<ObservacionPreventiva, 'id' | 'creadoPor' | 'cerrada'>) => string | null
  cerrarObservacion: (id: string) => string | null
  /** RULE-802: un accidente grave o fatal parte con el protocolo legal pendiente. */
  reportarIncidente: (i: Pick<Incidente, 'obraId' | 'fecha' | 'tipo' | 'descripcion' | 'lugar' | 'empresa'> & { afectado?: string }) => string | null
  accionIncidente: (id: string, accion: AccionIncidente, x?: { tipo?: Incidente['tipo']; potencial?: Incidente['potencial']; diasPerdidos?: number; causas?: string }) => string | null
  pasoProtocolo: (id: string, paso: keyof NonNullable<Incidente['protocolo']>) => string | null
  crearMedida: (m: Omit<MedidaCorrectiva, 'id' | 'creado' | 'creadoPor' | 'cumplida'>) => string | null
  cumplirMedida: (id: string, evidencia: string) => string | null
  marcarTareaCritica: (partidaId: string, tarea: TipoTareaCritica | null) => string | null
  /** Respuesta del SII a un DTE (la integración queda simulada: la registra Finanzas). Un rechazo deja el EP por facturar. */
  respuestaSII: (id: string, aceptado: boolean, motivo?: string) => string | null
  /** Nota de crédito total que anula la factura de un EP aún no cobrado. */
  anularConNotaCredito: (facturaId: string, motivo: string) => string | null
  /** Registra el pago de una factura de proveedor (costo). */
  pagarCosto: (costoId: string) => string | null
  guardarCliente: (c: Omit<Cliente, 'id' | 'creado'> & { id?: string }) => string | null
  crearLead: (l: Pick<Lead, 'clienteId' | 'nombre' | 'origen' | 'lineaNegocio' | 'ubicacion' | 'montoEstimado' | 'fechaCierre'>) => string | null
  /** estudiar (asigna responsable), perder o descartar (RULE-002: motivo obligatorio). */
  accionLead: (id: string, accion: 'estudiar' | 'perder' | 'descartar', x: { responsable?: string; motivo?: string }) => string | null
  agendarVisita: (v: Pick<VisitaTecnica, 'leadId' | 'fecha' | 'responsable'>) => string | null
  cerrarVisita: (id: string, estado: 'realizada' | 'cancelada', notas: string) => string | null
  /** Propuesta nueva en borrador (o versión hija de otra, con su itemizado); devuelve su id o el error. */
  crearPropuesta: (leadId: string, anteriorId?: string) => { id?: string; error?: string }
  editarPropuesta: (id: string, cambios: Partial<Pick<Propuesta, 'lineas' | 'gg' | 'margen' | 'plazoDias' | 'validezHasta' | 'exclusiones'>>) => string | null
  /** Adjudicar crea la obra en planificación con el itemizado como presupuesto. */
  accionPropuesta: (id: string, accion: AccionPropuesta, x?: { texto?: string; motivo?: Propuesta['motivoRechazo']; fechaInicio?: Dia }) => string | null
  /** RULE-503: la solicitud se asigna al subcontratista de la partida (o a la constructora). */
  ingresarPostventa: (s: Pick<SolicitudPostventa, 'obraId' | 'solicitante' | 'ubicacion' | 'descripcion' | 'categoria' | 'partidaId'>) => string | null
  accionPostventa: (id: string, accion: AccionPostventa, x?: { diagnostico?: string; categoria?: SolicitudPostventa['categoria']; motivo?: string; costo?: number; cargoSubcontratista?: boolean }) => string | null
}

export type Estado = Datos & { ui: UI } & Acciones

const idbStorage: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: async (k, v) => set(k, v),
  removeItem: async (k) => del(k),
}

function datosIniciales(): Datos & { ui: UI } {
  // En modo nube se parte vacío: los datos llegan desde Supabase (o desde la caché local de la empresa)
  if (modoNube) return { ...datosVacios(), ui: { rol: 'R01', obraId: '', usuario: '' } }
  const d = generarDemo(hoy())
  return { ...d, ui: { rol: 'R02', obraId: d.obras[0].id, usuario: USUARIOS.R02 } }
}

/** Obra seleccionada válida para el conjunto de obras dado. */
function obraValida(obras: Obra[], id: string) {
  return obras.some((o) => o.id === id) ? id : (obras[0]?.id ?? '')
}

export const useStore = create<Estado>()(
  persist(
    (setS, getS) => {
      const mutar = (f: (s: Estado) => Partial<Estado>) => setS((s) => f(s))
      const obraActual = () => getS().obras.find((o) => o.id === getS().ui.obraId)!

      return {
        ...datosIniciales(),

        setRol: (rol) => mutar((s) => ({ ui: { ...s.ui, rol, usuario: USUARIOS[rol] } })),
        setObra: (obraId) => mutar((s) => ({ ui: { ...s.ui, obraId } })),
        setSesion: (rol, usuario) => mutar((s) => ({ ui: { ...s.ui, rol, usuario } })),
        reiniciarDemo: () =>
          mutar((s) => {
            const d = generarDemo(hoy())
            return { ...d, config: modoNube ? { ...d.config, empresa: s.config.empresa, rut: s.config.rut } : d.config, ui: modoNube ? { ...s.ui, obraId: d.obras[0].id } : { rol: 'R02', obraId: d.obras[0].id, usuario: USUARIOS.R02 } }
          }),
        cargarDatos: (d) => mutar((s) => { const obras = d.obras ?? s.obras; return { ...d, ui: { ...s.ui, obraId: obraValida(obras, s.ui.obraId) } } }),

        guardarRDO: (r) =>
          mutar((s) => ({ rdos: s.rdos.some((x) => x.id === r.id) ? s.rdos.map((x) => (x.id === r.id ? r : x)) : [...s.rdos, r] })),
        validarRDO: (id) =>
          mutar((s) => ({ rdos: s.rdos.map((x) => (x.id === id ? { ...x, estado: 'validado', validadoPor: s.ui.usuario } : x)) })),
        rechazarRDO: (id, motivo) =>
          mutar((s) => ({ rdos: s.rdos.map((x) => (x.id === id ? { ...x, estado: 'rechazado', motivoRechazo: motivo } : x)) })),

        agregarCostos: (items) => mutar((s) => ({ costos: [...s.costos, ...items] })),
        asignarCosto: (id, partidaId, tipo, regla) =>
          mutar((s) => ({
            costos: s.costos.map((c) => (c.id === id ? { ...c, partidaId, tipo } : c)),
            reglasMapeo: regla ? [...s.reglasMapeo, { ...regla, id: uid('rg') }] : s.reglasMapeo,
          })),
        agregarCompromisos: (items) => mutar((s) => ({ compromisos: [...s.compromisos, ...items] })),

        ajustarForecast: (a) => {
          // RN-P11: un ajuste que reduce el EAC de la obra en más de 5% del BAC requiere R01
          const s = getS()
          const c = calcularObra(s, a.obraId, hoy())
          const cp = c.partidas.find((x) => x.p.id === a.partidaId)!
          const reduccion = cp.etc - a.etc
          const estado: AjusteForecast['estado'] = reduccion > 0.05 * c.bac && s.ui.rol !== 'R01' ? 'pendiente_r01' : 'aprobado'
          mutar((st) => ({ ajustes: [...st.ajustes, { ...a, id: uid('aj'), estado, fecha: hoy(), autor: st.ui.usuario }] }))
          return estado
        },
        resolverAjuste: (id, aprobado) =>
          mutar((s) => ({ ajustes: s.ajustes.map((x) => (x.id === id ? { ...x, estado: aprobado ? 'aprobado' : 'rechazado' } : x)) })),

        actualizarActividad: (actId, cambios) =>
          mutar((s) => {
            const prog = programaDe(s, s.ui.obraId, 'actualizado')
            if (!prog) return {}
            return {
              programas: s.programas.map((p) =>
                p.id === prog.id ? { ...p, actividades: p.actividades.map((a) => (a.id === actId ? { ...a, ...cambios } : a)) } : p,
              ),
            }
          }),

        solicitarRebaseline: (motivo) =>
          mutar((s) => {
            const o = obraActual()
            const act = programaDe(s, o.id, 'actualizado')
            const lb = programaDe(s, o.id, 'lineaBase')
            if (!act || !lb) return {}
            const c = calcularObra(s, o.id, hoy())
            const r = calcularCPM(act.actividades, o.fechaInicio, { usarReales: true, hoy: hoy(), avance: c.avanceAct })
            const nuevas = act.actividades.map((a) => ({ ...a, inicio: r.get(a.id)!.es, fin: r.get(a.id)!.ef }))
            const nuevo: Programa = {
              id: uid('prog'), obraId: o.id, tipo: 'lineaBase', version: lb.version + 1, estado: 'en_aprobacion',
              motivo, creadoPor: s.ui.usuario, fecha: hoy(), actividades: nuevas,
            }
            return { programas: [...s.programas.filter((p) => !(p.obraId === o.id && p.tipo === 'lineaBase' && p.estado === 'en_aprobacion')), nuevo] }
          }),
        resolverRebaseline: (programaId, aprobado) =>
          mutar((s) => {
            const nuevo = s.programas.find((p) => p.id === programaId)
            if (!nuevo) return {}
            if (!aprobado) return { programas: s.programas.filter((p) => p.id !== programaId) }
            return {
              programas: s.programas.map((p) =>
                p.id === programaId ? { ...p, estado: 'vigente', fecha: hoy() }
                  : p.obraId === nuevo.obraId && p.tipo === 'lineaBase' && p.estado === 'vigente' ? { ...p, estado: 'reemplazado' }
                    : p,
              ),
            }
          }),

        cerrarPeriodo: (fecha) => {
          const s = getS()
          const r = cerrarPeriodo(s, s.ui.obraId, fecha, s.ui.usuario, hoy())
          setS({ periodos: [...s.periodos, r.periodo], alertas: r.alertas })
          return { nuevas: r.nuevas, resueltas: r.resueltas }
        },

        reconocerAlerta: (id) =>
          mutar((s) => ({ alertas: s.alertas.map((a) => (a.id === id && a.estado === 'activa' ? { ...a, estado: 'reconocida' } : a)) })),
        descartarAlerta: (id, motivo) =>
          mutar((s) => ({ alertas: s.alertas.map((a) => (a.id === id ? { ...a, estado: 'descartada', motivoDescarte: motivo } : a)) })),
        agregarAccion: (alertaId, acc) =>
          mutar((s) => ({
            alertas: s.alertas.map((a) =>
              a.id === alertaId ? { ...a, estado: 'en_accion', acciones: [...a.acciones, { ...acc, id: uid('acc'), estado: 'pendiente' }] } : a,
            ),
          })),
        cambiarEstadoAccion: (alertaId, accionId, estado) =>
          mutar((s) => {
            const n = periodosDe(s, s.ui.obraId).at(-1)?.numero ?? 0
            return {
              alertas: s.alertas.map((a) =>
                a.id === alertaId
                  ? { ...a, acciones: a.acciones.map((x) => (x.id === accionId ? { ...x, estado, completadaEnPeriodo: estado === 'completada' ? n : x.completadaEnPeriodo } : x)) }
                  : a,
              ),
            }
          }),

        actualizarConfig: (c) =>
          mutar((s) => ({ config: { ...s.config, ...c, umbrales: { ...s.config.umbrales, ...(c.umbrales ?? {}) } } })),

        crearObra: (o, partidas, actividades, cuadrillas) =>
          mutar((s) => {
            const progs: Programa[] = actividades.length
              ? (['contractual', 'lineaBase', 'actualizado'] as const).map((tipo) => ({
                  id: uid('prog'), obraId: o.id, tipo, version: 1, estado: 'vigente' as const,
                  creadoPor: s.ui.usuario, fecha: hoy(), actividades, motivo: tipo === 'lineaBase' ? 'Línea base inicial' : undefined,
                }))
              : []
            return {
              obras: [...s.obras, o], partidas: [...s.partidas, ...partidas], programas: [...s.programas, ...progs],
              cuadrillas: [...s.cuadrillas, ...cuadrillas], ui: { ...s.ui, obraId: o.id },
            }
          }),
        reemplazarPartidas: (obraId, partidas) =>
          mutar((s) => ({ partidas: [...s.partidas.filter((p) => p.obraId !== obraId), ...partidas] })),
        cargarPrograma: (obraId, actividades) =>
          mutar((s) => {
            const tiene = s.programas.some((p) => p.obraId === obraId)
            if (!tiene) {
              const progs = (['contractual', 'lineaBase', 'actualizado'] as const).map((tipo) => ({
                id: uid('prog'), obraId, tipo, version: 1, estado: 'vigente' as const, creadoPor: s.ui.usuario, fecha: hoy(), actividades,
              }))
              return { programas: [...s.programas, ...progs] }
            }
            // Ya existe: se propone como nueva línea base (requiere aprobación, 10 §23)
            const lb = programaDe(s, obraId, 'lineaBase')
            return {
              programas: [
                ...s.programas.filter((p) => !(p.obraId === obraId && p.tipo === 'lineaBase' && p.estado === 'en_aprobacion')),
                { id: uid('prog'), obraId, tipo: 'lineaBase', version: (lb?.version ?? 0) + 1, estado: 'en_aprobacion', motivo: 'Programa importado', creadoPor: s.ui.usuario, fecha: hoy(), actividades },
              ],
            }
          }),
        guardarModelo4D: (obraId, modelo) =>
          mutar((s) => ({ obras: s.obras.map((o) => (o.id === obraId ? { ...o, modelo4d: modelo } : o)) })),

        generarEstadoPago: (obraId, fechaCorte, indiceReajuste) => {
          const s = getS()
          const obra = s.obras.find((o) => o.id === obraId)
          const lineas = lineasEP(s, obraId, fechaCorte)
          if (!obra || lineas.length === 0) return null
          const propios = s.estadosPago.filter((e) => e.obraId === obraId)
          const base: EstadoPago = {
            id: uid('ep'), obraId, numero: Math.max(0, ...propios.map((e) => e.numero)) + 1, tipo: 'avance', fechaCorte, version: 1,
            lineas, bruto: 0, indiceReajuste, reajuste: 0, descuentos: [], retencion: 0, amortizacion: 0, neto: 0,
            creado: Math.max(fechaCorte, hoy()), presentaciones: [], observaciones: [], pagos: [],
          }
          const ep = recalcularEP(base, condicionesDe(obra), propios)
          mutar((x) => ({ estadosPago: [...x.estadosPago, ep] }))
          return ep
        },
        editarEstadoPago: (id, cambios) =>
          mutar((s) => ({
            estadosPago: s.estadosPago.map((e) => {
              if (e.id !== id || !editable(e, hoy())) return e
              const obra = s.obras.find((o) => o.id === e.obraId)
              return recalcularEP({ ...e, ...cambios }, condicionesDe(obra ?? {}), s.estadosPago.filter((x) => x.obraId === e.obraId))
            }),
          })),
        accionEstadoPago: (id, accion, datos = {}) => {
          const s = getS()
          const ep = s.estadosPago.find((e) => e.id === id)
          if (!ep) return 'El estado de pago no existe.'
          if (!accionesEP(ep, hoy(), s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esta acción en esta etapa.'
          try {
            const obra = s.obras.find((o) => o.id === ep.obraId)
            const fecha = datos.fecha ?? hoy()
            // v1.3: facturar emite la factura electrónica (DTE) con el folio siguiente
            const dte: DocumentoTributario | null = accion === 'facturar' ? {
              id: uid('dte'), obraId: ep.obraId, tipo: 'factura', folio: siguienteFolio(s.documentosTributarios, 'factura'), fecha, receptor: obra?.mandante ?? '', epId: ep.id,
              ...conIVA(ep.neto), glosa: `${ep.tipo === 'anticipo' ? 'Anticipo' : `Estado de pago N° ${ep.numero}`} · ${obra?.nombre ?? ''}`, historial: [{ fecha, estado: 'emitido', por: s.ui.usuario }], creado: fecha, creadoPor: s.ui.usuario,
            } : null
            const nuevo = aplicarAccion(ep, accion, { autor: s.ui.usuario, ...datos, fecha, ...(dte ? { factura: codigoDTE(dte) } : {}) }, condicionesDe(obra ?? {}))
            mutar((x) => ({ estadosPago: x.estadosPago.map((e) => (e.id === id ? nuevo : e)), ...(dte ? { documentosTributarios: [...x.documentosTributarios, dte] } : {}) }))
            return null
          } catch (e) {
            return e instanceof Error ? e.message : String(e)
          }
        },
        crearOrdenCambio: (obraId, datos) => {
          const propias = getS().ordenesCambio.filter((o) => o.obraId === obraId)
          const oc: OrdenCambio = {
            id: uid('oc'), obraId, numero: Math.max(0, ...propias.map((o) => o.numero)) + 1, ...datos,
            lineas: [], diasPlazo: 0, creada: hoy(), devoluciones: [],
          }
          mutar((x) => ({ ordenesCambio: [...x.ordenesCambio, oc] }))
          return oc
        },
        editarOrdenCambio: (id, cambios) =>
          mutar((s) => ({ ordenesCambio: s.ordenesCambio.map((o) => (o.id === id && editableOC(o, hoy()) ? { ...o, ...cambios } : o)) })),
        accionOrdenCambio: (id, accion, datos = {}) => {
          const s = getS()
          const oc = s.ordenesCambio.find((o) => o.id === id)
          if (!oc) return 'La orden de cambio no existe.'
          const t = hoy()
          const venta = calcularObra(s, oc.obraId, t).venta
          if (!accionesOC(oc, t, s.ui.rol, venta).includes(accion))
            return accion === 'aprobar_interna' && requiereGerencia(oc, venta) ? 'Supera el 5 % del contrato: la aprueba Gerencia (R01).' : 'Tu rol no puede hacer esta acción en esta etapa.'
          try {
            const nueva = aplicarAccionOC(oc, accion, { fecha: t, autor: s.ui.usuario, texto: datos.texto })
            mutar((x) => {
              const ordenesCambio = x.ordenesCambio.map((o) => (o.id === id ? nueva : o))
              // Al aprobarla internamente se crean las partidas extraordinarias (terreno ya puede reportarlas)
              if (accion === 'aprobar_interna') {
                const existentes = new Set(x.partidas.map((p) => p.id))
                return { ordenesCambio, partidas: [...x.partidas, ...partidasNuevas(nueva).filter((p) => !existentes.has(p.id))] }
              }
              // Al aprobarla el mandante se ajustan cantidades vigentes y plazo del contrato
              if (accion === 'aprobar_mandante') {
                const obra = x.obras.find((o) => o.id === oc.obraId)!
                const ejecutado = new Map<string, number>()
                for (const r of x.rdos) if (r.obraId === oc.obraId && r.estado === 'validado') for (const a of r.avances) ejecutado.set(a.partidaId, (ejecutado.get(a.partidaId) ?? 0) + a.cantidad)
                const efecto = aplicarAprobacion(x.partidas, obra, nueva, t, ejecutado)
                return { ordenesCambio, partidas: efecto.partidas, obras: x.obras.map((o) => (o.id === obra.id ? efecto.obra : o)) }
              }
              // Anulada sin trabajo: se quitan sus partidas extraordinarias
              if (accion === 'anular') {
                const conAvance = new Set(x.rdos.flatMap((r) => r.avances.map((a) => a.partidaId)))
                const conCosto = new Set(x.costos.map((k) => k.partidaId))
                return { ordenesCambio, partidas: x.partidas.filter((p) => p.ordenCambioId !== id || conAvance.has(p.id) || conCosto.has(p.id)) }
              }
              return { ordenesCambio }
            })
            return null
          } catch (e) {
            return e instanceof Error ? e.message : String(e)
          }
        },
        crearObligacion: (o) => mutar((s) => ({ obligaciones: [...s.obligaciones, { ...o, id: uid('ob'), creada: hoy() }] })),
        cumplirObligacion: (id, fecha, evidencia) =>
          mutar((s) => ({ obligaciones: s.obligaciones.map((o) => (o.id === id ? { ...o, cumplida: fecha, evidencia } : o)) })),
        eliminarObligacion: (id) => mutar((s) => ({ obligaciones: s.obligaciones.filter((o) => o.id !== id) })),
        registrarGarantia: (g) => mutar((s) => ({ garantias: [...s.garantias, { ...g, id: uid('ga'), creada: hoy() }] })),
        renovarGarantia: (id, nueva) =>
          mutar((s) => {
            const g = s.garantias.find((x) => x.id === id)
            if (!g) return {}
            return { garantias: [...s.garantias, { ...g, ...nueva, id: uid('ga'), reemplazaA: id, devuelta: undefined, cobrada: undefined, creada: hoy() }] }
          }),
        cerrarGarantia: (id, como, fecha) =>
          mutar((s) => ({ garantias: s.garantias.map((g) => (g.id === id ? { ...g, [como]: fecha } : g)) })),
        registrarRecepcion: (r) => {
          const s = getS()
          const t = hoy()
          if (r.tipo === 'provisoria' && r.resultado === 'recibida' && calcularObra(s, r.obraId, t).avanceReal < AVANCE_MINIMO_RECEPCION)
            return 'La obra aún no está terminada: la recepción provisoria requiere el 100 % de avance.'
          if (r.tipo === 'provisoria' && r.resultado === 'recibida') {
            const faltan = protocolosFaltantes(s, r.obraId, t)
            if (faltan.length) return `RULE-103: faltan protocolos obligatorios aprobados (${faltan.slice(0, 4).map((p) => `N° ${p.numero} ${p.nombre}`).join('; ')}${faltan.length > 4 ? '…' : ''}).`
          }
          if (r.tipo === 'definitiva') {
            const prov = recepcionProvisoria(s.recepciones, r.obraId, t)
            if (!prov) return 'Primero debe registrarse la recepción provisoria.'
            if (estadoRecepcion(prov, t) !== 'provisoria_sin_observaciones') return 'Quedan observaciones de la recepción provisoria sin cerrar.'
          }
          mutar((x) => {
            const recepciones = [...x.recepciones, { ...r, id: uid('rc'), registradaPor: x.ui.usuario }]
            return { recepciones, obras: x.obras.map((o) => (o.id === r.obraId ? { ...o, estado: estadoObraPorRecepcion(recepciones, o.id, Infinity, o.estado) } : o)) }
          })
          return null
        },
        observacionRecepcion: (recepcionId, observacionId, accion) =>
          mutar((s) => {
            const t = hoy()
            const recepciones = s.recepciones.map((r) => (r.id !== recepcionId ? r : {
              ...r, observaciones: r.observaciones.map((o) => (o.id !== observacionId ? o : accion === 'subsanar' ? { ...o, subsanada: t } : { ...o, vistoBueno: t, subsanada: o.subsanada ?? t })),
            }))
            const r = recepciones.find((x) => x.id === recepcionId)!
            return { recepciones, obras: s.obras.map((o) => (o.id === r.obraId ? { ...o, estado: estadoObraPorRecepcion(recepciones, o.id, Infinity, o.estado) } : o)) }
          }),
        crearRiesgo: (r) => {
          const s = getS()
          if (!puedeCrearRiesgo(s.ui.rol)) return { error: 'Tu rol no puede registrar riesgos.' }
          if (!r.titulo.trim() || !r.causa.trim()) return { error: 'Indica el riesgo y su causa.' }
          const t = hoy()
          const id = uid('rs')
          const numero = Math.max(0, ...s.riesgos.filter((x) => x.obraId === r.obraId).map((x) => x.numero)) + 1
          const responsable = r.responsable?.trim() || undefined
          const nuevo: Riesgo = {
            ...r, id, numero, titulo: r.titulo.trim(), causa: r.causa.trim(), responsable, origen: 'manual', evaluaciones: [], plan: [],
            historial: [{ fecha: t, estado: 'identificado', por: s.ui.usuario }, ...(responsable ? [{ fecha: t, estado: 'en_analisis' as const, por: s.ui.usuario }] : [])],
            creado: t, creadoPor: s.ui.usuario,
          }
          mutar((x) => ({ riesgos: [...x.riesgos, nuevo] }))
          return { id }
        },
        accionRiesgo: (id, accion, datos = {}) => {
          const s = getS()
          const r = s.riesgos.find((x) => x.id === id)
          if (!r) return 'El riesgo no existe.'
          const t = hoy()
          if (!accionesRiesgo(r, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esta acción en este estado.'
          try {
            const nuevo = aplicarAccionRiesgo(r, accion, { ...datos, fecha: t, autor: s.ui.usuario })
            mutar((x) => ({ riesgos: x.riesgos.map((y) => (y.id === id ? nuevo : y)) }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        crearDocumento: (doc, rev) => {
          const s = getS()
          if (!puedePublicarDocumento(s.ui.rol)) return 'Tu rol no puede publicar documentos.'
          if (!doc.codigo.trim() || !doc.titulo.trim() || !rev.revision.trim()) return 'Indica código, título y revisión.'
          if (s.documentos.some((x) => x.obraId === doc.obraId && x.codigo.toLowerCase() === doc.codigo.trim().toLowerCase())) return `Ya existe el documento ${doc.codigo.trim()}.`
          const t = hoy()
          const nuevo: Documento = {
            ...doc, id: uid('doc'), codigo: doc.codigo.trim(), titulo: doc.titulo.trim(), creado: t,
            revisiones: [{ ...rev, id: uid('rev'), revision: rev.revision.trim(), fecha: t, publicadaPor: s.ui.usuario }],
          }
          mutar((x) => ({ documentos: [...x.documentos, nuevo] }))
          return null
        },
        publicarRevision: (id, rev) => {
          const s = getS()
          const doc = s.documentos.find((x) => x.id === id)
          if (!doc) return 'El documento no existe.'
          if (!puedePublicarDocumento(s.ui.rol)) return 'Tu rol no puede publicar revisiones.'
          const r = rev.revision.trim()
          if (!r) return 'Indica la revisión.'
          if (doc.revisiones.some((x) => x.revision.toLowerCase() === r.toLowerCase())) return `La revisión ${r} ya existe.`
          const t = hoy()
          mutar((x) => ({ documentos: x.documentos.map((d) => (d.id === id ? { ...d, revisiones: [...d.revisiones, { ...rev, id: uid('rev'), revision: r, fecha: t, publicadaPor: s.ui.usuario }] } : d)) }))
          return null
        },
        confirmarTerreno: (id) => {
          const s = getS()
          const doc = s.documentos.find((x) => x.id === id)
          if (!doc) return 'El documento no existe.'
          if (!puedeConfirmarTerreno(s.ui.rol)) return 'La recepción en terreno la confirma el jefe de terreno o el administrador.'
          const t = hoy()
          const vig = revisionVigente(doc, t)!
          mutar((x) => ({ documentos: x.documentos.map((d) => (d.id === id ? { ...d, enTerreno: { revisionId: vig.id, fecha: t, por: s.ui.usuario } } : d)) }))
          return null
        },
        crearRFI: (r) => {
          const s = getS()
          if (!puedeCrearRFI(s.ui.rol)) return { error: 'Tu rol no puede emitir RFI.' }
          if (!r.asunto.trim()) return { error: 'Indica el asunto.' }
          const t = hoy()
          const id = uid('rfi')
          const numero = Math.max(0, ...s.rfis.filter((x) => x.obraId === r.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ rfis: [...x.rfis, { ...r, id, numero, asunto: r.asunto.trim(), historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return { id }
        },
        editarRFI: (id, cambios) =>
          mutar((s) => ({ rfis: s.rfis.map((r) => (r.id === id && estadoRFI(r, hoy()) === 'borrador' ? { ...r, ...cambios } : r)) })),
        accionRFI: (id, accion, datos = {}) => {
          const s = getS()
          const r = s.rfis.find((x) => x.id === id)
          if (!r) return 'El RFI no existe.'
          const t = hoy()
          if (!accionesRFI(r, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esta acción en este estado.'
          try {
            const nuevo = aplicarAccionRFI(r, accion, { ...datos, fecha: t, autor: s.ui.usuario })
            mutar((x) => ({ rfis: x.rfis.map((y) => (y.id === id ? nuevo : y)) }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        vincularRFI: (id, v) => mutar((s) => ({ rfis: s.rfis.map((r) => (r.id === id ? { ...r, ...v } : r)) })),
        crearSubmittal: (sub) => {
          const s = getS()
          if (!puedeCrearSubmittal(s.ui.rol)) return { error: 'Tu rol no puede crear submittals.' }
          if (!sub.titulo.trim()) return { error: 'Indica qué se somete a aprobación.' }
          const t = hoy()
          const id = uid('sub')
          const numero = Math.max(0, ...s.submittals.filter((x) => x.obraId === sub.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ submittals: [...x.submittals, { ...sub, id, numero, revision: 0, titulo: sub.titulo.trim(), historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return { id }
        },
        editarSubmittal: (id, cambios) =>
          mutar((s) => ({ submittals: s.submittals.map((x) => (x.id === id && estadoSubmittal(x, hoy()) === 'borrador' ? { ...x, ...cambios } : x)) })),
        accionSubmittal: (id, accion, datos = {}) => {
          const s = getS()
          const sub = s.submittals.find((x) => x.id === id)
          if (!sub) return { error: 'El submittal no existe.' }
          const t = hoy()
          if (!accionesSubmittal(sub, t, s.ui.rol).includes(accion)) return { error: 'Tu rol no puede hacer esta acción en este estado.' }
          try {
            const nuevo = aplicarAccionSubmittal(sub, accion, { ...datos, fecha: t, autor: s.ui.usuario })
            const siguiente = accion === 'rechazar' ? nuevaRevisionSubmittal(nuevo, uid('sub'), t, s.ui.usuario) : null
            mutar((x) => ({ submittals: [...x.submittals.map((y) => (y.id === id ? nuevo : y)), ...(siguiente ? [siguiente] : [])] }))
            return { nuevaRevision: siguiente?.id }
          } catch (e) {
            return { error: (e as Error).message }
          }
        },
        registrarFolio: (f) => {
          const s = getS()
          const emisor = emisorFolio(s.ui.rol)
          if (!emisor) return 'Firman el Libro de Obra el ITO, el administrador de obra y el jefe de terreno.'
          if (!f.texto.trim()) return 'Escribe la anotación.'
          const t = hoy()
          if (f.plazoRespuesta != null && f.plazoRespuesta <= t) return 'El plazo de respuesta debe ser posterior a hoy.'
          const numero = Math.max(0, ...s.folios.filter((x) => x.obraId === f.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ folios: [...x.folios, { ...f, id: uid('fol'), numero, fecha: t, autor: s.ui.usuario, emisor, texto: f.texto.trim() }] }))
          return null
        },
        crearTarea: (x) => {
          const s = getS()
          if (!puedePlanificar(s.ui.rol)) return 'Planifican el jefe de terreno y el administrador de obra.'
          if (!x.descripcion.trim() || !x.responsable.trim()) return 'Indica la tarea y el responsable.'
          if (!(x.meta > 0)) return 'Indica la meta de la semana.'
          if (x.fin < x.inicio) return 'El término no puede ser anterior al inicio.'
          if (x.inicio < x.semana || x.fin > x.semana + 6) return 'Las fechas deben quedar dentro de la semana.'
          mutar((st) => ({ tareasSemanales: [...st.tareasSemanales, { ...x, id: uid('ts'), descripcion: x.descripcion.trim(), restricciones: [], historial: [], creado: hoy(), creadoPor: s.ui.usuario }] }))
          return null
        },
        agregarRestriccion: (tareaId, r) => {
          const s = getS()
          const x = s.tareasSemanales.find((y) => y.id === tareaId)
          if (!x) return 'La tarea no existe.'
          if (!puedeGestionarRestricciones(s.ui.rol)) return 'Tu rol no puede registrar restricciones.'
          if (!['propuesta', 'comprometida'].includes(estadoTarea(x, hoy()) ?? '')) return 'Solo se agregan restricciones a tareas por iniciar.'
          if (!r.descripcion.trim() || !r.responsable.trim()) return 'Indica la restricción y quién la libera.'
          mutar((st) => ({ tareasSemanales: st.tareasSemanales.map((y) => (y.id === tareaId ? { ...y, restricciones: [...y.restricciones, { ...r, id: uid('rx'), descripcion: r.descripcion.trim() }] } : y)) }))
          return null
        },
        liberarRestriccion: (tareaId, restriccionId) => {
          const s = getS()
          if (!puedeGestionarRestricciones(s.ui.rol)) return 'Tu rol no puede liberar restricciones.'
          const t = hoy()
          mutar((st) => ({
            tareasSemanales: st.tareasSemanales.map((y) => (y.id !== tareaId ? y : { ...y, restricciones: y.restricciones.map((r) => (r.id === restriccionId ? { ...r, liberada: t } : r)) })),
          }))
          return null
        },
        accionTarea: (id, accion, datos = {}) => {
          const s = getS()
          const x = s.tareasSemanales.find((y) => y.id === id)
          if (!x) return 'La tarea no existe.'
          const t = hoy()
          if (!accionesTarea(x, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esta acción en este estado.'
          try {
            const nueva = aplicarAccionTarea(x, accion, { ...datos, fecha: t, autor: s.ui.usuario, ctx: { rfis: s.rfis, submittals: s.submittals } })
            mutar((st) => ({ tareasSemanales: st.tareasSemanales.map((y) => (y.id === id ? nueva : y)) }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        replanificarTarea: (id) => {
          const s = getS()
          const x = s.tareasSemanales.find((y) => y.id === id)
          if (!x || estadoTarea(x, hoy()) !== 'no_cumplida') return 'Solo se replanifica una tarea no cumplida.'
          if (!puedePlanificar(s.ui.rol)) return 'Planifican el jefe de terreno y el administrador de obra.'
          if (s.tareasSemanales.some((y) => y.reemplazaA === id)) return 'Esta tarea ya se replanificó.'
          const nueva = replanificar(x, uid('ts'), hoy(), s.ui.usuario)
          mutar((st) => ({ tareasSemanales: [...st.tareasSemanales, nueva] }))
          return null
        },
        guardarProveedor: (p) => {
          const s = getS()
          if (!puedeEditarProveedores(s.ui.rol)) return 'Los proveedores los mantiene Bodega y Adquisiciones.'
          if (!p.nombre.trim() || !p.rut.trim()) return 'Indica nombre y RUT.'
          if (p.estado === 'bloqueado' && !p.motivoBloqueo?.trim()) return 'Indica el motivo del bloqueo.'
          const id = p.id ?? uid('prov')
          mutar((x) => ({ proveedores: p.id ? x.proveedores.map((y) => (y.id === p.id ? { ...p, id } : y)) : [...x.proveedores, { ...p, id }] }))
          return null
        },
        guardarMaterial: (m) => {
          const s = getS()
          if (!puedeEditarCatalogo(s.ui.rol)) return 'El catálogo lo mantienen Bodega y Oficina Técnica.'
          if (!m.codigo.trim() || !m.nombre.trim() || !m.unidad.trim()) return 'Indica código, nombre y unidad.'
          if (s.materiales.some((y) => y.id !== m.id && y.codigo.toLowerCase() === m.codigo.trim().toLowerCase())) return `Ya existe el código ${m.codigo.trim()}.`
          const id = m.id ?? uid('mat')
          mutar((x) => ({ materiales: m.id ? x.materiales.map((y) => (y.id === m.id ? { ...m, id } : y)) : [...x.materiales, { ...m, id }] }))
          return null
        },
        crearSolicitud: (sol) => {
          const s = getS()
          if (!puedeSolicitar(s.ui.rol)) return 'Solicitan material el jefe de terreno y los capataces.'
          if (!(sol.cantidad > 0)) return 'Indica la cantidad.'
          const t = hoy()
          if (sol.fechaRequerida < t) return 'La fecha requerida no puede estar en el pasado.'
          const numero = Math.max(0, ...s.solicitudesMaterial.filter((x) => x.obraId === sol.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ solicitudesMaterial: [...x.solicitudesMaterial, { ...sol, id: uid('sm'), numero, historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return null
        },
        rechazarSolicitud: (id, motivo) => {
          const s = getS()
          if (!puedeRechazarSolicitud(s.ui.rol)) return 'Tu rol no puede rechazar solicitudes.'
          if (!motivo.trim()) return 'Indica el motivo.'
          const t = hoy()
          mutar((x) => ({ solicitudesMaterial: x.solicitudesMaterial.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: 'rechazada' as const, por: s.ui.usuario, texto: motivo.trim() }] } : y)) }))
          return null
        },
        crearOrdenCompra: (oc) => {
          const s = getS()
          if (!puedeComprar(s.ui.rol)) return { error: 'Las órdenes de compra las emite Bodega y Adquisiciones.' }
          const prov = s.proveedores.find((p) => p.id === oc.proveedorId)
          if (!prov) return { error: 'Elige el proveedor.' }
          if (prov.estado !== 'activo') return { error: `RULE-302: el proveedor está ${prov.estado}${prov.motivoBloqueo ? ` (${prov.motivoBloqueo})` : ''}.` }
          if (oc.lineas.length === 0) return { error: 'Agrega al menos una línea.' }
          const t = hoy()
          const id = uid('oc')
          const numero = Math.max(0, ...s.ordenesCompra.map((x) => x.numero)) + 1
          const lineas = oc.lineas.map((l) => ({ ...l, id: uid('lo') }))
          const solicitudes = new Set(lineas.map((l) => l.solicitudId).filter(Boolean))
          mutar((x) => ({
            ordenesCompra: [...x.ordenesCompra, { ...oc, id, numero, lineas, historial: [], recepciones: [], creado: t, creadoPor: s.ui.usuario }],
            solicitudesMaterial: x.solicitudesMaterial.map((y) => (solicitudes.has(y.id) ? { ...y, ordenCompraId: id, historial: [...y.historial, { fecha: t, estado: 'en_compra' as const, por: s.ui.usuario }] } : y)),
          }))
          return { id }
        },
        editarOrdenCompra: (id, cambios) =>
          mutar((s) => ({ ordenesCompra: s.ordenesCompra.map((o) => (o.id === id && estadoCompra(o, hoy()) === 'borrador' ? { ...o, ...cambios } : o)) })),
        accionOrdenCompra: (id, accion, texto) => {
          const s = getS()
          const oc = s.ordenesCompra.find((x) => x.id === id)
          if (!oc) return 'La orden de compra no existe.'
          const t = hoy()
          if (!accionesCompra(oc, t, s.ui.rol, s.config).includes(accion))
            return accion === 'aprobar' && s.ui.rol === 'R02' ? 'Supera tu límite de aprobación o está fuera de presupuesto: la aprueba Gerencia (R01).' : 'Tu rol no puede hacer esta acción en este estado.'
          try {
            const c = accion === 'enviar_aprobacion' ? calcularObra(s, oc.obraId, t) : null
            const saldoPartida = (pid: string) => { const cp = c?.partidas.find((p) => p.p.id === pid); return cp ? cp.bac - cp.ac - cp.comprometido : Infinity }
            const nueva = aplicarAccionCompra(oc, accion, { fecha: t, autor: s.ui.usuario, texto, proveedor: s.proveedores.find((p) => p.id === oc.proveedorId), cfg: s.config, saldoPartida })
            mutar((x) => ({ ordenesCompra: x.ordenesCompra.map((y) => (y.id === id ? nueva : y)) }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        recibirOrdenCompra: (id, r) => {
          const s = getS()
          const oc = s.ordenesCompra.find((x) => x.id === id)
          if (!oc) return 'La orden de compra no existe.'
          const t = hoy()
          if (!puedeRecibir(oc, t, s.ui.rol)) return 'Reciben Bodega o el jefe de terreno, con la OC enviada al proveedor.'
          try {
            const nueva = registrarRecepcion(oc, { id: uid('rec'), fecha: t, guia: r.guia, cantidades: r.cantidades, recibidoPor: s.ui.usuario })
            const rec = nueva.recepciones.at(-1)!
            const prov = s.proveedores.find((p) => p.id === oc.proveedorId)
            const costos = Object.entries(rec.cantidades).map(([lid, q]) => {
              const l = oc.lineas.find((x) => x.id === lid)!
              const mat = s.materiales.find((m) => m.id === l.materialId)
              return {
                id: uid('co'), obraId: oc.obraId, fecha: t, partidaId: l.partidaId, tipo: 'MAT' as const, cantidad: q, precio: l.precio, monto: Math.round(q * l.precio),
                descripcion: `${mat?.nombre ?? 'Material'} (${codigoOC(oc)})`, proveedor: prov?.nombre, documento: `${codigoOC(oc)} · guía ${rec.guia}`, origen: 'recepcion' as const,
              }
            })
            const entradas: MovimientoStock[] = Object.entries(rec.cantidades).map(([lid, q]) => {
              const l = oc.lineas.find((x) => x.id === lid)!
              return { id: uid('mv'), obraId: oc.obraId, materialId: l.materialId, fecha: t, tipo: 'entrada', cantidad: q, costoUnitario: l.precio, ordenCompraId: oc.id, recepcionId: rec.id, motivo: `${codigoOC(oc)} · guía ${rec.guia}`, autor: s.ui.usuario }
            })
            mutar((x) => ({ ordenesCompra: x.ordenesCompra.map((y) => (y.id === id ? nueva : y)), costos: [...x.costos, ...costos], movimientosStock: [...x.movimientosStock, ...entradas] }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        registrarMovimiento: (m) => {
          const s = getS()
          if (!puedeMoverStock(s.ui.rol)) return 'Los movimientos de bodega los registra Bodega y Adquisiciones.'
          if (m.tipo === 'ajuste' ? m.cantidad === 0 : !(m.cantidad > 0)) return 'Indica la cantidad.'
          if (m.tipo === 'salida' && !m.partidaId) return 'Indica la partida que consume el material.'
          if ((m.tipo === 'merma' || m.tipo === 'ajuste') && !m.motivo?.trim()) return 'Indica el motivo.'
          if (m.tipo === 'traspaso' && (!m.obraDestinoId || m.obraDestinoId === m.obraId)) return 'Elige la obra de destino.'
          const t = hoy()
          const sale = m.tipo === 'ajuste' ? Math.max(0, -m.cantidad) : m.cantidad
          if (sale > 0) {
            const err = validarSalida(s.movimientosStock, m.obraId, m.materialId, sale, t, s.obras.map((o) => o.id).filter((o) => o !== m.obraId))
            if (err) return err
          }
          const mov: MovimientoStock = { ...m, id: uid('mv'), fecha: t, motivo: m.motivo?.trim() || undefined, autor: s.ui.usuario }
          const nuevos = [mov]
          if (m.tipo === 'traspaso') {
            const origen = s.obras.find((o) => o.id === m.obraId)
            nuevos.push({
              id: uid('mv'), obraId: m.obraDestinoId!, materialId: m.materialId, fecha: t, tipo: 'entrada', cantidad: m.cantidad,
              costoUnitario: stockMaterial(s.movimientosStock, m.obraId, m.materialId, t).costoPromedio, motivo: `Traspaso desde ${origen?.nombre ?? 'otra obra'}`, autor: s.ui.usuario,
            })
          }
          mutar((x) => ({ movimientosStock: [...x.movimientosStock, ...nuevos] }))
          return null
        },
        despacharSolicitud: (id) => {
          const s = getS()
          const sol = s.solicitudesMaterial.find((x) => x.id === id)
          if (!sol) return 'La solicitud no existe.'
          if (!puedeMoverStock(s.ui.rol)) return 'Despacha Bodega y Adquisiciones.'
          const t = hoy()
          const err = validarSalida(s.movimientosStock, sol.obraId, sol.materialId, sol.cantidad, t, s.obras.map((o) => o.id).filter((o) => o !== sol.obraId))
          if (err) return err
          mutar((x) => ({
            movimientosStock: [...x.movimientosStock, { id: uid('mv'), obraId: sol.obraId, materialId: sol.materialId, fecha: t, tipo: 'salida', cantidad: sol.cantidad, partidaId: sol.partidaId, solicitudId: sol.id, motivo: `Solicitud N° ${sol.numero}`, autor: s.ui.usuario }],
            solicitudesMaterial: x.solicitudesMaterial.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: 'atendida_bodega' as const, por: s.ui.usuario }] } : y)),
          }))
          return null
        },
        guardarSubcontratista: (p) => {
          const s = getS()
          if (!puedeEditarSubcontratistas(s.ui.rol)) return 'Los subcontratistas los registran Gerencia o el administrador de obra.'
          if (!p.nombre.trim() || !p.rut.trim()) return 'Indica nombre y RUT.'
          const existente = s.proveedores.find((x) => x.id === p.id || x.rut.replace(/\W/g, '') === p.rut.replace(/\W/g, ''))
          if (existente) {
            mutar((x) => ({ proveedores: x.proveedores.map((y) => (y.id === existente.id ? { ...y, ...p, id: existente.id, esSubcontratista: true } : y)) }))
          } else {
            mutar((x) => ({ proveedores: [...x.proveedores, { ...p, id: uid('prov'), estado: 'activo', esSubcontratista: true }] }))
          }
          return null
        },
        crearSubcontrato: (sc) => {
          const s = getS()
          if (!puedeCrearSubcontrato(s.ui.rol)) return { error: 'Tu rol no puede crear subcontratos.' }
          if (!sc.subcontratistaId) return { error: 'Elige el subcontratista.' }
          if (sc.lineas.length === 0) return { error: 'Asigna al menos una partida.' }
          const t = hoy()
          const id = uid('sc')
          const propios = s.subcontratos.filter((x) => x.obraId === sc.obraId)
          const numero = Math.max(0, ...propios.map((x) => x.numero)) + 1
          const codigo = `SC-${String(900 + numero).padStart(3, '0')}`
          mutar((x) => ({ subcontratos: [...x.subcontratos, { ...sc, id, numero, codigo, ajustes: [], historial: [], compromisos: {}, creado: t, creadoPor: s.ui.usuario }] }))
          return { id }
        },
        editarSubcontrato: (id, cambios) =>
          mutar((s) => ({ subcontratos: s.subcontratos.map((x) => (x.id === id && estadoSub(x, hoy()) === 'borrador' ? { ...x, ...cambios } : x)) })),
        accionSubcontrato: (id, accion, texto) => {
          const s = getS()
          const sc = s.subcontratos.find((x) => x.id === id)
          if (!sc) return 'El subcontrato no existe.'
          const t = hoy()
          if (!accionesSub(sc, t, s.ui.rol, s.config).includes(accion))
            return accion === 'firmar' && s.ui.rol === 'R02' ? 'Supera el límite de 500 UF del administrador de obra: lo firma Gerencia (R01).' : 'Tu rol no puede hacer esta acción en este estado.'
          if (accion === 'acreditar') {
            const a = acreditacion(sc, s.trabajadores, s.documentosLaborales, t)
            if (!a.ok) return `RULE-702: falta documentación de ingreso (F30 ${a.f30 === 'validado' || a.f30 === 'por_vencer' ? 'vigente' : 'no vigente'}; ${a.acreditados} de ${a.trabajadores} trabajadores acreditados).`
          }
          try {
            let nuevo = aplicarAccionSub(sc, accion, { fecha: t, autor: s.ui.usuario, texto, eps: s.epsSubcontrato, rdos: s.rdos })
            // Al firmar, el saldo de cada partida queda comprometido (si no venía de un compromiso importado)
            const nuevosComp: Compromiso[] = []
            if (accion === 'firmar') {
              const prov = s.proveedores.find((p) => p.id === sc.subcontratistaId)
              const mapa = { ...sc.compromisos }
              for (const l of sc.lineas) {
                if (mapa[l.partidaId]) continue
                const k: Compromiso = {
                  id: `${sc.id}_${l.partidaId}`, obraId: sc.obraId, partidaId: l.partidaId, tipo: 'SUB', descripcion: `Subcontrato ${sc.descripcion}`,
                  proveedor: prov?.nombre, documento: sc.codigo, monto: Math.round(l.cantidad * l.pu), fecha: t,
                }
                nuevosComp.push(k)
                mapa[l.partidaId] = k.id
              }
              nuevo = { ...nuevo, compromisos: mapa }
            }
            mutar((x) => ({ subcontratos: x.subcontratos.map((y) => (y.id === id ? nuevo : y)), compromisos: [...x.compromisos, ...nuevosComp] }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        registrarAjusteSub: (id, a) => {
          const s = getS()
          const sc = s.subcontratos.find((x) => x.id === id)
          if (!sc) return 'El subcontrato no existe.'
          if (s.ui.rol !== 'R02' && s.ui.rol !== 'R01') return 'Los ajustes los registra el administrador de obra.'
          if (!(a.monto > 0) || !a.descripcion.trim()) return 'Indica monto y descripción.'
          const t = hoy()
          // El adicional o descuento cambia el monto vigente: ajusta el compromiso de la primera partida
          const kid = sc.compromisos[sc.lineas[0]?.partidaId]
          const delta = a.tipo === 'adicional' ? a.monto : a.tipo === 'descuento' ? -a.monto : 0
          mutar((x) => ({
            subcontratos: x.subcontratos.map((y) => (y.id === id ? { ...y, ajustes: [...y.ajustes, { ...a, id: uid('aj'), fecha: t, descripcion: a.descripcion.trim() }] } : y)),
            compromisos: delta && kid ? x.compromisos.map((k) => (k.id === kid ? { ...k, monto: k.monto + delta } : k)) : x.compromisos,
          }))
          return null
        },
        crearEPSub: (subcontratoId, fechaCorte) => {
          const s = getS()
          const sc = s.subcontratos.find((x) => x.id === subcontratoId)
          if (!sc) return { error: 'El subcontrato no existe.' }
          const propio = s.ui.rol === 'R10' && subcontratistaDeR10(s.proveedores)?.id === sc.subcontratistaId
          if (s.ui.rol !== 'R02' && !propio) return { error: 'El EP lo prepara el administrador de obra (o el subcontratista desde su portal).' }
          const t = hoy()
          if (fechaCorte > t) return { error: 'El corte no puede ser futuro.' }
          const lineas = sugerirLineas(sc, s.epsSubcontrato, s.rdos, fechaCorte, t)
          if (lineas.length === 0) return { error: 'No hay avance validado por cobrar a esa fecha.' }
          const id = uid('eps')
          const numero = Math.max(0, ...s.epsSubcontrato.filter((e) => e.subcontratoId === subcontratoId).map((e) => e.numero)) + 1
          mutar((x) => ({ epsSubcontrato: [...x.epsSubcontrato, { id, obraId: sc.obraId, subcontratoId, numero, fechaCorte, lineas, descuentos: 0, historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return { id }
        },
        editarEPSub: (id, cambios) =>
          mutar((s) => ({ epsSubcontrato: s.epsSubcontrato.map((e) => (e.id === id && estadoEPSub(e, hoy()) === 'borrador' ? { ...e, ...cambios } : e)) })),
        accionEPSub: (id, accion, texto) => {
          const s = getS()
          const ep = s.epsSubcontrato.find((x) => x.id === id)
          const sc = ep && s.subcontratos.find((x) => x.id === ep.subcontratoId)
          if (!ep || !sc) return 'El estado de pago no existe.'
          const t = hoy()
          if (!accionesEPSub(ep, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esta acción en este estado.'
          if (s.ui.rol === 'R10' && subcontratistaDeR10(s.proveedores)?.id !== sc.subcontratistaId) return 'Solo puedes presentar los EP de tus subcontratos.'
          // RULE-701 se revisa también al pagar: la documentación puede vencer entre la aprobación y el pago
          if (accion === 'pagar' && !f301Vigente(s.documentosLaborales, sc.obraId, sc.subcontratistaId, ep.fechaCorte, t))
            return 'RULE-701: falta el F30-1 validado del período: el pago queda bloqueado hasta que se cargue y valide.'
          try {
            const nuevo = aplicarAccionEPSub(ep, accion, { fecha: t, autor: s.ui.usuario, texto, eps: s.epsSubcontrato, rdos: s.rdos, sc })
            // Al aprobarse, el EP es costo real de sus partidas (contra el compromiso del subcontrato)
            const prov = s.proveedores.find((p) => p.id === sc.subcontratistaId)
            const costos = accion !== 'aprobar' ? [] : ep.lineas.filter((l) => l.cantidad > 0).map((l) => ({
              id: uid('co'), obraId: ep.obraId, fecha: t, partidaId: l.partidaId, tipo: 'SUB' as const, cantidad: l.cantidad, precio: puPartida(sc, l.partidaId),
              monto: Math.round(l.cantidad * puPartida(sc, l.partidaId)), descripcion: `EP N° ${ep.numero} ${sc.descripcion}`, proveedor: prov?.nombre,
              documento: `${sc.codigo} · EP ${ep.numero}`, compromisoId: sc.compromisos[l.partidaId], origen: 'ep_subcontrato' as const,
            }))
            mutar((x) => ({ epsSubcontrato: x.epsSubcontrato.map((y) => (y.id === id ? nuevo : y)), costos: [...x.costos, ...costos] }))
            return null
          } catch (e) {
            return (e as Error).message
          }
        },
        registrarTrabajador: (w) => {
          const s = getS()
          const propio = s.ui.rol === 'R10' && subcontratistaDeR10(s.proveedores)?.id === w.subcontratistaId
          if (s.ui.rol !== 'R02' && !propio) return 'Registran trabajadores el administrador de obra o el propio subcontratista.'
          if (!w.rut.trim() || !w.nombre.trim() || !w.oficio.trim()) return 'Indica RUT, nombre y oficio.'
          if (s.trabajadores.some((x) => x.obraId === w.obraId && x.rut.replace(/\W/g, '') === w.rut.replace(/\W/g, '') && x.salida == null)) return 'Ese trabajador ya está registrado en la obra.'
          mutar((x) => ({ trabajadores: [...x.trabajadores, { ...w, id: uid('tr'), rut: w.rut.trim(), nombre: w.nombre.trim(), oficio: w.oficio.trim() }] }))
          return null
        },
        cargarDocumento: (doc) => {
          const s = getS()
          if (!puedeCargarDocumentos(s.ui.rol)) return 'Cargan documentos el subcontratista o el administrador de obra.'
          if (s.ui.rol === 'R10' && subcontratistaDeR10(s.proveedores)?.id !== doc.subcontratistaId) return 'Solo puedes cargar documentos de tu empresa.'
          if (doc.tipo === 'f30_1' && !doc.periodo) return 'Indica el mes del F30-1.'
          const t = hoy()
          mutar((x) => ({ documentosLaborales: [...x.documentosLaborales, { ...doc, id: uid('dl'), historial: [{ fecha: t, estado: 'cargado' as const, por: s.ui.usuario }], creado: t, creadoPor: s.ui.usuario }] }))
          return null
        },
        revisarDocumento: (id, resultado, motivo) => {
          const s = getS()
          if (!puedeRevisarDocumentos(s.ui.rol)) return 'Revisa la documentación el administrador de obra (o Prevención).'
          if (resultado === 'rechazado' && !motivo?.trim()) return 'Indica el motivo del rechazo.'
          const t = hoy()
          mutar((x) => ({ documentosLaborales: x.documentosLaborales.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: resultado, por: s.ui.usuario, ...(motivo?.trim() ? { texto: motivo.trim() } : {}) }] } : y)) }))
          return null
        },
        guardarEquipo: (e) => {
          const s = getS()
          if (!puedeEditarEquipos(s.ui.rol)) return 'Los equipos los administra Bodega y Adquisiciones.'
          if (!e.codigo.trim() || !e.nombre.trim()) return 'Indica código y nombre.'
          if (!(e.tarifa.monto > 0)) return 'Indica la tarifa.'
          if (e.id) mutar((x) => ({ equipos: x.equipos.map((y) => (y.id === e.id ? { ...y, ...e, id: y.id } : y)) }))
          else mutar((x) => ({ equipos: [...x.equipos, { ...e, id: uid('eq'), mantenciones: [] }] }))
          return null
        },
        programarMantencion: (equipoId, descripcion, programada) => {
          const s = getS()
          if (!puedeEditarEquipos(s.ui.rol) && s.ui.rol !== 'R03') return 'Programan mantenciones Bodega o el jefe de terreno.'
          if (!descripcion.trim()) return 'Indica la mantención.'
          mutar((x) => ({ equipos: x.equipos.map((y) => (y.id === equipoId ? { ...y, mantenciones: [...y.mantenciones, { id: uid('mt'), descripcion: descripcion.trim(), programada }] } : y)) }))
          return null
        },
        realizarMantencion: (equipoId, mantencionId) => {
          const s = getS()
          if (!puedeEditarEquipos(s.ui.rol) && s.ui.rol !== 'R03') return 'Registran mantenciones Bodega o el jefe de terreno.'
          const t = hoy()
          mutar((x) => ({ equipos: x.equipos.map((y) => (y.id !== equipoId ? y : { ...y, mantenciones: y.mantenciones.map((m) => (m.id === mantencionId ? { ...m, realizada: t } : m)) })) }))
          return null
        },
        registrarParte: (p) => {
          const s = getS()
          if (!puedeRegistrarParte(s.ui.rol)) return 'Registran partes el jefe de terreno o el capataz.'
          const err = erroresParte(p)
          if (err) return err
          if (p.trabajos.some((x) => x.horas > 0 && !x.partidaId)) return 'Imputa las horas trabajadas a una partida.'
          if (s.partesMaquinaria.some((x) => x.equipoId === p.equipoId && x.fecha === p.fecha)) return 'Ya hay un parte de ese equipo en esa fecha.'
          const t = hoy()
          mutar((x) => ({ partesMaquinaria: [...x.partesMaquinaria, { ...p, id: uid('pm'), historial: [{ fecha: t, estado: 'enviado' as const, por: s.ui.usuario }], creado: t, creadoPor: s.ui.usuario }] }))
          return null
        },
        accionParte: (id, accion, texto) => {
          const s = getS()
          const p = s.partesMaquinaria.find((x) => x.id === id)
          const eq = p && s.equipos.find((e) => e.id === p.equipoId)
          if (!p || !eq) return 'El parte no existe.'
          const t = hoy()
          if (!accionesParte(p, t, s.ui.rol).includes(accion)) return 'Valida los partes el jefe de terreno.'
          if (accion === 'corregir' && !texto?.trim()) return 'Indica qué hay que corregir.'
          if (accion === 'validar' && estadoParte(p, t) === 'corregido') return 'El parte está devuelto para corrección.'
          const paso = { fecha: t, estado: accion === 'validar' ? 'validado' as const : 'corregido' as const, por: s.ui.usuario, ...(texto?.trim() ? { texto: texto.trim() } : {}) }
          const costos = accion !== 'validar' ? [] : costoParte(p, eq).map((x) => ({
            id: uid('co'), obraId: p.obraId, fecha: p.fecha, partidaId: x.partidaId, tipo: 'EQ' as const, cantidad: x.horas, precio: Math.round(x.monto / x.horas),
            monto: x.monto, descripcion: `${eq.nombre} (${eq.codigo})`, documento: `Parte ${eq.codigo} ${p.fecha}`, origen: 'parte_maquinaria' as const,
          }))
          mutar((x) => ({ partesMaquinaria: x.partesMaquinaria.map((y) => (y.id === id ? { ...y, historial: [...y.historial, paso] } : y)), costos: [...x.costos, ...costos] }))
          return null
        },
        abrirCajaChica: (c) => {
          const s = getS()
          if (!puedeAdministrarCaja(s.ui.rol)) return 'La caja chica la abre Finanzas.'
          if (!(c.fondo > 0) || !c.responsable.trim()) return 'Indica fondo y responsable.'
          const t = hoy()
          if (s.cajasChicas.some((x) => x.obraId === c.obraId && abiertaCaja(x, t))) return 'La obra ya tiene una caja chica abierta.'
          mutar((x) => ({ cajasChicas: [...x.cajasChicas, { ...c, id: uid('cc'), responsable: c.responsable.trim(), abierta: t }] }))
          return null
        },
        cerrarCajaChica: (id) => {
          const s = getS()
          const caja = s.cajasChicas.find((x) => x.id === id)
          if (!caja) return 'La caja no existe.'
          if (!puedeAdministrarCaja(s.ui.rol)) return 'La caja chica la cierra Finanzas.'
          const t = hoy()
          if (s.rendiciones.some((r) => r.cajaId === id && estadoRendicion(r, t) !== 'aprobada')) return 'Hay rendiciones pendientes: repón o rechaza antes de cerrar.'
          mutar((x) => ({ cajasChicas: x.cajasChicas.map((y) => (y.id === id ? { ...y, cerrada: { fecha: t, devolucion: saldoCaja(caja, x.rendiciones, t).saldo } } : y)) }))
          return null
        },
        crearRendicion: (cajaId) => {
          const s = getS()
          const caja = s.cajasChicas.find((x) => x.id === cajaId)
          if (!caja) return 'La caja no existe.'
          if (!puedeRendir(s.ui.rol)) return 'Rinde el responsable de la caja (administrador o jefe de terreno).'
          const t = hoy()
          if (s.rendiciones.some((r) => r.cajaId === cajaId && estadoRendicion(r, t) === 'borrador')) return 'Ya hay una rendición en preparación.'
          const numero = Math.max(0, ...s.rendiciones.filter((r) => r.cajaId === cajaId).map((r) => r.numero)) + 1
          mutar((x) => ({ rendiciones: [...x.rendiciones, { id: uid('rd'), obraId: caja.obraId, cajaId, numero, items: [], historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return null
        },
        agregarItemRendicion: (rendicionId, item) => {
          const s = getS()
          const r = s.rendiciones.find((x) => x.id === rendicionId)
          if (!r || estadoRendicion(r, hoy()) !== 'borrador') return 'La rendición ya fue presentada.'
          if (!puedeRendir(s.ui.rol)) return 'Rinde el responsable de la caja.'
          if (!(item.monto > 0) || !item.descripcion.trim()) return 'Indica descripción y monto.'
          mutar((x) => ({ rendiciones: x.rendiciones.map((y) => (y.id === rendicionId ? { ...y, items: [...y.items, { ...item, id: uid('it'), descripcion: item.descripcion.trim(), proveedor: item.proveedor.trim() }] } : y)) }))
          return null
        },
        quitarItemRendicion: (rendicionId, itemId) =>
          mutar((s) => ({ rendiciones: s.rendiciones.map((y) => (y.id === rendicionId && estadoRendicion(y, hoy()) === 'borrador' ? { ...y, items: y.items.filter((i) => i.id !== itemId) } : y)) })),
        presentarRendicion: (id) => {
          const s = getS()
          const r = s.rendiciones.find((x) => x.id === id)
          if (!r || estadoRendicion(r, hoy()) !== 'borrador') return 'La rendición no está en preparación.'
          if (!puedeRendir(s.ui.rol)) return 'Presenta el responsable de la caja.'
          if (!r.items.length) return 'Agrega al menos un gasto.'
          const t = hoy()
          mutar((x) => ({ rendiciones: x.rendiciones.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: 'presentada' as const, por: s.ui.usuario }] } : y)) }))
          return null
        },
        revisarItemRendicion: (rendicionId, itemId, estado, motivo) => {
          const s = getS()
          const r = s.rendiciones.find((x) => x.id === rendicionId)
          const item = r?.items.find((i) => i.id === itemId)
          if (!r || !item || estadoRendicion(r, hoy()) !== 'presentada') return 'La rendición no está presentada.'
          if (!puedeRevisarItem(s.ui.rol, item, s.config)) return 'Sobre 10 UF por ítem lo aprueba Finanzas o Gerencia (RN-P04).'
          if (estado === 'rechazado' && !motivo?.trim()) return 'Indica el motivo del rechazo.'
          const t = hoy()
          mutar((x) => ({
            rendiciones: x.rendiciones.map((y) => (y.id !== rendicionId ? y : { ...y, items: y.items.map((i) => (i.id === itemId ? { ...i, revision: { estado, fecha: t, por: s.ui.usuario, ...(motivo?.trim() ? { motivo: motivo.trim() } : {}) } } : i)) })),
          }))
          return null
        },
        reponerFondo: (id) => {
          const s = getS()
          const r = s.rendiciones.find((x) => x.id === id)
          if (!r || estadoRendicion(r, hoy()) !== 'presentada') return 'La rendición no está presentada.'
          if (!puedeAdministrarCaja(s.ui.rol)) return 'Repone el fondo Finanzas.'
          if (r.items.some((i) => !i.revision)) return 'Revisa todos los ítems antes de reponer.'
          const t = hoy()
          const costos = r.items.filter((i) => i.revision?.estado === 'aprobado').map((i) => ({
            id: uid('co'), obraId: r.obraId, fecha: i.fecha, partidaId: i.imputacion === 'GG' ? null : i.imputacion, tipo: i.imputacion === 'GG' ? 'GG' as const : 'OTRO' as const,
            monto: i.monto, descripcion: i.descripcion, proveedor: i.proveedor || undefined, documento: `${i.comprobante === 'factura' ? 'Factura' : 'Boleta'} ${i.numero ?? ''} · rendición ${r.numero}`.trim(), origen: 'rendicion' as const,
          }))
          mutar((x) => ({ rendiciones: x.rendiciones.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: 'aprobada' as const, por: s.ui.usuario }] } : y)), costos: [...x.costos, ...costos] }))
          return null
        },
        crearProtocolo: (p) => {
          const s = getS()
          if (!puedeCrearProtocolo(s.ui.rol)) return 'Los protocolos los programa el jefe de terreno o el administrador.'
          if (!p.nombre.trim() || !p.partidaId) return 'Indica el protocolo y la partida.'
          if (!p.checklist.length) return 'Agrega al menos un punto al checklist.'
          const numero = Math.max(0, ...s.protocolosCalidad.filter((x) => x.obraId === p.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ protocolosCalidad: [...x.protocolosCalidad, { ...p, id: uid('pq'), numero, nombre: p.nombre.trim(), historial: [], creado: hoy(), creadoPor: s.ui.usuario }] }))
          return null
        },
        marcarChecklist: (id, indice, ok) =>
          mutar((s) => ({
            protocolosCalidad: s.protocolosCalidad.map((p) => (p.id !== id || estadoProtocolo(p, hoy()) !== 'en_inspeccion' ? p : { ...p, checklist: p.checklist.map((i, k) => (k === indice ? { ...i, ok } : i)) })),
          })),
        accionProtocolo: (id, accion, observaciones) => {
          const s = getS()
          const p = s.protocolosCalidad.find((x) => x.id === id)
          if (!p) return 'El protocolo no existe.'
          const t = hoy()
          if (!accionesProtocolo(p, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esa acción en este estado.'
          const error = validarAccionProtocolo(p, accion, observaciones)
          if (error) return error
          const paso = { fecha: t, estado: ESTADO_POR_ACCION[accion], por: s.ui.usuario, ...(observaciones?.trim() ? { texto: observaciones.trim() } : {}) }
          mutar((x) => {
            const protocolos = x.protocolosCalidad.map((y) => (y.id === id ? { ...y, historial: [...y.historial, paso], ...(accion === 'rechazar' ? { observaciones: observaciones!.trim() } : {}) } : y))
            if (accion !== 'rechazar') return { protocolosCalidad: protocolos }
            // RULE-104: NCR al responsable y protocolo de reinspección (checklist en blanco)
            const numero = Math.max(0, ...x.protocolosCalidad.filter((y) => y.obraId === p.obraId).map((y) => y.numero)) + 1
            const re: ProtocoloCalidad = { ...p, id: uid('pq'), numero, checklist: p.checklist.map((i) => ({ texto: i.texto })), observaciones: undefined, programado: t + 1, reinspeccionDe: p.id, historial: [], creado: t, creadoPor: s.ui.usuario }
            const nNcr = Math.max(0, ...x.noConformidades.filter((y) => y.obraId === p.obraId).map((y) => y.numero)) + 1
            const ncr: NoConformidad = {
              id: uid('nc'), obraId: p.obraId, partidaId: p.partidaId, numero: nNcr, origen: 'protocolo', protocoloId: p.id,
              descripcion: `${p.nombre} (${p.ubicacion}): ${observaciones!.trim()}`, responsable: p.responsable, plazo: t + PLAZO_NCR, historial: [], creado: t, creadoPor: s.ui.usuario,
            }
            return { protocolosCalidad: [...protocolos, re], noConformidades: [...x.noConformidades, ncr] }
          })
          return null
        },
        crearNCR: (n) => {
          const s = getS()
          if (!puedeCrearNCR(s.ui.rol)) return 'Las NCR las abre el jefe de terreno o el administrador.'
          if (!n.descripcion.trim() || !n.partidaId || !n.responsable.trim()) return 'Indica la partida, la descripción y el responsable.'
          const t = hoy()
          if (n.plazo < t) return 'El plazo de corrección no puede ser anterior a hoy.'
          const numero = Math.max(0, ...s.noConformidades.filter((x) => x.obraId === n.obraId).map((x) => x.numero)) + 1
          mutar((x) => ({ noConformidades: [...x.noConformidades, { ...n, id: uid('nc'), numero, descripcion: n.descripcion.trim(), responsable: n.responsable.trim(), historial: [], creado: t, creadoPor: s.ui.usuario }] }))
          return null
        },
        accionNCR: (id, accion, x = {}) => {
          const s = getS()
          const n = s.noConformidades.find((y) => y.id === id)
          if (!n) return 'La NCR no existe.'
          const t = hoy()
          if (!accionesNCR(n, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esa acción en este estado.'
          if (accion === 'corregir' && !x.accionCorrectiva?.trim()) return 'Indica la acción correctiva.'
          if (accion === 'anular' && !x.texto?.trim()) return 'Indica el motivo de la anulación.'
          const paso = { fecha: t, estado: ESTADO_POR_ACCION_NCR[accion], por: s.ui.usuario, ...(x.texto?.trim() ? { texto: x.texto.trim() } : {}) }
          mutar((st) => ({
            noConformidades: st.noConformidades.map((y) => (y.id !== id ? y : {
              ...y, historial: [...y.historial, paso],
              ...(x.causa?.trim() ? { causa: x.causa.trim() } : {}),
              ...(x.accionCorrectiva?.trim() ? { accionCorrectiva: x.accionCorrectiva.trim() } : {}),
              ...(accion === 'cerrar' && x.costoMateriales ? { costoMateriales: x.costoMateriales } : {}),
            })),
          }))
          return null
        },
        programarInspeccion: (i) => {
          const s = getS()
          if (!puedeProgramarInspeccion(s.ui.rol)) return 'Las inspecciones las programa el jefe de terreno o el administrador.'
          if (!i.inspector.trim()) return 'Indica el inspector.'
          mutar((x) => ({ inspeccionesCalidad: [...x.inspeccionesCalidad, { ...i, id: uid('iq'), inspector: i.inspector.trim() }] }))
          return null
        },
        realizarInspeccion: (id, r) => {
          const s = getS()
          const i = s.inspeccionesCalidad.find((x) => x.id === id)
          if (!i || i.realizada) return 'La inspección ya fue registrada.'
          if (s.ui.rol !== 'R03' && s.ui.rol !== 'R02') return 'La inspección la registra el jefe de terreno o el administrador.'
          if (!r.conforme && (!r.hallazgos.trim() || !(r.partidaId ?? i.partidaId) || !r.responsable?.trim())) return 'Indica los hallazgos, la partida y el responsable de corregir.'
          const t = hoy()
          mutar((x) => {
            const inspeccionesCalidad = x.inspeccionesCalidad.map((y) => (y.id === id ? { ...y, realizada: { fecha: t, conforme: r.conforme, hallazgos: r.hallazgos.trim() } } : y))
            if (r.conforme) return { inspeccionesCalidad }
            const numero = Math.max(0, ...x.noConformidades.filter((y) => y.obraId === i.obraId).map((y) => y.numero)) + 1
            const ncr: NoConformidad = {
              id: uid('nc'), obraId: i.obraId, partidaId: (r.partidaId ?? i.partidaId)!, numero, origen: 'inspeccion', inspeccionId: id,
              descripcion: r.hallazgos.trim(), responsable: r.responsable!.trim(), plazo: t + PLAZO_NCR, historial: [], creado: t, creadoPor: x.ui.usuario,
            }
            return { inspeccionesCalidad, noConformidades: [...x.noConformidades, ncr] }
          })
          return null
        },
        registrarCharla: (c) => {
          const s = getS()
          if (!puedeCharla(s.ui.rol)) return 'La charla la registra el capataz, el jefe de terreno o Prevención.'
          if (!c.tema.trim() || !(c.asistentes > 0)) return 'Indica el tema y los asistentes.'
          if (s.charlasSeguridad.some((x) => x.obraId === c.obraId && x.fecha === c.fecha && x.cuadrillaId === c.cuadrillaId)) return 'Esa charla ya está registrada.'
          mutar((x) => ({ charlasSeguridad: [...x.charlasSeguridad, { ...c, id: uid('ch'), tema: c.tema.trim(), creadoPor: s.ui.usuario }] }))
          return null
        },
        registrarART: (a) => {
          const s = getS()
          if (!puedeART(s.ui.rol)) return 'El ART lo registra el capataz, el jefe de terreno o Prevención.'
          if (!a.medidas.length || !(a.firmantes > 0)) return 'Indica las medidas de control y los trabajadores que firmaron.'
          mutar((x) => ({ arts: [...x.arts, { ...a, id: uid('art'), creadoPor: s.ui.usuario }] }))
          return null
        },
        programarInspeccionSeg: (i) => {
          const s = getS()
          if (!puedeGestionarSST(s.ui.rol)) return 'Las inspecciones de seguridad las programa Prevención.'
          mutar((x) => ({ inspeccionesSeguridad: [...x.inspeccionesSeguridad, { ...i, id: uid('is') }] }))
          return null
        },
        realizarInspeccionSeg: (id, r) => {
          const s = getS()
          if (!puedeGestionarSST(s.ui.rol)) return 'La inspección la registra Prevención.'
          if (!(r.cumplimiento >= 0 && r.cumplimiento <= 1)) return 'El cumplimiento va de 0 a 100 %.'
          mutar((x) => ({ inspeccionesSeguridad: x.inspeccionesSeguridad.map((y) => (y.id === id ? { ...y, realizada: { fecha: hoy(), cumplimiento: r.cumplimiento, hallazgos: r.hallazgos.trim() || 'Sin hallazgos' } } : y)) }))
          return null
        },
        registrarObservacion: (o) => {
          const s = getS()
          if (!puedeObservar(s.ui.rol)) return 'Tu rol no registra observaciones preventivas.'
          if (!o.descripcion.trim() || (!o.segura && !o.responsable.trim())) return 'Indica la observación y quién corrige.'
          mutar((x) => ({ observacionesPreventivas: [...x.observacionesPreventivas, { ...o, id: uid('op'), descripcion: o.descripcion.trim(), responsable: o.responsable.trim(), creadoPor: s.ui.usuario, ...(o.segura ? { cerrada: o.fecha } : {}) }] }))
          return null
        },
        cerrarObservacion: (id) => {
          const s = getS()
          if (!puedeObservar(s.ui.rol)) return 'Tu rol no cierra observaciones.'
          mutar((x) => ({ observacionesPreventivas: x.observacionesPreventivas.map((o) => (o.id === id ? { ...o, cerrada: hoy() } : o)) }))
          return null
        },
        reportarIncidente: (i) => {
          const s = getS()
          if (!puedeReportarIncidente(s.ui.rol)) return 'Tu rol no reporta incidentes.'
          if (!i.descripcion.trim() || !i.lugar.trim()) return 'Indica qué pasó y dónde.'
          const t = hoy()
          if (i.fecha > t) return 'La fecha no puede ser futura.'
          const numero = Math.max(0, ...s.incidentes.filter((x) => x.obraId === i.obraId).map((x) => x.numero)) + 1
          const nuevo: Incidente = { ...i, id: uid('in'), numero, descripcion: i.descripcion.trim(), lugar: i.lugar.trim(), afectado: i.afectado?.trim() || undefined, historial: [], creado: t, creadoPor: s.ui.usuario }
          mutar((x) => ({ incidentes: [...x.incidentes, nuevo] }))
          return null
        },
        accionIncidente: (id, accion, x = {}) => {
          const s = getS()
          const i = s.incidentes.find((y) => y.id === id)
          if (!i) return 'El incidente no existe.'
          const t = hoy()
          if (!accionesIncidente(i, t, s.ui.rol).includes(accion)) return 'Solo Prevención gestiona el incidente en este estado.'
          const actualizado: Incidente = {
            ...i,
            ...(accion === 'clasificar' ? { tipo: x.tipo ?? i.tipo, potencial: x.potencial, diasPerdidos: x.diasPerdidos } : {}),
            ...(x.causas?.trim() ? { causas: x.causas.trim() } : {}),
          }
          const error = validarAccionIncidente(s, actualizado, accion, t, x)
          if (error) return error
          mutar((st) => ({ incidentes: st.incidentes.map((y) => (y.id === id ? { ...actualizado, historial: [...y.historial, { fecha: t, estado: ESTADO_POR_ACCION_INC[accion], por: s.ui.usuario }] } : y)) }))
          return null
        },
        pasoProtocolo: (id, paso) => {
          const s = getS()
          if (!puedeGestionarSST(s.ui.rol) && s.ui.rol !== 'R02') return 'El protocolo lo registra Prevención o el administrador de obra.'
          mutar((x) => ({ incidentes: x.incidentes.map((i) => (i.id === id ? { ...i, protocolo: { ...i.protocolo, [paso]: hoy() } } : i)) }))
          return null
        },
        crearMedida: (m) => {
          const s = getS()
          if (!puedeGestionarSST(s.ui.rol)) return 'Las medidas correctivas las define Prevención.'
          if (!m.descripcion.trim() || !m.responsable.trim()) return 'Indica la medida y el responsable.'
          mutar((x) => ({ medidasCorrectivas: [...x.medidasCorrectivas, { ...m, id: uid('mc'), descripcion: m.descripcion.trim(), responsable: m.responsable.trim(), creado: hoy(), creadoPor: s.ui.usuario }] }))
          return null
        },
        cumplirMedida: (id, evidencia) => {
          const s = getS()
          if (!puedeCumplirMedida(s.ui.rol)) return 'Tu rol no registra el cumplimiento de medidas.'
          if (!evidencia.trim()) return 'Indica la evidencia del cumplimiento.'
          mutar((x) => ({ medidasCorrectivas: x.medidasCorrectivas.map((m) => (m.id === id ? { ...m, cumplida: { fecha: hoy(), evidencia: evidencia.trim(), por: s.ui.usuario } } : m)) }))
          return null
        },
        marcarTareaCritica: (partidaId, tarea) => {
          const s = getS()
          if (!puedeMarcarCritica(s.ui.rol)) return 'Las tareas críticas las define Prevención o el jefe de terreno.'
          mutar((x) => ({ partidas: x.partidas.map((p) => (p.id !== partidaId ? p : tarea ? { ...p, tareaCritica: tarea } : (({ tareaCritica: _t, ...r }) => r)(p))) }))
          return null
        },
        respuestaSII: (id, aceptado, motivo) => {
          const s = getS()
          if (!puedeFacturar(s.ui.rol)) return 'La respuesta del SII la registra Finanzas.'
          const doc = s.documentosTributarios.find((x) => x.id === id)
          const t = hoy()
          if (!doc || estadoDTE(doc, t) !== 'emitido') return 'El documento no está esperando respuesta del SII.'
          if (!aceptado && !motivo?.trim()) return 'Indica el motivo del rechazo del SII.'
          mutar((x) => ({
            documentosTributarios: x.documentosTributarios.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado: aceptado ? 'aceptado_sii' as const : 'rechazado_sii' as const, por: s.ui.usuario, ...(motivo?.trim() ? { texto: motivo.trim() } : {}) }] } : y)),
            // Factura rechazada: el EP vuelve a "por facturar"
            estadosPago: aceptado || doc.tipo !== 'factura' ? x.estadosPago : x.estadosPago.map((e) => (e.id === doc.epId && e.factura === codigoDTE(doc) ? { ...e, facturado: undefined, factura: undefined, vencimiento: undefined } : e)),
          }))
          return null
        },
        anularConNotaCredito: (facturaId, motivo) => {
          const s = getS()
          if (!puedeFacturar(s.ui.rol)) return 'Las notas de crédito las emite Finanzas.'
          const f = s.documentosTributarios.find((x) => x.id === facturaId)
          const t = hoy()
          const ep = s.estadosPago.find((e) => e.id === f?.epId)
          if (!f || !puedeAnularConNC(f, ep, t)) return 'Solo se anula con nota de crédito una factura vigente de un EP sin cobros.'
          if (!motivo.trim()) return 'Indica el motivo de la nota de crédito.'
          const nc: DocumentoTributario = {
            id: uid('dte'), obraId: f.obraId, tipo: 'nota_credito', folio: siguienteFolio(s.documentosTributarios, 'nota_credito'), fecha: t, receptor: f.receptor, epId: f.epId, referenciaId: f.id,
            neto: f.neto, iva: f.iva, total: f.total, glosa: `Anula ${codigoDTE(f)}: ${motivo.trim()}`, historial: [{ fecha: t, estado: 'emitido', por: s.ui.usuario }], creado: t, creadoPor: s.ui.usuario,
          }
          mutar((x) => ({
            documentosTributarios: [...x.documentosTributarios.map((y) => (y.id === f.id ? { ...y, historial: [...y.historial, { fecha: t, estado: 'anulado' as const, por: s.ui.usuario, texto: `${codigoDTE(nc)}: ${motivo.trim()}` }] } : y)), nc],
            estadosPago: x.estadosPago.map((e) => (e.id === f.epId ? { ...e, facturado: undefined, factura: undefined, vencimiento: undefined } : e)),
          }))
          return null
        },
        pagarCosto: (costoId) => {
          const s = getS()
          if (!puedeTesoreria(s.ui.rol)) return 'Los pagos los registra Finanzas.'
          const k = s.costos.find((x) => x.id === costoId)
          if (!k) return 'El documento no existe.'
          if (s.transacciones.some((x) => x.refId === costoId)) return 'Ese documento ya está pagado.'
          mutar((x) => ({ transacciones: [...x.transacciones, { id: uid('tx'), obraId: k.obraId, fecha: hoy(), tipo: 'pago', concepto: 'proveedor', refId: k.id, contraparte: k.proveedor ?? k.descripcion, documento: k.documento, monto: k.monto, creadoPor: s.ui.usuario }] }))
          return null
        },
        guardarCliente: (c) => {
          const s = getS()
          if (!puedeComercial(s.ui.rol)) return 'Los clientes los administra Comercial.'
          if (!c.nombre.trim()) return 'Indica el nombre del cliente.'
          if (c.estado === 'bloqueado' && s.ui.rol !== 'R01') return 'Solo Gerencia bloquea un cliente.'
          mutar((x) => ({
            clientes: c.id ? x.clientes.map((y) => (y.id === c.id ? { ...y, ...c, nombre: c.nombre.trim() } : y)) : [...x.clientes, { ...c, id: uid('cl'), nombre: c.nombre.trim(), creado: hoy() }],
          }))
          return null
        },
        crearLead: (l) => {
          const s = getS()
          if (!puedeComercial(s.ui.rol)) return 'Los leads los registra Comercial.'
          if (!l.nombre.trim() || !l.clienteId) return 'Indica el proyecto y el cliente.'
          const numero = Math.max(0, ...s.leads.map((x) => x.numero)) + 1
          mutar((x) => ({ leads: [...x.leads, { ...l, id: uid('ld'), numero, nombre: l.nombre.trim(), historial: [], creado: hoy(), creadoPor: s.ui.usuario }] }))
          return null
        },
        accionLead: (id, accion, x) => {
          const s = getS()
          const l = s.leads.find((y) => y.id === id)
          if (!l) return 'El lead no existe.'
          if (!puedeComercial(s.ui.rol)) return 'Tu rol no gestiona leads.'
          const t = hoy()
          const e = estadoLead(l, t)
          const permitido: Record<typeof accion, EstadoLead[]> = { estudiar: ['nuevo'], perder: ['nuevo', 'en_estudio', 'propuesta_enviada'], descartar: ['nuevo', 'en_estudio'] }
          if (!e || !permitido[accion].includes(e)) return 'El lead no admite esa acción en su estado.'
          if (accion === 'estudiar' && !x.responsable?.trim()) return 'Asigna el responsable del estudio.'
          if (accion !== 'estudiar' && !x.motivo?.trim()) return 'El motivo es obligatorio (RULE-002).'
          const estado: EstadoLead = accion === 'estudiar' ? 'en_estudio' : accion === 'perder' ? 'perdido' : 'descartado'
          mutar((st) => ({
            leads: st.leads.map((y) => (y.id === id ? { ...y, historial: [...y.historial, { fecha: t, estado, por: s.ui.usuario }], ...(x.responsable?.trim() ? { responsable: x.responsable.trim() } : {}), ...(x.motivo?.trim() ? { motivo: x.motivo.trim() } : {}) } : y)),
          }))
          return null
        },
        agendarVisita: (v) => {
          const s = getS()
          if (!puedeVisita(s.ui.rol)) return 'Las visitas las agenda Comercial u Oficina Técnica.'
          if (!v.responsable.trim()) return 'Indica el responsable.'
          mutar((x) => ({ visitasTecnicas: [...x.visitasTecnicas, { ...v, id: uid('vt'), responsable: v.responsable.trim(), estado: 'agendada' }] }))
          return null
        },
        cerrarVisita: (id, estado, notas) => {
          const s = getS()
          if (!puedeVisita(s.ui.rol)) return 'Tu rol no registra visitas.'
          if (!notas.trim()) return estado === 'realizada' ? 'Registra las notas del levantamiento.' : 'Indica el motivo de la cancelación.'
          mutar((x) => ({ visitasTecnicas: x.visitasTecnicas.map((v) => (v.id === id ? { ...v, estado, notas: notas.trim() } : v)) }))
          return null
        },
        crearPropuesta: (leadId, anteriorId) => {
          const s = getS()
          if (!puedeComercial(s.ui.rol)) return { error: 'Las propuestas las prepara Comercial.' }
          const l = s.leads.find((y) => y.id === leadId)
          const t = hoy()
          if (!l || !['nuevo', 'en_estudio', 'propuesta_enviada'].includes(estadoLead(l, t) ?? '')) return { error: 'El lead no está abierto.' }
          const ant = s.propuestas.find((p) => p.id === anteriorId)
          const id = uid('pr')
          const numero = Math.max(0, ...s.propuestas.map((p) => p.numero)) + 1
          const nueva: Propuesta = {
            id, leadId, numero: ant?.numero ?? numero, version: ant ? Math.max(...s.propuestas.filter((p) => p.numero === ant.numero).map((p) => p.version)) + 1 : 1, anteriorId: ant?.id,
            lineas: ant ? ant.lineas.map((x) => ({ ...x, id: uid('lp') })) : [], gg: ant?.gg ?? 0, margen: ant?.margen ?? 0.12, plazoDias: ant?.plazoDias ?? 90, validezHasta: t + 30,
            exclusiones: ant?.exclusiones ?? 'Permisos y derechos municipales, aportes reembolsables y empalmes.', historial: [], creado: t, creadoPor: s.ui.usuario,
          }
          mutar((x) => ({
            propuestas: [...x.propuestas, nueva],
            // Preparar una propuesta pone al lead en estudio
            leads: estadoLead(l, t) === 'nuevo' ? x.leads.map((y) => (y.id === leadId ? { ...y, responsable: y.responsable ?? s.ui.usuario, historial: [...y.historial, { fecha: t, estado: 'en_estudio' as const, por: s.ui.usuario }] } : y)) : x.leads,
          }))
          return { id }
        },
        editarPropuesta: (id, cambios) => {
          const s = getS()
          const p = s.propuestas.find((y) => y.id === id)
          if (!p || estadoPropuesta(p, hoy()) !== 'borrador') return 'Solo se edita una propuesta en borrador.'
          if (!puedeComercial(s.ui.rol)) return 'Tu rol no edita propuestas.'
          if (cambios.margen != null && !(cambios.margen > -0.5 && cambios.margen < 0.9)) return 'El margen debe estar entre −50 % y 90 %.'
          mutar((x) => ({ propuestas: x.propuestas.map((y) => (y.id === id ? { ...y, ...cambios } : y)) }))
          return null
        },
        accionPropuesta: (id, accion, x = {}) => {
          const s = getS()
          const p = s.propuestas.find((y) => y.id === id)
          if (!p) return 'La propuesta no existe.'
          const t = hoy()
          if (!accionesPropuesta(p, t, s.ui.rol).includes(accion)) return 'Tu rol no puede hacer esa acción en este estado.'
          const lead = s.leads.find((l) => l.id === p.leadId)!
          const tot = totalesPropuesta(p)
          if (accion === 'enviar_revision' && (!p.lineas.length || tot.precio <= 0)) return 'La propuesta no tiene itemizado.'
          const observado = clienteObservado(s, lead.clienteId, t)
          if (accion === 'aprobar' && (margenBajo(p, s.config.umbrales.margenMinimo) || observado) && !x.texto?.trim())
            return `Justifica el V°B°: ${[margenBajo(p, s.config.umbrales.margenMinimo) ? `margen bajo el mínimo de ${Math.round(s.config.umbrales.margenMinimo * 100)} % (RULE-005)` : '', observado ? `${observado} (RULE-004)` : ''].filter(Boolean).join(' y ')}.`
          if ((accion === 'devolver' || accion === 'anular') && !x.texto?.trim()) return 'Indica el motivo.'
          if (accion === 'rechazar' && !x.motivo) return 'Indica el motivo del rechazo.'
          const estado: Record<AccionPropuesta, Propuesta['historial'][number]['estado'] | null> = {
            enviar_revision: 'en_revision', devolver: 'borrador', aprobar: null, enviar: 'enviada', adjudicar: 'adjudicada', rechazar: 'rechazada', desierta: 'desierta', anular: 'anulada',
          }
          const paso = estado[accion] ? [{ fecha: t, estado: estado[accion]!, por: s.ui.usuario, ...(x.texto?.trim() ? { texto: x.texto.trim() } : {}) }] : []
          const cliente = s.clientes.find((c) => c.id === lead.clienteId)
          mutar((st) => {
            let obras = st.obras
            let partidas = st.partidas
            let obraId: string | undefined
            if (accion === 'adjudicar') {
              // La obra nace en planificación con el itemizado de la oferta (precio prorrateado sobre el costo directo)
              obraId = uid('obra')
              obras = [...obras, {
                id: obraId, nombre: lead.nombre, mandante: cliente?.nombre ?? '', lineaNegocio: lead.lineaNegocio, administrador: 'Por asignar', jefeTerreno: 'Por asignar', oficinaTecnica: 'Por asignar',
                moneda: 'CLP', fechaInicio: x.fechaInicio ?? t + 14, plazoDias: p.plazoDias, multaDiaria: 0, margenOfertado: p.margen, ggPresupuesto: p.gg, estado: 'planificacion',
              }]
              partidas = [...partidas, ...p.lineas.map((l) => ({
                id: `${obraId}_p${l.codigo}`, obraId: obraId!, codigo: l.codigo, capitulo: l.capitulo, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad,
                puVenta: Math.round(puCostoLinea(l) * tot.factor), recursos: l.recursos,
              }))]
            }
            const estadoDeLead: EstadoLead | null = accion === 'enviar' ? 'propuesta_enviada' : accion === 'adjudicar' ? 'ganado' : accion === 'rechazar' || accion === 'desierta' ? 'perdido' : null
            return {
              obras, partidas,
              propuestas: st.propuestas.map((y) => (y.id !== id ? y : {
                ...y, historial: [...y.historial, ...paso],
                ...(accion === 'aprobar' ? { aprobacion: { fecha: t, por: s.ui.usuario, ...(x.texto?.trim() ? { justificacion: x.texto.trim() } : {}) } } : {}),
                ...(accion === 'devolver' ? { aprobacion: undefined } : {}),
                ...(accion === 'rechazar' ? { motivoRechazo: x.motivo } : {}),
                ...(obraId ? { obraId } : {}),
              })),
              leads: estadoDeLead && estadoLead(lead, t) !== estadoDeLead ? st.leads.map((l) => (l.id === lead.id ? {
                ...l, historial: [...l.historial, { fecha: t, estado: estadoDeLead, por: s.ui.usuario }],
                ...(estadoDeLead === 'perdido' ? { motivo: accion === 'desierta' ? 'Licitación desierta' : `Propuesta rechazada (${x.motivo})` } : {}),
              } : l)) : st.leads,
            }
          })
          return null
        },
        ingresarPostventa: (s) => {
          const st = getS()
          if (!puedeIngresarPostventa(st.ui.rol)) return 'La solicitud la ingresa el mandante o la constructora.'
          if (!s.descripcion.trim() || !s.ubicacion.trim()) return 'Indica qué falla y dónde.'
          const t = hoy()
          if (inicioGarantia(st, s.obraId, t) == null) return 'La obra aún no tiene recepción: la garantía postventa corre desde la recepción.'
          const numero = Math.max(0, ...st.solicitudesPostventa.filter((x) => x.obraId === s.obraId).map((x) => x.numero)) + 1
          const asignado = responsableDe(st, s.obraId, s.partidaId)
          mutar((x) => ({
            solicitudesPostventa: [...x.solicitudesPostventa, {
              ...s, ...asignado, id: uid('pv'), numero, fecha: t, descripcion: s.descripcion.trim(), ubicacion: s.ubicacion.trim(), solicitante: s.solicitante.trim() || st.ui.usuario,
              historial: [], creado: t, creadoPor: st.ui.usuario,
            }],
          }))
          return null
        },
        accionPostventa: (id, accion, x = {}) => {
          const st = getS()
          const s = st.solicitudesPostventa.find((y) => y.id === id)
          if (!s) return 'La solicitud no existe.'
          const t = hoy()
          const esSuya = s.subcontratistaId != null && subcontratistaDeR10(st.proveedores)?.id === s.subcontratistaId
          if (!accionesPostventa(s, t, st.ui.rol, esSuya).includes(accion)) return 'Tu rol no puede hacer esa acción en este estado.'
          if (accion === 'evaluar' && !x.diagnostico?.trim()) return 'Registra el diagnóstico de la visita.'
          if (accion === 'rechazar' && !x.motivo?.trim()) return 'Indica el motivo (fuera de garantía, mal uso…).'
          const estado = { evaluar: 'en_evaluacion', reparar: 'en_reparacion', resolver: 'resuelta', rechazar: 'rechazada' }[accion] as SolicitudPostventa['historial'][number]['estado']
          mutar((z) => ({
            solicitudesPostventa: z.solicitudesPostventa.map((y) => (y.id !== id ? y : {
              ...y, historial: [...y.historial, { fecha: t, estado, por: st.ui.usuario }],
              ...(accion === 'evaluar' ? { visita: t, diagnostico: x.diagnostico!.trim(), ...(x.categoria ? { categoria: x.categoria } : {}) } : {}),
              ...(accion === 'rechazar' ? { motivoRechazo: x.motivo!.trim() } : {}),
              ...(accion === 'resolver' ? { costoReparacion: x.costo ?? 0, cargoSubcontratista: !!x.cargoSubcontratista || st.ui.rol === 'R10' } : {}),
            })),
          }))
          return null
        },
        guardarCondicionesPago: (obraId, c) =>
          mutar((s) => ({ obras: s.obras.map((o) => (o.id === obraId ? { ...o, condicionesPago: c } : o)) })),
      }
    },
    {
      name: 'obrai-datos',
      // Si cambia el modelo de datos de la demo, se regenera (sin backend aún, 03 §6)
      version: 22,
      migrate: () => datosIniciales() as unknown as Estado,
      // En modo nube la caché se hidrata por empresa, después de iniciar sesión (sync.ts)
      skipHydration: modoNube,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => {
        const d: Record<string, unknown> = { config: s.config, ui: s.ui }
        for (const k of COLECCIONES) d[k] = s[k]
        return d as unknown as Estado
      },
    },
  ),
)

/** Subconjunto de datos (sin acciones) para el motor de dominio. */
export function useDatos(): Datos {
  const s = useStore()
  return s
}

export type { TipoRecurso }
