// Benchmark y scores estratégicos (v2, 14 §6–§13, 13 "Scores Estratégicos"): posición de la empresa en
// su segmento (referencia sectorial de demostración), rendimientos de referencia (BEN-007), Score Salud
// Empresa, riesgo empresarial, madurez del control de gestión y scores de mandantes, administradores
// (solo Gerencia), subcontratistas y proveedores.
import { useMemo } from 'react'
import { Badge, Card, Kpi, Titulo, cx } from '../components/ui'
import {
  benchmark, cartera, indicesOBR, NOMBRES_METRICA, nivelScore, riesgoEmpresarial, scoreEmpresa, scoresAdministrador, scoresMandante, scoresProveedor, scoresSubcontratista, segmento, type Metrica,
} from '../domain/benchmark'
import { hoy } from '../domain/fechas'
import { mm, num, pct } from '../domain/formato'
import type { EstadoSemaforo } from '../domain/types'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

const tono = (s: number | null): EstadoSemaforo | undefined => (s == null ? undefined : s >= 80 ? 'verde' : s >= 60 ? 'amarillo' : 'rojo')
const fmt = (m: Metrica, v: number) => {
  const f = NOMBRES_METRICA[m].formato
  return f === 'pct' ? pct(v, 1) : f === 'pp' ? `${v >= 0 ? '+' : ''}${num(v * 100, 1)} pp` : f === 'dias' ? `${num(v, 0)} días` : f === 'num' ? `${num(v, 1)} %` : num(v, 2)
}

export default function Benchmark() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const t = hoy() - 1
  const r = useMemo(() => {
    const xs = cartera(d, t)
    return {
      seg: segmento(d, xs, t), ben: benchmark(d, xs, t), emp: scoreEmpresa(d, xs, t), riesgo: riesgoEmpresarial(d, xs, t), obr: indicesOBR(d, xs, t),
      mandantes: scoresMandante(d, xs, t), admins: scoresAdministrador(d, xs, t), subs: scoresSubcontratista(d, t), provs: scoresProveedor(d, t),
    }
  }, [d, t])
  const { seg, ben, emp, riesgo, obr } = r

  return (
    <div className="space-y-4">
      <Titulo sub={`Segmento: ${seg.tamano} · ${seg.linea} · ${seg.mandante} · Región de ${seg.region} · ${seg.volumen} al año`}>Benchmark y scores</Titulo>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        {ben.fuente}. En producción, la referencia es el agregado anónimo de la red OBRAI (al menos 10 empresas del segmento, ninguna sobre el 30 %, solo rangos percentiles). Los scores y los índices se calculan con los datos propios.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Posición en el segmento (BEN-001)" valor={`${ben.posicion} de ${ben.empresas}`} sub={`percentil promedio ${num(ben.promedio, 0)}`} estado={ben.promedio >= 60 ? 'verde' : ben.promedio >= 40 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Score Salud Empresa" valor={emp.score ?? '—'} sub={nivelScore(emp.score)} estado={tono(emp.score)} />
        <Kpi etiqueta="Riesgo empresarial" valor={riesgo.nivel} sub={`${riesgo.puntos} punto(s) de riesgo`} estado={riesgo.nivel === 'Bajo' ? 'verde' : riesgo.nivel === 'Medio' ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Madurez del control de gestión (OBR-001)" valor={`${num(obr.madurez, 1)} de 5`} sub={`calidad de datos (OBR-004): ${obr.calidadDatos ?? '—'}`} estado={obr.madurez >= 4 ? 'verde' : obr.madurez >= 3 ? 'amarillo' : 'rojo'} />
      </div>

      <Card titulo="Posición por indicador (BEN-002 a BEN-008)">
        <div className="space-y-2">
          {ben.posiciones.map((p) => (
            <div key={p.m} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-sm">
              <span><span className="text-xs text-slate-400">{NOMBRES_METRICA[p.m].ben}</span> {NOMBRES_METRICA[p.m].nombre}</span>
              <div className="relative h-3 rounded bg-slate-100" title={`Percentil ${p.percentil}`}>
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
                <div className={cx('h-full rounded', p.percentil >= 60 ? 'bg-emerald-500' : p.percentil >= 40 ? 'bg-amber-400' : 'bg-red-500')} style={{ width: `${p.percentil}%` }} />
              </div>
              <span className="tabular w-56 text-right text-xs text-slate-600">{fmt(p.m, p.valor)} · P{p.percentil} <span className="text-slate-400">(P50 {fmt(p.m, p.p50)})</span></span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">La barra muestra el percentil (más largo es mejor; la línea es la mediana del segmento).</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Rendimientos de referencia (BEN-007)">
          {ben.rendimientos.length === 0 ? <p className="text-sm text-slate-500">Sin partidas comparables con avance suficiente.</p> : (
            <table className="tabular w-full text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-1.5 text-left font-medium">HH por unidad</th><th className="font-medium">Propio</th><th className="font-medium">P25</th><th className="font-medium">P50</th><th className="font-medium">P75</th></tr></thead>
              <tbody>
                {ben.rendimientos.map((x) => (
                  <tr key={x.nombre} className="border-b border-slate-100 text-right">
                    <td className="py-1.5 text-left">{x.nombre}<div className="text-xs text-slate-500">{x.partida} · {x.obra}</div></td>
                    <td className={cx('font-medium', x.propio > x.p75 ? 'text-crit' : x.propio <= x.p50 ? 'text-emerald-700' : 'text-amber-700')}>{num(x.propio, 2)}</td>
                    <td>{num(x.p25, 2)}</td><td>{num(x.p50, 2)}</td><td>{num(x.p75, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card titulo="Score Salud Empresa (14 §5.2)">
          <dl className="tabular space-y-1 text-sm">
            {([['Obras (60 %)', emp.componentes.obras, 'Health Score promedio ponderado por venta'], ['Liquidez (20 %)', emp.componentes.liquidez, `caja mínima 60 días ${mm(emp.caja.minimo60)}`], ['Backlog (10 %)', emp.componentes.backlog, `${mm(emp.backlog)} · ${emp.mesesBacklog != null ? `${num(emp.mesesBacklog, 1)} meses de producción` : '—'}`], ['Accidentabilidad (10 %)', emp.componentes.accidentabilidad, 'KSE-03 de 12 meses']] as const).map(([k, v, det]) => (
              <div key={k} className="flex items-center justify-between gap-2"><dt>{k}<span className="block text-xs text-slate-500">{det}</span></dt><dd className="font-semibold">{v != null ? Math.round(v) : '—'}</dd></div>
            ))}
          </dl>
          <div className="mt-3 border-t border-slate-100 pt-2">
            <div className="mb-1 text-sm font-medium">Riesgo empresarial: {riesgo.nivel}</div>
            {riesgo.factores.length === 0 ? <p className="text-sm text-slate-500">Sin factores de riesgo.</p> : (
              <ul className="space-y-1 text-sm">{riesgo.factores.map((f) => <li key={f.factor}><Badge tono={f.puntos >= 2 ? 'rojo' : 'ambar'}>+{f.puntos}</Badge> {f.factor}<span className="block text-xs text-slate-500">{f.detalle}</span></li>)}</ul>
            )}
          </div>
        </Card>
      </div>

      <Card titulo="Madurez del control de gestión (OBR-001)">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{obr.checks.map((c) => <li key={c.nombre} className={c.ok ? 'text-emerald-800' : 'text-slate-500'}>{c.ok ? '✓' : '○'} {c.nombre}</li>)}</ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <TablaScores titulo="Score Mandante" filas={r.mandantes.map((m) => ({ nombre: m.mandante, sub: `${m.obras} obra(s) · atraso de pago ${m.atraso != null ? `${num(m.atraso, 0)} días` : '—'} · aprobación EP ${m.aprob != null ? `${num(m.aprob, 0)} días` : '—'}`, score: m.score }))} />
        {rol === 'R01' && <TablaScores titulo="Score Administrador de Obra (solo Gerencia)" filas={r.admins.map((a) => ({ nombre: a.administrador, sub: `${a.obras.join(', ')} · margen ${a.margen != null ? `${a.margen >= 0 ? '+' : ''}${num(a.margen * 100, 1)} pp` : '—'} · SPI ${a.spi != null ? num(a.spi, 2) : '—'}`, score: a.score }))} />}
        <TablaScores titulo="Score Subcontratista" filas={r.subs.map((s) => ({ nombre: s.subcontratista, sub: `${s.ncr} NCR (180 días) · ${s.bloqueados} EP retenidos · ${s.incidentes} incidentes`, score: s.score }))} />
        <TablaScores titulo="Score Proveedor" filas={r.provs.map((p) => ({ nombre: p.proveedor, sub: `OTIF ${p.otif != null ? pct(p.otif, 0) : '—'} en ${p.ocs} OC (90 días)`, score: p.score }))} />
      </div>
    </div>
  )
}

function TablaScores({ titulo, filas }: { titulo: string; filas: { nombre: string; sub: string; score: number | null }[] }) {
  return (
    <Card titulo={titulo}>
      {filas.length === 0 ? <p className="text-sm text-slate-500">Sin datos.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {filas.map((f) => (
            <li key={f.nombre} className="flex items-center justify-between gap-2 py-1.5">
              <span>{f.nombre}<span className="block text-xs text-slate-500">{f.sub}</span></span>
              <Badge tono={f.score == null ? 'gris' : f.score >= 80 ? 'verde' : f.score >= 60 ? 'ambar' : 'rojo'}>{f.score ?? '—'}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
