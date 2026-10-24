// Control de costos por partida (RF-COS-05/06, 17 §2.1)
import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Badge, Boton, Campo, Card, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import type { CalcPartida } from '../domain/evm'
import { fmtFecha } from '../domain/fechas'
import { idx, mm, num, pct } from '../domain/formato'
import { TIPOS_RECURSO, type TipoRecurso } from '../domain/types'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

type Tab = 'partidas' | 'sin_imputar' | 'compromisos' | 'ajustes'

export default function Costos() {
  const { d, c } = useCalc()
  const [tab, setTab] = useState<Tab>('partidas')
  const [forecast, setForecast] = useState<CalcPartida | null>(null)
  const nav = useNavigate()
  if (!c) return null
  const sinImputar = d.costos.filter((k) => k.obraId === c.obra.id && !k.partidaId && k.tipo !== 'GG')
  const pendientes = d.ajustes.filter((a) => a.obraId === c.obra.id && a.estado === 'pendiente_r01')
  const capitulos = [...new Set(c.partidas.map((p) => p.p.capitulo))]

  const exportar = () => {
    const filas = [['Código', 'Partida', 'Unidad', 'Cantidad', 'Avance', 'BAC', 'Comprometido', 'AC', 'EV', 'CPI', 'ETC', 'EAC', 'VAC'],
      ...c.partidas.map((p) => [p.p.codigo, p.p.descripcion, p.p.unidad, p.p.cantidad, p.avance.toFixed(4), Math.round(p.bac), Math.round(p.comprometido), Math.round(p.ac), Math.round(p.ev), p.cpi?.toFixed(3) ?? '', Math.round(p.etc), Math.round(p.eac), Math.round(p.vac)])]
    const csv = filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = `control-costos-${c.obra.nombre}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      <Titulo sub="Presupuesto → Comprometido → Ejecutado → Proyectado por partida" accion={<Boton variante="secundario" onClick={exportar}>Exportar a Excel (CSV)</Boton>}>Control de costos</Titulo>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['partidas', 'Por partida'], ['sin_imputar', `Sin imputar (${sinImputar.length})`], ['compromisos', 'Compromisos'], ['ajustes', `Ajustes de forecast${pendientes.length ? ` (${pendientes.length} por aprobar)` : ''}`]] as [Tab, string][]).map(([k, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm', tab === k ? 'border-marca font-medium text-marca' : 'border-transparent text-slate-600')}>{n}</button>
        ))}
      </div>

      {tab === 'partidas' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[1050px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Partida</th>
                  <th className="font-medium">Avance</th><th className="font-medium">Presupuesto (BAC)</th><th className="font-medium">Comprometido</th>
                  <th className="font-medium">Ejecutado (AC)</th><th className="font-medium">Ganado (EV)</th><th className="font-medium">CPI</th>
                  <th className="font-medium">Por gastar (ETC)</th><th className="font-medium">Proyectado (EAC)</th><th className="font-medium">VAC</th><th />
                </tr>
              </thead>
              <tbody>
                {capitulos.map((cap) => {
                  const ps = c.partidas.filter((p) => p.p.capitulo === cap)
                  const s = (f: (p: CalcPartida) => number) => ps.reduce((a, p) => a + f(p), 0)
                  return (
                    <Fragment key={cap}>
                      <tr className="bg-slate-50 text-right font-semibold">
                        <td className="py-1.5 text-left">{cap}</td>
                        <td>{pct(s((p) => p.ev) / (s((p) => p.bac) || 1), 0)}</td><td>{mm(s((p) => p.bac))}</td><td>{mm(s((p) => p.comprometido))}</td>
                        <td>{mm(s((p) => p.ac))}</td><td>{mm(s((p) => p.ev))}</td><td>{idx(s((p) => p.ac) ? s((p) => p.ev) / s((p) => p.ac) : null)}</td>
                        <td>{mm(s((p) => p.etc))}</td><td>{mm(s((p) => p.eac))}</td>
                        <td className={s((p) => p.vac) < 0 ? 'text-crit' : ''}>{mm(s((p) => p.vac))}</td><td />
                      </tr>
                      {ps.map((p) => {
                        const barraMax = Math.max(p.bac, p.eac, p.ac + p.comprometido) || 1
                        return (
                          <tr key={p.p.id} className="border-b border-slate-100 text-right hover:bg-blue-50/40">
                            <td className="py-2 text-left">
                              <button onClick={() => nav(`/partida/${p.p.id}`)} className="text-left hover:text-marca">
                                <span className="text-slate-500">{p.p.codigo}</span> {p.p.descripcion}
                              </button>
                              <div className="mt-1 flex h-1.5 w-48 gap-px overflow-hidden rounded bg-slate-100" title="Ejecutado + comprometido vs presupuesto">
                                <div className="bg-ac" style={{ width: `${(p.ac / barraMax) * 100}%` }} />
                                <div className="bg-amber-300" style={{ width: `${(p.comprometido / barraMax) * 100}%` }} />
                              </div>
                            </td>
                            <td>{pct(p.avance, 0)}</td><td>{mm(p.bac)}</td><td>{mm(p.comprometido)}</td><td>{mm(p.ac)}</td><td>{mm(p.ev)}</td>
                            <td className={cx(ek('KCO-03', p.cpi) === 'rojo' && 'font-semibold text-crit', ek('KCO-03', p.cpi) === 'amarillo' && 'font-semibold text-warn')} title={ayudaKpi('KCO-03')}>{idx(p.cpi)}</td>
                            <td>{mm(p.etc)}{p.ajuste && <span className="ml-1 text-[10px] text-marca" title={`Ajuste manual: ${p.ajuste.motivo}`}>✎</span>}</td>
                            <td>{mm(p.eac)}</td>
                            <td className={cx(p.vac < 0 ? 'text-crit' : 'text-slate-600')}>{mm(p.vac)}</td>
                            <td><button onClick={() => setForecast(p)} className="text-xs text-marca hover:underline">Forecast</button></td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
                <tr className="text-right text-slate-600">
                  <td className="py-2 text-left">Gastos generales (nivel de esfuerzo)</td><td>{pct(c.plazoConsumido, 0)}</td>
                  <td>{mm(c.ggBac)}</td><td>—</td><td>{mm(c.ggAc)}</td><td>{mm(c.ggPv)}</td><td>{idx(c.ggAc ? c.ggPv / c.ggAc : null)}</td>
                  <td>{mm(c.ggEac - c.ggAc)}</td><td>{mm(c.ggEac)}</td><td className={c.ggBac - c.ggEac < 0 ? 'text-crit' : ''}>{mm(c.ggBac - c.ggEac)}</td><td />
                </tr>
                {c.acSinImputar > 0 && (
                  <tr className="text-right text-amber-700">
                    <td className="py-2 text-left">Costo sin imputar ({pct(c.pctNoImputado)})</td><td /><td>—</td><td>—</td><td>{mm(c.acSinImputar)}</td><td>—</td><td /><td>—</td><td>{mm(c.acSinImputar)}</td><td>{mm(-c.acSinImputar)}</td><td />
                  </tr>
                )}
                <tr className="border-t-2 border-slate-300 text-right font-bold">
                  <td className="py-2 text-left">Total obra</td><td>{pct(c.avanceReal, 0)}</td><td>{mm(c.bac)}</td><td>{mm(c.comprometido)}</td><td>{mm(c.ac)}</td><td>{mm(c.ev)}</td>
                  <td>{idx(c.cpi)}</td><td>{mm(c.etc)}</td><td>{mm(c.eac)}</td><td className={c.vac < 0 ? 'text-crit' : 'text-ok'}>{mm(c.vac)}</td><td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Método de forecast: {d.config.metodoEAC === 'cpi' ? 'ETC = (BAC − EV) / CPI de la partida (usa presupuesto si el avance es < 10%)' : d.config.metodoEAC === 'presupuesto' ? 'ETC = BAC − EV' : 'ETC = (BAC − EV) / (CPI × SPI)'}. ✎ = ajuste manual de Oficina Técnica.</p>
        </Card>
      )}

      {tab === 'sin_imputar' && <SinImputar />}
      {tab === 'compromisos' && <Compromisos />}
      {tab === 'ajustes' && <Ajustes />}

      <ModalForecast p={forecast} onCerrar={() => setForecast(null)} />
    </div>
  )
}

function ModalForecast({ p, onCerrar }: { p: CalcPartida | null; onCerrar: () => void }) {
  const ajustar = useStore((s) => s.ajustarForecast)
  const [etc, setEtc] = useState('')
  const [motivo, setMotivo] = useState('')
  const [res, setRes] = useState<string | null>(null)
  if (!p) return null
  const valor = Number(etc.replace(/\./g, '').replace(',', '.'))
  return (
    <Modal abierto titulo={`Forecast · ${p.p.codigo} ${p.p.descripcion}`} onCerrar={() => { setRes(null); setEtc(''); setMotivo(''); onCerrar() }}>
      {res ? (
        <div className="space-y-3">
          <p className="text-sm">{res}</p>
          <Boton onClick={() => { setRes(null); setEtc(''); setMotivo(''); onCerrar() }}>Listo</Boton>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <dl className="tabular grid grid-cols-2 gap-y-1 rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">BAC</dt><dd className="text-right">{mm(p.bac)}</dd>
            <dt className="text-slate-500">AC a la fecha</dt><dd className="text-right">{mm(p.ac)}</dd>
            <dt className="text-slate-500">ETC calculado</dt><dd className="text-right">{mm(p.etc)}</dd>
            <dt className="text-slate-500">EAC</dt><dd className="text-right font-semibold">{mm(p.eac)}</dd>
          </dl>
          <Campo etiqueta="Nuevo costo por completar (ETC, en $)"><input className={inputCls} inputMode="numeric" value={etc} onChange={(e) => setEtc(e.target.value)} placeholder={String(Math.round(p.etc))} /></Campo>
          {etc && isFinite(valor) && <p className="text-slate-600">Nuevo EAC: <span className="font-semibold">{mm(p.ac + valor)}</span> (VAC {mm(p.bac - p.ac - valor)})</p>}
          <Campo etiqueta="Motivo (obligatorio, queda auditado)"><textarea className={inputCls} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <p className="text-xs text-slate-500">RN-P11: si el ajuste reduce el EAC de la obra en más de 5% del BAC, queda pendiente de aprobación de Gerencia.</p>
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton disabled={!etc || !isFinite(valor) || valor < 0 || !motivo.trim()} onClick={() => {
              const e = ajustar({ obraId: p.p.obraId, partidaId: p.p.id, etc: valor, motivo: motivo.trim() })
              setRes(e === 'aprobado' ? 'Ajuste aplicado. El forecast de la obra se recalculó.' : 'El ajuste reduce el EAC en más de 5% del BAC: quedó pendiente de aprobación de Gerencia (R01).')
            }}>Guardar ajuste</Boton>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SinImputar() {
  const { d, c } = useCalc()
  const asignar = useStore((s) => s.asignarCosto)
  const [sel, setSel] = useState<Record<string, { partida: string; tipo: TipoRecurso | 'GG'; regla: boolean }>>({})
  if (!c) return null
  const lista = d.costos.filter((k) => k.obraId === c.obra.id && !k.partidaId && k.tipo !== 'GG')
  if (lista.length === 0) return <Vacio titulo="Todo imputado" texto="No hay costos sin partida en esta obra." />
  return (
    <Card titulo="Costos sin imputar" accion={<span className="text-xs text-slate-500">KCO-08: {pct(c.pctNoImputado)} del costo real</span>}>
      <div className="space-y-2">
        {lista.map((k) => {
          const s = sel[k.id] ?? { partida: '', tipo: 'MAT' as const, regla: true }
          return (
            <div key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="min-w-[220px] flex-1">
                <div className="font-medium">{k.descripcion || '(sin descripción)'} · <span className="tabular">{mm(k.monto)}</span></div>
                <div className="text-xs text-slate-500">{fmtFecha(k.fecha)} · cuenta {k.cuenta ?? '—'} · centro {k.centroCosto ?? '—'} {k.proveedor && `· ${k.proveedor}`}</div>
              </div>
              <select className={cx(inputCls, 'w-56')} value={s.partida} onChange={(e) => setSel({ ...sel, [k.id]: { ...s, partida: e.target.value } })}>
                <option value="">Partida…</option>
                <option value="GG">Gastos generales</option>
                {c.partidas.map((p) => <option key={p.p.id} value={p.p.id}>{p.p.codigo} {p.p.descripcion}</option>)}
              </select>
              {s.partida !== 'GG' && (
                <select className={cx(inputCls, 'w-36')} value={s.tipo} onChange={(e) => setSel({ ...sel, [k.id]: { ...s, tipo: e.target.value as TipoRecurso } })}>
                  {(Object.keys(TIPOS_RECURSO) as TipoRecurso[]).map((t) => <option key={t} value={t}>{TIPOS_RECURSO[t]}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={s.regla} onChange={(e) => setSel({ ...sel, [k.id]: { ...s, regla: e.target.checked } })} /> Recordar regla</label>
              <Boton className="min-h-9" disabled={!s.partida} onClick={() => {
                const gg = s.partida === 'GG'
                asignar(k.id, gg ? null : s.partida, gg ? 'GG' : s.tipo, s.regla && (k.cuenta || k.centroCosto)
                  ? { cuenta: k.cuenta, centroCosto: k.centroCosto, obraId: k.obraId, partidaId: gg ? null : s.partida, tipo: gg ? 'GG' : s.tipo } : undefined)
              }}>Imputar</Boton>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Compromisos() {
  const { d, c } = useCalc()
  if (!c) return null
  const lista = d.compromisos.filter((k) => k.obraId === c.obra.id)
  const pagado = (id: string) => d.costos.filter((k) => k.compromisoId === id).reduce((s, k) => s + k.monto, 0)
  if (lista.length === 0) return <Vacio titulo="Sin compromisos" texto="Importa OC y subcontratos vigentes desde Importar datos." accion={<Link to="/importar" className="text-marca">Importar</Link>} />
  return (
    <Card titulo="Compromisos vigentes (OC y subcontratos)">
      <table className="tabular w-full text-sm">
        <thead><tr className="border-b text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Documento</th><th className="text-left font-medium">Proveedor</th><th className="text-left font-medium">Partida</th><th className="font-medium">Monto</th><th className="font-medium">Facturado</th><th className="font-medium">% avance partida</th></tr></thead>
        <tbody>
          {lista.map((k) => {
            const cp = c.partidas.find((p) => p.p.id === k.partidaId)
            return (
              <tr key={k.id} className="border-b border-slate-100 text-right">
                <td className="py-2 text-left">{k.documento} <Badge>{TIPOS_RECURSO[k.tipo]}</Badge></td>
                <td className="text-left">{k.proveedor}</td>
                <td className="text-left">{cp ? `${cp.p.codigo} ${cp.p.descripcion}` : '—'}</td>
                <td>{mm(k.monto)}</td><td>{mm(pagado(k.id))} <span className="text-xs text-slate-400">({pct(pagado(k.id) / k.monto, 0)})</span></td>
                <td>{cp ? pct(cp.avance, 0) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">Subcontratos: el avance validado se provisiona como costo devengado aunque el EP del subcontratista no esté facturado ({mm(c.provisionSub)} provisionado).</p>
    </Card>
  )
}

function Ajustes() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const resolver = useStore((s) => s.resolverAjuste)
  if (!c) return null
  const lista = d.ajustes.filter((a) => a.obraId === c.obra.id).sort((a, b) => b.fecha - a.fecha)
  if (lista.length === 0) return <Vacio titulo="Sin ajustes manuales" texto="El forecast se calcula automáticamente. Usa “Forecast” en una partida para ajustarlo con motivo." />
  return (
    <Card titulo="Ajustes manuales de forecast (auditados)">
      <div className="space-y-2">
        {lista.map((a) => {
          const p = d.partidas.find((x) => x.id === a.partidaId)
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex-1">
                <div className="font-medium">{p?.codigo} {p?.descripcion} · ETC {mm(a.etc)}</div>
                <div className="text-xs text-slate-500">{fmtFecha(a.fecha)} · {a.autor} · “{a.motivo}”</div>
              </div>
              <Badge tono={a.estado === 'aprobado' ? 'verde' : a.estado === 'rechazado' ? 'gris' : 'ambar'}>{a.estado === 'pendiente_r01' ? 'Pendiente de Gerencia' : a.estado}</Badge>
              {a.estado === 'pendiente_r01' && rol === 'R01' && (
                <>
                  <Boton className="min-h-8 text-xs" onClick={() => resolver(a.id, true)}>Aprobar</Boton>
                  <Boton variante="secundario" className="min-h-8 text-xs" onClick={() => resolver(a.id, false)}>Rechazar</Boton>
                </>
              )}
            </div>
          )
        })}
      </div>
      {rol !== 'R01' && lista.some((a) => a.estado === 'pendiente_r01') && <p className="mt-2 text-xs text-slate-500">Cambia al rol Gerencia (R01) para aprobar.</p>}
      <p className="mt-2 text-xs text-slate-500">{num(lista.length)} ajuste(s).</p>
    </Card>
  )
}
