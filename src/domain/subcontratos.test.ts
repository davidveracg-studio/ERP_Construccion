import { describe, expect, it } from 'vitest'
import { CONFIG_DEFECTO } from './datos'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import {
  accionesSub, aplicarAccionEPSub, aplicarAccionSub, avanceValidado, estadoEPSub, estadoSub, excesosRULE703, indicadoresSub, limiteSubcontrato, montosEPSub,
  montoVigente, retencionAcumulada, sugerirLineas,
} from './subcontratos'
import type { EPSubcontrato, RDO, Subcontrato } from './types'

const HOY = dia('2026-10-20')
const rdo = (fecha: number, cantidad: number, estado: RDO['estado'] = 'validado'): RDO => ({
  id: `r${fecha}`, obraId: 'o', cuadrillaId: 'c', fecha, clima: 'despejado', estado, autor: 'C', avances: [{ partidaId: 'p1', cantidad }], hh: [], observaciones: '',
})
const sc = (o: Partial<Subcontrato> = {}): Subcontrato => ({
  id: 'sc1', obraId: 'o', numero: 1, codigo: 'SC-001', subcontratistaId: 'prov', descripcion: 'Pintura', lineas: [{ partidaId: 'p1', cantidad: 100, pu: 10_000 }],
  retencion: 0.05, inicio: 0, termino: 200, ajustes: [], historial: [{ fecha: 1, estado: 'vigente', por: 'A' }], compromisos: {}, creado: 0, creadoPor: 'OT', ...o,
})
const ep = (o: Partial<EPSubcontrato> = {}): EPSubcontrato => ({
  id: 'e1', obraId: 'o', subcontratoId: 'sc1', numero: 1, fechaCorte: 30, lineas: [{ partidaId: 'p1', cantidad: 40 }], descuentos: 0, historial: [], creado: 31, creadoPor: 'A', ...o,
})
const ctx = (eps: EPSubcontrato[], rdos: RDO[], extra = {}) => ({ fecha: 35, autor: 'A', eps, rdos, sc: sc(), ...extra })

describe('Subcontrato (10 §14)', () => {
  it('borrador → en acreditación → vigente; sobre 500 UF firma Gerencia', () => {
    const b = sc({ historial: [] })
    expect(accionesSub(b, 5, 'R02', CONFIG_DEFECTO)).toEqual(['firmar'])
    const grande = sc({ historial: [], lineas: [{ partidaId: 'p1', cantidad: 1, pu: limiteSubcontrato(CONFIG_DEFECTO) + 1 }] })
    expect(accionesSub(grande, 5, 'R02', CONFIG_DEFECTO)).toEqual([])
    expect(accionesSub(grande, 5, 'R01', CONFIG_DEFECTO)).toEqual(['firmar'])
    const f = aplicarAccionSub(b, 'firmar', { fecha: 5, autor: 'A', eps: [], rdos: [] })
    expect(estadoSub(aplicarAccionSub(f, 'acreditar', { fecha: 6, autor: 'A', eps: [], rdos: [] }), 6)).toBe('vigente')
  })

  it('termina solo con sus partidas 100 % validadas y cierra con los EP pagados', () => {
    expect(() => aplicarAccionSub(sc(), 'terminar', { fecha: 40, autor: 'A', eps: [], rdos: [rdo(10, 60)] })).toThrow(/100 %/)
    const t = aplicarAccionSub(sc(), 'terminar', { fecha: 40, autor: 'A', eps: [], rdos: [rdo(10, 60), rdo(20, 40)] })
    const pendiente = ep({ historial: [{ fecha: 32, estado: 'aprobado', por: 'A' }] })
    expect(() => aplicarAccionSub(t, 'cerrar', { fecha: 41, autor: 'A', eps: [pendiente], rdos: [] })).toThrow(/pagados/)
    const c = aplicarAccionSub(t, 'cerrar', { fecha: 41, autor: 'A', eps: [{ ...pendiente, historial: [...pendiente.historial, { fecha: 40, estado: 'pagado', por: 'A' }] }], rdos: [] })
    expect([estadoSub(c, 41), c.retencionDevuelta]).toEqual(['cerrado', 41])
  })

  it('el monto vigente suma adicionales y resta descuentos; las multas van al EP', () => {
    const s = sc({ ajustes: [{ id: 'a', tipo: 'adicional', fecha: 5, monto: 50_000, descripcion: '' }, { id: 'b', tipo: 'descuento', fecha: 6, monto: 20_000, descripcion: '' }, { id: 'c', tipo: 'multa', fecha: 7, monto: 9_000, descripcion: '' }] })
    expect(montoVigente(s, 10)).toBe(1_030_000)
    expect(montosEPSub(ep({ descuentos: 9_000 }), s)).toEqual({ bruto: 400_000, retencion: 20_000, descuentos: 9_000, neto: 371_000 })
  })
})

describe('EP de subcontrato (10 §15), RULE-703 y RULE-704', () => {
  it('sugiere lo validado no cobrado y bloquea la validación si se cobra más (RULE-703)', () => {
    const rdos = [rdo(10, 30), rdo(20, 25), rdo(29, 10, 'enviado')]
    expect(avanceValidado(rdos, 'o', 'p1', 30)).toBe(55)
    const previo = ep({ id: 'e0', lineas: [{ partidaId: 'p1', cantidad: 20 }], historial: [{ fecha: 12, estado: 'pagado', por: 'A' }] })
    expect(sugerirLineas(sc(), [previo], rdos, 30, 35)).toEqual([{ partidaId: 'p1', cantidad: 35 }])
    const exceso = { ...ep({ lineas: [{ partidaId: 'p1', cantidad: 40 }] }), historial: [{ fecha: 32, estado: 'presentado' as const, por: 'A' }] }
    expect(excesosRULE703(exceso, [previo, exceso], rdos, 35)).toEqual([{ partidaId: 'p1', cobrado: 60, validado: 55, exceso: 5 }])
    expect(() => aplicarAccionEPSub(exceso, 'validar', ctx([previo, exceso], rdos))).toThrow(/RULE-703/)
    const justo = { ...exceso, lineas: [{ partidaId: 'p1', cantidad: 35 }] }
    expect(estadoEPSub(aplicarAccionEPSub(justo, 'validar', ctx([previo, justo], rdos)), 35)).toBe('validado')
  })

  it('acumula la retención de los EP aprobados', () => {
    const a = ep({ historial: [{ fecha: 32, estado: 'aprobado', por: 'A' }] })
    const b = ep({ id: 'e2', lineas: [{ partidaId: 'p1', cantidad: 10 }], historial: [{ fecha: 33, estado: 'presentado', por: 'A' }] })
    expect(retencionAcumulada(sc(), [a, b], 35)).toBe(20_000)
  })

  it('la demo tiene subcontratos con EP dentro del avance validado y sin alertas nuevas', () => {
    const d = generarDemo(HOY)
    expect(d.subcontratos.length).toBeGreaterThanOrEqual(8)
    for (const s of d.subcontratos) {
      for (const e of d.epsSubcontrato.filter((x) => x.subcontratoId === s.id)) expect(excesosRULE703(e, d.epsSubcontrato, d.rdos, HOY), `${s.codigo} EP ${e.numero}`).toEqual([])
      const ind = indicadoresSub(s, d.epsSubcontrato, d.rdos, calcularObra(d, s.obraId, HOY), HOY)
      expect(ind.pagadoVsAvance ?? 0, s.codigo).toBeLessThanOrEqual(1 + 1e-9)
    }
    expect(d.subcontratos.some((s) => estadoSub(s, HOY) === 'cerrado')).toBe(true)
    for (const o of d.obras) expect(evaluarReglas(d, calcularObra(d, o.id, HOY)).filter((r) => r.regla === 'RULE-304').map((r) => r.titulo), o.id).toEqual([])
  })
})
