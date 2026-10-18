import { describe, expect, it } from 'vitest'
import {
  aprobadoRendicion, estadoRendicion, indicadoresCaja, limiteRendicion, observacionesItem, observacionesRendicion, puedeRevisarItem, rechazadoRendicion, saldoCaja,
} from './cajaChica'
import { CONFIG_DEFECTO } from './datos'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { CajaChica, ItemRendicion, Rendicion } from './types'

const HOY = dia('2026-10-20')
const cfg = CONFIG_DEFECTO
const caja: CajaChica = { id: 'cc', obraId: 'obra_aromos', responsable: 'JT', fondo: 500_000, abierta: 0 }
const item = (o: Partial<ItemRendicion> = {}): ItemRendicion => ({ id: Math.random().toString(36), fecha: 5, proveedor: 'P', comprobante: 'boleta', numero: '1', descripcion: 'Gasto', monto: 50_000, imputacion: 'GG', ...o })
const rend = (o: Partial<Rendicion> = {}): Rendicion => ({ id: 'r', obraId: 'obra_aromos', cajaId: 'cc', numero: 1, items: [item(), item({ monto: 30_000 })], historial: [], creado: 1, creadoPor: 'JT', ...o })

describe('Caja chica y rendiciones (10 §17)', () => {
  it('el saldo baja con lo gastado y se repone al aprobarse la rendición', () => {
    const r = rend()
    expect(saldoCaja(caja, [r], 10)).toEqual({ pendiente: 80_000, saldo: 420_000 })
    const repuesta = rend({ historial: [{ fecha: 11, estado: 'presentada', por: 'JT' }, { fecha: 14, estado: 'aprobada', por: 'F' }] })
    expect(estadoRendicion(repuesta, 12)).toBe('presentada')
    expect(saldoCaja(caja, [repuesta], 14).saldo).toBe(500_000)
    expect(indicadoresCaja(caja, [repuesta], 20).diasSinReponer).toBe(6)
  })

  it('RULE-401: observa ítems sin documento, sin imputar o sobre el tope, y la suma sobre el fondo', () => {
    expect(observacionesItem(item({ comprobante: 'sin_documento', imputacion: '' }), cfg)).toHaveLength(2)
    expect(observacionesItem(item({ monto: limiteRendicion(cfg) + 1 }), cfg)[0]).toMatch(/tope/)
    expect(observacionesRendicion(rend({ items: [item({ monto: 600_000 })] }), caja, cfg).sobreFondo).toBe(true)
  })

  it('RN-P04: el administrador aprueba hasta 10 UF por ítem; sobre eso, Finanzas o Gerencia', () => {
    const grande = item({ monto: limiteRendicion(cfg) + 1 })
    expect(puedeRevisarItem('R02', item(), cfg)).toBe(true)
    expect(puedeRevisarItem('R02', grande, cfg)).toBe(false)
    expect(puedeRevisarItem('R09', grande, cfg)).toBe(true)
    expect(puedeRevisarItem('R03', item(), cfg)).toBe(false)
  })

  it('la demo: cajas con saldo, rendiciones repuestas (con un rechazo) y ninguna RULE-401', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      const c = d.cajasChicas.find((x) => x.obraId === 'obra_aromos')!
      expect(saldoCaja(c, d.rendiciones, t).saldo, `día +${k}`).toBeGreaterThan(0)
      for (const o of d.obras) expect(evaluarReglas(d, calcularObra(d, o.id, t)).filter((r) => r.regla === 'RULE-401'), `${o.id} día +${k}`).toEqual([])
      const repuestas = d.rendiciones.filter((r) => estadoRendicion(r, t) === 'aprobada')
      expect(repuestas.length).toBeGreaterThan(2)
      expect(repuestas.some((r) => rechazadoRendicion(r) > 0 && aprobadoRendicion(r) > 0)).toBe(true)
    }
    expect(generarDemo(HOY).cajasChicas.some((x) => x.cerrada)).toBe(true)
  })
})
