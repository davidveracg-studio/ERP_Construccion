// Auditoría mensual OBRAI (v2: 14 §14). Informe ejecutivo del mes, guardado como foto inmutable:
// scores, riesgo empresarial, posición en el benchmark, fortalezas y debilidades, las desviaciones de
// costo más grandes con su causa (13 §8), los riesgos por exposición, recomendaciones automáticas y la
// proyección de margen, caja y backlog.
import { benchmark, cartera, indicesOBR, NOMBRES_METRICA, riesgoEmpresarial, scoreEmpresa, nivelScore, type ObraCalc } from './benchmark'
import { recepcionProvisoria } from './contrato'
import type { Datos } from './datos'
import { estadoEPConDocs } from './cumplimiento'
import { desglosePartida } from './explicacion'
import { finDeMes, iso } from './fechas'
import { cuentasPorCobrar } from './finanzas'
import { mm, pct } from './formato'
import { exposicionRiesgo, riesgoActivo } from './riesgos'
import { healthScore, semaforo, semaforoRecord } from './semaforo'
import type { Dia, InformeAuditoria } from './types'

export const mesDe = (t: Dia) => iso(t).slice(0, 7)
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (mes: string) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
/** Último mes completo al día t. */
export const ultimoMesCerrado = (t: Dia) => finDeMes(finDeMes(t) - 31)

export function generarInforme(d: Datos, corte: Dia): InformeAuditoria {
  const xs = cartera(d, corte)
  const ej = xs.filter((x) => x.o.estado === 'en_ejecucion')
  const emp = scoreEmpresa(d, xs, corte)
  const riesgo = riesgoEmpresarial(d, xs, corte)
  const ben = benchmark(d, xs, corte)
  const obr = indicesOBR(d, xs, corte)
  const fmtMetrica = (m: keyof typeof NOMBRES_METRICA, v: number) => {
    const f = NOMBRES_METRICA[m].formato
    return f === 'pct' ? pct(v, 1) : f === 'pp' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')} pp` : f === 'dias' ? `${Math.round(v)} días` : f === 'num' ? `${v.toFixed(1).replace('.', ',')} %` : v.toFixed(2).replace('.', ',')
  }
  const fortalezas = ben.posiciones.filter((p) => p.percentil >= 60).sort((a, b) => b.percentil - a.percentil)
    .map((p) => ({ titulo: NOMBRES_METRICA[p.m].nombre, detalle: `${fmtMetrica(p.m, p.valor)} · percentil ${p.percentil} del segmento (P50 ${fmtMetrica(p.m, p.p50)})` }))
  const debilidades = ben.posiciones.filter((p) => p.percentil < 40).sort((a, b) => a.percentil - b.percentil)
    .map((p) => ({ titulo: NOMBRES_METRICA[p.m].nombre, detalle: `${fmtMetrica(p.m, p.valor)} · percentil ${p.percentil} (P50 ${fmtMetrica(p.m, p.p50)})` }))
  for (const x of ej) for (const cel of semaforo(x.c, d.config).filter((s) => s.estado === 'rojo' || s.estado === 'amarillo'))
    debilidades.push({ titulo: `${x.o.nombre}: ${cel.nombre} en ${cel.estado}`, detalle: `KPI ${cel.kpi}` })
  // Desviaciones explicadas (13 §8): las 5 partidas con peor VAC y su componente principal
  const desviaciones = ej.flatMap((x) => x.c.partidas.filter((p) => p.vac < 0).map((p) => ({ x, p })))
    .sort((a, b) => a.p.vac - b.p.vac).slice(0, 5)
    .map(({ x, p }) => {
      const comp = desglosePartida(p).filter((k) => k.monto > 0).sort((a, b) => b.monto - a.monto)[0]
      return { obra: x.o.nombre, partida: `${p.p.codigo} ${p.p.descripcion}`, vac: Math.round(p.vac), causa: comp ? `${comp.etiqueta}${comp.detalle ? ` (${comp.detalle})` : ''}` : 'Sin descomposición' }
    })
  const riesgos = d.riesgos.filter((r) => riesgoActivo(r, corte)).map((r) => ({ r, x: exposicionRiesgo(r, corte) })).filter((y) => y.x)
    .sort((a, b) => b.x!.monto - a.x!.monto).slice(0, 5)
    .map(({ r, x }) => ({ obra: d.obras.find((o) => o.id === r.obraId)?.nombre ?? '', titulo: r.titulo, monto: Math.round(x!.monto), dias: Math.round(x!.dias * 10) / 10, nivel: x!.nivel }))
  return {
    mes: mesDe(corte), corte,
    scoreEmpresa: emp.score, nivel: nivelScore(emp.score), componentes: emp.componentes,
    riesgo: { nivel: riesgo.nivel, puntos: riesgo.puntos, factores: riesgo.factores },
    benchmark: { fuente: ben.fuente, empresas: ben.empresas, posicion: ben.posicion, promedio: Math.round(ben.promedio) },
    madurez: obr.madurez, calidadDatos: obr.calidadDatos,
    obras: xs.map((x) => ({ id: x.o.id, nombre: x.o.nombre, estado: x.o.estado, health: x.o.estado === 'en_ejecucion' ? healthScore(x.c, d.config) : null, semaforo: semaforoRecord(semaforo(x.c, d.config)), cpi: x.c.cpi, spi: x.c.spi, margen: x.c.margenProyectado })),
    fortalezas: fortalezas.slice(0, 10), debilidades: debilidades.slice(0, 10), desviaciones, riesgos,
    recomendaciones: recomendaciones(d, xs, corte, ben.rendimientos, riesgo),
    proyeccion: {
      resultado: Math.round(ej.reduce((s, x) => s + x.c.resultado, 0)),
      margen: ej.reduce((s, x) => s + x.c.venta, 0) > 0 ? ej.reduce((s, x) => s + x.c.resultado, 0) / ej.reduce((s, x) => s + x.c.venta, 0) : null,
      cajaMinima60: Math.round(emp.caja.minimo60),
      backlog: Math.round(emp.backlog), mesesBacklog: emp.mesesBacklog,
    },
  }
}

/** Recomendaciones automáticas (14 §14): rendimientos, mayor obra, no productivas, retenciones, concentración, cobranza y F30-1. */
function recomendaciones(d: Datos, xs: ObraCalc[], corte: Dia, rendimientos: ReturnType<typeof benchmark>['rendimientos'], riesgo: ReturnType<typeof riesgoEmpresarial>) {
  const out: { texto: string; regla?: string }[] = []
  for (const r of rendimientos.filter((y) => y.propio > y.p50 * 1.1))
    out.push({ texto: `Revisar el rendimiento de ${r.partida.toLowerCase()} en ${r.obra}: ${r.propio.toFixed(2).replace('.', ',')} HH/u vs P50 del segmento ${r.p50.toFixed(2).replace('.', ',')}.`, regla: 'BEN-007' })
  for (const x of xs.filter((y) => y.o.estado === 'en_ejecucion')) {
    if (x.c.extraNoAprobado.length) out.push({ texto: `Gestionar la aprobación de las órdenes de cambio con trabajo ya ejecutado en ${x.o.nombre} (${mm(x.c.extraNoAprobado.reduce((s, e) => s + e.monto, 0))}).`, regla: 'RULE-105' })
    const np = x.c.hhTotal > 0 ? x.c.hhNoProd / x.c.hhTotal : 0
    if (np > 0.07) out.push({ texto: `Reducir las HH no productivas en ${x.o.nombre} (${pct(np, 1)} de las HH).`, regla: 'KPR' })
  }
  for (const x of xs) {
    const prov = recepcionProvisoria(d.recepciones, x.o.id, corte)
    const ret = cuentasPorCobrar(d, [x.o.id], corte).retenciones
    if (prov && corte - prov.fecha > 60 && ret > 0) out.push({ texto: `Solicitar la devolución de retenciones de ${x.o.nombre} (${mm(ret)}), recibida hace ${corte - prov.fecha} días.`, regla: 'RULE-501' })
  }
  if (riesgo.concentracion > 0.5 && riesgo.mandanteMayor) out.push({ texto: `Diversificar mandantes: ${riesgo.mandanteMayor} concentra el ${Math.round(riesgo.concentracion * 100)} % del backlog.`, regla: 'KCM-05' })
  const cxc = cuentasPorCobrar(d, xs.map((x) => x.o.id), corte)
  if (cxc.vencidos > 0) out.push({ texto: `Gestionar la cobranza de ${cxc.items.filter((i) => i.vencidoHace != null).length} EP vencidos (${mm(cxc.vencidos)}).`, regla: 'RULE-402' })
  const bloqueados = new Set(d.epsSubcontrato.filter((e) => { const sc = d.subcontratos.find((s) => s.id === e.subcontratoId); return sc && estadoEPConDocs(e, sc, d.documentosLaborales, corte) === 'bloqueado' })
    .map((e) => d.proveedores.find((p) => p.id === d.subcontratos.find((s) => s.id === e.subcontratoId)?.subcontratistaId)?.nombre).filter(Boolean))
  if (bloqueados.size) out.push({ texto: `Exigir el F30-1 a ${[...bloqueados].join(', ')} para liberar sus EP retenidos.`, regla: 'RULE-701' })
  return out
}
