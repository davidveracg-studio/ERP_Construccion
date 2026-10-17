import { describe, expect, it } from 'vitest'
import type { Datos } from './datos'
import { lineasEP } from './estadosPago'
import { calcularObra } from './evm'
import { dia } from './fechas'
import {
  accionesOC, aplicarAccionOC, aplicarAprobacion, etapaOC, idPartidaNueva, montosOC, partidasNuevas, partidaVigente, requiereGerencia,
} from './ordenesCambio'
import { cantidadesProgramadas } from './programa'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { OrdenCambio, RDO } from './types'

const HOY = dia('2026-10-20')
const x = (fecha: number, texto?: string) => ({ fecha, autor: 'Prueba', texto })

const extraordinaria = (obraId: string, numero = 9): OrdenCambio => ({
  id: `oc_prueba_${numero}`, obraId, numero, tipo: 'extraordinaria', causa: 'imprevisto', titulo: 'Drenaje', descripcion: '',
  lineas: [{ nueva: { codigo: `OC${numero}.1`, descripcion: 'Drenaje perimetral', unidad: 'ml', tipoCosto: 'SUB' }, cantidad: 100, puVenta: 50_000, puCosto: 40_000 }],
  diasPlazo: 7, creada: HOY - 10, devoluciones: [],
})

/** Lleva la orden por el ciclo hasta la etapa pedida y aplica sus efectos como lo hace el store. */
function avanzar(d: Datos, oc: OrdenCambio, hasta: 'aprobada_interna' | 'presentada' | 'aprobada_mandante' | 'rechazada') {
  let o = aplicarAccionOC(oc, 'valorizar', x(HOY - 9))
  o = aplicarAccionOC(o, 'aprobar_interna', x(HOY - 8))
  d.partidas.push(...partidasNuevas(o))
  if (hasta !== 'aprobada_interna') o = aplicarAccionOC(o, 'presentar', x(HOY - 7))
  if (hasta === 'aprobada_mandante') {
    o = aplicarAccionOC(o, 'aprobar_mandante', x(HOY - 5))
    const obra = d.obras.find((b) => b.id === o.obraId)!
    const efecto = aplicarAprobacion(d.partidas, obra, o, HOY - 5)
    d.partidas = efecto.partidas
    d.obras = d.obras.map((b) => (b.id === obra.id ? efecto.obra : b))
  }
  if (hasta === 'rechazada') o = aplicarAccionOC(o, 'rechazar', x(HOY - 5, 'No corresponde'))
  d.ordenesCambio.push(o)
  return o
}

const avanceEn = (partidaId: string, cantidad: number, obraId = 'obra_aromos'): RDO => ({
  id: `rdo_extra_${partidaId}`, obraId, cuadrillaId: 'cq_rojas', fecha: HOY - 3, clima: 'despejado', estado: 'validado', autor: 'X',
  avances: [{ partidaId, cantidad }], hh: [], observaciones: '',
})

describe('Órdenes de cambio: ciclo y permisos (10 §10, RN-P04)', () => {
  it('recorre borrador → valorizada → aprobada interna → presentada → aprobada por el mandante', () => {
    const vacia = { ...extraordinaria('o'), lineas: [] }
    expect(() => aplicarAccionOC(vacia, 'valorizar', x(HOY))).toThrow(/al menos una partida/)
    let o = extraordinaria('o')
    expect(etapaOC(o, HOY)).toBe('borrador')
    o = aplicarAccionOC(o, 'valorizar', x(HOY - 9))
    expect(etapaOC(o, HOY)).toBe('valorizada')
    o = aplicarAccionOC(o, 'aprobar_interna', x(HOY - 8))
    o = aplicarAccionOC(o, 'presentar', x(HOY - 7))
    expect(etapaOC(o, HOY)).toBe('presentada')
    expect(() => aplicarAccionOC(o, 'rechazar', x(HOY))).toThrow(/motivo/)
    o = aplicarAccionOC(o, 'aprobar_mandante', x(HOY - 5))
    expect(etapaOC(o, HOY)).toBe('aprobada_mandante')
    expect(montosOC(o)).toEqual({ venta: 5_000_000, costo: 4_000_000, margen: 0.2 })
  })

  it('sobre el 5 % del contrato la aprobación interna es de Gerencia', () => {
    const o = aplicarAccionOC(extraordinaria('o'), 'valorizar', x(HOY - 9))
    expect(requiereGerencia(o, 50_000_000)).toBe(true)
    expect(accionesOC(o, HOY, 'R02', 50_000_000)).not.toContain('aprobar_interna')
    expect(accionesOC(o, HOY, 'R01', 50_000_000)).toContain('aprobar_interna')
    expect(accionesOC(o, HOY, 'R02', 500_000_000)).toContain('aprobar_interna')
    const presentada = aplicarAccionOC(aplicarAccionOC(o, 'aprobar_interna', x(HOY - 8)), 'presentar', x(HOY - 7))
    expect(accionesOC(presentada, HOY, 'R11', 1).sort()).toEqual(['aprobar_mandante', 'rechazar'])
  })

  it('al aprobarla ajusta cantidades sin bajar de lo ejecutado y extiende el plazo', () => {
    const d = generarDemo(HOY)
    const obra = d.obras.find((o) => o.id === 'obra_aromos')!
    const p = d.partidas.find((q) => q.id === 'obra_aromos_p3.2')!
    const oc: OrdenCambio = { ...extraordinaria('obra_aromos'), tipo: 'disminucion', diasPlazo: 3, lineas: [{ partidaId: p.id, cantidad: -p.cantidad, puVenta: p.puVenta, puCosto: 1 }] }
    const r = aplicarAprobacion(d.partidas, obra, oc, HOY, new Map([[p.id, 500]]))
    expect(r.partidas.find((q) => q.id === p.id)!.cantidad).toBe(500)
    expect(r.obra.plazoDias).toBe(obra.plazoDias + 3)
  })
})

describe('Órdenes de cambio: efectos en EVM, EP y alertas', () => {
  it('una partida extraordinaria no cuenta hasta que el mandante aprueba la orden', () => {
    const d = generarDemo(HOY)
    const antes = calcularObra(d, 'obra_aromos', HOY)
    const oc = avanzar(d, extraordinaria('obra_aromos'), 'presentada')
    const id = idPartidaNueva(oc, 0)
    expect(partidaVigente(d.partidas.find((p) => p.id === id)!, d.ordenesCambio, HOY)).toBe(false)
    const pendiente = calcularObra(d, 'obra_aromos', HOY)
    expect(pendiente.venta).toBe(antes.venta)
    expect(pendiente.bac).toBe(antes.bac)
    expect(lineasEP(d, 'obra_aromos', HOY).some((l) => l.partidaId === id)).toBe(false)
  })

  it('aprobada: suma venta y presupuesto, se programa desde la aprobación y se puede cobrar', () => {
    const d = generarDemo(HOY)
    const antes = calcularObra(d, 'obra_aromos', HOY)
    const oc = avanzar(d, extraordinaria('obra_aromos'), 'aprobada_mandante')
    const id = idPartidaNueva(oc, 0)
    const c = calcularObra(d, 'obra_aromos', HOY)
    expect(c.venta - antes.venta).toBe(5_000_000)
    expect(c.bac - antes.bac).toBeCloseTo(4_000_000, -1)
    expect(c.terminoContractual - antes.terminoContractual).toBe(7)
    // Programada desde la aprobación, no desde el inicio de la obra
    const obra = d.obras.find((o) => o.id === 'obra_aromos')!
    const p = d.partidas.find((q) => q.id === id)!
    expect(cantidadesProgramadas(undefined, obra, new Map([[id, 100]]), HOY - 6, new Map([[id, p.inicioProgramado!]])).get(id)).toBe(0)
    d.rdos.push(avanceEn(id, 20))
    expect(lineasEP(d, 'obra_aromos', HOY).find((l) => l.partidaId === id)?.cantidad).toBe(20)
  })

  it('avance sin orden aprobada: costo sin venta y RULE-105 (alta; crítica si se rechaza)', () => {
    const d = generarDemo(HOY)
    const oc = avanzar(d, extraordinaria('obra_aromos'), 'presentada')
    const id = idPartidaNueva(oc, 0)
    d.rdos.push(avanceEn(id, 30))
    d.costos.push({ id: 'k_extra', obraId: 'obra_aromos', fecha: HOY - 2, partidaId: id, tipo: 'SUB', monto: 1_200_000, descripcion: 'Drenaje', origen: 'manual' })
    const c = calcularObra(d, 'obra_aromos', HOY)
    expect(c.extraNoAprobado).toHaveLength(1)
    expect(c.extraNoAprobado[0].monto).toBe(30 * 50_000)
    expect(c.acExtraNoAprobado).toBe(1_200_000)
    const reglas = evaluarReglas(d, c).filter((r) => r.regla === 'RULE-105')
    expect(reglas.map((r) => r.severidad)).toEqual(['alta'])

    d.ordenesCambio = d.ordenesCambio.map((o) => (o.id === oc.id ? aplicarAccionOC(o, 'rechazar', x(HOY - 1, 'No corresponde')) : o))
    const rechazada = calcularObra(d, 'obra_aromos', HOY)
    expect(evaluarReglas(d, rechazada).find((r) => r.regla === 'RULE-105')?.severidad).toBe('critica')
  })

  it('la demo trae una orden aprobada, una esperando al mandante y una valorizada', () => {
    const d = generarDemo(HOY)
    const etapas = d.ordenesCambio.filter((o) => o.obraId === 'obra_aromos').map((o) => etapaOC(o, HOY))
    expect(etapas).toEqual(['aprobada_mandante', 'presentada', 'valorizada'])
    const aprobada = d.partidas.find((p) => p.id === idPartidaNueva(d.ordenesCambio[0], 0))!
    expect(aprobada.inicioProgramado).toBeDefined()
    expect(calcularObra(d, 'obra_aromos', HOY).extraNoAprobado).toHaveLength(0)
  })
})
