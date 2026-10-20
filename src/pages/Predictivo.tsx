// Motor predictivo avanzado (v2, 13 "Motor Predictivo", 14 §18): EAC por tres métodos y por tendencia,
// término con estacionalidad climática y simulación Monte Carlo del plazo, curvas de aprendizaje,
// anomalías en los RDO y escenarios (agregar trabajadores a una actividad; tomar una propuesta).
// Modelos estadísticos deterministas y reproducibles: no usa IA generativa.
import { useMemo, useState } from 'react'
import { Badge, Campo, Card, Kpi, Titulo, Vacio, cx, inputCls } from '../components/ui'
import GuiaFigura from '../components/GuiaFigura'
import { estadoPropuesta } from '../domain/comercial'
import { fmtFecha, hoy } from '../domain/fechas'
import { mm, num, pct } from '../domain/formato'
import { anomalias, curvasAprendizaje, diasLluvia, eacMetodos, escenarioCuadrilla, escenarioPropuesta, simularPlazo } from '../domain/predictivo'
import { useCalc } from '../store/hooks'

export default function Predictivo() {
  const { d, c } = useCalc()
  const sim = useMemo(() => (c ? simularPlazo(c) : null), [c])
  const eac = useMemo(() => (c ? eacMetodos(c, d) : null), [c, d])
  const curvas = useMemo(() => (c ? curvasAprendizaje(d, c) : []), [c, d])
  const anom = useMemo(() => (c ? anomalias(d, c) : []), [c, d])
  if (!c || !eac) return null
  if (!c.actualizado) return <Vacio titulo="Sin Carta Gantt" texto="El motor predictivo necesita el programa de la obra." />
  const lluvia = diasLluvia(c.corte + 1, c.terminoProyectado)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · corte ${fmtFecha(c.corte)} · modelos estadísticos reproducibles (regresión, percentiles, Monte Carlo); sin IA generativa`}
        accion={<GuiaFigura figura="montecarlo" titulo="Cómo se lee el Monte Carlo del plazo" texto="Cada bolita es una corrida del programa con duraciones al azar (sesgadas por el SPI) y lluvia. Las pilas forman la distribución de la fecha de término; P50 y P80 se leen en la regla." />}>Motor predictivo</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Costo a término (EAC)" valor={mm(c.eac)} sub={`por partida · rango de métodos ${mm(eac.minimo ?? 0)} – ${mm(eac.maximo ?? 0)}`} estado={c.eac <= c.bac ? 'verde' : c.eac <= c.bac * 1.03 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Término determinista (CPM)" valor={fmtFecha(c.terminoProyectado - 1)} sub={`+${num(lluvia, 1)} días esperados de lluvia → ${fmtFecha(Math.round(c.terminoProyectado + lluvia) - 1)}`} />
        <Kpi etiqueta="Término P50 / P80 (Monte Carlo)" valor={sim ? fmtFecha(sim.p50 - 1) : '—'} sub={sim ? `P80 ${fmtFecha(sim.p80 - 1)} · ${sim.n} simulaciones` : ''} />
        <Kpi etiqueta="Probabilidad de cumplir el plazo" valor={sim ? pct(sim.probCumplir, 0) : '—'} sub={`contractual ${fmtFecha(c.terminoContractual - 1)}`} estado={sim == null ? undefined : sim.probCumplir >= 0.8 ? 'verde' : sim.probCumplir >= 0.5 ? 'amarillo' : 'rojo'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Costo a término: tres métodos y tendencia">
          <table className="tabular w-full text-sm [&_td+td]:pl-3">
            <tbody>
              {eac.metodos.map((m) => (
                <tr key={m.id} className={cx('border-b border-slate-100', m.id === 'partidas' && 'bg-blue-50/60')}>
                  <td className="py-1.5">{m.nombre}{m.id === 'partidas' && <Badge tono="azul">sistema</Badge>}<div className="text-xs text-slate-500">{m.detalle}</div></td>
                  <td className="whitespace-nowrap text-right font-medium">{m.eac != null ? mm(m.eac) : '—'}</td>
                  <td className={cx('whitespace-nowrap text-right text-xs', m.eac != null && m.eac > c.bac ? 'text-crit' : 'text-emerald-700')}>{m.eac != null ? `${m.eac > c.bac ? '+' : ''}${mm(m.eac - c.bac)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">BAC {mm(c.bac)} · AC {mm(c.ac)} · EV {mm(c.ev)} · CPI {c.cpi != null ? num(c.cpi, 2) : '—'} · SPI {c.spi != null ? num(c.spi, 2) : '—'}</p>
          {eac.serie.length >= 2 && <SerieCPI serie={eac.serie} tendencia={eac.tendencia} />}
        </Card>

        <Card titulo="Simulación Monte Carlo del plazo">
          {!sim ? <p className="text-sm text-slate-500">No se pudo simular.</p> : (
            <>
              <Histograma sim={sim} />
              <p className="mt-2 text-xs text-slate-500">Verde: escenarios que terminan dentro del plazo contractual. Cada simulación varía la duración restante de las actividades (triangular según el SPI, con cola hacia el atraso) y suma días de lluvia por mes (Poisson). P10 {fmtFecha(sim.p10 - 1)} · P90 {fmtFecha(sim.p90 - 1)}.</p>
              {sim.criticidad.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-sm font-medium">Índice de criticidad (veces en la ruta crítica)</div>
                  <ul className="space-y-1 text-sm">{sim.criticidad.map((x) => <li key={x.codigo} className="flex justify-between gap-2"><span>{x.codigo} {x.nombre}</span><span className="tabular">{pct(x.indice, 0)}</span></li>)}</ul>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Curvas de aprendizaje (actividades repetitivas)">
          {curvas.length === 0 ? <p className="text-sm text-slate-500">No hay actividades repetitivas (3 o más con las mismas partidas).</p> : curvas.map((cv) => (
            <div key={cv.grupo} className="mb-3">
              <div className="text-sm font-medium">{cv.partida}</div>
              <div className="text-xs text-slate-500">{cv.grupo} · presupuesto {num(cv.presupuesto, 2)} HH/u</div>
              <table className="tabular mt-1 w-full text-sm [&_td+td]:pl-3">
                <tbody>{cv.puntos.map((p) => <tr key={p.codigo} className="border-b border-slate-100"><td className="py-1">{p.rep}. {p.nombre}</td><td className={cx('text-right', p.hhu != null && p.hhu > cv.presupuesto * 1.05 && 'text-crit')}>{p.hhu != null ? `${num(p.hhu, 3)} HH/u` : '—'}</td><td className="text-right text-xs text-slate-500">{{ terminada: 'terminada', en_curso: 'en curso', pendiente: 'pendiente' }[p.estado]}</td></tr>)}</tbody>
              </table>
              <p className="mt-1 text-xs text-slate-600">{cv.tasa != null ? `Tasa de aprendizaje ${pct(cv.tasa, 0)} (Wright, R² ${num(cv.r2 ?? 0, 2)}): ${cv.tasa < 0.97 ? 'la cuadrilla mejora al repetir; proyecta rendimientos menores en lo que falta.' : cv.tasa > 1.03 ? 'el rendimiento empeora con las repeticiones: revisar la causa (altura, frentes, cuadrilla).' : 'sin efecto aprendizaje: el rendimiento se mantiene.'}` : 'Faltan repeticiones terminadas para ajustar la curva.'}</p>
            </div>
          ))}
        </Card>
        <Card titulo="Anomalías en los RDO (últimos 30 días)">
          {anom.length === 0 ? <p className="text-sm text-slate-500">Sin rendimientos atípicos: todos los RDO están dentro de ±60 % de la mediana de su cuadrilla y partida.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{anom.map((a, i) => <li key={i} className="flex justify-between gap-2 py-1.5"><span>{fmtFecha(a.fecha)} · {a.cuadrilla}<span className="block text-xs text-slate-500">{a.partida}</span></span><span className="tabular text-right">{num(a.hhu, 3)} HH/u<span className="block text-xs text-slate-500">{a.razon > 1 ? `${num(a.razon, 1)}× la mediana` : `${num(1 / a.razon, 1)}× menos que la mediana`}</span></span></li>)}</ul>
          )}
        </Card>
      </div>

      <Escenarios />
    </div>
  )
}

function SerieCPI({ serie, tendencia }: { serie: { fecha: number; cpi: number | null }[]; tendencia: { a: number; b: number } | null }) {
  const pts = serie.filter((s) => s.cpi != null) as { fecha: number; cpi: number }[]
  const W = 320, H = 90
  const xs = pts.map((p) => p.fecha), ys = pts.map((p) => p.cpi)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0.9, ...ys) - 0.02, y1 = Math.max(1.05, ...ys) + 0.02
  const X = (x: number) => 8 + ((x - x0) / Math.max(1, x1 - x0)) * (W - 16)
  const Y = (y: number) => H - 8 - ((y - y0) / (y1 - y0)) * (H - 16)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="CPI semanal y su tendencia">
      <line x1={8} x2={W - 8} y1={Y(1)} y2={Y(1)} stroke="currentColor" className="text-slate-300" strokeDasharray="3 3" />
      <polyline fill="none" stroke="currentColor" className="text-marca" strokeWidth={2} points={pts.map((p) => `${X(p.fecha)},${Y(p.cpi)}`).join(' ')} />
      {tendencia && <line x1={X(x0)} y1={Y(tendencia.a + tendencia.b * x0)} x2={X(x1)} y2={Y(tendencia.a + tendencia.b * x1)} stroke="currentColor" className="text-amber-500" strokeWidth={1.5} strokeDasharray="5 3" />}
      {pts.map((p) => <circle key={p.fecha} cx={X(p.fecha)} cy={Y(p.cpi)} r={2.5} className="fill-marca" />)}
      <text x={W - 8} y={Y(1) - 3} textAnchor="end" className="fill-slate-400 text-[9px]">CPI 1,0</text>
    </svg>
  )
}

function Histograma({ sim }: { sim: NonNullable<ReturnType<typeof simularPlazo>> }) {
  const W = 320, H = 110
  const max = Math.max(...sim.histograma.map((h) => h.n))
  const x0 = sim.histograma[0].desde
  const x1 = sim.histograma.at(-1)!.desde + (sim.histograma[1] ? sim.histograma[1].desde - x0 : 1)
  const X = (x: number) => 8 + ((x - x0) / Math.max(1, x1 - x0)) * (W - 16)
  const bw = (W - 16) / sim.histograma.length
  const paso = sim.histograma[1] ? sim.histograma[1].desde - x0 : 1
  const T = 12
  return (
    <svg viewBox={`0 0 ${W} ${H + T + 14}`} className="w-full" role="img" aria-label="Distribución del término de obra">
      <g transform={`translate(0 ${T})`}>
        {sim.histograma.map((h, i) => <rect key={i} x={8 + i * bw + 1} y={H - (h.n / max) * (H - 10)} width={bw - 2} height={(h.n / max) * (H - 10)} className={h.desde + paso <= sim.contractual ? 'fill-emerald-400' : 'fill-amber-400'} />)}
        {[['P50', sim.p50, 'text-slate-700', -3], ['P80', sim.p80, 'text-slate-500', -3], ['Contrato', sim.contractual, 'text-crit', H + 11]].map(([n, x, cls, y]) => (
          <g key={n as string} className={cls as string}>
            <line x1={X(x as number)} x2={X(x as number)} y1={0} y2={H} stroke="currentColor" strokeWidth={1.5} strokeDasharray={n === 'Contrato' ? '0' : '3 2'} />
            <text x={X(x as number)} y={y as number} textAnchor="middle" className="fill-current text-[9px]">{n as string}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}

function Escenarios() {
  const { d, c } = useCalc()
  const t = hoy()
  const acts = (c?.actualizado?.actividades ?? []).filter((a) => !a.esHito && a.finReal == null && a.partidas.length)
  const [act, setAct] = useState(acts.find((a) => c?.cpm.get(a.id)?.critica)?.id ?? acts[0]?.id ?? '')
  const [n, setN] = useState(4)
  const props = d.propuestas.filter((p) => ['enviada', 'borrador', 'en_revision'].includes(estadoPropuesta(p, t) ?? ''))
  const [prop, setProp] = useState(props[0]?.id ?? '')
  const esc = useMemo(() => (c && act ? escenarioCuadrilla(d, c, act, n) : null), [c, d, act, n])
  const p = props.find((x) => x.id === prop)
  const escP = useMemo(() => (p ? escenarioPropuesta(d, t - 1, p) : null), [d, t, p])
  if (!c) return null
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card titulo="Escenario: ¿y si agrego trabajadores a una actividad?">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <Campo etiqueta="Actividad"><select className={inputCls} value={act} onChange={(e) => setAct(e.target.value)}>{acts.map((a) => <option key={a.id} value={a.id}>{a.codigo} {a.nombre}{c.cpm.get(a.id)?.critica ? ' (crítica)' : ''}</option>)}</select></Campo>
          <Campo etiqueta="Trabajadores adicionales"><input type="number" min={1} className={inputCls} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value)))} /></Campo>
        </div>
        {esc && (
          <dl className="tabular mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Dotación</dt><dd>{esc.dotacion} + {esc.adicionales} (rinden 80 %) → ritmo ×{num(esc.factor, 2)}</dd></div>
            <div className="flex justify-between"><dt>Término de obra</dt><dd>{fmtFecha(esc.terminoActual - 1)} → <b>{fmtFecha(esc.nuevoTermino - 1)}</b> ({esc.ganados > 0 ? `${esc.ganados} ${esc.ganados === 1 ? "día" : "días"} antes` : 'sin cambio'})</dd></div>
            {esc.hitos.map((h) => <div key={h.hito} className="flex justify-between"><dt>{h.hito}</dt><dd>{fmtFecha(h.antes! - 1)} → {fmtFecha(h.despues! - 1)}{h.antes! - h.despues! > 0 ? ` (${h.antes! - h.despues!} ${h.antes! - h.despues! === 1 ? "día" : "días"} antes)` : ''}</dd></div>)}
            <div className="flex justify-between"><dt>Costo de los trabajadores adicionales</dt><dd>{mm(esc.costo)}</dd></div>
            <div className="flex justify-between"><dt>Ahorro de GG y multas evitadas</dt><dd>{mm(esc.ahorroGG + esc.multaEvitada)}</dd></div>
            {esc.ganados <= 0 && <p className="text-xs text-slate-500">{esc.critica ? 'La actividad es crítica para un hito, pero no define el término de la obra.' : 'La actividad tiene holgura: acelerarla no adelanta el término.'}</p>}
          </dl>
        )}
      </Card>
      <Card titulo="Escenario: ¿y si tomo esta obra?">
        {props.length === 0 ? <p className="text-sm text-slate-500">Sin propuestas abiertas.</p> : (
          <>
            <Campo etiqueta="Propuesta"><select className={inputCls} value={prop} onChange={(e) => setProp(e.target.value)}>{props.map((x) => <option key={x.id} value={x.id}>N° {x.numero} · {d.leads.find((l) => l.id === x.leadId)?.nombre}</option>)}</select></Campo>
            {escP && (
              <dl className="tabular mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt>Precio de la oferta</dt><dd>{mm(escP.precio)} · margen {pct(escP.margen, 1)}</dd></div>
                <div className="flex justify-between"><dt>Backlog</dt><dd>{mm(escP.backlogAntes)} → <b>{mm(escP.backlogDespues)}</b></dd></div>
                <div className="flex justify-between"><dt>Meses de producción en cartera</dt><dd>{escP.mesesAntes != null ? num(escP.mesesAntes, 1) : '—'} → {escP.mesesDespues != null ? num(escP.mesesDespues, 1) : '—'}</dd></div>
                <div className="flex justify-between"><dt>Concentración de mandante (KCM-05)</dt><dd className={cx(escP.concDespues > 0.5 && 'text-amber-700')}>{pct(escP.concAntes, 0)} → {pct(escP.concDespues, 0)}</dd></div>
                <div className="flex justify-between"><dt>Trabajadores propios necesarios</dt><dd>~{escP.trabajadores} (dotación actual {escP.dotacionActual})</dd></div>
              </dl>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
