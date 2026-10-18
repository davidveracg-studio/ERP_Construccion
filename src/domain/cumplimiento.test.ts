import { describe, expect, it } from 'vitest'
import {
  acreditacion, estadoDoc, estadoEPConDocs, estadoTrabajador, f301Vigente, indicadoresCumplimiento, periodo, periodoAnterior, subcontratistaDeR10,
} from './cumplimiento'
import { dia } from './fechas'
import { generarDemo } from './seed'
import { estadoSub } from './subcontratos'
import type { DocumentoLaboral, EPSubcontrato, Subcontrato, Trabajador } from './types'

const HOY = dia('2026-10-20')
const doc = (o: Partial<DocumentoLaboral>): DocumentoLaboral => ({
  id: Math.random().toString(36), obraId: 'o', subcontratistaId: 's', tipo: 'f30', historial: [{ fecha: 10, estado: 'cargado', por: 'S' }, { fecha: 11, estado: 'validado', por: 'A' }], creado: 10, creadoPor: 'S', ...o,
})
const sc = (o: Partial<Subcontrato> = {}): Subcontrato => ({
  id: 'sc', obraId: 'o', numero: 1, codigo: 'SC-1', subcontratistaId: 's', descripcion: 'x', lineas: [], retencion: 0.05, inicio: 0, termino: 300, ajustes: [],
  historial: [{ fecha: 5, estado: 'en_acreditacion', por: 'A' }], compromisos: {}, creado: 0, creadoPor: 'A', ...o,
})
const w: Trabajador = { id: 'w1', obraId: 'o', subcontratistaId: 's', rut: '1-9', nombre: 'Juan', oficio: 'Jornal', ingreso: 5 }

describe('Documentos laborales (10 §19)', () => {
  it('cargado → validado → por vencer → vencido; rechazado; pendiente si no existe', () => {
    const d = doc({ vencimiento: 40 })
    expect(estadoDoc(d, 10)).toBe('cargado')
    expect(estadoDoc(d, 20)).toBe('validado')
    expect(estadoDoc(d, 36)).toBe('por_vencer')
    expect(estadoDoc(d, 41)).toBe('vencido')
    expect(estadoDoc(doc({ historial: [{ fecha: 10, estado: 'cargado', por: 'S' }, { fecha: 11, estado: 'rechazado', por: 'A' }] }), 20)).toBe('rechazado')
    expect(estadoDoc(undefined, 20)).toBe('pendiente')
    expect(periodoAnterior('2026-01')).toBe('2025-12')
  })
})

describe('RULE-702: acreditación', () => {
  it('exige F30 vigente y trabajadores con contrato, información de riesgos y EPP validados', () => {
    const base = [doc({ tipo: 'f30', vencimiento: 100 })]
    expect(acreditacion(sc(), [w], base, 20).ok).toBe(false)
    const delTrabajador = (['contrato', 'informacion_riesgos', 'epp'] as const).map((tipo) => doc({ tipo, trabajadorId: 'w1' }))
    expect(estadoTrabajador(w, delTrabajador, 20).acreditado).toBe(true)
    expect(acreditacion(sc(), [w], [...base, ...delTrabajador], 20).ok).toBe(true)
    expect(acreditacion(sc(), [w], [doc({ tipo: 'f30', vencimiento: 15 }), ...delTrabajador], 20).ok).toBe(false)
  })
})

describe('RULE-701: F30-1 para el pago', () => {
  const corte = dia('2026-09-30')
  const ep: EPSubcontrato = {
    id: 'e', obraId: 'o', subcontratoId: 'sc', numero: 1, fechaCorte: corte, lineas: [], descuentos: 0, historial: [{ fecha: corte + 5, estado: 'aprobado', por: 'A' }], creado: corte, creadoPor: 'A',
  }
  it('un EP aprobado sin F30-1 del mes del corte o del anterior queda bloqueado, y se libera al validarse', () => {
    expect(estadoEPConDocs(ep, sc(), [], corte + 6)).toBe('bloqueado')
    const cargado = doc({ tipo: 'f30_1', periodo: periodo(corte), creado: corte + 7, historial: [{ fecha: corte + 7, estado: 'cargado', por: 'S' }] })
    expect(estadoEPConDocs(ep, sc(), [cargado], corte + 8)).toBe('bloqueado')
    const validado = { ...cargado, historial: [...cargado.historial, { fecha: corte + 9, estado: 'validado' as const, por: 'A' }] }
    expect(estadoEPConDocs(ep, sc(), [validado], corte + 9)).toBe('aprobado')
    expect(f301Vigente([doc({ tipo: 'f30_1', periodo: periodoAnterior(periodo(corte)) })], 'o', 's', corte, corte + 9)).toBe(true)
  })

  it('la demo: EP final de Eléctrica Norte (R10) bloqueado por F30-1, vigentes acreditados y al día', () => {
    const d = generarDemo(HOY)
    const ind = indicadoresCumplimiento(d, 'obra_aromos', HOY)
    expect([ind.alDia, ind.bloqueados, ind.porVencer]).toEqual([1, 0, 1])
    const bod = indicadoresCumplimiento(d, 'obra_bodegas', HOY)
    expect(bod.bloqueados).toBeGreaterThanOrEqual(1)
    expect(bod.porRevisar).toBe(1)
    const sc203 = d.subcontratos.find((s) => s.codigo === 'SC-203')!
    const bloqueado = d.epsSubcontrato.find((e) => e.subcontratoId === sc203.id && estadoEPConDocs(e, sc203, d.documentosLaborales, HOY) === 'bloqueado')
    expect(bloqueado).toBeTruthy()
    for (const s of d.subcontratos.filter((x) => estadoSub(x, HOY) === 'vigente')) expect(acreditacion(s, d.trabajadores, d.documentosLaborales, HOY).ok, s.codigo).toBe(true)
    expect(subcontratistaDeR10(d.proveedores)?.nombre).toBe('Eléctrica Norte Ltda.')
    for (const o of d.obras) expect(indicadoresCumplimiento(d, o.id, HOY).alDia ?? 1, o.id).toBe(1)
  })
})
