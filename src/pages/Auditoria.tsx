// Auditoría mensual OBRAI (v2, 14 §14): informe ejecutivo de cada mes cerrado, guardado como foto
// inmutable (no cambia aunque cambien los datos después). Se puede imprimir o guardar como PDF.
import { Link, useParams } from 'react-router'
import { Badge, Boton, Card, Kpi, Titulo, Vacio } from '../components/ui'
import { nombreMes, ultimoMesCerrado, mesDe } from '../domain/auditoria'
import { fmtFecha, hoy } from '../domain/fechas'
import { mm, num, pct } from '../domain/formato'
import { DIMENSIONES } from '../domain/semaforo'
import type { EstadoSemaforo } from '../domain/types'
import { Luz } from '../components/ui'
import { useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'
import { useState } from 'react'

export default function Auditorias() {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const generar = useStore((s) => s.generarAuditoria)
  const [error, setError] = useState<string | null>(null)
  const mes = mesDe(ultimoMesCerrado(hoy()))
  const lista = [...d.auditorias].sort((a, b) => b.mes.localeCompare(a.mes))
  const puede = (rol === 'R01' || rol === 'R05') && !lista.some((a) => a.mes === mes)
  return (
    <div className="space-y-4">
      <Titulo sub="Informe ejecutivo automático de cada mes cerrado: scores, benchmark, fortalezas, debilidades, desviaciones, riesgos y recomendaciones" accion={puede ? <Boton onClick={() => setError(generar())}>Generar auditoría de {nombreMes(mes)}</Boton> : undefined}>
        Auditoría mensual
      </Titulo>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {lista.length === 0 ? <Vacio titulo="Sin auditorías" texto="Genera la auditoría del último mes cerrado." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((a) => (
            <Link key={a.id} to={`/auditoria/${a.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-marca">
              <div className="text-xs uppercase text-slate-500">Auditoría</div>
              <div className="text-lg font-semibold capitalize">{nombreMes(a.mes)}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <Badge tono={a.informe.scoreEmpresa == null ? 'gris' : a.informe.scoreEmpresa >= 80 ? 'verde' : a.informe.scoreEmpresa >= 60 ? 'ambar' : 'rojo'}>Score {a.informe.scoreEmpresa ?? '—'}</Badge>
                <Badge tono={a.informe.riesgo.nivel === 'Bajo' ? 'verde' : a.informe.riesgo.nivel === 'Medio' ? 'ambar' : 'rojo'}>Riesgo {a.informe.riesgo.nivel}</Badge>
                <Badge tono="gris">{a.informe.recomendaciones.length} recomendaciones</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-500">Generada el {fmtFecha(a.fecha)} por {a.generadaPor}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function AuditoriaDetalle() {
  const { id } = useParams()
  const d = useDatosDominio()
  const a = d.auditorias.find((x) => x.id === id)
  if (!a) return <Vacio titulo="Auditoría no encontrada" texto="" accion={<Link to="/auditoria" className="text-marca">Volver</Link>} />
  const inf = a.informe
  return (
    <div className="space-y-4">
      <Titulo sub={`Corte al ${fmtFecha(inf.corte)} · generada el ${fmtFecha(a.fecha)} por ${a.generadaPor} · foto inmutable`} accion={<div className="flex gap-2 print:hidden"><Link to="/auditoria" className="self-center text-sm text-marca hover:underline">← Auditorías</Link><Boton variante="secundario" onClick={() => window.print()}>Imprimir / PDF</Boton></div>}>
        Auditoría de {nombreMes(inf.mes)}
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Score Salud Empresa" valor={inf.scoreEmpresa ?? '—'} sub={inf.nivel} estado={inf.scoreEmpresa == null ? undefined : inf.scoreEmpresa >= 80 ? 'verde' : inf.scoreEmpresa >= 60 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Riesgo empresarial" valor={inf.riesgo.nivel} sub={inf.riesgo.factores.map((f) => f.factor).join(' · ') || 'sin factores'} estado={inf.riesgo.nivel === 'Bajo' ? 'verde' : inf.riesgo.nivel === 'Medio' ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Posición en el segmento" valor={`${inf.benchmark.posicion} de ${inf.benchmark.empresas}`} sub={`${inf.benchmark.fuente.toLowerCase()}`} />
        <Kpi etiqueta="Proyección" valor={mm(inf.proyeccion.resultado)} sub={`resultado a término (${inf.proyeccion.margen != null ? pct(inf.proyeccion.margen, 1) : '—'}) · caja mínima 60 días ${mm(inf.proyeccion.cajaMinima60)} · backlog ${mm(inf.proyeccion.backlog)}${inf.proyeccion.mesesBacklog != null ? ` (${num(inf.proyeccion.mesesBacklog, 1)} meses)` : ''}`} />
      </div>

      <Card titulo="Resumen ejecutivo por obra">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 text-left font-medium">Obra</th><th className="text-right font-medium">Health</th><th className="text-right font-medium">CPI</th><th className="text-right font-medium">SPI</th><th className="text-right font-medium">Margen</th><th className="text-left font-medium">Semáforo</th></tr></thead>
            <tbody>
              {inf.obras.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="py-2">{o.nombre}</td>
                  <td className="text-right">{o.health != null ? Math.round(o.health) : '—'}</td>
                  <td className="text-right">{o.cpi != null ? num(o.cpi, 2) : '—'}</td>
                  <td className="text-right">{o.spi != null ? num(o.spi, 2) : '—'}</td>
                  <td className="text-right">{pct(o.margen, 1)}</td>
                  <td><span className="flex gap-1">{DIMENSIONES.map((x) => <span key={x.dim} title={x.nombre}><Luz estado={(o.semaforo[x.dim] ?? 'na') as EstadoSemaforo} /></span>)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo={`Fortalezas (${inf.fortalezas.length})`}>
          {inf.fortalezas.length === 0 ? <p className="text-sm text-slate-500">—</p> : <ul className="space-y-1.5 text-sm">{inf.fortalezas.map((f, i) => <li key={i}><span className="font-medium text-emerald-800">✓ {f.titulo}</span><span className="block text-xs text-slate-500">{f.detalle}</span></li>)}</ul>}
        </Card>
        <Card titulo={`Debilidades (${inf.debilidades.length})`}>
          {inf.debilidades.length === 0 ? <p className="text-sm text-slate-500">—</p> : <ul className="space-y-1.5 text-sm">{inf.debilidades.map((f, i) => <li key={i}><span className="font-medium text-amber-800">! {f.titulo}</span><span className="block text-xs text-slate-500">{f.detalle}</span></li>)}</ul>}
        </Card>
      </div>

      <Card titulo="Recomendaciones automáticas">
        {inf.recomendaciones.length === 0 ? <p className="text-sm text-slate-500">Sin recomendaciones.</p> : <ol className="list-decimal space-y-1.5 pl-5 text-sm">{inf.recomendaciones.map((r, i) => <li key={i}>{r.texto}{r.regla && <span className="ml-1 text-xs text-slate-400">({r.regla})</span>}</li>)}</ol>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Desviaciones de costo explicadas (top 5)">
          {inf.desviaciones.length === 0 ? <p className="text-sm text-slate-500">Sin partidas con VAC negativo.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{inf.desviaciones.map((x, i) => <li key={i} className="py-1.5"><div className="flex justify-between gap-2"><span>{x.partida} · {x.obra}</span><span className="tabular font-medium text-crit">{mm(x.vac)}</span></div><div className="text-xs text-slate-500">Causa principal: {x.causa}</div></li>)}</ul>
          )}
        </Card>
        <Card titulo="Riesgos por exposición (top 5)">
          {inf.riesgos.length === 0 ? <p className="text-sm text-slate-500">Sin riesgos evaluados.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{inf.riesgos.map((x, i) => <li key={i} className="flex justify-between gap-2 py-1.5"><span>{x.titulo}<span className="block text-xs text-slate-500">{x.obra} · nivel {x.nivel}</span></span><span className="tabular text-right">{mm(x.monto)}<span className="block text-xs text-slate-500">{num(x.dias, 1)} días</span></span></li>)}</ul>
          )}
        </Card>
      </div>
      <p className="text-xs text-slate-500">Madurez del control de gestión (OBR-001): {num(inf.madurez, 1)} de 5 · Calidad de datos (OBR-004): {inf.calidadDatos ?? '—'}. Benchmark: {inf.benchmark.fuente}.</p>
    </div>
  )
}
