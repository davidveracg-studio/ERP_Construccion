import { describe, expect, it } from 'vitest'
import {
  estadoGarantia, estadoObligacion, estadoObraPorRecepcion, estadoRecepcion, exposicionMultas, garantiasVivas, multaDevengada,
} from './contrato'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { Garantia, Obligacion, RecepcionObra } from './types'

const HOY = dia('2026-10-20')
const ob = (o: Partial<Obligacion>): Obligacion => ({ id: 'ob', obraId: 'obra_aromos', tipo: 'informe', titulo: 'Informe', responsable: 'X', fechaLimite: 100, creada: 0, ...o })
const ga = (o: Partial<Garantia>): Garantia => ({
  id: 'g1', obraId: 'obra_aromos', tipo: 'boleta', objeto: 'fiel_cumplimiento', numero: '1', emisor: 'Banco', monto: 1000, emision: 0, vencimiento: 100, creada: 0, ...o,
})
const rc = (o: Partial<RecepcionObra>): RecepcionObra => ({ id: 'r', obraId: 'o', tipo: 'provisoria', fecha: 10, resultado: 'recibida', observaciones: [], registradaPor: 'X', ...o })

describe('Contrato: obligaciones y multas (RULE-904)', () => {
  it('pasa de pendiente a por vencer, vencida o cumplida', () => {
    expect(estadoObligacion(ob({}), 80)).toBe('pendiente')
    expect(estadoObligacion(ob({}), 92)).toBe('por_vencer')
    expect(estadoObligacion(ob({}), 101)).toBe('vencida')
    expect(estadoObligacion(ob({ cumplida: 99 }), 120)).toBe('cumplida')
    expect(estadoObligacion(ob({ cumplida: 104 }), 120)).toBe('cumplida_con_atraso')
  })

  it('devenga la multa diaria hasta que se cumple, o la fija una vez', () => {
    expect(multaDevengada(ob({ multa: { tipo: 'diaria', monto: 10 } }), 105)).toBe(50)
    expect(multaDevengada(ob({ multa: { tipo: 'diaria', monto: 10 }, cumplida: 103 }), 120)).toBe(30)
    expect(multaDevengada(ob({ multa: { tipo: 'fija', monto: 500 } }), 101)).toBe(500)
    expect(multaDevengada(ob({ multa: { tipo: 'fija', monto: 500 } }), 99)).toBe(0)
  })

  it('la exposición suma atraso, obligaciones y multas aplicadas, con tope', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const obra = { ...c.obra, multaDiaria: 1_000_000_000 }
    const e = exposicionMultas({ ...c, atrasoProyectado: 5 }, [], 0, obra)
    expect(e.total).toBe(e.tope)
    expect(exposicionMultas(c, [ob({ fechaLimite: HOY - 4, multa: { tipo: 'diaria', monto: 100_000 } })], 50_000, c.obra).obligaciones).toBe(400_000)
  })
})

describe('Contrato: garantías (10 §20, RULE-404)', () => {
  it('vigente → por vencer → vencida; renovada, devuelta o cobrada', () => {
    const g = ga({})
    expect(estadoGarantia(g, [g], 50)).toBe('vigente')
    expect(estadoGarantia(g, [g], 75)).toBe('por_vencer')
    expect(estadoGarantia(g, [g], 101)).toBe('vencida')
    const nueva = ga({ id: 'g2', reemplazaA: 'g1', emision: 80, vencimiento: 300, creada: 80 })
    expect(estadoGarantia(g, [g, nueva], 85)).toBe('renovada')
    expect(garantiasVivas([g, nueva], 85).map((x) => x.id)).toEqual(['g2'])
    expect(estadoGarantia(ga({ devuelta: 60 }), [], 70)).toBe('devuelta')
    expect(estadoGarantia(ga({ cobrada: 60 }), [], 70)).toBe('cobrada')
  })

  it('alerta alta por vencer y crítica vencida; RULE-904 media sin multa y alta con multa', () => {
    const d = generarDemo(HOY)
    d.garantias.push(ga({ id: 'gx', emision: HOY - 300, vencimiento: HOY + 10, creada: HOY - 300 }), ga({ id: 'gy', emision: HOY - 300, vencimiento: HOY - 2, creada: HOY - 300 }))
    d.obligaciones.push(ob({ id: 'ox', fechaLimite: HOY + 5 }), ob({ id: 'oy', fechaLimite: HOY + 5, multa: { tipo: 'diaria', monto: 1 } }))
    const reglas = evaluarReglas(d, calcularObra(d, 'obra_aromos', HOY))
    const sev = (clave: string) => reglas.find((r) => r.clave === clave)?.severidad
    expect(sev('RULE-404|gx')).toBe('alta')
    expect(sev('RULE-404|gy')).toBe('critica')
    expect(sev('RULE-904|ox')).toBe('media')
    expect(sev('RULE-904|oy')).toBe('alta')
  })
})

describe('Contrato: recepción (10 §16)', () => {
  it('la provisoria queda sin observaciones con todos los V°B°, y la obra pasa a garantía y luego a cerrada', () => {
    const r = rc({ observaciones: [{ id: 'a', texto: 'x', plazo: 30, subsanada: 20 }, { id: 'b', texto: 'y', plazo: 30, subsanada: 21, vistoBueno: 22 }] })
    expect(estadoRecepcion(r, 25)).toBe('provisoria_con_observaciones')
    expect(estadoObraPorRecepcion([r], 'o', 25, 'en_ejecucion')).toBe('recepcion_provisoria')
    const cerrada = { ...r, observaciones: r.observaciones.map((o) => ({ ...o, vistoBueno: 23 })) }
    expect(estadoObraPorRecepcion([cerrada], 'o', 25, 'en_ejecucion')).toBe('en_garantia')
    expect(estadoObraPorRecepcion([cerrada, rc({ id: 'd', tipo: 'definitiva', fecha: 400 })], 'o', 401, 'en_garantia')).toBe('cerrada')
    expect(estadoObraPorRecepcion([rc({ resultado: 'rechazada' })], 'o', 25, 'terminada')).toBe('en_ejecucion')
  })

  it('la demo trae una obra terminada en recepción provisoria, con retenciones por devolver', () => {
    const d = generarDemo(HOY)
    const bodegas = d.obras.find((o) => o.id === 'obra_bodegas')!
    expect(bodegas.estado).toBe('recepcion_provisoria')
    const c = calcularObra(d, 'obra_bodegas', HOY)
    expect(c.avanceReal).toBeGreaterThan(0.99)
    const recepcion = d.recepciones.find((r) => r.obraId === 'obra_bodegas')!
    expect(recepcion.observaciones.filter((o) => !o.vistoBueno)).toHaveLength(1)
    expect(c.caja.movimientos.find((m) => m.tipo === 'retencion')?.detalle).toMatch(/recepción provisoria/)
    // Una obra terminada no está "rezagada" aunque haya consumido todo el plazo
    expect(evaluarReglas(d, c).some((r) => r.regla === 'RULE-109')).toBe(false)
  })
})
