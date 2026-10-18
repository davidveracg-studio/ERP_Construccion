import { describe, expect, it } from 'vitest'
import {
  accionesOC, aplicarAccionOC, compromisoOC, estadoOC, estadoSolicitud, indicadoresCompras, limiteAdmin, otif, otifProveedor, registrarRecepcion,
} from './compras'
import { CONFIG_DEFECTO } from './datos'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { semaforo } from './semaforo'
import { generarDemo } from './seed'
import type { OrdenCompra, Proveedor, SolicitudMaterial } from './types'

const HOY = dia('2026-10-20')
const cfg = CONFIG_DEFECTO
const prov: Proveedor = { id: 'p1', rut: '1-9', nombre: 'Prov', rubro: 'X', estado: 'activo' }
const oc = (o: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc1', obraId: 'obra_aromos', numero: 1, proveedorId: 'p1', lineas: [{ id: 'l1', materialId: 'm', cantidad: 100, precio: 10_000, partidaId: 'obra_aromos_p3.4' }],
  fechaEntrega: 20, urgente: false, cotizaciones: 3, historial: [], recepciones: [], creado: 10, creadoPor: 'B', ...o,
})
const x = (fecha: number, extra = {}) => ({ fecha, autor: 'A', cfg, proveedor: prov, ...extra })
const enviada = (o: Partial<OrdenCompra> = {}) => oc({ historial: [{ fecha: 11, estado: 'por_aprobar', por: 'B' }, { fecha: 12, estado: 'aprobada', por: 'A' }, { fecha: 12, estado: 'enviada', por: 'B' }], ...o })

describe('Órdenes de compra (10 §13)', () => {
  it('borrador → por aprobar → aprobada → enviada; recepción parcial y total', () => {
    let o = aplicarAccionOC(oc(), 'enviar_aprobacion', x(11))
    expect(estadoOC(o, 11)).toBe('por_aprobar')
    o = aplicarAccionOC(o, 'aprobar', x(12))
    o = aplicarAccionOC(o, 'enviar', x(12))
    expect(estadoOC(o, 12)).toBe('enviada')
    o = registrarRecepcion(o, { id: 'r1', fecha: 15, guia: '123', cantidades: { l1: 40 }, recibidoPor: 'B' })
    expect(estadoOC(o, 15)).toBe('recibida_parcial')
    expect(() => registrarRecepcion(o, { id: 'r2', fecha: 16, guia: '124', cantidades: { l1: 70 }, recibidoPor: 'B' })).toThrow(/pendiente/)
    o = registrarRecepcion(o, { id: 'r2', fecha: 18, guia: '124', cantidades: { l1: 60 }, recibidoPor: 'B' })
    expect(estadoOC(o, 18)).toBe('recibida')
    expect(() => aplicarAccionOC(o, 'anular', x(19, { texto: 'x' }))).toThrow()
  })

  it('RULE-302 bloquea proveedor no activo; RULE-303 exige justificación sin 3 cotizaciones', () => {
    expect(() => aplicarAccionOC(oc(), 'enviar_aprobacion', x(11, { proveedor: { ...prov, estado: 'bloqueado' } }))).toThrow(/RULE-302/)
    const grande = oc({ cotizaciones: 1, lineas: [{ id: 'l1', materialId: 'm', cantidad: 1000, precio: 10_000, partidaId: 'p' }] })
    expect(() => aplicarAccionOC(grande, 'enviar_aprobacion', x(11))).toThrow(/RULE-303/)
    expect(estadoOC(aplicarAccionOC({ ...grande, justificacion: 'Proveedor único' }, 'enviar_aprobacion', x(11)), 11)).toBe('por_aprobar')
  })

  it('sobre el límite (RN-P04) o fuera de presupuesto la aprueba Gerencia', () => {
    const chica = aplicarAccionOC(oc(), 'enviar_aprobacion', x(11, { saldoPartida: () => 5_000_000 }))
    expect(accionesOC(chica, 11, 'R02', cfg)).toContain('aprobar')
    const fuera = aplicarAccionOC(oc(), 'enviar_aprobacion', x(11, { saldoPartida: () => 500_000 }))
    expect(fuera.fueraPresupuesto).toEqual(['l1'])
    expect(accionesOC(fuera, 11, 'R02', cfg)).not.toContain('aprobar')
    expect(accionesOC(fuera, 11, 'R01', cfg)).toContain('aprobar')
    const sobre = aplicarAccionOC(oc({ lineas: [{ id: 'l1', materialId: 'm', cantidad: 1, precio: limiteAdmin(cfg) + 1, partidaId: 'p' }] }), 'enviar_aprobacion', x(11, { saldoPartida: () => Infinity }))
    expect(accionesOC(sobre, 11, 'R02', cfg)).not.toContain('aprobar')
  })

  it('el saldo por recibir de las OC aprobadas suma al comprometido de la partida', () => {
    const o = registrarRecepcion(enviada(), { id: 'r', fecha: 15, guia: '1', cantidades: { l1: 30 }, recibidoPor: 'B' })
    expect(compromisoOC([o], 'obra_aromos', 14).get('obra_aromos_p3.4')).toBe(1_000_000)
    expect(compromisoOC([o], 'obra_aromos', 15).get('obra_aromos_p3.4')).toBe(700_000)
    const d = generarDemo(HOY)
    const antes = calcularObra(d, 'obra_aromos', HOY).partidas.find((p) => p.p.id === 'obra_aromos_p5.1')!.comprometido
    d.ordenesCompra.push(enviada({ id: 'ocx', creado: HOY - 5, lineas: [{ id: 'l1', materialId: 'm', cantidad: 10, precio: 10_000, partidaId: 'obra_aromos_p5.1' }], historial: [{ fecha: HOY - 3, estado: 'aprobada', por: 'A' }] }))
    expect(calcularObra(d, 'obra_aromos', HOY).partidas.find((p) => p.p.id === 'obra_aromos_p5.1')!.comprometido).toBe(antes + 100_000)
  })
})

describe('Solicitudes de material (10 §12)', () => {
  it('pasa a en compra con su OC y se completa con la recepción', () => {
    const s: SolicitudMaterial = { id: 's1', obraId: 'obra_aromos', numero: 1, materialId: 'm', cantidad: 100, partidaId: 'p', fechaRequerida: 20, urgencia: 'planificada', historial: [], ordenCompraId: 'oc1', creado: 9, creadoPor: 'JT' }
    const o = enviada({ lineas: [{ id: 'l1', materialId: 'm', cantidad: 100, precio: 1, partidaId: 'p', solicitudId: 's1' }] })
    expect(estadoSolicitud({ ...s, ordenCompraId: undefined }, [], 10)).toBe('enviada')
    expect(estadoSolicitud(s, [o], 13)).toBe('en_compra')
    const r = registrarRecepcion(o, { id: 'r', fecha: 16, guia: '1', cantidades: { l1: 100 }, recibidoPor: 'B' })
    expect(estadoSolicitud(s, [r], 16)).toBe('completada')
  })
})

describe('OTIF (KAB-06), semáforo Compras y RULE-305', () => {
  it('a tiempo y completa cuenta; tarde o incompleta vencida no', () => {
    const ok = registrarRecepcion(enviada(), { id: 'r', fecha: 19, guia: '1', cantidades: { l1: 100 }, recibidoPor: 'B' })
    const tarde = registrarRecepcion(enviada({ id: 'o2' }), { id: 'r', fecha: 22, guia: '1', cantidades: { l1: 100 }, recibidoPor: 'B' })
    const incompleta = registrarRecepcion(enviada({ id: 'o3' }), { id: 'r', fecha: 18, guia: '1', cantidades: { l1: 50 }, recibidoPor: 'B' })
    const pendiente = enviada({ id: 'o4', fechaEntrega: 40 })
    expect(otif([ok, tarde, incompleta, pendiente], 25)).toEqual({ valor: 1 / 3, n: 3, ok: 1 })
    expect(otifProveedor([ok, tarde, incompleta], 'p1', 25).valor).toBeCloseTo(1 / 3)
  })

  it('la demo tiene OTIF en verde, compras en curso y ninguna alerta de abastecimiento', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras.filter((y) => y.estado === 'en_ejecucion')) {
        const c = calcularObra(d, o.id, t)
        const donde = `${o.id} día +${k}`
        expect(semaforo(c, d.config).find((s) => s.dim === 'compras')?.estado, donde).toBe('verde')
        expect(c.compras.otifN, donde).toBeGreaterThanOrEqual(4)
        expect(evaluarReglas(d, c).filter((r) => ['RULE-304', 'RULE-305', 'RULE-306'].includes(r.regla)), donde).toEqual([])
      }
      expect(indicadoresCompras(d.ordenesCompra, d.solicitudesMaterial, 'obra_aromos', t).porAprobar).toBe(1)
    }
  })
})
