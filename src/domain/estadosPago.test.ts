import { describe, expect, it } from 'vitest'
import { CONDICIONES_PAGO_DEFECTO } from './caja'
import {
  accionesEP, aplicarAccion, editable, epAtrasado, epVencido, etapaEP, indicadoresEP, pagadoHasta, pendientePorPartida, recalcularEP,
} from './estadosPago'
import { dia, finDeMes } from './fechas'
import { generarDemo } from './seed'
import type { EstadoPago } from './types'

const HOY = dia('2026-10-20')
const COND = { ...CONDICIONES_PAGO_DEFECTO, retencion: 0.05, anticipo: 0, reajuste: { indice: 'IPC', base: 100 } }
const nuevo = (): EstadoPago => ({
  id: 'e', obraId: 'o', numero: 1, tipo: 'avance', fechaCorte: 0, version: 1, lineas: [{ partidaId: 'p', cantidad: 10, monto: 1000 }],
  bruto: 1000, reajuste: 0, descuentos: [], retencion: 50, amortizacion: 0, neto: 950, creado: 1, presentaciones: [], observaciones: [], pagos: [],
})
const x = (fecha: number, o: Partial<{ texto: string; factura: string; monto: number }> = {}) => ({ fecha, autor: 'Prueba', ...o })

describe('Estados de pago: ciclo (10 §9)', () => {
  it('recorre borrador → revisión → presentado → observado → v2 → aprobado → facturado → pago parcial → pagado', () => {
    let e = nuevo()
    expect(etapaEP(e, 1)).toBe('borrador')
    expect(editable(e, 1)).toBe(true)
    e = aplicarAccion(e, 'enviar_revision', x(2), COND)
    expect(etapaEP(e, 2)).toBe('en_revision_interna')
    e = aplicarAccion(e, 'presentar', x(3), COND)
    expect(etapaEP(e, 3)).toBe('presentado')
    expect(editable(e, 3)).toBe(false)
    expect(() => aplicarAccion(e, 'observar', x(5), COND)).toThrow(/obligatoria/)
    e = aplicarAccion(e, 'observar', x(5, { texto: 'Falta respaldo' }), COND)
    expect(etapaEP(e, 5)).toBe('observado')
    expect(editable(e, 5)).toBe(true)
    e = aplicarAccion(e, 'presentar', x(7), COND)
    expect(e.version).toBe(2)
    expect(etapaEP(e, 7)).toBe('presentado')
    e = aplicarAccion(e, 'aprobar', x(12), COND)
    e = aplicarAccion(e, 'facturar', x(13, { factura: 'F-1' }), COND)
    expect(e.vencimiento).toBe(13 + COND.diasPago)
    e = aplicarAccion(e, 'pagar', x(40, { monto: 500 }), COND)
    expect(etapaEP(e, 40)).toBe('pagado_parcial')
    expect(epVencido(e, 50)).toBe(true)
    e = aplicarAccion(e, 'pagar', x(51), COND)
    expect(etapaEP(e, 51)).toBe('pagado')
    expect(pagadoHasta(e, 51)).toBe(950)
    // La etapa a una fecha pasada no cambia
    expect(etapaEP(e, 6)).toBe('observado')
  })

  it('observar y reingresar el mismo día deja el EP presentado', () => {
    let e = aplicarAccion({ ...nuevo(), enRevision: 2, presentaciones: [3] }, 'observar', x(5, { texto: 'Corregir' }), COND)
    e = aplicarAccion(e, 'presentar', x(5), COND)
    expect(etapaEP(e, 5)).toBe('presentado')
    expect(e.version).toBe(2)
  })

  it('cada acción la ejecuta el rol que corresponde', () => {
    const borrador = nuevo()
    expect(accionesEP(borrador, 1, 'R05')).toContain('enviar_revision')
    expect(accionesEP(borrador, 1, 'R11')).toEqual([])
    const presentado = { ...borrador, enRevision: 2, presentaciones: [3] }
    expect(accionesEP(presentado, 3, 'R11').sort()).toEqual(['aprobar', 'observar'])
    expect(accionesEP(presentado, 3, 'R05')).toEqual([])
    expect(() => aplicarAccion(borrador, 'aprobar', x(1), COND)).toThrow(/No se puede/)
  })

  it('recalcula reajuste, retención y descuentos', () => {
    const e = recalcularEP({ ...nuevo(), indiceReajuste: 102, descuentos: [{ concepto: 'Multa', monto: 100 }] }, COND, [])
    expect(e.reajuste).toBe(20)
    expect(e.retencion).toBe(51)
    expect(e.neto).toBe(1000 + 20 - 51 - 100)
  })

  it('anular libera el avance para otro EP', () => {
    const d = generarDemo(HOY)
    const ultimo = d.estadosPago.filter((e) => e.obraId === 'obra_aromos' && e.tipo === 'avance').at(-1)!
    const antes = pendientePorPartida(d, 'obra_aromos', ultimo.fechaCorte)
    d.estadosPago = d.estadosPago.map((e) => (e.id === ultimo.id ? { ...e, anulado: HOY - 1, motivoAnulacion: 'x' } : e))
    const despues = pendientePorPartida(d, 'obra_aromos', ultimo.fechaCorte)
    const suma = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0)
    expect(suma(despues)).toBeGreaterThan(suma(antes))
  })
})

describe('Estados de pago: demo, indicadores y RULE-403', () => {
  it('la demo trae generadores, reajuste IPC y un EP observado y reingresado', () => {
    const d = generarDemo(HOY)
    const aromos = d.estadosPago.filter((e) => e.obraId === 'obra_aromos' && e.tipo === 'avance')
    expect(aromos.every((e) => e.lineas.every((l) => (l.generadores ?? []).length > 0))).toBe(true)
    expect(aromos.some((e) => e.reajuste > 0)).toBe(true)
    const v2 = aromos.find((e) => e.version === 2)!
    expect(v2.observaciones[0].origen).toBe('mandante')
    const ind = indicadoresEP(aromos, HOY)
    expect(ind.diasPreparacion).toBe(3)
    expect(ind.observados).toBeGreaterThan(0)
  })

  it('alerta si el avance del mes cerrado no se presenta a tiempo', () => {
    const d = generarDemo(HOY)
    const corte = finDeMes(finDeMes(HOY) - 31)
    expect(epAtrasado(d, 'obra_aromos', HOY)).toBeNull()
    d.estadosPago = d.estadosPago.filter((e) => !(e.obraId === 'obra_aromos' && e.fechaCorte >= corte))
    expect(epAtrasado(d, 'obra_aromos', HOY)).toBe(corte)
  })
})
