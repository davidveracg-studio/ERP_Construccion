// Configuración de umbrales, forecast y datos de demostración (RF-ADM-04)
import { useState } from 'react'
import { Boton, Campo, Card, Modal, Titulo, inputCls } from '../components/ui'
import type { Config } from '../domain/types'
import { modoNube } from '../lib/supabase'
import { useStore } from '../store/store'

type ClaveU = keyof Config['umbrales']
const PARES: { k: ClaveU; n: string; a: string; b: string; pct?: boolean }[] = [
  { k: 'spi', n: 'SPI (plazo)', a: 'Verde desde', b: 'Rojo bajo' },
  { k: 'cpi', n: 'CPI (costos)', a: 'Verde desde', b: 'Rojo bajo' },
  { k: 'avancePp', n: 'Desviación de avance', a: 'Verde desde (pp)', b: 'Rojo bajo (pp)', pct: true },
  { k: 'productividad', n: 'HH/unidad sobre APU', a: 'Verde hasta', b: 'Rojo sobre', pct: true },
  { k: 'toleranciaPartida', n: 'Alerta de costo por partida (RULE-605)', a: 'Media sobre', b: 'Alta sobre', pct: true },
  { k: 'rendimientoMO', n: 'Rendimiento de MO (RULE-606)', a: 'Media sobre', b: 'Alta sobre', pct: true },
  { k: 'avanceVsPlazoPp', n: 'Plazo consumido − avance (RULE-109)', a: 'Media sobre (pp)', b: 'Alta sobre (pp)', pct: true },
  { k: 'vac', n: 'VAC de la obra (RULE-608)', a: 'Alta bajo −', b: 'Crítica bajo −', pct: true },
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
      <Titulo sub="Umbrales del semáforo ejecutivo y de las reglas de alerta temprana (configurables por empresa, 12 §Configuración)">Configuración</Titulo>
      <Card titulo="Empresa">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Razón social"><input className={inputCls} value={config.empresa} onChange={(e) => actualizarConfig({ empresa: e.target.value })} /></Campo>
          <Campo etiqueta="RUT"><input className={inputCls} value={config.rut} onChange={(e) => actualizarConfig({ rut: e.target.value })} /></Campo>
        </div>
      </Card>
      <Card titulo="Umbrales">
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
