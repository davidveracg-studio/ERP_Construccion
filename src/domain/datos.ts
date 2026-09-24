import type {
  AjusteForecast, Alerta, Compromiso, Config, CostoReal, Cuadrilla, Obra, Partida,
  PeriodoControl, Programa, RDO, ReglaMapeo,
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
}

export const CONFIG_DEFECTO: Config = {
  empresa: 'Constructora Demo SpA',
  rut: '76.123.456-7',
  umbrales: {
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
  },
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
  'obras', 'partidas', 'programas', 'cuadrillas', 'rdos', 'costos', 'compromisos', 'reglasMapeo', 'ajustes', 'periodos', 'alertas',
] as const
export type Coleccion = (typeof COLECCIONES)[number]

export function datosVacios(): Datos {
  return {
    config: CONFIG_DEFECTO, obras: [], partidas: [], programas: [], cuadrillas: [], rdos: [], costos: [],
    compromisos: [], reglasMapeo: [], ajustes: [], periodos: [], alertas: [],
  }
}
