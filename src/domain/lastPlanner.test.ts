import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import {
  accionesTarea, aplicarAccionTarea, avanceReportado, estadoTarea, indicadoresLP, liberacion, lunesDe, ppcSemana, replanificar, restriccionUrgente,
} from './lastPlanner'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { RDO, RFI, TareaSemanal } from './types'

const HOY = dia('2026-10-20') // martes
const L = lunesDe(HOY)
const ctx = { rfis: [] as RFI[], submittals: [] }
const ts = (o: Partial<TareaSemanal> = {}): TareaSemanal => ({
  id: 't1', obraId: 'obra_aromos', semana: L, descripcion: 'Losa', partidaId: 'p1', responsable: 'Capataz', meta: 10, inicio: L, fin: L + 4,
  restricciones: [], historial: [], creado: L - 5, creadoPor: 'JT', ...o,
})
const x = (fecha: number, extra = {}) => ({ fecha, autor: 'JT', ctx, ...extra })

describe('Last Planner: ciclo de la tarea (10 §8)', () => {
  it('no se compromete con restricciones abiertas; propuesta → comprometida → en ejecución → cumplida', () => {
    const conRx = ts({ restricciones: [{ id: 'r', tipo: 'material', descripcion: 'Moldaje', responsable: 'A', fechaCompromiso: L - 1 }] })
    expect(() => aplicarAccionTarea(conRx, 'comprometer', x(L - 3))).toThrow(/restricción/)
    let t = aplicarAccionTarea(ts(), 'comprometer', x(L - 3))
    expect(accionesTarea(t, L, 'R04')).toEqual(['iniciar'])
    t = aplicarAccionTarea(t, 'iniciar', x(L))
    expect(() => aplicarAccionTarea(t, 'cumplir', x(L + 4, { logrado: 8 }))).toThrow(/meta/)
    t = aplicarAccionTarea(t, 'cumplir', x(L + 4, { logrado: 11 }))
    expect(estadoTarea(t, L + 4)).toBe('cumplida')
  })

  it('no cumplida exige causa y se replanifica con lo que faltó en la semana siguiente', () => {
    const t0 = aplicarAccionTarea(ts(), 'comprometer', x(L - 3))
    expect(() => aplicarAccionTarea(t0, 'no_cumplir', x(L + 4, { logrado: 6 }))).toThrow(/causa/)
    const t = aplicarAccionTarea(t0, 'no_cumplir', x(L + 4, { logrado: 6, causa: 'clima' }))
    const r = replanificar(t, 't2', L + 4, 'JT')
    expect([r.semana, r.meta, r.reemplazaA, estadoTarea(r, L + 5)]).toEqual([L + 7, 4, 't1', 'propuesta'])
  })

  it('la restricción de RFI se libera sola al responderse; avisa a 48 h del inicio', () => {
    const rfi: RFI = {
      id: 'q', obraId: 'obra_aromos', numero: 1, asunto: 'a', pregunta: 'b', disciplina: 'estructura', destinatario: 'mandante', partidaIds: [], creado: L - 10, creadoPor: 'X',
      historial: [{ fecha: L - 9, estado: 'emitido', por: 'X' }, { fecha: L + 2, estado: 'respondido', por: 'ITO', texto: 'ok' }],
    }
    const t = ts({ semana: L + 7, inicio: L + 7, fin: L + 11, restricciones: [{ id: 'r', tipo: 'rfi', descripcion: 'RFI 1', responsable: 'OT', fechaCompromiso: L + 3, rfiId: 'q' }] })
    const c = { rfis: [rfi], submittals: [] }
    expect(liberacion(t.restricciones[0], c, L + 1)).toBeNull()
    expect(liberacion(t.restricciones[0], c, L + 2)).toBe(L + 2)
    expect(restriccionUrgente(t, ctx, L + 4)).toBe(false) // a 3 días
    expect(restriccionUrgente(t, ctx, L + 5)).toBe(true) // a 2 días
    expect(restriccionUrgente(t, c, L + 5)).toBe(false) // ya liberada
  })

  it('el logrado sale de los RDO de la partida y la cuadrilla en la semana', () => {
    const rdo = (fecha: number, cantidad: number, cuadrillaId = 'cq'): RDO => ({
      id: `r${fecha}${cuadrillaId}`, obraId: 'obra_aromos', cuadrillaId, fecha, clima: 'despejado', estado: 'validado', autor: 'C', avances: [{ partidaId: 'p1', cantidad }], hh: [], observaciones: '',
    })
    const rdos = [rdo(L, 3), rdo(L + 1, 4), rdo(L + 1, 9, 'otra'), rdo(L + 7, 5)]
    expect(avanceReportado(ts({ cuadrillaId: 'cq' }), rdos, L + 6)).toBe(7)
    expect(avanceReportado(ts({ cuadrillaId: 'cq' }), rdos, L)).toBe(3)
    expect(avanceReportado(ts(), rdos, L + 6)).toBe(16)
  })
})

describe('Last Planner: PPC (KPL-04) y alertas', () => {
  it('PPC = cumplidas / comprometidas; RULE-113 media bajo 70 % y alta bajo 60 %', () => {
    const cerrar = (id: string, ok: boolean) => ts({
      id, semana: L - 7, historial: [{ fecha: L - 10, estado: 'comprometida', por: 'JT' }, { fecha: L - 3, estado: ok ? 'cumplida' : 'no_cumplida', por: 'JT' }], causa: ok ? undefined : 'material',
    })
    const tareas = [cerrar('a', true), cerrar('b', true), cerrar('c', false), cerrar('d', false), ts({ id: 'e', semana: L - 7 })]
    expect(ppcSemana(tareas, L - 7, HOY)).toMatchObject({ comprometidas: 4, cumplidas: 2, ppc: 0.5, cerrada: true })
    const ind = indicadoresLP(tareas, ctx, HOY)
    expect([ind.ultima?.ppc, ind.estado, ind.causas]).toEqual([0.5, 'rojo', [{ causa: 'material', n: 2 }]])

    const d = generarDemo(HOY)
    d.tareasSemanales = tareas
    const regla = evaluarReglas(d, calcularObra(d, 'obra_aromos', HOY)).find((r) => r.regla === 'RULE-113')
    expect(regla?.severidad).toBe('alta')
  })

  it('la demo tiene PPC en meta, sin restricciones urgentes, con causas registradas y lookahead con restricciones', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras.filter((y) => y.estado === 'en_ejecucion')) {
        const tareas = d.tareasSemanales.filter((y) => y.obraId === o.id)
        const ind = indicadoresLP(tareas, { rfis: d.rfis, submittals: d.submittals }, t)
        const donde = `${o.id} día +${k}`
        expect(ind.estado, donde).toBe('verde')
        expect(ind.urgentes, donde).toBe(0)
        expect(ind.restriccionesAbiertas, donde).toBeGreaterThan(0)
        // Lo logrado en las tareas cerradas coincide con los RDO
        for (const y of tareas.filter((z) => z.logrado != null)) expect(y.logrado, donde).toBeCloseTo(avanceReportado(y, d.rdos, t)!, 1)
        expect(evaluarReglas(d, calcularObra(d, o.id, t)).filter((r) => r.regla === 'RULE-113' || r.regla === 'RULE-114'), donde).toEqual([])
      }
      expect(d.tareasSemanales.some((y) => estadoTarea(y, t) === 'no_cumplida')).toBe(true)
    }
  })
})
