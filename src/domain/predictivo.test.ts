import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { anomalias, curvasAprendizaje, diasLluvia, eacMetodos, escenarioCuadrilla, escenarioPropuesta, mediana, regresion, rng, simularPlazo } from './predictivo'
import { estadoPropuesta } from './comercial'
import { generarDemo } from './seed'

const HOY = dia('2026-10-20')

describe('Motor predictivo (13, 14 §18)', () => {
  it('utilidades: regresión, mediana, generador reproducible y lluvia estacional', () => {
    const r = regresion([1, 2, 3, 4], [2, 4, 6, 8])!
    expect(r.b).toBeCloseTo(2)
    expect(r.a).toBeCloseTo(0)
    expect(r.r2).toBeCloseTo(1)
    expect(mediana([5, 1, 3])).toBe(3)
    const a = rng(1), b = rng(1)
    expect([a(), a()]).toEqual([b(), b()])
    // Invierno llueve más que verano en Coquimbo
    expect(diasLluvia(dia('2026-06-01'), dia('2026-07-01'))).toBeGreaterThan(diasLluvia(dia('2026-01-01'), dia('2026-01-31')))
  })

  it('la demo: tres métodos de EAC con rango, Monte Carlo reproducible con P50 ≤ P80 y probabilidad de cumplir', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY - 1)
    const e = eacMetodos(c, d)
    expect(e.metodos.filter((m) => m.eac != null)).toHaveLength(5)
    expect(e.minimo!).toBeLessThanOrEqual(c.eac)
    expect(e.maximo!).toBeGreaterThanOrEqual(c.eac)
    const s1 = simularPlazo(c)!, s2 = simularPlazo(c)!
    expect(s1.p50).toBe(s2.p50)
    expect(s1.p10).toBeLessThanOrEqual(s1.p50)
    expect(s1.p50).toBeLessThanOrEqual(s1.p80)
    expect(s1.probCumplir).toBeGreaterThan(0.5)
    expect(s1.histograma.reduce((s, h) => s + h.n, 0)).toBe(s1.n)
  })

  it('curva de aprendizaje de los pisos, sin anomalías y escenarios de cuadrilla y propuesta', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY - 1)
    const cv = curvasAprendizaje(d, c)
    expect(cv[0].puntos).toHaveLength(5)
    expect(cv[0].tasa).not.toBeNull()
    expect(anomalias(d, c)).toEqual([])
    const crit = c.actualizado!.actividades.find((a) => !a.finReal && !a.esHito && c.cpm.get(a.id)?.critica)!
    const esc = escenarioCuadrilla(d, c, crit.id, 4)!
    expect(esc.factor).toBeGreaterThan(1)
    expect(esc.costo).toBeGreaterThan(0)
    // Acelerar la estructura adelanta el hito "Término obra gruesa"
    expect(esc.hitos.some((h) => h.despues! < h.antes!)).toBe(true)
    const p = d.propuestas.find((x) => estadoPropuesta(x, HOY) === 'enviada')!
    const ep = escenarioPropuesta(d, HOY - 1, p)
    expect(ep.backlogDespues).toBeGreaterThan(ep.backlogAntes)
    expect(ep.trabajadores).toBeGreaterThan(0)
  })
})
