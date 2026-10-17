import { describe, expect, it } from 'vitest'
import {
  accionesRFI, accionesSubmittal, aplicarAccionRFI, aplicarAccionSubmittal, estadoRFI, estadoSubmittal, folioPendiente, indicadoresDocumental,
  nuevaRevisionSubmittal, revisionVigente, rfiVencido, siguienteRevision, sumarHabiles, terrenoDesactualizado,
} from './documental'
import { calcularObra } from './evm'
import { dia, diaSemana } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { Documento, Folio, RFI, Submittal } from './types'

const HOY = dia('2026-10-20')
const HABILES = [1, 2, 3, 4, 5]
const x = (fecha: number, texto?: string) => ({ fecha, autor: 'Ana', texto })
const doc = (o: Partial<Documento> = {}): Documento => ({
  id: 'd1', obraId: 'obra_aromos', codigo: 'E-1', titulo: 'Plano', tipo: 'plano', especialidad: 'estructura', partidaIds: [], creado: 10,
  revisiones: [{ id: 'r1', revision: 'A', fecha: 10, publicadaPor: 'X' }, { id: 'r2', revision: '0', fecha: 20, publicadaPor: 'X' }], ...o,
})
const rfi = (o: Partial<RFI> = {}): RFI => ({
  id: 'q1', obraId: 'obra_aromos', numero: 1, asunto: 'A', pregunta: '¿?', disciplina: 'estructura', destinatario: 'mandante', partidaIds: [], historial: [], creado: 10, creadoPor: 'X', ...o,
})
const sub = (o: Partial<Submittal> = {}): Submittal => ({
  id: 's1', obraId: 'obra_aromos', numero: 1, revision: 0, titulo: 'Ficha', tipo: 'ficha_tecnica', descripcion: '', partidaIds: [], historial: [], creado: 10, creadoPor: 'X', ...o,
})

describe('Documentos: revisiones (08) y RULE-905', () => {
  it('la última revisión publicada es la vigente; la siguiente se sugiere', () => {
    expect(revisionVigente(doc(), 15)?.revision).toBe('A')
    expect(revisionVigente(doc(), 25)?.revision).toBe('0')
    expect(siguienteRevision(doc())).toBe('1')
    expect(siguienteRevision(doc({ revisiones: [{ id: 'r', revision: 'B', fecha: 1, publicadaPor: 'X' }] }))).toBe('C')
  })

  it('terreno queda desactualizado al publicarse una revisión que no confirmó', () => {
    const d = doc({ enTerreno: { revisionId: 'r1', fecha: 11, por: 'J' } })
    expect(terrenoDesactualizado(d, 15)).toBeNull()
    expect(terrenoDesactualizado(d, 25)?.revision).toBe('A')
    expect(terrenoDesactualizado({ ...d, enTerreno: { revisionId: 'r2', fecha: 21, por: 'J' } }, 25)).toBeNull()
  })
})

describe('RFI (10 §26) y RULE-903', () => {
  it('borrador → emitido → respondido ⇄ emitido (repregunta) → cerrado', () => {
    let r = rfi()
    expect(() => aplicarAccionRFI(r, 'emitir', x(11))).toThrow(/fecha límite/)
    r = aplicarAccionRFI({ ...r, fechaLimite: 18 }, 'emitir', x(11))
    expect(estadoRFI(r, 11)).toBe('emitido')
    expect(accionesRFI(r, 12, 'R11')).toEqual(['responder'])
    expect(() => aplicarAccionRFI(r, 'responder', x(12))).toThrow(/respuesta/)
    r = aplicarAccionRFI(r, 'responder', x(12, 'Sí'))
    r = aplicarAccionRFI(r, 'repreguntar', x(13, 'Falta el detalle'))
    expect(estadoRFI(r, 13)).toBe('emitido')
    r = aplicarAccionRFI(r, 'responder', x(14, 'Detalle adjunto'))
    r = aplicarAccionRFI(r, 'cerrar', { ...x(15), ordenCambioId: 'oc1' })
    expect(estadoRFI(r, 15)).toBe('cerrado')
    expect(r.ordenCambioId).toBe('oc1')
  })

  it('vence si sigue emitido pasada la fecha límite; es alta si toca la ruta crítica', () => {
    const r = rfi({ fechaLimite: 18, historial: [{ fecha: 11, estado: 'emitido', por: 'X' }] })
    expect(rfiVencido(r, 18)).toBe(false)
    expect(rfiVencido(r, 19)).toBe(true)

    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const critica = c.actualizado!.actividades.find((a) => c.cpm.get(a.id)?.critica && a.finReal == null && a.partidas.length)!
    d.rfis.push(
      rfi({ id: 'qa', fechaLimite: HOY - 2, historial: [{ fecha: HOY - 9, estado: 'emitido', por: 'X' }] }),
      rfi({ id: 'qb', fechaLimite: HOY - 2, historial: [{ fecha: HOY - 9, estado: 'emitido', por: 'X' }], partidaIds: [critica.partidas[0].partidaId] }),
    )
    const reglas = evaluarReglas(d, calcularObra(d, 'obra_aromos', HOY))
    expect(reglas.find((r) => r.clave === 'RULE-903|qa')?.severidad).toBe('media')
    expect(reglas.find((r) => r.clave === 'RULE-903|qb')?.severidad).toBe('alta')
  })
})

describe('Submittals (10 §27)', () => {
  it('enviado → aprobado con observaciones; rechazado genera la revisión siguiente', () => {
    let s = aplicarAccionSubmittal(sub(), 'enviar', x(11))
    expect(estadoSubmittal(s, 11)).toBe('enviado')
    expect(accionesSubmittal(s, 12, 'R11')).toEqual(['aprobar', 'aprobar_con_observaciones', 'rechazar'])
    expect(() => aplicarAccionSubmittal(s, 'aprobar_con_observaciones', x(12))).toThrow(/observaciones/)
    expect(estadoSubmittal(aplicarAccionSubmittal(s, 'aprobar_con_observaciones', x(12, 'Lote único')), 12)).toBe('aprobado_con_observaciones')
    s = aplicarAccionSubmittal(s, 'rechazar', x(12, 'Tono distinto'))
    const rev = nuevaRevisionSubmittal(s, 's2', 12, 'Ana')
    expect([rev.revision, rev.reemplazaA, estadoSubmittal(rev, 12)]).toEqual([1, 's1', 'borrador'])
  })
})

describe('Libro de Obra y RULE-902', () => {
  it('una instrucción del ITO espera respuesta 3 días hábiles o el plazo indicado', () => {
    const lunes = HOY - ((diaSemana(HOY) + 6) % 7)
    expect(sumarHabiles(lunes + 4, 3, HABILES)).toBe(lunes + 9) // viernes + 3 hábiles = miércoles
    const f: Folio = { id: 'f1', obraId: 'obra_aromos', numero: 1, fecha: lunes, autor: 'ITO', emisor: 'mandante', tipo: 'instruccion', texto: 'x' }
    expect(folioPendiente(f, [f], lunes + 3, HABILES)).toEqual({ limite: lunes + 3, vencido: false })
    expect(folioPendiente(f, [f], lunes + 4, HABILES)?.vencido).toBe(true)
    const resp: Folio = { ...f, id: 'f2', numero: 2, fecha: lunes + 4, emisor: 'contratista', tipo: 'respuesta', respondeA: 'f1' }
    expect(folioPendiente(f, [f, resp], lunes + 5, HABILES)).toBeNull()
    expect(folioPendiente({ ...f, emisor: 'contratista' }, [], lunes + 9, HABILES)).toBeNull()
  })
})

describe('Demo documental', () => {
  it('sin vencidos ni planos superados en terreno durante dos semanas, en las 3 obras', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras) {
        const c = calcularObra(d, o.id, t)
        const de = <T extends { obraId: string }>(xs: T[]) => xs.filter((y) => y.obraId === o.id)
        const ind = indicadoresDocumental({ rfis: de(d.rfis), submittals: de(d.submittals), folios: de(d.folios), documentos: de(d.documentos) }, c, d.config.diasHabiles, t)
        const donde = `${o.id} día +${k}`
        expect([ind.rfiVencidos, ind.submittalsVencidos, ind.foliosVencidos, ind.planosDesactualizados], donde).toEqual([0, 0, 0, 0])
        expect(ind.estado.kdo02, donde).not.toBe('rojo')
        expect(evaluarReglas(d, c).filter((r) => ['RULE-902', 'RULE-903', 'RULE-905'].includes(r.regla)), donde).toEqual([])
      }
    }
  })
})
