import { describe, expect, it } from 'vitest'
import { CONFIG_DEFECTO, type Datos } from './datos'
import { dia } from './fechas'
import { codigoDTE, conIVA, cuentasPorCobrar, cuentasPorPagar, estadoDTE, puedeAnularConNC, siguienteFolio } from './finanzas'
import { generarDemo } from './seed'
import type { CostoReal, DocumentoTributario, EstadoPago, Obra } from './types'

const HOY = dia('2026-10-20')
const ep = (o: Partial<EstadoPago> = {}): EstadoPago => ({
  id: 'e1', obraId: 'o', numero: 1, tipo: 'avance', fechaCorte: 0, version: 1, lineas: [], bruto: 1000, reajuste: 0, descuentos: [], retencion: 50, amortizacion: 0, neto: 950,
  creado: 0, presentaciones: [1], observaciones: [], aprobado: 5, pagos: [], ...o,
})
const costo = (o: Partial<CostoReal> = {}): CostoReal => ({ id: 'k1', obraId: 'o', fecha: 10, partidaId: 'p', tipo: 'MAT', monto: 500, descripcion: 'Hormigón', proveedor: 'Hormigones', origen: 'importacion', ...o })
const obra = { id: 'o', nombre: 'Obra', mandante: 'Mandante', condicionesPago: { anticipo: 0, retencion: 0.05, diasAprobacion: 10, diasPago: 30, diasPagoProveedores: 30, diasDevolucionRetencion: 60, capitalTrabajo: 0.2 } } as unknown as Obra
const vacio = { costos: [], transacciones: [], obras: [obra], epsSubcontrato: [], subcontratos: [], proveedores: [], documentosLaborales: [] } as unknown as Datos

describe('Finanzas: DTE, cuentas por cobrar y por pagar (14 KFI)', () => {
  it('CxC por antigüedad desde la factura, vencidos (KFI-09) y días de cobro (KFI-03)', () => {
    const eps = [
      ep({ id: 'a', facturado: 10, factura: 'F-1001', vencimiento: 40 }),
      ep({ id: 'b', facturado: 60, factura: 'F-1002', vencimiento: 90, pagos: [{ fecha: 70, monto: 450 }] }),
      ep({ id: 'c', facturado: 20, factura: 'F-1003', vencimiento: 50, pagos: [{ fecha: 45, monto: 950 }], pagado: 45 }),
      ep({ id: 'd' }),
    ]
    const r = cuentasPorCobrar({ estadosPago: eps }, ['o'], 80)
    expect(r.items.map((i) => [i.ep.id, i.saldo, i.tramo])).toEqual([['a', 950, 2], ['b', 500, 0]])
    expect(r.vencidos).toBe(950)
    expect(r.dso).toBe(25)
    expect(r.porFacturar.map((x) => x.id)).toEqual(['d'])
  })

  it('CxP: lo importado y vencido lo pagó la contabilidad; lo operacional vencido queda por pagar hasta registrar el pago', () => {
    const d = { ...vacio, costos: [costo(), costo({ id: 'k2', origen: 'recepcion', fecha: 20 }), costo({ id: 'k3', fecha: 70 }), costo({ id: 'k4', origen: 'rendicion', fecha: 70 })] } as Datos
    const r = cuentasPorPagar(d, ['o'], 80)
    expect(r.items.map((i) => [i.id, i.atraso, i.tramo])).toEqual([['k2', 30, 1], ['k3', -20, 0]])
    expect(r.vencidas).toBe(500)
    const pagado = cuentasPorPagar({ ...d, transacciones: [{ id: 't', obraId: 'o', fecha: 75, tipo: 'pago', concepto: 'proveedor', refId: 'k2', contraparte: 'H', monto: 500, creadoPor: 'F' }] } as Datos, ['o'], 80)
    expect(pagado.items.map((i) => i.id)).toEqual(['k3'])
  })

  it('DTE: folio correlativo, IVA y nota de crédito solo para facturas de EP sin cobros', () => {
    const f: DocumentoTributario = { id: 'f', obraId: 'o', tipo: 'factura', folio: 1005, fecha: 10, receptor: 'M', epId: 'e1', ...conIVA(1000), glosa: '', historial: [{ fecha: 10, estado: 'emitido', por: 'F' }], creado: 10, creadoPor: 'F' }
    expect(conIVA(1000)).toEqual({ neto: 1000, iva: 190, total: 1190 })
    expect(siguienteFolio([f], 'factura')).toBe(1006)
    expect(siguienteFolio([f], 'nota_credito')).toBe(101)
    expect(codigoDTE(f)).toBe('F-1005')
    expect(puedeAnularConNC(f, ep({ factura: 'F-1005', facturado: 10 }), 12)).toBe(true)
    expect(puedeAnularConNC(f, ep({ factura: 'F-1005', facturado: 10, pagos: [{ fecha: 11, monto: 100 }] }), 12)).toBe(false)
    expect(estadoDTE({ ...f, historial: [...f.historial, { fecha: 11, estado: 'rechazado_sii', por: 'F' }] }, 11)).toBe('rechazado_sii')
  })

  it('la demo: cada EP facturado tiene su DTE aceptado, uno rechazado y reemitido, y nada vencido por pagar', () => {
    for (const k of [0, 7, 13]) {
      const t = HOY + k
      const d = generarDemo(t)
      const facturados = d.estadosPago.filter((e) => e.facturado != null && e.facturado <= t - 1 && e.anulado == null)
      for (const e of facturados) {
        const dte = d.documentosTributarios.find((x) => x.epId === e.id && codigoDTE(x) === e.factura)
        expect(dte, `EP ${e.id}`).toBeDefined()
        expect(dte!.neto).toBe(e.neto)
      }
      expect(d.documentosTributarios.filter((x) => estadoDTE(x, t) === 'rechazado_sii')).toHaveLength(1)
      const obras = d.obras.map((o) => o.id)
      const cxp = cuentasPorPagar(d, obras, t)
      expect(cxp.vencidas, `día +${k}`).toBe(0)
      expect(cuentasPorCobrar(d, obras, t).sobre60).toBeLessThanOrEqual(0.1)
      expect(d.config.umbrales).toEqual(expect.objectContaining({ limiteRendicionUf: CONFIG_DEFECTO.umbrales.limiteRendicionUf }))
    }
  })
})
