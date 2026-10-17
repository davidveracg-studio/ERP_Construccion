import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import {
  accionesRiesgo, aplicarAccionRiesgo, diasSinPlan, estadoRiesgo, exposicionRiesgo, indicadoresRiesgo, nivelRiesgo, revisionVencida,
} from './riesgos'
import { generarDemo } from './seed'
import type { Riesgo } from './types'

const HOY = dia('2026-10-20')
const rs = (o: Partial<Riesgo> = {}): Riesgo => ({
  id: 'r1', obraId: 'obra_aromos', numero: 1, titulo: 'Riesgo', causa: 'Causa', categoria: 'plazo', origen: 'manual', evaluaciones: [], plan: [],
  historial: [{ fecha: 10, estado: 'identificado', por: 'X' }], partidaIds: [], creado: 10, creadoPor: 'X', ...o,
})
const ev = { probabilidad: 4 as const, impacto: 4 as const, impactoMonto: 10_000_000, impactoDias: 10 }
const x = (fecha: number, extra = {}) => ({ fecha, autor: 'Ana', ...extra })

describe('Riesgos: matriz y exposición (08 Riesgo)', () => {
  it('clasifica probabilidad × impacto en bajo, medio, alto y crítico', () => {
    expect(nivelRiesgo(1, 4)).toBe('bajo')
    expect(nivelRiesgo(2, 3)).toBe('medio')
    expect(nivelRiesgo(3, 4)).toBe('alto')
    expect(nivelRiesgo(4, 4)).toBe('critico')
  })

  it('la exposición es prob.% × impacto en dinero y en días, con la última evaluación', () => {
    const r = rs({ evaluaciones: [{ ...ev, fecha: 11, autor: 'A' }, { ...ev, probabilidad: 2, fecha: 20, autor: 'A' }] })
    expect(exposicionRiesgo(r, 15)).toEqual({ nivel: 'critico', puntaje: 16, monto: 7_000_000, dias: 7 })
    expect(exposicionRiesgo(r, 25)).toEqual({ nivel: 'medio', puntaje: 8, monto: 3_000_000, dias: 3 })
    expect(exposicionRiesgo(rs(), 25)).toBeNull()
  })
})

describe('Riesgos: ciclo de vida (10 §25)', () => {
  it('identificado → en análisis → abierto → en mitigación → materializado → cerrado', () => {
    let r = rs()
    expect(() => aplicarAccionRiesgo(r, 'evaluar', x(11, { evaluacion: ev, fechaRevision: 30 }))).toThrow(/identificado/)
    r = aplicarAccionRiesgo(r, 'asignar', x(11, { responsable: 'Ana' }))
    expect(estadoRiesgo(r, 11)).toBe('en_analisis')
    expect(() => aplicarAccionRiesgo(r, 'evaluar', x(12, { evaluacion: ev }))).toThrow(/revisión/)
    r = aplicarAccionRiesgo(r, 'evaluar', x(12, { evaluacion: ev, fechaRevision: 30 }))
    expect(estadoRiesgo(r, 12)).toBe('abierto')
    r = aplicarAccionRiesgo(r, 'registrar_plan', x(13, { accion: { id: 'a1', descripcion: 'Comprar antes', responsable: 'Ana', fecha: 20 } }))
    expect(estadoRiesgo(r, 13)).toBe('en_mitigacion')
    // La reevaluación no cambia el estado, pero queda en el historial de evaluaciones
    r = aplicarAccionRiesgo(r, 'evaluar', x(14, { evaluacion: { ...ev, probabilidad: 2 }, fechaRevision: 40 }))
    expect(estadoRiesgo(r, 14)).toBe('en_mitigacion')
    expect(r.evaluaciones).toHaveLength(2)
    r = aplicarAccionRiesgo(r, 'materializar', x(15))
    expect(estadoRiesgo(r, 15)).toBe('materializado')
    expect(() => aplicarAccionRiesgo(r, 'cerrar', x(16))).toThrow(/impacto real/)
    r = aplicarAccionRiesgo(r, 'cerrar', x(16, { impactoReal: { monto: 4_000_000, dias: 2 } }))
    expect(estadoRiesgo(r, 16)).toBe('cerrado')
    expect(estadoRiesgo(r, 12)).toBe('abierto')
  })

  it('en mitigación vuelve a abierto con motivo; cerrar sin materializar exige motivo', () => {
    let r = rs({ historial: [{ fecha: 10, estado: 'identificado', por: 'X' }, { fecha: 11, estado: 'en_mitigacion', por: 'X' }] })
    expect(() => aplicarAccionRiesgo(r, 'reabrir', x(12))).toThrow(/efectivo/)
    r = aplicarAccionRiesgo(r, 'reabrir', x(12, { nota: 'Proveedor alternativo tampoco tiene stock' }))
    expect(estadoRiesgo(r, 12)).toBe('abierto')
    expect(() => aplicarAccionRiesgo(r, 'cerrar', x(13))).toThrow(/motivo/)
    expect(estadoRiesgo(aplicarAccionRiesgo(r, 'cerrar', x(13, { nota: 'Ya no aplica' })), 13)).toBe('cerrado')
  })

  it('materializar y cerrar quedan para Gerencia y el administrador de obra', () => {
    const r = rs({ historial: [{ fecha: 10, estado: 'abierto', por: 'X' }] })
    expect(accionesRiesgo(r, 11, 'R05')).toEqual(['evaluar', 'registrar_plan'])
    expect(accionesRiesgo(r, 11, 'R02')).toContain('cerrar')
    expect(accionesRiesgo(r, 11, 'R11')).toEqual([])
  })
})

describe('Riesgos: alertas (RULE-610/611) e indicadores (KRI)', () => {
  const critico = rs({
    responsable: 'Ana', fechaRevision: 40,
    historial: [{ fecha: 10, estado: 'identificado', por: 'X' }, { fecha: 11, estado: 'abierto', por: 'X' }],
    evaluaciones: [{ ...ev, fecha: 11, autor: 'Ana' }],
  })

  it('RULE-610 a los 3 días sin plan; RULE-611 con la revisión superada', () => {
    expect(diasSinPlan(critico, 13)).toBe(2)
    expect(diasSinPlan(critico, 14)).toBe(3)
    const conPlan = aplicarAccionRiesgo(critico, 'registrar_plan', x(14, { accion: { id: 'a', descripcion: 'd', responsable: 'Ana', fecha: 20 } }))
    expect(diasSinPlan(conPlan, 15)).toBe(0)
    expect(revisionVencida(critico, 40)).toBe(false)
    expect(revisionVencida(critico, 41)).toBe(true)

    const d = generarDemo(HOY)
    d.riesgos.push({ ...critico, id: 'rx', creado: HOY - 10, historial: [{ fecha: HOY - 10, estado: 'abierto', por: 'X' }], evaluaciones: [{ ...ev, fecha: HOY - 5, autor: 'Ana' }], fechaRevision: HOY - 1 })
    const reglas = evaluarReglas(d, calcularObra(d, 'obra_aromos', HOY))
    expect(reglas.find((r) => r.clave === 'RULE-610|rx')?.severidad).toBe('alta')
    expect(reglas.find((r) => r.clave === 'RULE-611|rx')?.severidad).toBe('media')
  })

  it('la demo tiene un registro sano: exposición bajo la contingencia y holgura, sin críticos ni vencidos', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras) {
        const c = calcularObra(d, o.id, t)
        const kri = indicadoresRiesgo(d.riesgos.filter((r) => r.obraId === o.id), c, d.config, t)
        const donde = `${o.id} día +${k}`
        expect(kri.abiertos, donde).toBeGreaterThan(0)
        expect(kri.estado.kri02, donde).toBe('verde')
        expect(kri.estado.kri03, donde).toBe('verde')
        expect(kri.estado.kri04, donde).toBe('verde')
        expect(kri.estado.kri05, donde).toBe('verde')
        expect(kri.estado.kri06, donde).toBe('verde')
        expect(evaluarReglas(d, c).filter((r) => ['RULE-610', 'RULE-611', 'RULE-612'].includes(r.regla)), donde).toEqual([])
      }
    }
  })
})
