// Estados de las tarjetas de indicadores de una obra (los mismos cálculos que muestran las pantallas),
// para verificar que la demo no tenga rojos.
import { actividadesAtrasadas, type CalcObra } from './evm'
import { estadoCalidad, estadoSeguridad } from './semaforo'
import type { Config, EstadoSemaforo } from './types'
import { estadoKpi, estadoUmbral, umbralIF, umbralMargen, type KpiId } from './umbrales'

export function estadosTarjetas(c: CalcObra, cfg: Config): Record<string, EstadoSemaforo> {
  const r = (x: number, y: number) => (y > 0 ? x / y : null)
  const at = actividadesAtrasadas(c)
  const s = c.seguridad
  const q = c.calidad
  const kpis: [KpiId, number | null | undefined][] = [
    ['KPL-03', c.pvDir > 0 ? c.desvAvance : null], ['KPL-05', c.spi], ['KPL-06', c.atrasoProyectado], ['KPL-13', c.indiceAvancePlazo],
    ['KPL-14', c.holguraMin], ['KPL-10', at.pct], ['KPL-15', at.criticas.length],
    ['KCO-03', c.cpi], ['KCO-04', r(c.eac, c.bac)], ['KCO-08', c.pctNoImputado], ['KCO-10', c.ggDesviacion], ['KCO-11', r(c.cv, c.bac)],
    ['KCO-12', r(c.sv, c.bac)], ['KCO-14', r(c.vac, c.bac)], ['KCO-15', c.tcpi],
    ['KPR-01', c.productividadDesv], ['KPR-02', c.indiceProductividad], ['KPR-05', c.cumplimientoRDO],
    ['KPR-08', r(c.hhExtra, c.hhTotal)], ['KPR-09', r(c.hhNoProd, c.hhTotal)],
    ['KFI-04', c.caja.periodosNoCobrados],
    ['KAB-01', c.compras.enFecha], ['KAB-02', c.compras.leadTime], ['KAB-03', c.compras.urgentes], ['KAB-06', c.compras.otif], ['KAB-09', c.compras.fueraPresupuesto],
    ['KCA-01', q.primera], ['KCA-03', q.costoNoCalidad], ['KCA-07', q.reworkRate], ['KCA-09', q.inspecciones],
    ['KSE-05', s.charlas], ['KSE-06', s.art], ['KSE-08', s.medidasVencidas], ['KSE-10', s.inspecciones], ['KSE-11', s.obsEnPlazo],
  ]
  return {
    ...Object.fromEntries(kpis.map(([id, v]) => [id, estadoKpi(cfg, id, v)])),
    'KSE-01': estadoUmbral(s.if, umbralIF(cfg)),
    'KCO-05': estadoUmbral(c.margenProyectado, umbralMargen(cfg, c.obra.margenOfertado)),
    'KCA-02': estadoCalidad(c, cfg),
    'KSE-12': estadoSeguridad(c, cfg),
  }
}
