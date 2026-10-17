import { describe, expect, it } from 'vitest'
import { calcularCPM, CicloError, programarActividades } from './cpm'
import { CONFIG_DEFECTO, type Datos } from './datos'
import { calcularObra } from './evm'
import { desgloseObra, desglosePartida } from './explicacion'
import { dia } from './fechas'
import { importarCostos, importarItemizado, importarPrograma, parsearNumero } from './importar'
import { cerrarPeriodo } from './periodos'
import { generarDemo } from './seed'
import type { Actividad, Obra, Partida } from './types'

const act = (id: string, duracion: number, predecesoras: Actividad['predecesoras'] = []): Actividad => ({
  id, codigo: id, nombre: id, duracion, predecesoras, partidas: [], inicio: 0, fin: 0,
})

describe('CPM', () => {
  it('calcula fechas, holguras y ruta crítica', () => {
    const acts = [
      act('A', 10),
      act('B', 5, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }]),
      act('C', 3, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }]),
      act('D', 4, [{ actividadId: 'B', tipo: 'FC', desfase: 0 }, { actividadId: 'C', tipo: 'FC', desfase: 0 }]),
    ]
    const r = calcularCPM(acts, 0)
    expect(r.get('D')!.ef).toBe(19)
    expect(r.get('C')!.holgura).toBe(2)
    expect(r.get('B')!.critica).toBe(true)
    expect(r.get('C')!.critica).toBe(false)
  })

  it('soporta CC, FF y desfases negativos', () => {
    const acts = [
      act('A', 10),
      act('B', 6, [{ actividadId: 'A', tipo: 'CC', desfase: 2 }]),
      act('C', 4, [{ actividadId: 'A', tipo: 'FF', desfase: 3 }]),
      act('D', 2, [{ actividadId: 'A', tipo: 'FC', desfase: -3 }]),
    ]
    const r = calcularCPM(acts, 0)
    expect(r.get('B')!.es).toBe(2)
    expect(r.get('C')!.ef).toBe(13)
    expect(r.get('D')!.es).toBe(7)
  })

  it('holgura negativa cuando la fecha límite es menor que el término', () => {
    const r = calcularCPM([act('A', 10), act('B', 10, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }])], 0, { fechaLimite: 15 })
    expect(r.get('B')!.holgura).toBe(-5)
  })

  it('los hitos contractuales acotan el término tardío', () => {
    const acts = [
      act('A', 10),
      act('H', 0, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }]),
      act('B', 30),
    ]
    const r = calcularCPM(acts, 0, { fechaLimite: 40, limites: new Map([['H', 8]]) })
    expect(r.get('A')!.holgura).toBe(-2)
    expect(r.get('A')!.critica).toBe(true)
    expect(r.get('B')!.holgura).toBe(10)
  })

  it('detecta ciclos', () => {
    expect(() => calcularCPM([act('A', 1, [{ actividadId: 'B', tipo: 'FC', desfase: 0 }]), act('B', 1, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }])], 0)).toThrow(CicloError)
  })

  it('proyecta con fechas reales y avance', () => {
    const acts = programarActividades([act('A', 10), act('B', 10, [{ actividadId: 'A', tipo: 'FC', desfase: 0 }])], 0)
    acts[0].inicioReal = 0
    const r = calcularCPM(acts, 0, { usarReales: true, hoy: 10, avance: new Map([['A', 0.5]]) })
    expect(r.get('A')!.ef).toBe(15)
    expect(r.get('B')!.ef).toBe(25)
  })
})

describe('Números', () => {
  it('parsea formatos chilenos', () => {
    expect(parsearNumero('1.234,56')).toBe(1234.56)
    expect(parsearNumero('$ 12.000')).toBe(12000)
    expect(parsearNumero('1234.5')).toBe(1234.5)
    expect(parsearNumero('0,25')).toBe(0.25)
    expect(parsearNumero('1.234.567')).toBe(1234567)
  })
})

/** Obra mínima: una partida de hormigón con APU conocido. */
function obraMinima(): Datos {
  const obra: Obra = {
    id: 'o', nombre: 'Test', mandante: 'M', lineaNegocio: 'E', administrador: 'A', jefeTerreno: 'J', oficinaTecnica: 'T',
    moneda: 'CLP', fechaInicio: dia('2026-01-05'), plazoDias: 100, multaDiaria: 0, margenOfertado: 0.1, ggPresupuesto: 0, estado: 'en_ejecucion',
  }
  const p: Partida = {
    id: 'p', obraId: 'o', codigo: '1', capitulo: '1', descripcion: 'Hormigón', unidad: 'm³', cantidad: 100, puVenta: 120_000,
    recursos: [
      { tipo: 'MO', descripcion: 'MO', cantPorUnidad: 0.25, unidad: 'HH', precio: 10_000 },
      { tipo: 'MAT', descripcion: 'H-30', cantPorUnidad: 1, unidad: 'm³', precio: 100_000 },
    ],
  }
  const a: Actividad = { ...act('a', 100), partidas: [{ partidaId: 'p', cantidad: 100 }], inicio: obra.fechaInicio, fin: obra.fechaInicio + 100 }
  const prog = (tipo: 'lineaBase' | 'actualizado') => ({ id: tipo, obraId: 'o', tipo, version: 1, estado: 'vigente' as const, creadoPor: 'x', fecha: 0, actividades: [{ ...a, inicioReal: tipo === 'actualizado' ? obra.fechaInicio : undefined }] })
  return {
    config: structuredClone(CONFIG_DEFECTO), obras: [obra], partidas: [p],
    programas: [prog('lineaBase'), prog('actualizado')],
    cuadrillas: [{ id: 'c', obraId: 'o', nombre: 'C', capataz: 'X', trabajadores: 5, costoHH: 10_000 }],
    rdos: [{
      id: 'r', obraId: 'o', cuadrillaId: 'c', fecha: obra.fechaInicio + 9, clima: 'despejado', estado: 'validado', autor: 'X', observaciones: '',
      avances: [{ partidaId: 'p', cantidad: 20 }],
      hh: [{ partidaId: 'p', trabajadores: 5, horasNormales: 8, horasExtra: 0 }], // 40 HH para 20 m³ = 2,0 HH/m³? no: 40/20 = 2
    }],
    costos: [{ id: 'k', obraId: 'o', fecha: obra.fechaInicio + 9, partidaId: 'p', tipo: 'MAT', cantidad: 21, precio: 105_000, monto: 21 * 105_000, descripcion: 'H-30', origen: 'manual' }],
    compromisos: [], reglasMapeo: [], ajustes: [], periodos: [], alertas: [], estadosPago: [], ordenesCambio: [], obligaciones: [], garantias: [], recepciones: [], riesgos: [],
  }
}

describe('EVM', () => {
  it('calcula PV, EV, AC, CPI, SPI y EAC', () => {
    const d = obraMinima()
    const c = calcularObra(d, 'o', d.obras[0].fechaInicio + 9)
    const pu = 0.25 * 10_000 + 100_000 // 102.500
    expect(c.bacDir).toBe(100 * pu)
    expect(c.pv).toBeCloseTo(10 * pu, 6) // 10% del plazo
    expect(c.ev).toBeCloseTo(20 * pu, 6)
    expect(c.ac).toBe(40 * 10_000 + 21 * 105_000)
    expect(c.cpi).toBeCloseTo(c.ev / c.ac, 9)
    expect(c.spi).toBeCloseTo(2, 9)
    expect(c.cv).toBeCloseTo(c.ev - c.ac, 6)
    // EAC método CPI: AC + (BAC − EV)/CPI
    const cp = c.partidas[0]
    expect(cp.eac).toBeCloseTo(cp.ac + (cp.bac - cp.ev) / cp.cpi!, 4)
    expect(c.vac).toBeCloseTo(c.bac - c.eac, 6)
    expect(cp.rendReal).toBe(2)
  })

  it('la descomposición suma exactamente AC − EV', () => {
    const d = obraMinima()
    const c = calcularObra(d, 'o', d.obras[0].fechaInicio + 9)
    const comps = desglosePartida(c.partidas[0])
    const total = comps.reduce((s, x) => s + x.monto, 0)
    expect(total).toBeCloseTo(c.partidas[0].ac - c.partidas[0].ev, 4)
    const mat = comps.filter((x) => x.recurso === 'MAT')
    expect(mat.find((x) => x.tipo === 'consumo')!.monto).toBeCloseTo((21 - 20) * 100_000, 4)
    expect(mat.find((x) => x.tipo === 'precio')!.monto).toBeCloseTo(21 * 5_000, 4)
  })
})

describe('Demo completa', () => {
  const hoy = dia('2026-09-22')
  const d = generarDemo(hoy)

  it('genera obras, RDO, costos y períodos', () => {
    expect(d.obras.length).toBe(3)
    expect(d.rdos.length).toBeGreaterThan(100)
    expect(d.periodos.length).toBeGreaterThan(10)
  })

  it('Los Aromos: al día, con leve sobrecosto y una alerta de rendimiento', () => {
    const c = calcularObra(d, 'obra_aromos', hoy - 1)
    expect(c.spi!).toBeGreaterThan(0.9)
    expect(c.cpi!).toBeLessThan(1)
    expect(c.avanceReal).toBeGreaterThan(0.1)
    const reglas = new Set(d.alertas.filter((a) => a.obraId === 'obra_aromos' && a.estado !== 'resuelta').map((a) => a.regla))
    expect(reglas.has('RULE-606')).toBe(true)
  })

  it('la descomposición de la obra suma AC − EV', () => {
    const c = calcularObra(d, 'obra_aromos', hoy - 1)
    const total = desgloseObra(c).reduce((s, x) => s + x.monto, 0)
    expect(Math.abs(total - (c.ac - c.ev))).toBeLessThan(c.partidas.length * 20)
  })

  it('no permite cerrar un período anterior al último', () => {
    const ult = d.periodos.filter((p) => p.obraId === 'obra_aromos').at(-1)!
    expect(() => cerrarPeriodo(d, 'obra_aromos', ult.fechaCorte, 'x', hoy)).toThrow()
  })
})

describe('Importadores', () => {
  const obra = obraMinima().obras[0]
  it('itemizado con capítulos y APU', () => {
    const txt = 'Código\tDescripción\tUnidad\tCantidad\tPU\thh_unidad\tcosto_hh\tmat_cantidad\tmat_precio\n3\tOBRA GRUESA\t\t\t\n3.1\tHormigón\tm3\t100\t120.000\t0,25\t9.500\t1,03\t98.000'
    const r = importarItemizado(txt, 'o')
    expect(r.errores).toEqual([])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].capitulo).toBe('3 OBRA GRUESA')
    expect(r.items[0].recursos).toHaveLength(2)
  })
  it('costos con reglas de mapeo y sin imputar', () => {
    const d = obraMinima()
    const txt = 'fecha;cuenta;centro_costo;monto\n10-01-2026;5-1-01;X-1;1.000\n10-01-2026;9;Z;500'
    const r = importarCostos(txt, obra, d.partidas, [{ id: 'r', cuenta: '5-1-01', centroCosto: 'X-1', obraId: 'o', partidaId: 'p', tipo: 'MAT' }], [])
    expect(r.items[0].partidaId).toBe('p')
    expect(r.items[1].partidaId).toBeNull()
    expect(r.sinMapeo).toBe(1)
  })
  it('programa con predecesoras y partidas', () => {
    const d = obraMinima()
    const txt = 'codigo,nombre,duracion,predecesoras,partidas\nA1,Excavación,10,,1:60\nA2,Losa,5,A1FC+2,1:40\nH,Fin,0,A2,'
    const r = importarPrograma(txt, obra, d.partidas)
    expect(r.errores).toEqual([])
    expect(r.items.find((a) => a.codigo === 'A2')!.inicio).toBe(obra.fechaInicio + 12)
    expect(r.items.find((a) => a.codigo === 'H')!.esHito).toBe(true)
  })
})
