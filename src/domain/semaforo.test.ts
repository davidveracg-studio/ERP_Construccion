import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { healthDetalle, healthScore } from './semaforo'
import { generarDemo } from './seed'

describe('Health Score', () => {
  it('el desglose pondera las 7 dimensiones y reproduce el score', () => {
    const hoy = dia('2026-10-20')
    const d = generarDemo(hoy)
    const c = calcularObra(d, 'obra_aromos', hoy - 1)
    const h = healthDetalle(c, d.config)
    expect(h.dimensiones.map((x) => x.peso)).toEqual([0.25, 0.2, 0.1, 0.1, 0.1, 0.15, 0.05])
    const con = h.dimensiones.filter((x) => x.valor != null)
    const promedio = con.reduce((s, x) => s + x.valor! * x.peso, 0) / con.reduce((s, x) => s + x.peso, 0)
    expect(h.sinTope).toBeCloseTo(promedio, 9)
    expect(h.score).toBe(healthScore(c, d.config))
    expect(h.tope).toBe(false)
  })
})
