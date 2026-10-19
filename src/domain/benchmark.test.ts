import { describe, expect, it } from 'vitest'
import { generarInforme, nombreMes, ultimoMesCerrado } from './auditoria'
import { benchmark, cartera, indicesOBR, norm, percentil, riesgoEmpresarial, scoreEmpresa, scoresMandante, scoresSubcontratista } from './benchmark'
import { dia } from './fechas'
import { generarDemo } from './seed'

const HOY = dia('2026-10-20')

describe('Benchmark, scores y auditoría mensual (14 §6–§14)', () => {
  it('percentil por interpolación entre P10–P90, orientado para que más alto sea mejor', () => {
    const d = { p: [10, 20, 30, 40, 50] as [number, number, number, number, number] }
    expect(percentil(30, d)).toBe(50)
    expect(percentil(35, d)).toBe(63)
    expect(percentil(30, { ...d, menorMejor: true })).toBe(50)
    expect(percentil(15, { ...d, menorMejor: true })).toBe(83)
    expect(percentil(-100, d)).toBe(1)
    expect(percentil(1000, d)).toBe(99)
    expect(norm(1, 1, 0.9, 0.8)).toBe(100)
    expect(norm(0.9, 1, 0.9, 0.8)).toBe(60)
    expect(norm(5, 0, 2, 5)).toBe(0)
  })

  it('la demo: empresa sana, riesgo medio por concentración de mandante y F30-1, scores e índices calculados', () => {
    const t = HOY - 1
    const d = generarDemo(HOY)
    const xs = cartera(d, t)
    const emp = scoreEmpresa(d, xs, t)
    expect(emp.score).toBeGreaterThanOrEqual(80)
    const r = riesgoEmpresarial(d, xs, t)
    expect(r.nivel).toBe('Medio')
    expect(r.factores.map((f) => f.factor)).toContain('Concentración de mandante (KCM-05)')
    const ben = benchmark(d, xs, t)
    expect(ben.posiciones.length).toBeGreaterThanOrEqual(8)
    expect(ben.posicion).toBeGreaterThanOrEqual(1)
    expect(ben.rendimientos.length).toBeGreaterThan(0)
    expect(scoresMandante(d, xs, t).length).toBe(3)
    expect(scoresSubcontratista(d, t).find((s) => s.subcontratista === 'Eléctrica Norte Ltda.')!.bloqueados).toBeGreaterThan(0)
    expect(indicesOBR(d, xs, t).madurez).toBeGreaterThanOrEqual(4)
  })

  it('la auditoría mensual es una foto del corte con recomendaciones; la demo trae los dos últimos meses', () => {
    const d = generarDemo(HOY)
    expect(d.auditorias.map((a) => nombreMes(a.mes))).toEqual(['agosto 2026', 'septiembre 2026'])
    const inf = generarInforme(d, ultimoMesCerrado(HOY))
    expect(inf.mes).toBe('2026-09')
    expect(inf.recomendaciones.map((x) => x.regla)).toContain('KCM-05')
    expect(inf.obras).toHaveLength(3)
    expect(inf.desviaciones.length).toBeLessThanOrEqual(5)
    expect(d.auditorias.at(-1)!.informe.scoreEmpresa).toBe(inf.scoreEmpresa)
    expect(d.auditorias.at(-1)!.informe.recomendaciones).toEqual(inf.recomendaciones)
  })
})
