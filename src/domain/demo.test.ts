import { describe, expect, it } from 'vitest'
import { calcularObra } from './evm'
import { dia } from './fechas'
import { semaforo } from './semaforo'
import { generarDemo } from './seed'

const ABIERTAS = ['activa', 'reconocida', 'en_accion']

describe('Demo', () => {
  it('es determinista: la misma fecha genera los mismos datos e ids', () => {
    const hoy = dia('2026-10-20')
    expect(JSON.stringify(generarDemo(hoy))).toBe(JSON.stringify(generarDemo(hoy)))
    expect(generarDemo(hoy).config.demoGenerada).toBe(hoy)
  })

  it('al avanzar un día no cambian los costos de semanas pasadas', () => {
    const hoy = dia('2026-10-20') // martes: el día siguiente mantiene la fecha de inicio
    const a = new Map(generarDemo(hoy).costos.map((c) => [c.id, c]))
    const b = generarDemo(hoy + 1).costos.filter((c) => c.fecha < hoy - 7)
    expect(b.length).toBeGreaterThan(20)
    for (const c of b) expect(a.get(c.id)).toEqual(c)
  })

  // Cualquier día del año: KPIs sin rojo, datos completos y solo alertas medias o bajas
  for (const inicio of ['2026-10-17', '2027-03-02']) {
    it(`se ve sana todos los días desde ${inicio}`, () => {
      for (let k = 0; k < 14; k++) {
        const hoy = dia(inicio) + k
        const d = generarDemo(hoy)
        for (const o of d.obras) {
          const c = calcularObra(d, o.id, hoy)
          const donde = `${o.id} día +${k}`
          expect(semaforo(c, d.config).filter((x) => x.estado === 'rojo').map((x) => x.dim), donde).toEqual([])
          expect(c.spi!, donde).toBeGreaterThanOrEqual(0.85)
          expect(c.cpi!, donde).toBeGreaterThanOrEqual(0.95)
          expect(c.margenProyectado, donde).toBeGreaterThanOrEqual(d.config.umbrales.margenMinimo)
          expect(c.confianza, donde).toBe('alta')
          const graves = d.alertas.filter((a) => a.obraId === o.id && ABIERTAS.includes(a.estado) && (a.severidad === 'critica' || a.severidad === 'alta'))
          expect(graves.map((a) => a.regla), donde).toEqual([])
        }
        // La demo sigue mostrando alertas y una acción correctiva en curso
        expect(d.alertas.filter((a) => ABIERTAS.includes(a.estado)).length).toBeGreaterThan(0)
        expect(d.alertas.some((a) => a.acciones.length > 0)).toBe(true)
      }
    })
  }
})
