// Cierre semanal del período de control (17 §4.2, 10 §28)
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Boton, Card, Titulo, cx } from '../components/ui'
import { calcularObra } from '../domain/evm'
import { finDeSemana, fmtFecha, hoy } from '../domain/fechas'
import { idx, mm, pct } from '../domain/formato'
import { periodosDe } from '../domain/periodos'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

export default function Cierre() {
  const d = useDatosDominio()
  const obraId = useStore((s) => s.ui.obraId)
  const cerrar = useStore((s) => s.cerrarPeriodo)
  const [res, setRes] = useState<{ nuevas: number; resueltas: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const periodos = periodosDe(d, obraId)
  const ultimo = periodos.at(-1)
  // Próximo corte: viernes siguiente al último cierre, sin pasar de hoy
  const sugerido = ultimo ? Math.min(ultimo.fechaCorte + 7, hoy()) : Math.min(finDeSemana(hoy()), hoy())
  const corte = sugerido
  const c = useMemo(() => calcularObra(d, obraId, corte), [d, obraId, corte])
  const lote = d.costos.filter((k) => k.obraId === obraId).reduce((m, k) => Math.max(m, k.fecha), 0)
  const checks = [
    { ok: c.diasSinRDO.length === 0, txt: 'RDO de todos los días hábiles de la semana', det: c.diasSinRDO.length ? `Faltan: ${c.diasSinRDO.map(fmtFecha).join(', ')}` : 'Completo', link: '/rdo' },
    { ok: c.rdoPendientes === 0, txt: 'Avance y HH validados por el jefe de terreno', det: c.rdoPendientes ? `${c.rdoPendientes} RDO sin validar` : 'Todo validado', link: '/terreno' },
    { ok: lote >= corte - 7, txt: 'Costos importados hasta la fecha de corte', det: lote ? `Último costo: ${fmtFecha(lote)}` : 'Sin costos', link: '/importar' },
    { ok: c.pctNoImputado <= 0.1, txt: 'Costo no imputado ≤ 10% (KCO-08)', det: pct(c.pctNoImputado), link: '/costos' },
    { ok: !d.alertas.some((a) => a.obraId === obraId && a.regla === 'RULE-607' && ['activa', 'reconocida'].includes(a.estado)), txt: 'Inconsistencias costo–avance revisadas (RULE-607)', det: '', link: '/alertas' },
  ]
  const yaCerrado = ultimo && ultimo.fechaCorte >= corte

  return (
    <div className="max-w-4xl space-y-4">
      <Titulo sub="Congela el EVM de la semana, evalúa las reglas de alerta temprana y verifica la efectividad de las acciones">Cierre semanal de control</Titulo>

      <Card titulo={`Período ${(ultimo?.numero ?? 0) + 1} · corte ${fmtFecha(corte)}`}>
        {yaCerrado ? <p className="text-sm text-slate-600">El período con corte {fmtFecha(ultimo!.fechaCorte)} ya está cerrado. El próximo cierre estará disponible el {fmtFecha(ultimo!.fechaCorte + 7)}.</p> : (
          <>
            <ul className="space-y-2">
              {checks.map((k) => (
                <li key={k.txt} className="flex items-start gap-3 text-sm">
                  <span className={cx('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white', k.ok ? 'bg-ok' : 'bg-warn')}>{k.ok ? '✓' : '!'}</span>
                  <div className="flex-1"><div className="font-medium">{k.txt}</div>{k.det && <div className="text-xs text-slate-500">{k.det}</div>}</div>
                  {!k.ok && <Link to={k.link} className="text-xs text-marca">Resolver →</Link>}
                </li>
              ))}
            </ul>
            <div className="tabular mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
              <div>CPI <b>{idx(c.cpi)}</b></div><div>SPI <b>{idx(c.spi)}</b></div><div>EAC <b>{mm(c.eac)}</b></div><div>Avance <b>{pct(c.avanceReal)}</b></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Puedes cerrar con pendientes: el período quedará marcado con confianza “{c.confianza}”. Los períodos cerrados son inmutables (RN-P11).</p>
            <Boton className="mt-3" onClick={() => {
              try { setError(null); setRes(cerrar(corte)) } catch (e) { setError((e as Error).message) }
            }}>Cerrar período</Boton>
          </>
        )}
        {res && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Período cerrado: {res.nuevas} alerta(s) nueva(s), {res.resueltas} resuelta(s). <Link to="/alertas" className="underline">Ver alertas</Link> · <Link to="/informe" className="underline">Informe semanal</Link></p>}
        {error && <p className="mt-3 text-sm text-crit">{error}</p>}
      </Card>

      <Card titulo="Períodos cerrados">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">#</th><th className="text-left font-medium">Corte</th><th className="font-medium">Avance</th><th className="font-medium">SPI</th><th className="font-medium">CPI</th><th className="font-medium">EAC</th><th className="font-medium">Margen proy.</th><th className="font-medium">Confianza</th></tr></thead>
            <tbody>
              {[...periodos].reverse().map((p) => (
                <tr key={p.id} className="border-b border-slate-100 text-right">
                  <td className="py-1.5 text-left">{p.numero}</td><td className="text-left">{fmtFecha(p.fechaCorte)}</td>
                  <td>{pct(p.obra.avanceReal)}</td><td>{idx(p.obra.spi)}</td><td>{idx(p.obra.cpi)}</td><td>{mm(p.obra.eac)}</td><td>{pct(p.obra.margenProyectado)}</td><td>{p.obra.confianza}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
