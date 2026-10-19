import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { semaforo } from './semaforo'
import { generarDemo } from './seed'
import { accionesIncidente, charlaDelDia, estadoIncidente, medidaVencida, partidasSinART, pasosPendientes, validarAccionIncidente } from './seguridad'
import type { Incidente, MedidaCorrectiva, Partida } from './types'

const HOY = dia('2026-10-20')
const inc = (o: Partial<Incidente> = {}): Incidente => ({
  id: 'i1', obraId: 'o', numero: 1, fecha: 10, tipo: 'cuasi', descripcion: 'x', lugar: 'Losa', empresa: 'Constructora', historial: [], creado: 10, creadoPor: 'C', ...o,
})
const medida = (o: Partial<MedidaCorrectiva> = {}): MedidaCorrectiva => ({
  id: 'm1', obraId: 'o', origen: { tipo: 'incidente', id: 'i1' }, descripcion: 'Baranda', responsable: 'JT', plazo: 15, creado: 11, creadoPor: 'P', ...o,
})

describe('Seguridad: charlas, ART e incidentes (10 §18, 12 RULE-801..804)', () => {
  it('RULE-801 y RULE-803: charla del día por cuadrilla u obra, y ART para cada tarea crítica reportada', () => {
    const charlas = [{ id: 'c', obraId: 'o', fecha: 10, cuadrillaId: null, tema: 'EPP', relator: 'C', asistentes: 8, creadoPor: 'C' }]
    expect(charlaDelDia({ charlasSeguridad: charlas }, 'o', 'cq1', 10)).toBeDefined()
    expect(charlaDelDia({ charlasSeguridad: charlas }, 'o', 'cq1', 11)).toBeUndefined()
    const partidas = [{ id: 'p1', tareaCritica: 'altura' }, { id: 'p2' }] as Partida[]
    const rdo = { obraId: 'o', cuadrillaId: 'cq1', fecha: 10, avances: [{ partidaId: 'p1', cantidad: 5 }, { partidaId: 'p2', cantidad: 3 }], hh: [] }
    expect(partidasSinART({ arts: [], partidas }, rdo).map((p) => p.id)).toEqual(['p1'])
    const art = { id: 'a', obraId: 'o', fecha: 10, cuadrillaId: 'cq1', partidaId: 'p1', tarea: 'altura' as const, descripcion: '', riesgos: [], medidas: ['Arnés'], firmantes: 4, responsable: 'C', creadoPor: 'C' }
    expect(partidasSinART({ arts: [art], partidas }, rdo)).toEqual([])
  })

  it('incidente: Prevención clasifica e investiga; solo un cuasi de bajo potencial se cierra sin investigar', () => {
    const i = inc()
    expect(accionesIncidente(i, 10, 'R03')).toEqual([])
    expect(accionesIncidente(i, 10, 'R08')).toEqual(['clasificar'])
    const clasif = inc({ potencial: 'bajo', historial: [{ fecha: 10, estado: 'clasificado', por: 'P' }] })
    expect(accionesIncidente(clasif, 10, 'R08')).toEqual(['investigar', 'cerrar'])
    expect(accionesIncidente({ ...clasif, potencial: 'alto' }, 10, 'R08')).toEqual(['investigar'])
    // Medidas: se exige causa y al menos una medida; para cerrar, todas cumplidas
    const inv = inc({ historial: [{ fecha: 10, estado: 'en_investigacion', por: 'P' }] })
    expect(validarAccionIncidente({ medidasCorrectivas: [] }, inv, 'medidas', 11, { causas: 'Sin baranda' })).toMatch(/medida/)
    expect(validarAccionIncidente({ medidasCorrectivas: [medida()] }, inv, 'medidas', 11, { causas: 'Sin baranda' })).toBeNull()
    const enCurso = inc({ historial: [{ fecha: 12, estado: 'medidas_en_curso', por: 'P' }] })
    expect(validarAccionIncidente({ medidasCorrectivas: [medida()] }, enCurso, 'cerrar', 13, {})).toMatch(/cumplidas/)
    expect(estadoIncidente(enCurso, 12)).toBe('medidas_en_curso')
    expect(medidaVencida(medida(), 16)).toBe(true)
    expect(medidaVencida(medida({ cumplida: { fecha: 14, evidencia: 'foto', por: 'JT' } }), 16)).toBe(false)
  })

  it('RULE-802: protocolo legal de un accidente grave y denuncia DIAT de uno con tiempo perdido', () => {
    expect(pasosPendientes(inc({ tipo: 'con_tiempo_perdido' }))).toEqual(['Denuncia DIAT'])
    expect(pasosPendientes(inc({ tipo: 'grave' }))).toEqual(['Suspender la faena afectada', 'Avisar a la Inspección del Trabajo', 'Avisar a la SEREMI de Salud', 'Denuncia DIAT'])
    const g = inc({ tipo: 'grave', protocolo: { suspension: 10, avisoInspeccion: 10, avisoSeremi: 10, diat: 11 } })
    expect(pasosPendientes(g)).toEqual(['Autorización de reanudación'])
    expect(validarAccionIncidente({ medidasCorrectivas: [] }, { ...g, historial: [{ fecha: 12, estado: 'medidas_en_curso', por: 'P' }] }, 'cerrar', 13, {})).toMatch(/reanudación/)
  })

  it('la demo: seguridad en verde, charlas y ART al 100 % y sin RULE-801/802/803/804', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras) {
        const c = calcularObra(d, o.id, t - 1)
        expect(evaluarReglas(d, c).filter((r) => r.regla.startsWith('RULE-80')).map((r) => r.regla), `${o.id} día +${k}`).toEqual([])
        if (o.estado !== 'en_ejecucion') continue
        expect(semaforo(c, d.config).find((x) => x.dim === 'seguridad')?.estado, `${o.id} día +${k}`).toBe('verde')
        expect(c.seguridad.charlas).toBe(1)
        expect(c.seguridad.art ?? 1).toBe(1)
        expect(c.seguridad.obsEnPlazo ?? 1).toBeGreaterThanOrEqual(0.9)
      }
      // La obra terminada tuvo un accidente con tiempo perdido, cerrado con su DIAT
      const ctp = d.incidentes.find((i) => i.tipo === 'con_tiempo_perdido')!
      expect(estadoIncidente(ctp, t)).toBe('cerrado')
      expect(d.incidentes.some((i) => i.obraId === 'obra_aromos' && estadoIncidente(i, t) === 'medidas_en_curso')).toBe(true)
    }
  })
})
