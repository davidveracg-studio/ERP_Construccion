import { describe, expect, it } from 'vitest'
import { anticipoPorAmortizar, CONDICIONES_PAGO_DEFECTO, epVencido, etapaEP, lineasEP, montosEP } from './caja'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { EstadoPago } from './types'

const HOY = dia('2026-10-20')
const ep = (o: Partial<EstadoPago>): EstadoPago => ({
  id: 'e', obraId: 'o', numero: 1, tipo: 'avance', fechaCorte: 0, lineas: [], bruto: 100, retencion: 5, amortizacion: 10, neto: 85, presentado: 10, ...o,
})

describe('Caja: estados de pago', () => {
  it('la etapa depende de la fecha consultada', () => {
    const e = ep({ presentado: 10, aprobado: 20, facturado: 21, vencimiento: 51, pagado: 50 })
    expect(etapaEP(e, 5)).toBeNull()
    expect(etapaEP(e, 15)).toBe('presentado')
    expect(etapaEP(e, 20)).toBe('aprobado')
    expect(etapaEP(e, 30)).toBe('facturado')
    expect(etapaEP(e, 50)).toBe('pagado')
    expect(epVencido(ep({ facturado: 21, vencimiento: 51 }), 60)).toBe(true)
    expect(epVencido(e, 60)).toBe(false)
  })

  it('descuenta retención y amortiza el anticipo hasta agotarlo', () => {
    const cond = { ...CONDICIONES_PAGO_DEFECTO, anticipo: 0.1, retencion: 0.05 }
    expect(montosEP(1000, cond, 500)).toEqual({ retencion: 50, amortizacion: 100, neto: 850 })
    expect(montosEP(1000, cond, 30)).toEqual({ retencion: 50, amortizacion: 30, neto: 920 })
    const eps = [ep({ tipo: 'anticipo', bruto: 300, amortizacion: 0 }), ep({ amortizacion: 100 })]
    expect(anticipoPorAmortizar(eps, 20)).toBe(200)
  })

  it('el próximo EP incluye solo lo validado que no se ha cobrado', () => {
    const d = generarDemo(HOY)
    const lineas = lineasEP(d, 'obra_aromos', HOY - 1)
    expect(lineas.length).toBeGreaterThan(0)
    const yaIncluido = d.estadosPago.filter((e) => e.obraId === 'obra_aromos').flatMap((e) => e.lineas)
    for (const l of lineas) expect(l.monto).toBeGreaterThan(0)
    // Lo cobrado más lo pendiente no supera lo ejecutado validado
    const total = [...yaIncluido, ...lineas].reduce((s, l) => s + l.monto, 0)
    const c = calcularObra(d, 'obra_aromos', HOY - 1)
    const valorizado = c.partidas.reduce((s, cp) => s + cp.cantEjec * cp.p.puVenta, 0)
    expect(total).toBeLessThanOrEqual(valorizado + 1)
  })
})

describe('Caja: proyección', () => {
  for (const obra of ['obra_aromos', 'obra_clinica']) {
    it(`${obra}: el flujo total de la obra es su resultado (venta − costo a término)`, () => {
      const d = generarDemo(HOY)
      const c = calcularObra(d, obra, HOY)
      const total = c.caja.movimientos.reduce((s, m) => s + m.monto, 0)
      expect(Math.abs(total - (c.venta - c.eac)) / c.venta).toBeLessThan(0.005)
      // Hasta hoy, todo es real; después, comprometido o estimado
      for (const m of c.caja.movimientos) expect(m.origen === 'real').toBe(m.fecha <= HOY)
    })
  }

  it('la caja de un día pasado no usa cobros ni pagos posteriores', () => {
    const d = generarDemo(HOY)
    const antes = calcularObra(d, 'obra_aromos', HOY - 30)
    for (const m of antes.caja.movimientos.filter((x) => x.origen === 'real')) expect(m.fecha).toBeLessThanOrEqual(HOY - 30)
    expect(antes.caja.saldoHoy).not.toBe(calcularObra(d, 'obra_aromos', HOY).caja.saldoHoy)
  })

  it('alerta RULE-603 cuando la caja proyectada no alcanza y RULE-402 con EP vencidos', () => {
    const d = generarDemo(HOY)
    // Mandante que no paga: todos los EP quedan facturados y vencidos, sin capital de trabajo
    d.estadosPago = d.estadosPago.map((e) => (e.pagado != null ? { ...e, pagado: undefined } : e))
    d.obras = d.obras.map((o) => ({ ...o, condicionesPago: { ...o.condicionesPago!, capitalTrabajo: 0 } }))
    const c = calcularObra(d, 'obra_aromos', HOY)
    expect(c.caja.estado).toBe('rojo')
    expect(c.caja.epVencidos.length).toBeGreaterThan(0)
    expect(c.caja.cxcVencida).toBeGreaterThan(0)
    const reglas = evaluarReglas(d, c).map((x) => `${x.regla}:${x.severidad}`)
    expect(reglas).toContain('RULE-603:alta')
    expect(reglas.some((r) => r.startsWith('RULE-402'))).toBe(true)
  })
})
