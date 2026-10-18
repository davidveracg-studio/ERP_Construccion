import { describe, expect, it } from 'vitest'
import { controlMateriales, faltantes, indicadoresBodega, signo, stockMaterial, validarSalida } from './bodega'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { evaluarReglas } from './reglas'
import { generarDemo } from './seed'
import type { MovimientoStock, TareaSemanal } from './types'

const HOY = dia('2026-10-20')
const mv = (o: Partial<MovimientoStock>): MovimientoStock => ({ id: Math.random().toString(36), obraId: 'o', materialId: 'm', fecha: 10, tipo: 'entrada', cantidad: 10, autor: 'B', ...o })

describe('Bodega: stock y costo promedio', () => {
  it('suma entradas y ajustes, resta salidas, mermas y traspasos; valoriza a costo promedio', () => {
    const movs = [
      mv({ cantidad: 100, costoUnitario: 1000 }),
      mv({ fecha: 11, tipo: 'salida', cantidad: 40, partidaId: 'p' }),
      mv({ fecha: 12, cantidad: 60, costoUnitario: 1300 }),
      mv({ fecha: 13, tipo: 'merma', cantidad: 5 }),
      mv({ fecha: 14, tipo: 'ajuste', cantidad: -3 }),
      mv({ fecha: 15, tipo: 'traspaso', cantidad: 12, obraDestinoId: 'o2' }),
    ]
    expect(movs.map(signo)).toEqual([100, -40, 60, -5, -3, -12])
    const s = stockMaterial(movs, 'o', 'm', 15)
    expect(s.cantidad).toBe(100)
    expect(s.costoPromedio).toBeCloseTo((60 * 1000 + 60 * 1300) / 120, 5)
    expect(stockMaterial(movs, 'o', 'm', 11).cantidad).toBe(60)
  })

  it('RULE-203: no deja salir más de lo que hay y sugiere traspaso si otra obra tiene', () => {
    const movs = [mv({ cantidad: 10 }), mv({ obraId: 'o2', cantidad: 50 })]
    expect(validarSalida(movs, 'o', 'm', 10, 20)).toBeNull()
    expect(validarSalida(movs, 'o', 'm', 15, 20, ['o2'])).toMatch(/RULE-203.*traspaso/)
  })
})

describe('Bodega: control por partida (KAB-11), cobertura (RULE-201) y sobreconsumo (RULE-202)', () => {
  it('el consumo de la demo calza con el avance y el stock nunca queda negativo', () => {
    const d = generarDemo(HOY)
    for (const o of d.obras) {
      const c = calcularObra(d, o.id, HOY)
      for (const x of controlMateriales(d, c, HOY)) {
        expect(x.recibido, `${x.partida.id} recibido ≤ comprado`).toBeLessThanOrEqual(x.comprado + 1e-6)
        expect(x.consumido, `${x.partida.id} consumido ≤ recibido`).toBeLessThanOrEqual(x.recibido + 1e-6)
        if (x.segunAvance > 50) expect(x.desvio!, x.partida.id).toBeGreaterThan(-0.1)
      }
      const mats = new Set(d.movimientosStock.filter((m) => m.obraId === o.id).map((m) => m.materialId))
      for (const m of mats) for (let t = o.fechaInicio; t < HOY; t += 3) expect(stockMaterial(d.movimientosStock, o.id, m, t).cantidad, `${o.id} ${m} día ${t}`).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('detecta material faltante para una tarea por iniciar y el sobreconsumo', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const tarea: TareaSemanal = {
      id: 'tx', obraId: 'obra_aromos', semana: HOY + 2, descripcion: 'Albañilería piso 5', partidaId: 'obra_aromos_p4.1', responsable: 'C', meta: 50_000,
      inicio: HOY + 2, fin: HOY + 6, restricciones: [], historial: [], creado: HOY - 1, creadoPor: 'JT',
    }
    d.tareasSemanales.push(tarea)
    const f = faltantes(d, 'obra_aromos', HOY)
    expect(f.map((x) => x.material.id)).toEqual(['mat_ladrillo'])
    expect(evaluarReglas(d, c).some((r) => r.clave === 'RULE-201|mat_ladrillo')).toBe(true)
    d.movimientosStock.push(mv({ obraId: 'obra_aromos', materialId: 'mat_ladrillo', fecha: HOY - 1, tipo: 'salida', cantidad: 100_000, partidaId: 'obra_aromos_p4.1' }))
    expect(evaluarReglas(d, c).find((r) => r.clave === 'RULE-202|obra_aromos_p4.1')?.severidad).toBe('media')
  })

  it('la demo no tiene faltantes ni sobreconsumo durante dos semanas', () => {
    for (let k = 0; k < 14; k++) {
      const t = HOY + k
      const d = generarDemo(t)
      for (const o of d.obras) {
        const c = calcularObra(d, o.id, t)
        const ind = indicadoresBodega(d, c, t)
        const donde = `${o.id} día +${k}`
        expect(ind.faltantes.map((x) => x.material.nombre), donde).toEqual([])
        expect(ind.sobreconsumo.map((x) => x.partida.codigo), donde).toEqual([])
        expect(evaluarReglas(d, c).filter((r) => r.regla === 'RULE-201' || r.regla === 'RULE-202'), donde).toEqual([])
      }
    }
  })
})
