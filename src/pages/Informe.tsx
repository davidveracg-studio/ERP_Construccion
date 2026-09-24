// Informe semanal de control (RF-CTL-06): imprimible a PDF desde el navegador
import { useMemo } from 'react'
import { CurvaS } from '../components/graficos'
import { SemaforoEjecutivo } from '../components/Semaforo'
import { Boton, Card } from '../components/ui'
import { serieCurvaS } from '../domain/evm'
import { desgloseObra, paretoActividades, paretoPartidas } from '../domain/explicacion'
import { fmtFecha } from '../domain/fechas'
import { idx, mm, pct, pp } from '../domain/formato'
import { periodosDe } from '../domain/periodos'
import { healthScore } from '../domain/semaforo'
import { useCalc } from '../store/hooks'

export default function Informe() {
  const { d, c, sem } = useCalc()
  const serie = useMemo(() => (c ? serieCurvaS(d, c.obra.id, c.corte) : []), [d, c])
  if (!c) return null
  const o = c.obra
  const per = periodosDe(d, o.id).at(-1)
  const alertas = d.alertas.filter((a) => a.obraId === o.id && ['activa', 'reconocida', 'en_accion'].includes(a.estado) && ['critica', 'alta'].includes(a.severidad))
  const score = healthScore(c, d.config)
  return (
    <div className="mx-auto max-w-4xl space-y-4 bg-white p-6 print:p-0">
      <div className="no-print flex justify-end"><Boton onClick={() => window.print()}>Imprimir / guardar PDF</Boton></div>
      <header className="border-b pb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">{d.config.empresa} · Informe semanal de control</div>
        <h1 className="text-2xl font-semibold">{o.nombre}</h1>
        <p className="text-sm text-slate-600">{o.mandante} · Administrador: {o.administrador} · Corte {fmtFecha(c.corte)}{per && ` · último período cerrado #${per.numero} (${fmtFecha(per.fechaCorte)})`} · Health Score {score != null ? Math.round(score) : '—'}</p>
      </header>
      <section>
        <h2 className="mb-2 font-semibold">1. Semáforo ejecutivo</h2>
        <SemaforoEjecutivo celdas={sem} />
      </section>
      <section className="tabular grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
        <div>Avance real / planificado: <b>{pct(c.avanceReal)} / {pct(c.avancePlan)}</b></div>
        <div>Desviación de avance: <b>{pp(c.desvAvance)}</b></div>
        <div>Plazo consumido: <b>{pct(c.plazoConsumido)}</b></div>
        <div>CPI / SPI: <b>{idx(c.cpi)} / {idx(c.spi)}</b></div>
        <div>CV / SV: <b>{mm(c.cv)} / {mm(c.sv)}</b></div>
        <div>BAC / EAC: <b>{mm(c.bac)} / {mm(c.eac)}</b></div>
        <div>VAC: <b>{mm(c.vac)}</b></div>
        <div>Margen proyectado: <b>{pct(c.margenProyectado)}</b> (ofertado {pct(o.margenOfertado, 0)})</div>
        <div>Término proyectado: <b>{fmtFecha(c.terminoProyectado - 1)}</b> ({c.atrasoProyectado > 0 ? '+' : ''}{c.atrasoProyectado} d)</div>
      </section>
      <Card titulo="2. Curva S"><CurvaS puntos={serie} corte={c.corte} eac={c.eac} terminoProyectado={c.terminoProyectado} /></Card>
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">3. Qué explica la desviación de costo</h2>
          <ul className="tabular space-y-1 text-sm">{desgloseObra(c).slice(0, 6).map((x) => <li key={x.etiqueta} className="flex justify-between"><span>{x.etiqueta}</span><span className={x.monto > 0 ? 'text-crit' : 'text-ok'}>{mm(x.monto)}</span></li>)}</ul>
          <h3 className="mb-1 mt-3 text-sm font-medium">Partidas con mayor sobrecosto</h3>
          <ul className="tabular space-y-1 text-sm">{paretoPartidas(c).slice(0, 5).map((x) => <li key={x.id} className="flex justify-between"><span>{x.etiqueta}</span><span>{mm(x.monto)}</span></li>)}</ul>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">4. Qué explica el atraso</h2>
          <ul className="space-y-1 text-sm">{paretoActividades(c).slice(0, 6).map((x) => <li key={x.id} className="flex justify-between"><span>{x.etiqueta}{x.critica && ' (crítica)'}</span><span className="text-crit">+{x.atraso} d</span></li>)}</ul>
        </div>
      </section>
      <section className="print-break">
        <h2 className="mb-2 font-semibold">5. Alertas críticas y altas ({alertas.length})</h2>
        <ul className="space-y-2 text-sm">
          {alertas.map((a) => (
            <li key={a.id} className="border-l-4 border-crit pl-3">
              <div className="font-medium">{a.titulo}</div>
              <div className="text-slate-600">{a.porQue} {a.queProvoca && `Causa: ${a.queProvoca}.`}</div>
              <div>Acción: {a.accionRequerida} · Responsable: {a.responsable} · {a.acciones.length ? `${a.acciones.length} acción(es) registradas` : 'sin acción registrada'}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
