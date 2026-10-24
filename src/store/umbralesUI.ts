// Umbrales del doc 14 con los ajustes de la empresa, para colorear tarjetas en cualquier pantalla.
import { estadoKpi, textoUmbral, umbral, type KpiId } from '../domain/umbrales'
import { useStore } from './store'

/** Estado del semáforo de un KPI con la configuración vigente (convención alerta / crítico). */
export const ek = (id: KpiId, v: number | null | undefined) => estadoKpi(useStore.getState().config, id, v)

const fmt = (id: KpiId) => (v: number) => {
  const u = umbral(null, id).unidad
  if (!isFinite(v)) return '—'
  if (u === 'pct' || u === 'pp') return `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ${u === 'pp' ? 'pp' : '%'}`
  if (u === 'indice') return v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })}${u === 'dias' ? ' días' : u === 'meses' ? ' meses' : u === 'periodos' ? ' períodos' : ''}`
}

/** Texto del umbral para la ayuda de una tarjeta: "Doc 14 KPL-05: meta ≥ 1,00 · alerta < 0,95 · crítico < 0,85". */
export const ayudaKpi = (id: KpiId) => `Doc 14 ${id}: ${textoUmbral(umbral(useStore.getState().config, id), fmt(id))}`
