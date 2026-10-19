import { describe, expect, it } from 'vitest'
import { accionesPropuesta, alertasComerciales, clienteObservado, estadoLead, estadoPropuesta, indicadoresComercial, mejorFuente, propuestaVencida, puCostoLinea, rendimientosReales, totalesPropuesta } from './comercial'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { semaforo } from './semaforo'
import { generarDemo } from './seed'
import type { LineaPropuesta, Propuesta } from './types'

const HOY = dia('2026-10-20')
const linea = (o: Partial<LineaPropuesta> = {}): LineaPropuesta => ({
  id: 'l', codigo: '1.1', capitulo: '1', descripcion: 'Hormigón', unidad: 'm³', cantidad: 100,
  recursos: [{ tipo: 'MO', descripcion: 'MO', cantPorUnidad: 2, unidad: 'HH', precio: 10_000 }, { tipo: 'MAT', descripcion: 'H-30', cantPorUnidad: 1, unidad: 'm³', precio: 80_000 }], ...o,
})
const prop = (o: Partial<Propuesta> = {}): Propuesta => ({
  id: 'p', leadId: 'l', numero: 1, version: 1, lineas: [linea()], gg: 1_000_000, margen: 0.1, plazoDias: 60, validezHasta: 40, exclusiones: '', historial: [], creado: 1, creadoPor: 'C', ...o,
})

describe('Comercial: propuestas con APU y rendimientos reales (10 §2–4)', () => {
  it('precio = (costo directo + GG) / (1 − margen) y el factor prorratea GG y utilidad sobre cada línea', () => {
    expect(puCostoLinea(linea())).toBe(100_000)
    const t = totalesPropuesta(prop())
    expect(t.cd).toBe(10_000_000)
    expect(t.precio).toBe(Math.round(11_000_000 / 0.9))
    expect(t.utilidad).toBe(t.precio - 11_000_000)
    expect(t.factor * t.cd).toBeCloseTo(t.precio, -1)
  })

  it('flujo: Comercial envía a revisión, Gerencia da el V°B° y solo entonces se envía; vencida es derivada', () => {
    const p = prop()
    expect(accionesPropuesta(p, 5, 'R06')).toEqual(['enviar_revision', 'anular'])
    const rev = prop({ historial: [{ fecha: 5, estado: 'en_revision', por: 'C' }] })
    expect(accionesPropuesta(rev, 5, 'R06')).toEqual(['anular'])
    expect(accionesPropuesta(rev, 5, 'R01')).toEqual(['aprobar', 'devolver', 'anular'])
    const ok = { ...rev, aprobacion: { fecha: 6, por: 'G' } }
    expect(accionesPropuesta(ok, 6, 'R06')).toContain('enviar')
    const env = prop({ historial: [{ fecha: 7, estado: 'enviada', por: 'C' }], validezHasta: 30 })
    expect(accionesPropuesta(env, 8, 'R06')).toEqual(['adjudicar', 'rechazar', 'desierta', 'anular'])
    expect(propuestaVencida(env, 31)).toBe(true)
    expect(estadoPropuesta(env, 31)).toBe('enviada')
  })

  it('RULE-004: cliente bloqueado o con EP vencidos hace más de 60 días', () => {
    const base = { clientes: [{ id: 'c', nombre: 'M', tipo: 'empresa' as const, estado: 'activo' as const, creado: 0 }], obras: [{ id: 'o', mandante: 'M' }] as never, estadosPago: [] }
    expect(clienteObservado(base, 'c', 100)).toBeNull()
    expect(clienteObservado({ ...base, clientes: [{ ...base.clientes[0], estado: 'bloqueado' }] }, 'c', 100)).toMatch(/bloqueado/)
    expect(clienteObservado({ ...base, estadosPago: [{ obraId: 'o', vencimiento: 30 }] as never }, 'c', 100)).toMatch(/60 días/)
  })

  it('la demo: obras nacidas de propuestas adjudicadas, catálogo con costos reales, hit rate sobre la meta y solo RULE-001/003', () => {
    const d = generarDemo(HOY)
    for (const o of d.obras) {
      const p = d.propuestas.find((x) => x.obraId === o.id)!
      expect(estadoPropuesta(p, HOY)).toBe('adjudicada')
      const venta = d.partidas.filter((x) => x.obraId === o.id && !x.ordenCambioId).reduce((s, x) => s + x.cantidad * x.puVenta, 0)
      expect(totalesPropuesta(p).precio / venta).toBeCloseTo(1, 3)
    }
    const cat = rendimientosReales(d, HOY - 1)
    const h30 = cat.find((r) => r.descripcion === 'Hormigón estructural H-30')!
    expect(mejorFuente(h30)?.puReal).toBeGreaterThan(0)
    const borrador = d.propuestas.find((p) => estadoPropuesta(p, HOY) === 'borrador')!
    expect(borrador.lineas.some((l) => l.fuente?.startsWith('Real'))).toBe(true)
    expect(estadoLead(d.leads.find((l) => l.id === borrador.leadId)!, HOY)).toBe('en_estudio')
    const k = indicadoresComercial(d, HOY)
    expect(k.hitRate).toBeGreaterThanOrEqual(0.2)
    expect(k.enviadas).toBe(2)
    expect(alertasComerciales(d, HOY).map((a) => a.regla).sort()).toEqual(['RULE-001', 'RULE-003'])
  })

  it('una obra adjudicada (en planificación, sin Carta Gantt) se puede calcular sin errores', () => {
    const d = generarDemo(HOY)
    const p = d.propuestas.find((x) => estadoPropuesta(x, HOY) === 'borrador')!
    const tot = totalesPropuesta(p)
    d.obras.push({ ...d.obras[0], id: 'obra_nueva', nombre: 'Nueva', estado: 'planificacion', fechaInicio: HOY + 14, plazoDias: p.plazoDias, modelo4d: undefined, condicionesPago: undefined })
    d.partidas.push(...p.lineas.map((l) => ({ id: `n_${l.codigo}`, obraId: 'obra_nueva', codigo: l.codigo, capitulo: l.capitulo, descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad, puVenta: Math.round(puCostoLinea(l) * tot.factor), recursos: l.recursos })))
    const c = calcularObra(d, 'obra_nueva', HOY)
    expect(c.venta).toBeCloseTo(tot.precio, -4)
    expect(semaforo(c, d.config)).toHaveLength(8)
  })
})
