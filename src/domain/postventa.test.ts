import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { accionesPostventa, enGarantia, estadoPostventa, finGarantia, indicadoresPostventa, inicioGarantia, responsableDe, vencidaPostventa } from './postventa'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { RecepcionObra, SolicitudPostventa } from './types'

const HOY = dia('2026-10-20')
const rec = (tipo: RecepcionObra['tipo'], fecha: number): RecepcionObra => ({ id: tipo, obraId: 'o', tipo, fecha, resultado: 'recibida', observaciones: [], registradaPor: 'A' })
const sol = (o: Partial<SolicitudPostventa> = {}): SolicitudPostventa => ({
  id: 's', obraId: 'o', numero: 1, fecha: 100, solicitante: 'M', ubicacion: 'Depto 4', descripcion: 'Filtración', categoria: 'terminaciones', responsable: 'Constructora', historial: [], creado: 100, creadoPor: 'M', ...o,
})

describe('Postventa: garantía del art. 18 LGUC (RULE-503)', () => {
  it('la garantía corre desde la recepción definitiva (o la provisoria) con 10/5/3 años según la falla', () => {
    expect(inicioGarantia({ recepciones: [] }, 'o', 50)).toBeNull()
    expect(inicioGarantia({ recepciones: [rec('provisoria', 10)] }, 'o', 50)).toBe(10)
    expect(inicioGarantia({ recepciones: [rec('provisoria', 10), rec('definitiva', 40)] }, 'o', 50)).toBe(40)
    expect(finGarantia(0, 'terminaciones')).toBe(1096)
    const d = { recepciones: [rec('provisoria', 0)] }
    expect(enGarantia(d, 'o', 'terminaciones', 1200)).toBe(false)
    expect(enGarantia(d, 'o', 'instalaciones', 1200)).toBe(true)
    expect(enGarantia(d, 'o', 'estructura', 3600)).toBe(true)
  })

  it('se asigna al subcontratista de la partida, que puede darla por resuelta; los plazos son 3 y 30 días', () => {
    const d = { subcontratos: [{ obraId: 'o', subcontratistaId: 'pr', lineas: [{ partidaId: 'p6', cantidad: 1, pu: 1 }] }], proveedores: [{ id: 'pr', nombre: 'Eléctrica Norte' }], obras: [{ id: 'o', administrador: 'Carolina' }] } as never
    expect(responsableDe(d, 'o', 'p6')).toEqual({ responsable: 'Eléctrica Norte', subcontratistaId: 'pr' })
    expect(responsableDe(d, 'o', 'p1')).toEqual({ responsable: 'Carolina' })
    const s = sol()
    expect(accionesPostventa(s, 101, 'R02')).toEqual(['evaluar', 'rechazar'])
    expect(accionesPostventa(s, 101, 'R10', true)).toEqual([])
    const rep = sol({ historial: [{ fecha: 102, estado: 'en_reparacion', por: 'A' }] })
    expect(accionesPostventa(rep, 103, 'R10', true)).toEqual(['resolver'])
    expect(accionesPostventa(rep, 103, 'R10', false)).toEqual([])
    expect(vencidaPostventa(s, 103)).toBe(false)
    expect(vencidaPostventa(s, 104)).toBe(true)
    expect(vencidaPostventa(rep, 131)).toBe(true)
    expect(estadoPostventa(rep, 101)).toBe('recibida')
  })

  it('la demo: solicitudes en la obra recibida, una en reparación del subcontratista y ninguna fuera de plazo', () => {
    for (const k of [0, 6, 13]) {
      const t = HOY + k
      const d = generarDemo(t)
      const ids = d.obras.filter((o) => inicioGarantia(d, o.id, t) != null).map((o) => o.id)
      expect(ids).toEqual(['obra_bodegas'])
      const ind = indicadoresPostventa(d, ids, t)
      expect(ind.total).toBe(5)
      expect(ind.fueraDePlazo).toBe(0)
      expect(d.solicitudesPostventa.some((s) => s.responsable === 'Eléctrica Norte Ltda.' && estadoPostventa(s, t) === 'en_reparacion')).toBe(true)
      expect(evaluarReglas(d, calcularObra(d, 'obra_bodegas', t - 1)).filter((r) => r.regla === 'RULE-503')).toEqual([])
    }
  })
})
