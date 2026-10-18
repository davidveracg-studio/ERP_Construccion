import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { costoParte, equiposDeObra, erroresParte, estadoParte, indicadoresEquipo, rendimientoEquipo } from './maquinaria'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { Equipo, ParteMaquinaria } from './types'

const HOY = dia('2026-10-20')
const eq = (o: Partial<Equipo> = {}): Equipo => ({
  id: 'e', codigo: 'EQ-1', nombre: 'Grúa', tipo: 'Grúa', propiedad: 'propio', tarifa: { modalidad: 'mes', monto: 2_200_000 }, costoHoraPresupuesto: 10_000, consumoEstandar: 10,
  obraId: 'obra_aromos', asignado: 0, mantenciones: [], ...o,
})
const parte = (fecha: number, o: Partial<ParteMaquinaria> = {}): ParteMaquinaria => ({
  id: `p${fecha}`, obraId: 'obra_aromos', equipoId: 'e', fecha, operador: 'O', horometroInicial: 0, horometroFinal: 8, horasDisponibles: 9,
  trabajos: [{ partidaId: 'a', horas: 6 }, { partidaId: 'b', horas: 2 }], improductivas: [{ horas: 1, causa: 'espera_frente' }], horasMantencion: 0, combustible: 80,
  historial: [{ fecha, estado: 'enviado', por: 'O' }, { fecha: fecha + 1, estado: 'validado', por: 'J' }], creado: fecha, creadoPor: 'J', ...o,
})

describe('Parte diario de maquinaria (10 §29)', () => {
  it('valida que las horas cuadren con las disponibles y el horómetro', () => {
    expect(erroresParte(parte(10))).toBeNull()
    expect(erroresParte(parte(10, { horasDisponibles: 7 }))).toMatch(/disponibles/)
    expect(erroresParte(parte(10, { horometroFinal: 5 }))).toMatch(/horómetro/)
    expect(estadoParte(parte(10), 10)).toBe('enviado')
    expect(estadoParte(parte(10), 11)).toBe('validado')
  })

  it('el costo va a cada partida: por hora, o el costo fijo del día repartido', () => {
    expect(costoParte(parte(10), eq({ tarifa: { modalidad: 'hora', monto: 50_000 } }))).toEqual([{ partidaId: 'a', horas: 6, monto: 300_000 }, { partidaId: 'b', horas: 2, monto: 100_000 }])
    expect(costoParte(parte(10), eq())).toEqual([{ partidaId: 'a', horas: 6, monto: 75_000 }, { partidaId: 'b', horas: 2, monto: 25_000 }])
  })
})

describe('Indicadores KMQ y RULE-205/206', () => {
  it('utilización, improductivas, costo hora, consumo y disponibilidad mecánica', () => {
    const ps = [parte(10), parte(11), parte(12, { horasMantencion: 1, horasDisponibles: 8, improductivas: [] })]
    const k = indicadoresEquipo(eq(), ps, 12)
    expect(k.utilizacion).toBeCloseTo(24 / 26)
    expect(k.improductividad).toBeCloseTo(2 / 26)
    expect(k.costoHoraReal).toBeCloseTo((3 * 100_000) / 24)
    expect(k.consumo).toBeCloseTo(10)
    expect(k.disponibilidad).toBeCloseTo(26 / 27)
    expect(k.causaRepetida).toBeNull()
    expect(indicadoresEquipo(eq(), [parte(10), parte(11), parte(12)], 12).causaRepetida).toBe('espera_frente')
  })

  it('RULE-205 con baja utilización en un equipo de costo fijo; RULE-206 con improductivas sobre 20 %', () => {
    const d = generarDemo(HOY)
    d.equipos.push(eq({ id: 'ex' }))
    const ociosa = (f: number) => parte(f, { id: `x${f}`, equipoId: 'ex', trabajos: [{ partidaId: 'obra_aromos_p3.4', horas: 4 }], improductivas: [{ horas: 3, causa: 'falta_operador' }], horometroFinal: 4 })
    d.partesMaquinaria.push(ociosa(HOY - 3), ociosa(HOY - 2), ociosa(HOY - 1))
    const reglas = evaluarReglas(d, calcularObra(d, 'obra_aromos', HOY))
    expect(reglas.find((r) => r.clave === 'RULE-205|ex')?.severidad).toBe('media')
    expect(reglas.find((r) => r.clave === 'RULE-206|ex')?.severidad).toBe('media')
  })

  it('la demo tiene equipos en uso con buena utilización, rendimiento según presupuesto y sin alertas', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      const c = calcularObra(d, 'obra_aromos', t)
      const activos = equiposDeObra(d.equipos, 'obra_aromos', t)
      expect(activos.map((e) => e.codigo).sort(), `día +${k}`).toContain('EQ-01')
      const grua = indicadoresEquipo(activos.find((e) => e.codigo === 'EQ-01')!, d.partesMaquinaria, t)
      expect(grua.utilizacion!, `día +${k}`).toBeGreaterThanOrEqual(0.7)
      expect(grua.mantencionesEnFecha, `día +${k}`).toBe(1)
      for (const o of d.obras) expect(evaluarReglas(d, calcularObra(d, o.id, t)).filter((r) => r.regla === 'RULE-205' || r.regla === 'RULE-206'), `${o.id} día +${k}`).toEqual([])
      if (k === 0) {
        const bomba = d.equipos.find((e) => e.codigo === 'EQ-02')!
        const p = d.partidas.find((x) => x.id === 'obra_aromos_p3.2')!
        const cp = c.partidas.find((x) => x.p.id === p.id)!
        const r = rendimientoEquipo(d.partesMaquinaria, bomba.id, p, cp.cantEjec, t)
        expect(r.horas).toBeGreaterThan(0)
      }
    }
  })
})
