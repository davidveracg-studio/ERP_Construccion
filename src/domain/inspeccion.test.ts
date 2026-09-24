import { it } from 'vitest'
import { calcularObra } from './evm'
import { desgloseObra } from './explicacion'
import { dia } from './fechas'
import { generarDemo } from './seed'
import { semaforo } from './semaforo'

it.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.INSPECCION)('inspección de la demo', () => {
  const hoy = dia('2026-09-22')
  const d = generarDemo(hoy)
  for (const o of d.obras) {
    const c = calcularObra(d, o.id, hoy - 1)
    console.log(o.nombre, {
      spi: c.spi?.toFixed(3), cpi: c.cpi?.toFixed(3), avReal: c.avanceReal.toFixed(3), avPlan: c.avancePlan.toFixed(3),
      plazo: c.plazoConsumido.toFixed(3), atraso: c.atrasoProyectado, holgura: c.holguraMin, margen: c.margenProyectado.toFixed(3),
      ofertado: o.margenOfertado, vacPct: (c.vac / c.bac).toFixed(3), prod: c.productividadDesv?.toFixed(3), conf: c.confianza,
      noImp: c.pctNoImputado.toFixed(3), hitos: c.hitos.map((h) => `${h.act.codigo}:${h.estado}:${h.atraso}`),
    })
    console.log(semaforo(c, d.config).filter((x) => x.estado !== 'na').map((x) => `${x.nombre}=${x.estado}`).join(' '))
    console.log(desgloseObra(c).map((x) => `${x.etiqueta}: ${(x.monto / 1e6).toFixed(1)}`).join(' | '))
    for (const p of c.partidas) if (p.avance > 0) console.log(' ', p.p.codigo, 'av', p.avance.toFixed(2), 'cpi', p.cpi?.toFixed(2), 'vac', (p.vac / 1e6).toFixed(1), 'rend', p.rendReal?.toFixed(3), '/', p.rendPres)
    const al = d.alertas.filter((a) => a.obraId === o.id)
    console.log(' alertas', al.map((a) => `${a.regla}:${a.estado}:${a.severidad}`).join(', '))
    console.log(' periodos', d.periodos.filter((p) => p.obraId === o.id).map((p) => `${p.numero}:${p.obra.spi?.toFixed(2)}/${p.obra.cpi?.toFixed(2)}`).join(' '))
  }
})
