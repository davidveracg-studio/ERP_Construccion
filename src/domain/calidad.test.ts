import { describe, expect, it } from 'vitest'
import {
  accionesNCR, accionesProtocolo, estadoNCR, estadoProtocolo, liberacionesPendientes, ncrVencida, protocolosFaltantes, protocolosVigentes, retrabajo, validarAccionProtocolo,
} from './calidad'
import { CONFIG_DEFECTO } from './datos'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { semaforo } from './semaforo'
import { generarDemo } from './seed'
import type { NoConformidad, ProtocoloCalidad, RDO } from './types'

const HOY = dia('2026-10-20')
const prot = (o: Partial<ProtocoloCalidad> = {}): ProtocoloCalidad => ({
  id: 'p1', obraId: 'o', partidaId: 'h30', numero: 1, nombre: 'Liberación antes de hormigonar', tipo: 'liberacion', obligatorio: true, requiereITO: true,
  responsable: 'Cuadrilla Pérez', ubicacion: 'Losa piso 3', checklist: [{ texto: 'Enfierradura', ok: true }, { texto: 'Moldaje' }], programado: 10, historial: [], creado: 8, creadoPor: 'JT', ...o,
})
const ncr = (o: Partial<NoConformidad> = {}): NoConformidad => ({
  id: 'n1', obraId: 'o', partidaId: 'h30', numero: 1, origen: 'protocolo', descripcion: 'Recubrimiento', responsable: 'Cuadrilla Pérez', plazo: 15, historial: [], creado: 10, creadoPor: 'JT', ...o,
})

describe('Calidad: protocolos y NCR (10 §11 y §22)', () => {
  it('la liberación bloquea la partida hasta aprobarse; la reinspección reemplaza al rechazado', () => {
    const p = prot()
    const d = { protocolosCalidad: [p] }
    expect(liberacionesPendientes(d, 'h30', 9)).toEqual([])
    expect(liberacionesPendientes(d, 'h30', 10)).toHaveLength(1)
    const rechazado = prot({ historial: [{ fecha: 10, estado: 'en_inspeccion', por: 'C' }, { fecha: 10, estado: 'rechazado', por: 'JT' }] })
    const re = prot({ id: 'p2', reinspeccionDe: 'p1', programado: 11, creado: 10, historial: [{ fecha: 11, estado: 'aprobado', por: 'JT' }] })
    expect(protocolosVigentes([rechazado, re], 11).map((x) => x.id)).toEqual(['p2'])
    expect(liberacionesPendientes({ protocolosCalidad: [rechazado, re] }, 'h30', 11)).toEqual([])
    expect(estadoProtocolo(rechazado, 10)).toBe('rechazado')
    // RULE-103: el obligatorio pendiente impide la recepción provisoria
    expect(protocolosFaltantes({ protocolosCalidad: [p] }, 'o', 20)).toHaveLength(1)
    expect(protocolosFaltantes({ protocolosCalidad: [rechazado, re] }, 'o', 20)).toHaveLength(0)
  })

  it('permisos: capataz inicia, jefe de terreno aprueba con checklist completo o rechaza con observaciones, ITO visa', () => {
    const p = prot()
    expect(accionesProtocolo(p, 10, 'R04')).toEqual(['iniciar'])
    const enInsp = prot({ historial: [{ fecha: 10, estado: 'en_inspeccion', por: 'C' }] })
    expect(accionesProtocolo(enInsp, 10, 'R04')).toEqual([])
    expect(accionesProtocolo(enInsp, 10, 'R03')).toEqual(['aprobar', 'rechazar'])
    expect(validarAccionProtocolo(enInsp, 'aprobar')).toMatch(/checklist/)
    expect(validarAccionProtocolo(enInsp, 'rechazar', ' ')).toMatch(/observaciones/)
    const aprobado = prot({ historial: [{ fecha: 10, estado: 'aprobado', por: 'JT' }] })
    expect(accionesProtocolo(aprobado, 10, 'R11')).toEqual(['visar'])
    expect(accionesProtocolo({ ...aprobado, requiereITO: false }, 10, 'R11')).toEqual([])
    // NCR: corrige el responsable, verifica el jefe de terreno, anula el administrador
    const n = ncr()
    expect(accionesNCR(n, 12, 'R02')).toEqual(['corregir', 'anular'])
    expect(accionesNCR(ncr({ historial: [{ fecha: 11, estado: 'en_correccion', por: 'C' }] }), 12, 'R03')).toEqual(['verificar'])
    expect(estadoNCR(n, 9)).toBeNull()
    expect(ncrVencida(n, 16)).toBe(true)
    expect(ncrVencida(ncr({ historial: [{ fecha: 14, estado: 'verificada', por: 'JT' }] }), 16)).toBe(false)
  })

  it('rework rate: HH de retrabajo marcadas con la NCR sobre las HH totales', () => {
    const rdo: RDO = {
      id: 'r', obraId: 'o', cuadrillaId: 'cq', fecha: 10, clima: 'despejado', estado: 'validado', autor: 'C', avances: [], observaciones: '',
      hh: [{ partidaId: 'h30', trabajadores: 10, horasNormales: 9, horasExtra: 0 }, { partidaId: 'h30', trabajadores: 2, horasNormales: 5, horasExtra: 0, ncrId: 'n1' }],
    }
    const r = retrabajo({ rdos: [rdo], cuadrillas: [{ id: 'cq', obraId: 'o', nombre: 'Q', capataz: 'C', trabajadores: 12, costoHH: 10_000 }], config: CONFIG_DEFECTO }, 'o', 0, 20)
    expect(r.hhRt).toBe(10)
    expect(r.rate).toBeCloseTo(10 / 100)
    expect(r.porNCR.get('n1')).toEqual({ hh: 10, costo: 100_000 })
  })

  it('la demo: calidad en verde, una liberación por aprobar, un rechazo en corrección (solo RULE-104 media) y la obra terminada sin protocolos faltantes', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras) {
        const c = calcularObra(d, o.id, t - 1)
        const reglas = evaluarReglas(d, c).filter((r) => ['RULE-104', 'RULE-111', 'RULE-112'].includes(r.regla))
        if (o.id === 'obra_aromos') {
          expect(reglas.map((r) => `${r.regla} ${r.severidad}`), `día +${k}`).toEqual(['RULE-104 media'])
          expect(d.protocolosCalidad.filter((p) => p.obraId === o.id && p.tipo === 'liberacion' && p.programado === t && estadoProtocolo(p, t) === 'pendiente')).toHaveLength(1)
        } else expect(reglas, `${o.id} día +${k}`).toEqual([])
        if (o.estado !== 'en_ejecucion') expect(protocolosFaltantes(d, o.id, t)).toEqual([])
        expect(semaforo(c, d.config).find((x) => x.dim === 'calidad')?.estado, `${o.id} día +${k}`).toBe('verde')
        expect(c.calidad.reworkRate ?? 0).toBeLessThanOrEqual(0.02)
        expect(c.calidad.primera ?? 1, `${o.id} día +${k}`).toBeGreaterThanOrEqual(0.85)
      }
      // Las HH de retrabajo salen de las HH del RDO: el costo de mano de obra no cambia
      expect(d.rdos.some((r) => r.hh.some((h) => h.ncrId))).toBe(true)
    }
  })
})
