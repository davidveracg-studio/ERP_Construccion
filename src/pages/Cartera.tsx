// Control Tower de cartera (07 Workspace Gerencial, 17 §2.1)
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Luz, Card, Titulo, Kpi, Badge } from '../components/ui'
import { rutaDimension, valorCelda } from '../components/Semaforo'
import { calcularObra } from '../domain/evm'
import { hoy } from '../domain/fechas'
import { mm, pct, signoPct } from '../domain/formato'
import { DIMENSIONES, healthScore, semaforo } from '../domain/semaforo'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

export default function Cartera() {
  const d = useDatosDominio()
  const setObra = useStore((s) => s.setObra)
  const nav = useNavigate()
  const filas = useMemo(() => {
    const t = hoy()
    return d.obras
      .map((o) => {
        const c = calcularObra(d, o.id, t)
        const alertas = d.alertas.filter((a) => a.obraId === o.id && ['activa', 'reconocida', 'en_accion'].includes(a.estado))
        return { o, c, sem: semaforo(c, d.config), score: healthScore(c, d.config), alertas }
      })
      .sort((a, b) => a.c.vac - b.c.vac)
  }, [d])
  const tot = filas.reduce(
    (s, f) => ({ venta: s.venta + f.c.venta, resultado: s.resultado + f.c.resultado, vac: s.vac + f.c.vac, bac: s.bac + f.c.bac, backlog: s.backlog + f.c.venta * (1 - f.c.avanceReal) }),
    { venta: 0, resultado: 0, vac: 0, bac: 0, backlog: 0 },
  )
  const u = d.config.umbrales
  const ir = (id: string, ruta: string) => { setObra(id); nav(ruta) }

  return (
    <div className="space-y-5">
      <Titulo sub="Semáforo ejecutivo por obra, ordenado por desviación proyectada a término (VAC)">Control Tower de cartera</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Obras en ejecución" valor={filas.filter((f) => f.o.estado === 'en_ejecucion').length} />
        <Kpi etiqueta="Venta contratada" valor={mm(tot.venta)} sub={`Backlog ${mm(tot.backlog)}`} />
        <Kpi etiqueta="Resultado proyectado" valor={mm(tot.resultado)} sub={`Margen ${pct(tot.venta ? tot.resultado / tot.venta : 0)}`} />
        {/* Mismos umbrales que la alerta de VAC por obra (RULE-608), sobre el presupuesto de la cartera */}
        <Kpi etiqueta="VAC consolidado" valor={mm(tot.vac)} sub={tot.bac ? signoPct(tot.vac / tot.bac) : undefined}
          estado={tot.vac >= -u.vac[0] * tot.bac ? 'verde' : tot.vac >= -u.vac[1] * tot.bac ? 'amarillo' : 'rojo'} ayuda="Presupuesto − costo estimado a término" />
      </div>

      <Card titulo="Semáforo por obra">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Obra</th>
                {DIMENSIONES.map((d) => <th key={d.dim} className="px-1 py-2 text-center font-medium">{d.nombre}</th>)}
                <th className="px-2 py-2 text-right font-medium">Score</th>
                <th className="px-2 py-2 text-right font-medium">Margen proy.</th>
                <th className="px-2 py-2 text-right font-medium">VAC</th>
                <th className="px-2 py-2 text-right font-medium">Atraso</th>
                <th className="px-2 py-2 text-right font-medium">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ o, c, sem, score, alertas }) => (
                <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 pr-3">
                    <button onClick={() => ir(o.id, '/obra')} className="text-left font-medium text-marca hover:underline">{o.nombre}</button>
                    <div className="text-xs text-slate-500">{o.mandante} · {o.lineaNegocio} · avance {pct(c.avanceReal, 0)}</div>
                  </td>
                  {sem.map((s) => (
                    <td key={s.dim} className="px-1 text-center">
                      {s.estado === 'na' ? <span className="text-xs text-slate-300">{s.disponibleEn}</span> : (
                        <button onClick={() => ir(o.id, rutaDimension(s.dim))} className="inline-flex flex-col items-center gap-0.5" title={`${s.nombre}: ${valorCelda(s)}`}>
                          <Luz estado={s.estado} tam="sm" />
                          <span className="tabular text-[11px] text-slate-600">{valorCelda(s)}</span>
                        </button>
                      )}
                    </td>
                  ))}
                  <td className="tabular px-2 text-right font-semibold">{score != null ? Math.round(score) : '—'}</td>
                  <td className="tabular px-2 text-right">{pct(c.margenProyectado)}<div className="text-[11px] text-slate-400">ofertado {pct(o.margenOfertado, 0)}</div></td>
                  <td className={`tabular px-2 text-right ${c.vac < 0 ? 'text-crit' : 'text-ok'}`}>{mm(c.vac)}<div className="text-[11px] text-slate-400">{signoPct(c.bac ? c.vac / c.bac : 0)}</div></td>
                  <td className="tabular px-2 text-right">{c.atrasoProyectado > 0 ? <span className="text-crit">+{c.atrasoProyectado} d</span> : <span className="text-slate-500">{c.atrasoProyectado} d</span>}</td>
                  <td className="px-2 text-right">
                    <button onClick={() => ir(o.id, '/alertas')}>
                      <Badge tono={alertas.some((a) => a.severidad === 'critica') ? 'rojo' : alertas.length ? 'ambar' : 'verde'}>{alertas.length}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Toca una luz para ver la explicación de la desviación. Las dimensiones en gris no aplican a esa obra (por ejemplo, compras en una obra terminada).</p>
      </Card>
    </div>
  )
}
