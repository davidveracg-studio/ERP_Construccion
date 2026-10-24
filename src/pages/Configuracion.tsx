// Configuración de umbrales, forecast y datos de demostración (RF-ADM-04)
import { useState } from 'react'
import { Boton, Campo, Card, Modal, Titulo, inputCls } from '../components/ui'
import type { Config } from '../domain/types'
import { KPIS, UMBRALES_DOC14, umbral, type KpiId } from '../domain/umbrales'
import { modoNube } from '../lib/supabase'
import { useStore } from '../store/store'

type ClaveU = 'toleranciaPartida' | 'avanceVsPlazoPp'
const PARES: { k: ClaveU; n: string; a: string; b: string; pct?: boolean }[] = [
  { k: 'toleranciaPartida', n: 'Alerta de costo por partida (RULE-605)', a: 'Media sobre', b: 'Alta sobre', pct: true },
  { k: 'avanceVsPlazoPp', n: 'Plazo consumido − avance (RULE-109)', a: 'Media sobre (pp)', b: 'Alta sobre (pp)', pct: true },
]

export default function Configuracion() {
  const config = useStore((s) => s.config)
  const { actualizarConfig, reiniciarDemo } = useStore()
  const [reset, setReset] = useState(false)
  const gerencia = useStore((s) => s.ui.rol) === 'R01'
  const u = config.umbrales
  const setPar = (k: ClaveU, i: 0 | 1, v: string, pct?: boolean) => {
    const n = Number(v.replace(',', '.'))
    if (!isFinite(n)) return
    const par = [...(u[k] as [number, number])] as [number, number]
    par[i] = pct ? n / 100 : n
    actualizarConfig({ umbrales: { [k]: par } as Partial<Config['umbrales']> })
  }
  return (
    <div className="max-w-3xl space-y-4">
      <Titulo sub="Umbrales de los indicadores (doc 14 §4), del semáforo ejecutivo y de las reglas de alerta temprana, configurables por empresa (12 §Configuración)">Configuración</Titulo>
      <Card titulo="Empresa">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Razón social"><input className={inputCls} value={config.empresa} onChange={(e) => actualizarConfig({ empresa: e.target.value })} /></Campo>
          <Campo etiqueta="RUT"><input className={inputCls} value={config.rut} onChange={(e) => actualizarConfig({ rut: e.target.value })} /></Campo>
        </div>
      </Card>
      <UmbralesKpi />
      <Card titulo="Umbrales de reglas">
        <div className="space-y-3">
          {PARES.map(({ k, n, a, b, pct }) => (
            <div key={k} className="grid grid-cols-3 items-end gap-3">
              <span className="pb-2 text-sm font-medium">{n}</span>
              {[0, 1].map((i) => (
                <Campo key={i} etiqueta={i === 0 ? a : b}>
                  <input className={inputCls} inputMode="decimal" defaultValue={pct ? +((u[k] as number[])[i] * 100).toFixed(2) : (u[k] as number[])[i]} onBlur={(e) => setPar(k, i as 0 | 1, e.target.value, pct)} />
                </Campo>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-3 items-end gap-3">
            <span className="pb-2 text-sm font-medium">Margen mínimo (RULE-601)</span>
            <Campo etiqueta="%"><input className={inputCls} defaultValue={u.margenMinimo * 100} onBlur={(e) => actualizarConfig({ umbrales: { margenMinimo: Number(e.target.value) / 100 } })} /></Campo>
            <Campo etiqueta="Monto mínimo alerta de costo ($)"><input className={inputCls} defaultValue={u.montoMinimoAlerta} onBlur={(e) => actualizarConfig({ umbrales: { montoMinimoAlerta: Number(e.target.value) || 0 } })} /></Campo>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <span className="pb-2 text-sm font-medium">Recargo horas extra</span>
            <Campo etiqueta="%"><input className={inputCls} defaultValue={u.recargoExtra * 100} onBlur={(e) => actualizarConfig({ umbrales: { recargoExtra: Number(e.target.value) / 100 } })} /></Campo>
          </div>
        </div>
      </Card>
      <Card titulo="Forecast">
        <Campo etiqueta="Método de cálculo del costo por completar (ETC)">
          <select className={inputCls} value={config.metodoEAC} onChange={(e) => actualizarConfig({ metodoEAC: e.target.value as Config['metodoEAC'] })}>
            <option value="cpi">(BAC − EV) / CPI — el desempeño pasado continúa</option>
            <option value="presupuesto">BAC − EV — el resto se ejecuta según presupuesto</option>
            <option value="cpi_spi">(BAC − EV) / (CPI × SPI) — costo y plazo afectan</option>
          </select>
        </Campo>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.devengarSubcontratos} onChange={(e) => actualizarConfig({ devengarSubcontratos: e.target.checked })} />
          Provisionar costo de subcontratos según avance validado (costo devengado)
        </label>
      </Card>
      {gerencia && (
        <Card titulo="Datos de demostración">
          <p className="text-sm text-slate-600">
            {modoNube
              ? 'Los datos de la demo se guardan en Supabase y los comparten todos los que ingresan (con una copia en este dispositivo para trabajar sin conexión). Reiniciar regenera las obras de ejemplo con la fecha de hoy, para todos.'
              : 'Los datos se guardan en este navegador (IndexedDB) y funcionan sin conexión. Reiniciar regenera las obras de ejemplo con la fecha de hoy y borra todo lo ingresado.'}
          </p>
          <Boton variante="peligro" className="mt-3" onClick={() => setReset(true)}>Reiniciar demo</Boton>
        </Card>
      )}
      <Modal abierto={reset} titulo="¿Reiniciar la demo?" onCerrar={() => setReset(false)}>
        <p className="text-sm">{modoNube ? 'Se borrarán los datos ingresados por todos los usuarios de la demo.' : 'Se perderán todos los datos ingresados en este navegador.'}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setReset(false)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={() => { reiniciarDemo(); setReset(false) }}>Reiniciar</Boton>
        </div>
      </Modal>
    </div>
  )
}

const GRUPOS: [string, string][] = [
  ['KPL', 'Avance y plazo'], ['KCO', 'Costos'], ['KFI', 'Finanzas'], ['KSE', 'Seguridad'], ['KCA', 'Calidad'], ['KPR', 'Productividad'],
  ['KAB', 'Abastecimiento'], ['KSU', 'Subcontratos'], ['KCM', 'Comercial'], ['KMQ', 'Maquinaria'], ['KRI', 'Riesgos'], ['KDO', 'Documental'],
]
const CAMPOS = [['objetivo', 'Meta'], ['alerta', 'Alerta'], ['critico', 'Crítico']] as const
const UNIDAD: Record<string, string> = { pct: '%', pp: 'pp', indice: 'índice', dias: 'días', n: 'n°', meses: 'meses', periodos: 'períodos' }

/** Umbrales del doc 14 §4 por indicador, con los ajustes de la empresa (config.umbrales.kpi). */
function UmbralesKpi() {
  const config = useStore((s) => s.config)
  const { actualizarConfig } = useStore()
  const ajustes = config.umbrales.kpi ?? {}
  const escala = (id: KpiId) => (['pct', 'pp'].includes(UMBRALES_DOC14[id].unidad) ? 100 : 1)
  const fijar = (id: KpiId, campo: (typeof CAMPOS)[number][0], txt: string) => {
    const base = UMBRALES_DOC14[id][campo]
    const n = txt.trim() === '' ? base : Number(txt.replace(',', '.')) / escala(id)
    if (n != null && !isFinite(n)) return
    const fila = { ...ajustes[id], [campo]: n }
    if (CAMPOS.every(([c]) => fila[c] === undefined || fila[c] === UMBRALES_DOC14[id][c])) return restablecer(id)
    actualizarConfig({ umbrales: { kpi: { ...ajustes, [id]: fila } } })
  }
  const restablecer = (id: KpiId) => {
    const { [id]: _, ...resto } = ajustes
    actualizarConfig({ umbrales: { kpi: resto } })
  }
  const nAjustes = Object.keys(ajustes).length
  return (
    <Card titulo="Umbrales de indicadores (doc 14 §4)">
      <p className="mb-3 text-sm text-slate-600">
        Verde hasta cruzar la alerta, amarillo entre la alerta y el crítico, rojo pasado el crítico; la meta es la referencia del Health Score (100 puntos).
        Los valores en % se ingresan como porcentaje. {nAjustes ? `${nAjustes} indicador(es) ajustado(s) por la empresa.` : 'Sin ajustes: rige el doc 14.'}
      </p>
      <div className="space-y-2">
        {GRUPOS.map(([pre, nombre]) => {
          const ids = KPIS.filter((id) => id.startsWith(pre))
          if (!ids.length) return null
          return (
            <details key={pre} className="rounded-lg border border-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {nombre} <span className="text-slate-500">· {ids.length} indicadores{ids.some((id) => ajustes[id]) ? ' · con ajustes' : ''}</span>
              </summary>
              <div className="overflow-x-auto px-3 pb-3">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-xs text-slate-500">
                    <th className="py-1">Indicador</th><th>Sentido</th>{CAMPOS.map(([c, t]) => <th key={c} className="w-24">{t}</th>)}<th />
                  </tr></thead>
                  <tbody>
                    {ids.map((id) => {
                      const u = umbral(config, id)
                      const k = escala(id)
                      const orden = [u.objetivo ?? u.alerta, u.alerta, u.critico]
                      const ok = u.sentido === 'mayor' ? orden[0] >= orden[1] && orden[1] >= orden[2] : orden[0] <= orden[1] && orden[1] <= orden[2]
                      return (
                        <tr key={id + JSON.stringify(ajustes[id] ?? {})} className="border-t border-slate-100">
                          <td className="py-1 pr-2"><span className="font-mono text-xs text-slate-500">{id}</span> {u.nombre}
                            {!ok && <div className="text-xs text-crit">Orden inconsistente: revise meta, alerta y crítico</div>}</td>
                          <td className="whitespace-nowrap pr-2 text-xs text-slate-500">{u.sentido === 'mayor' ? 'más es mejor' : 'menos es mejor'} · {UNIDAD[u.unidad]}</td>
                          {CAMPOS.map(([c]) => {
                            const v = u[c]
                            const propio = ajustes[id]?.[c] !== undefined
                            return (
                              <td key={c} className="pr-2">
                                <input className={inputCls + (propio ? ' border-marca' : '')} inputMode="decimal" aria-label={`${id} ${c}`}
                                  disabled={v != null && !isFinite(v)} placeholder={v == null ? 'no definida' : '—'}
                                  defaultValue={v == null || !isFinite(v) ? '' : +(v * k).toFixed(2)} onBlur={(e) => fijar(id, c, e.target.value)} />
                              </td>
                            )
                          })}
                          <td>{ajustes[id] && <button className="text-xs text-marca" onClick={() => restablecer(id)}>Doc 14</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>
    </Card>
  )
}
