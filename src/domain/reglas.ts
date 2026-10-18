// Reglas del núcleo de alerta temprana (12). Se evalúan al cerrar el período de control.
import type { Datos } from './datos'
import type { CalcObra } from './evm'
import { estadoGarantia, estadoObligacion, multaDevengada, OBJETOS_GARANTIA, TIPOS_GARANTIA } from './contrato'
import { epAtrasado } from './estadosPago'
import { CAUSAS_IMPRODUCTIVAS, costoFijo, equiposDeObra, IMPRODUCTIVAS_MAX, indicadoresEquipo, MODALIDAD, UTILIZACION_MIN } from './maquinaria'
import { controlMateriales, DIAS_COBERTURA, faltantes, TOLERANCIA_CONSUMO } from './bodega'
import { codigoOC, OTIF_PROVEEDOR_MIN, otifProveedor, URGENTES_MAX, urgentesMes } from './compras'
import { CAUSAS_CNC, indicadoresLP, PPC_ALERTA, PPC_ROJO, restriccionesAbiertas, restriccionUrgente, TIPOS_RESTRICCION } from './lastPlanner'
import { DESTINATARIOS_RFI, folioPendiente, partidasCriticas, rfiVencido, terrenoDesactualizado, tocaCriticas, revisionVigente, TIPOS_FOLIO } from './documental'
import { ETAPAS_OC, etapaOC } from './ordenesCambio'
import { CATEGORIAS_RIESGO, diasSinPlan, DIAS_PLAN_CRITICO, ESCALA, estadoRiesgo, evaluacionVigente, exposicionRiesgo, NIVELES, revisionVencida } from './riesgos'
import { desglosePartida, paretoActividades, paretoCuadrillas } from './explicacion'
import { fmtFecha } from './fechas'
import { idx, mm, num, pct, pp, signoPct } from './formato'
import { rendimientosPorCuadrilla } from './evm'
import { costoHHPres } from './presupuesto'
import { semaforo } from './semaforo'
import type { PeriodoControl, Severidad } from './types'

export interface Candidata {
  regla: string
  clave: string
  severidad: Severidad
  titulo: string
  entidad: string
  datos: { etiqueta: string; valor: string }[]
  porQue: string
  queProvoca?: string
  queExplica?: string
  accionRequerida: string
  responsable: string
  kpi?: string
  valorKpi?: number
  mejorSiMenor?: boolean
}

export const NOMBRES_REGLA: Record<string, string> = {
  'RULE-101': 'RDO / avance / HH no registrados',
  'RULE-105': 'Trabajo extraordinario sin orden de cambio aprobada',
  'RULE-106': 'Atraso de obra (SPI)',
  'RULE-107': 'Hito en riesgo o vencido',
  'RULE-108': 'Actividad crítica atrasada',
  'RULE-109': 'Avance rezagado respecto del plazo',
  'RULE-113': 'PPC semanal bajo meta',
  'RULE-114': 'Restricción sin liberar a 48 h del inicio',
  'RULE-110': 'Registro de HH inconsistente',
  'RULE-201': 'Material requerido sin stock ni OC',
  'RULE-202': 'Consumo de material sobre presupuesto',
  'RULE-205': 'Baja utilización de maquinaria',
  'RULE-206': 'Horas improductivas de maquinaria sobre umbral',
  'RULE-304': 'Compromiso sobre presupuesto de partida',
  'RULE-305': 'OTIF de proveedor bajo',
  'RULE-306': 'Compras urgentes sobre umbral',
  'RULE-402': 'Estado de pago vencido',
  'RULE-403': 'Estado de pago no presentado a tiempo',
  'RULE-404': 'Garantía por vencer o vencida',
  'RULE-601': 'Margen proyectado bajo mínimo',
  'RULE-902': 'Folio del Libro de Obra sin respuesta',
  'RULE-903': 'RFI sin respuesta en plazo',
  'RULE-904': 'Obligación contractual por vencer o vencida',
  'RULE-905': 'Plano no vigente en uso en terreno',
  'RULE-602': 'CPI bajo umbral',
  'RULE-603': 'Caja proyectada negativa',
  'RULE-605': 'Desviación proyectada por partida',
  'RULE-606': 'Rendimiento de MO sobre presupuesto',
  'RULE-607': 'Inconsistencia costo–avance',
  'RULE-608': 'VAC de la obra bajo umbral',
  'RULE-609': 'Semáforo ejecutivo en rojo',
  'RULE-610': 'Riesgo crítico sin plan de mitigación',
  'RULE-611': 'Riesgo con revisión vencida',
  'RULE-612': 'Riesgo materializado',
}

export function evaluarReglas(d: Datos, c: CalcObra, anterior?: PeriodoControl): Candidata[] {
  const u = d.config.umbrales
  const o = c.obra
  const out: Candidata[] = []

  // RULE-101
  if (c.diasSinRDO.length > 0)
    out.push({
      regla: 'RULE-101', clave: 'RULE-101', severidad: c.diasSinRDO.length >= 2 ? 'media' : 'baja',
      titulo: `${c.diasSinRDO.length} día(s) hábil(es) sin reporte diario`, entidad: o.nombre,
      datos: [{ etiqueta: 'Días', valor: c.diasSinRDO.map(fmtFecha).join(', ') }],
      porQue: 'Sin RDO no hay avance ni HH: el EVM de la semana pierde confiabilidad.',
      accionRequerida: 'Registrar los RDO faltantes antes del cierre del período.',
      responsable: o.jefeTerreno,
    })

  // RULE-106
  if (c.spi != null && c.spi < u.spi[0])
    out.push({
      regla: 'RULE-106', clave: 'RULE-106', severidad: c.spi < u.spi[1] ? 'alta' : 'media',
      titulo: `Obra atrasada: SPI ${idx(c.spi)}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'SPI', valor: idx(c.spi) },
        { etiqueta: 'Avance real / planificado', valor: `${pct(c.avanceReal)} / ${pct(c.avancePlan)}` },
        { etiqueta: 'Atraso proyectado', valor: `${c.atrasoProyectado} días` },
        { etiqueta: 'Multa potencial', valor: mm(Math.max(0, c.atrasoProyectado) * o.multaDiaria) },
      ],
      porQue: `SPI ${idx(c.spi)} < umbral ${idx(u.spi[0])}.`,
      queExplica: paretoActividades(c).slice(0, 3).map((a) => `${a.etiqueta} (+${a.atraso} d${a.critica ? ', crítica' : ''})`).join(' · ') || undefined,
      accionRequerida: 'Plan de recuperación (refuerzo de cuadrillas, turnos, secuencia) o solicitud de aumento de plazo si la causa es imputable al mandante.',
      responsable: o.administrador, kpi: 'spi', valorKpi: c.spi,
    })

  // RULE-107
  for (const h of c.hitos) {
    if (h.estado !== 'en_riesgo' && h.estado !== 'vencido') continue
    const contractual = !!h.act.hitoContractual
    out.push({
      regla: 'RULE-107', clave: `RULE-107|${h.act.id}`,
      severidad: contractual ? 'critica' : 'alta',
      titulo: `Hito ${h.estado === 'vencido' ? 'vencido' : 'en riesgo'}: ${h.act.nombre}`, entidad: h.act.nombre,
      datos: [
        { etiqueta: 'Fecha comprometida', valor: fmtFecha(h.comprometida) },
        { etiqueta: 'Fecha proyectada', valor: fmtFecha(h.proyectada) },
        { etiqueta: 'Atraso', valor: `${h.atraso} días` },
        ...(contractual ? [{ etiqueta: 'Multa potencial', valor: mm(Math.max(0, h.atraso) * o.multaDiaria) }] : []),
      ],
      porQue: `La fecha proyectada por la ruta crítica supera la comprometida en ${h.atraso} días.`,
      queExplica: paretoActividades(c).filter((a) => a.critica).slice(0, 3).map((a) => `${a.etiqueta} (+${a.atraso} d)`).join(' · ') || undefined,
      accionRequerida: 'Revisar actividades predecesoras críticas y definir plan de recuperación.',
      responsable: o.administrador, kpi: `hito:${h.act.id}`, valorKpi: h.atraso, mejorSiMenor: true,
    })
  }

  // RULE-108
  // Solo las 3 actividades críticas más atrasadas, para no saturar al jefe de terreno
  const lb = new Map((c.lb?.actividades ?? []).map((a) => [a.id, a]))
  const criticas = (c.actualizado?.actividades ?? [])
    .map((a) => ({ a, r: c.cpm.get(a.id), b: lb.get(a.id) }))
    .filter(({ a, r, b }) => r && b && !r.terminada && !a.esHito && r.critica && r.ef - b.fin > 0)
    .sort((x, y) => (y.r!.ef - y.b!.fin) - (x.r!.ef - x.b!.fin))
    .slice(0, 3)
  for (const { a, r: r0, b: b0 } of criticas) {
    const r = r0!
    const b = b0!
    const atraso = r.ef - b.fin
    out.push({
      regla: 'RULE-108', clave: `RULE-108|${a.id}`, severidad: 'alta',
      titulo: `Actividad crítica atrasada: ${a.codigo} ${a.nombre}`, entidad: a.nombre,
      datos: [
        { etiqueta: 'Fin línea base', valor: fmtFecha(b.fin - 1) },
        { etiqueta: 'Fin proyectado', valor: fmtFecha(r.ef - 1) },
        { etiqueta: 'Holgura total', valor: `${r.holgura} días` },
        { etiqueta: 'Avance', valor: pct(c.avanceAct.get(a.id) ?? 0) },
      ],
      porQue: `Actividad en ruta crítica con ${atraso} días de atraso respecto de la línea base.`,
      accionRequerida: 'Reforzar recursos de la actividad o re-secuenciar sucesoras.',
      responsable: o.jefeTerreno, kpi: `act:${a.id}`, valorKpi: atraso, mejorSiMenor: true,
    })
  }

  // RULE-109 (una obra terminada no está rezagada aunque haya consumido todo el plazo)
  const brecha = c.plazoConsumido - c.avanceReal
  if (brecha > u.avanceVsPlazoPp[0] && c.avanceReal < 0.999)
    out.push({
      regla: 'RULE-109', clave: 'RULE-109', severidad: brecha > u.avanceVsPlazoPp[1] ? 'alta' : 'media',
      titulo: `Avance ${pct(c.avanceReal)} con ${pct(c.plazoConsumido)} del plazo consumido`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Plazo consumido', valor: pct(c.plazoConsumido) },
        { etiqueta: 'Avance físico', valor: pct(c.avanceReal) },
        { etiqueta: 'Brecha', valor: pp(brecha) },
      ],
      porQue: `La brecha plazo–avance (${pp(brecha)}) supera ${pp(u.avanceVsPlazoPp[0])}.`,
      accionRequerida: 'Revisar ritmo semanal requerido para cumplir el plazo.',
      responsable: o.administrador,
    })

  // RULE-110
  const noProd = c.hhTotal > 0 ? c.hhNoProd / c.hhTotal : 0
  if (noProd > 0.15)
    out.push({
      regla: 'RULE-110', clave: 'RULE-110', severidad: 'media',
      titulo: `HH no productivas ${pct(noProd)}`, entidad: o.nombre,
      datos: [{ etiqueta: 'HH no productivas', valor: num(c.hhNoProd) }, { etiqueta: 'HH totales', valor: num(c.hhTotal) }],
      porQue: 'Más de 15% de las HH registradas no se imputan a partidas.',
      accionRequerida: 'Revisar causas (esperas, clima) y registro de HH por partida.',
      responsable: o.jefeTerreno,
    })

  for (const cp of c.partidas) {
    const p = cp.p
    // RULE-304
    if (cp.ac + cp.comprometido > cp.bac * 1.0 && cp.avance < 0.9 && cp.bac > 0)
      out.push({
        regla: 'RULE-304', clave: `RULE-304|${p.id}`, severidad: 'alta',
        titulo: `Compromisos sobre presupuesto: ${p.codigo} ${p.descripcion}`, entidad: p.descripcion,
        datos: [
          { etiqueta: 'Presupuesto', valor: mm(cp.bac) },
          { etiqueta: 'Ejecutado + comprometido', valor: mm(cp.ac + cp.comprometido) },
          { etiqueta: 'Avance', valor: pct(cp.avance) },
        ],
        porQue: 'Lo gastado más lo comprometido ya supera el presupuesto con obra pendiente.',
        accionRequerida: 'Revisar compromisos y forecast de la partida.',
        responsable: o.oficinaTecnica,
      })

    // RULE-605
    const desv = cp.eac - cp.bac
    if (cp.avance >= 0.1 && cp.bac > 0 && desv > cp.bac * u.toleranciaPartida[0] && desv > u.montoMinimoAlerta) {
      const comps = desglosePartida(cp).filter((x) => x.monto > 0).sort((a, b) => b.monto - a.monto)
      const dominante = comps[0]?.recurso
      const resp = dominante === 'MO' ? o.jefeTerreno : dominante === 'SUB' ? o.administrador : o.oficinaTecnica
      out.push({
        regla: 'RULE-605', clave: `RULE-605|${p.id}`,
        severidad: desv > cp.bac * u.toleranciaPartida[1] ? 'alta' : 'media',
        titulo: `Alerta de costo: ${p.codigo} ${p.descripcion}`, entidad: `${p.codigo} ${p.descripcion}`,
        datos: [
          { etiqueta: 'Presupuesto (BAC)', valor: mm(cp.bac) },
          { etiqueta: 'Ejecutado (AC)', valor: mm(cp.ac) },
          { etiqueta: 'Avance físico', valor: `${pct(cp.avance, 0)} → EV ${mm(cp.ev)}` },
          { etiqueta: 'CPI', valor: idx(cp.cpi) },
          { etiqueta: 'Proyección (EAC)', valor: mm(cp.eac) },
          { etiqueta: 'Desviación proyectada', valor: `+${mm(desv)} (${signoPct(desv / cp.bac)})` },
        ],
        porQue: `EAC supera el BAC en ${signoPct(desv / cp.bac)} (tolerancia ${pct(u.toleranciaPartida[0], 0)}).`,
        queProvoca: comps.slice(0, 3).map((x) => `${x.etiqueta} ${mm(x.monto)}${x.detalle ? ` (${x.detalle})` : ''}`).join(' · ') || undefined,
        queExplica: paretoCuadrillas(d, { ...c, partidas: [cp] }, c.corte - 13)
          .filter((x) => x.detalle?.includes(p.codigo)).slice(0, 2).map((x) => `${x.etiqueta}: ${x.detalle}`).join(' · ') || undefined,
        accionRequerida: dominante === 'MO' ? 'Revisar rendimiento de la cuadrilla y organización del trabajo.' : dominante === 'MAT' ? 'Revisar consumo y precio de materiales (pérdidas, devoluciones, proveedor).' : 'Revisar costos y forecast de la partida.',
        responsable: resp, kpi: `cpi:${p.id}`, valorKpi: cp.cpi ?? undefined,
      })
    }

    // RULE-607
    if (cp.ac > 0 && cp.ev === 0 && cp.cantProg > 0)
      out.push({
        regla: 'RULE-607', clave: `RULE-607|a|${p.id}`, severidad: 'media',
        titulo: `Costo sin avance: ${p.codigo} ${p.descripcion}`, entidad: p.descripcion,
        datos: [{ etiqueta: 'AC', valor: mm(cp.ac) }, { etiqueta: 'Avance', valor: '0 %' }],
        porQue: 'Hay costos imputados pero ningún avance validado: ¿mala imputación o avance no reportado?',
        accionRequerida: 'Revisar imputación de costos o registrar el avance.',
        responsable: o.oficinaTecnica,
      })
    else if (cp.ev > 0.2 * cp.bac && cp.ac === 0)
      out.push({
        regla: 'RULE-607', clave: `RULE-607|b|${p.id}`, severidad: 'media',
        titulo: `Avance sin costo: ${p.codigo} ${p.descripcion}`, entidad: p.descripcion,
        datos: [{ etiqueta: 'EV', valor: mm(cp.ev) }, { etiqueta: 'AC', valor: '$ 0' }],
        porQue: 'La partida tiene avance relevante pero ningún costo registrado.',
        accionRequerida: 'Importar costos pendientes o revisar imputación.',
        responsable: o.oficinaTecnica,
      })
  }

  // RULE-606
  const rends = rendimientosPorCuadrilla(d, o.id, c.corte - 13, c.corte)
  const porPartida = new Map<string, typeof rends>()
  for (const r of rends) porPartida.set(r.partidaId, [...(porPartida.get(r.partidaId) ?? []), r])
  for (const [pid, lista] of porPartida) {
    const cant = lista.reduce((s, x) => s + x.cant, 0)
    const hh = lista.reduce((s, x) => s + x.hh, 0)
    const pres = lista[0].rendPres!
    const p = lista[0].partida!
    if (cant <= 0) continue
    const desv = hh / cant / pres - 1
    if (desv <= u.rendimientoMO[0]) continue
    const cp = c.partidas.find((x) => x.p.id === pid)
    const restante = cp ? Math.max(0, cp.p.cantidad - cp.cantEjec) * pres * desv * costoHHPres(p) : 0
    out.push({
      regla: 'RULE-606', clave: `RULE-606|${pid}`, severidad: desv > u.rendimientoMO[1] ? 'alta' : 'media',
      titulo: `Rendimiento MO: ${p.codigo} ${p.descripcion}`, entidad: p.descripcion,
      datos: [
        { etiqueta: 'Rendimiento real (2 sem.)', valor: `${num(hh / cant, 2)} HH/${p.unidad}` },
        { etiqueta: 'Presupuestado', valor: `${num(pres, 2)} HH/${p.unidad}` },
        { etiqueta: 'Desviación', valor: signoPct(desv) },
        { etiqueta: 'Sobrecosto MO proyectado', valor: mm(restante) },
      ],
      porQue: `El rendimiento real supera el presupuestado en ${signoPct(desv)}.`,
      queExplica: lista.filter((x) => (x.desv ?? 0) > 0).map((x) => `${d.cuadrillas.find((q) => q.id === x.cuadrillaId)?.nombre}: ${num(x.rendReal ?? 0, 2)} HH/${p.unidad}`).join(' · '),
      accionRequerida: 'Revisar organización de la cuadrilla, restricciones y método de trabajo.',
      responsable: o.jefeTerreno, kpi: `rend:${pid}`, valorKpi: hh / cant, mejorSiMenor: true,
    })
  }

  // RULE-601
  if (c.margenProyectado < u.margenMinimo)
    out.push({
      regla: 'RULE-601', clave: 'RULE-601', severidad: c.margenProyectado < 0 ? 'critica' : 'alta',
      titulo: `Margen proyectado ${pct(c.margenProyectado)}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Margen ofertado', valor: pct(o.margenOfertado) },
        { etiqueta: 'Margen proyectado', valor: pct(c.margenProyectado) },
        { etiqueta: 'Resultado proyectado', valor: mm(c.resultado) },
      ],
      porQue: `El margen proyectado está bajo el mínimo (${pct(u.margenMinimo)}).`,
      accionRequerida: 'Revisar las partidas con mayor desviación y el forecast.',
      responsable: o.administrador, kpi: 'margen', valorKpi: c.margenProyectado,
    })

  // RULE-602 (dos períodos consecutivos)
  if (c.cpi != null && c.cpi < u.cpi[0] && (anterior?.obra.cpi ?? 1) < u.cpi[0])
    out.push({
      regla: 'RULE-602', clave: 'RULE-602', severidad: c.cpi < u.cpi[1] ? 'alta' : 'media',
      titulo: `CPI ${idx(c.cpi)} por segundo período`, entidad: o.nombre,
      datos: [{ etiqueta: 'CPI actual', valor: idx(c.cpi) }, { etiqueta: 'CPI anterior', valor: idx(anterior?.obra.cpi) }],
      porQue: `CPI bajo ${idx(u.cpi[0])} dos períodos seguidos.`,
      accionRequerida: 'Revisar partidas con mayor desviación y rendimientos de MO.',
      responsable: o.administrador, kpi: 'cpi', valorKpi: c.cpi,
    })

  // RULE-608
  if (c.bac > 0 && c.vac < -u.vac[0] * c.bac)
    out.push({
      regla: 'RULE-608', clave: 'RULE-608', severidad: c.vac < -u.vac[1] * c.bac ? 'critica' : 'alta',
      titulo: `VAC de la obra ${mm(c.vac)}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'BAC', valor: mm(c.bac) },
        { etiqueta: 'EAC', valor: mm(c.eac) },
        { etiqueta: 'VAC', valor: `${mm(c.vac)} (${signoPct(c.vac / c.bac)})` },
        { etiqueta: 'TCPI requerido', valor: idx(c.tcpi) },
      ],
      porQue: `La obra terminaría ${signoPct(-c.vac / c.bac)} sobre presupuesto.`,
      queExplica: c.partidas.filter((x) => x.vac < 0).sort((a, b) => a.vac - b.vac).slice(0, 5).map((x) => `${x.p.codigo} ${mm(-x.vac)}`).join(' · '),
      accionRequerida: 'Plan de recuperación de margen sobre las partidas del Pareto.',
      responsable: o.administrador, kpi: 'vac', valorKpi: c.vac,
    })

  // RULE-603 (v1.3): saldo de caja proyectado bajo cero en los próximos 60 días
  const caja = c.caja
  if (caja.estado !== 'na' && caja.minimo60 < 0) {
    const pagos = caja.movimientos
      .filter((m) => m.origen !== 'real' && m.monto < 0 && m.fecha <= caja.fechaMinimo60)
      .reduce((acc, m) => acc.set(m.detalle, (acc.get(m.detalle) ?? 0) - m.monto), new Map<string, number>())
    const mayores = [...pagos].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${mm(v)}`)
    out.push({
      regla: 'RULE-603', clave: 'RULE-603', severidad: 'alta',
      titulo: `Caja proyectada negativa: ${mm(caja.minimo60)} el ${fmtFecha(caja.fechaMinimo60)}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Capital de trabajo asignado', valor: mm(caja.capital) },
        { etiqueta: 'Caja disponible hoy', valor: mm(caja.disponibleHoy) },
        { etiqueta: 'Mínimo próximos 60 días', valor: mm(caja.minimo60) },
        { etiqueta: 'Fecha del mínimo', valor: fmtFecha(caja.fechaMinimo60) },
        { etiqueta: 'EP vencidos por cobrar', valor: mm(caja.cxcVencida) },
      ],
      porQue: 'En los próximos 60 días la obra necesita más financiamiento que el capital de trabajo asignado (capital + cobros − pagos < 0).',
      queExplica: [caja.cxcVencida > 0 ? `EP vencidos ${mm(caja.cxcVencida)}` : '', mayores.length ? `Pagos hasta el mínimo: ${mayores.join(' · ')}` : ''].filter(Boolean).join(' · ') || undefined,
      accionRequerida: 'Acelerar la aprobación y el cobro de los EP y reprogramar pagos según la caja proyectada.',
      responsable: o.administrador, kpi: 'caja', valorKpi: caja.minimo60,
    })
  }

  // RULE-402 (v1.3): EP facturado con el vencimiento superado; escala a alta pasados 30 días
  for (const ep of caja.epVencidos) {
    const dias = c.corte - ep.vencimiento!
    out.push({
      regla: 'RULE-402', clave: `RULE-402|${ep.id}`, severidad: dias > 30 ? 'alta' : 'media',
      titulo: `EP N° ${ep.numero} vencido hace ${dias} días`, entidad: o.mandante,
      datos: [
        { etiqueta: 'Monto por cobrar', valor: mm(ep.neto) },
        { etiqueta: 'Factura', valor: ep.factura ?? '—' },
        { etiqueta: 'Vencimiento', valor: fmtFecha(ep.vencimiento!) },
      ],
      porQue: `El mandante no ha pagado el EP N° ${ep.numero} y el plazo venció hace ${dias} días.`,
      accionRequerida: dias > 15 ? 'Escalar la cobranza con el mandante y evaluar las medidas del contrato.' : 'Enviar recordatorio de pago al mandante.',
      responsable: dias > 15 ? o.administrador : o.oficinaTecnica,
    })
  }

  // RULE-105 (v1.1): avance o costo en partidas extraordinarias sin orden aprobada por el mandante
  for (const x of c.extraNoAprobado) {
    const oc = d.ordenesCambio.find((z) => z.id === x.p.ordenCambioId)
    const etapa = oc ? etapaOC(oc, c.corte) : null
    const rechazada = etapa === 'rechazada'
    out.push({
      regla: 'RULE-105', clave: `RULE-105|${x.p.id}`, severidad: rechazada ? 'critica' : 'alta',
      titulo: `${rechazada ? 'Costo no recuperable' : 'Trabajo en riesgo de no pago'}: ${x.p.descripcion}`, entidad: x.p.descripcion,
      datos: [
        { etiqueta: 'Orden de cambio', valor: oc ? `N° ${oc.numero} · ${etapa ? ETAPAS_OC[etapa] : ''}` : '—' },
        { etiqueta: 'Ejecutado sin respaldo (venta)', valor: mm(x.monto) },
        { etiqueta: 'Costo incurrido', valor: mm(x.costo) },
      ],
      porQue: rechazada
        ? 'El mandante rechazó la orden de cambio y la partida ya tiene avance o costo.'
        : 'Hay avance o costo en una partida extraordinaria cuya orden de cambio aún no aprueba el mandante.',
      accionRequerida: rechazada
        ? 'Detener el trabajo y negociar con el mandante el reconocimiento del costo.'
        : 'Gestionar la aprobación de la orden de cambio antes de seguir ejecutando.',
      responsable: o.administrador,
    })
  }

  // RULE-403 (v1.1): avance del mes cerrado sin EP presentado pasados los días de preparación
  const atrasado = epAtrasado(d, o.id, c.corte)
  if (atrasado != null)
    out.push({
      regla: 'RULE-403', clave: 'RULE-403', severidad: 'media',
      titulo: `EP del corte ${fmtFecha(atrasado)} sin presentar`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Corte del período', valor: fmtFecha(atrasado) },
        { etiqueta: 'Días desde el corte', valor: `${c.corte - atrasado}` },
      ],
      porQue: `Pasaron ${c.corte - atrasado} días desde el corte y el avance validado del período no se ha presentado al mandante.`,
      accionRequerida: 'Preparar, revisar y presentar el estado de pago del período.',
      responsable: o.oficinaTecnica,
    })

  // RULE-904 (v1.1): obligaciones del contrato por vencer (≤ 10 días) o vencidas
  for (const ob of d.obligaciones.filter((x) => x.obraId === o.id)) {
    const e = estadoObligacion(ob, c.corte)
    if (e !== 'por_vencer' && e !== 'vencida') continue
    const multa = multaDevengada(ob, c.corte)
    out.push({
      regla: 'RULE-904', clave: `RULE-904|${ob.id}`, severidad: e === 'vencida' || ob.multa ? 'alta' : 'media',
      titulo: `${e === 'vencida' ? 'Obligación vencida' : 'Obligación por vencer'}: ${ob.titulo}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Fecha límite', valor: fmtFecha(ob.fechaLimite) },
        { etiqueta: e === 'vencida' ? 'Días de atraso' : 'Días restantes', valor: `${Math.abs(ob.fechaLimite - c.corte)}` },
        ...(ob.multa ? [{ etiqueta: ob.multa.tipo === 'diaria' ? 'Multa diaria' : 'Multa', valor: mm(ob.multa.monto) }] : []),
        ...(multa > 0 ? [{ etiqueta: 'Multa devengada', valor: mm(multa) }] : []),
      ],
      porQue: e === 'vencida' ? `La obligación venció el ${fmtFecha(ob.fechaLimite)} y no está cumplida.` : `La obligación vence en ${ob.fechaLimite - c.corte} días.`,
      accionRequerida: e === 'vencida' ? 'Cumplir la obligación y negociar con el mandante la multa devengada.' : 'Preparar y entregar a tiempo lo comprometido.',
      responsable: ob.responsable,
    })
  }

  // RULE-404 (v1.1): garantías entregadas al mandante por vencer (≤ 30 días) o vencidas
  const garantias = d.garantias.filter((x) => x.obraId === o.id)
  for (const g of garantias) {
    const e = estadoGarantia(g, garantias, c.corte)
    if (e !== 'por_vencer' && e !== 'vencida') continue
    out.push({
      regla: 'RULE-404', clave: `RULE-404|${g.id}`, severidad: e === 'vencida' ? 'critica' : 'alta',
      titulo: `Garantía ${e === 'vencida' ? 'vencida' : 'por vencer'}: ${OBJETOS_GARANTIA[g.objeto]}`, entidad: `${TIPOS_GARANTIA[g.tipo]} N° ${g.numero}`,
      datos: [
        { etiqueta: 'Emisor', valor: g.emisor },
        { etiqueta: 'Monto', valor: mm(g.monto) },
        { etiqueta: 'Vencimiento', valor: fmtFecha(g.vencimiento) },
      ],
      porQue: e === 'vencida' ? 'La garantía venció sin renovarse: puede ser causal de incumplimiento del contrato.' : `La garantía vence en ${g.vencimiento - c.corte} días.`,
      accionRequerida: 'Solicitar la renovación al banco o aseguradora y entregarla al mandante antes del vencimiento.',
      responsable: o.administrador,
    })
  }

  // Bodega (v1.2): RULE-201 material de las tareas por iniciar sin stock ni OC, RULE-202 consumo sobre presupuesto
  const partCriticas201 = partidasCriticas(c)
  for (const f of faltantes(d, o.id, c.corte)) {
    const critica = f.tareas.some((x) => x.partidaId && partCriticas201.has(x.partidaId))
    out.push({
      regla: 'RULE-201', clave: `RULE-201|${f.material.id}`, severidad: f.critico && critica ? 'alta' : 'media',
      titulo: `Sin cobertura de ${f.material.nombre} para las tareas de los próximos ${DIAS_COBERTURA} días`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Requerido', valor: `${num(f.requerido, 1)} ${f.material.unidad}` },
        { etiqueta: 'Stock + en compra', valor: `${num(f.stock, 1)} + ${num(f.enCompra, 1)} ${f.material.unidad}` },
        { etiqueta: 'Tareas', valor: f.tareas.map((x) => x.descripcion).join(' · ') },
      ],
      porQue: 'Las tareas del plan semanal que parten pronto necesitan más material del que hay en bodega y en órdenes en curso.',
      queProvoca: 'Sin material la cuadrilla queda detenida y la compra termina siendo urgente.',
      accionRequerida: 'Emitir la OC al proveedor habitual o traspasar stock desde otra obra; registrar la restricción en la tarea.',
      responsable: o.administrador,
    })
  }
  for (const x of controlMateriales(d, c, c.corte)) {
    if (x.desvio == null || x.desvio <= TOLERANCIA_CONSUMO || x.consumido <= 0) continue
    out.push({
      regla: 'RULE-202', clave: `RULE-202|${x.partida.id}`, severidad: 'media', titulo: `Consumo de ${x.material.nombre} sobre lo presupuestado: ${x.partida.codigo} ${x.partida.descripcion}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Consumido', valor: `${num(x.consumido, 1)} ${x.material.unidad}` },
        { etiqueta: 'Presupuestado según avance', valor: `${num(x.segunAvance, 1)} ${x.material.unidad}` },
        { etiqueta: 'Desviación', valor: signoPct(x.desvio) },
      ],
      porQue: `Se ha consumido ${signoPct(x.desvio)} más material del que corresponde al avance de la partida.`,
      queProvoca: 'Pérdidas, mermas no registradas o un rendimiento de material peor que el presupuestado.',
      accionRequerida: 'Revisar mermas y despachos en bodega, y el rendimiento real del material en terreno.',
      responsable: o.jefeTerreno,
    })
  }

  // Maquinaria (v1.2): RULE-205 baja utilización de equipos de costo fijo y RULE-206 horas improductivas (últimos 7 días)
  for (const eq of equiposDeObra(d.equipos, o.id, c.corte)) {
    const k = indicadoresEquipo(eq, d.partesMaquinaria, c.corte)
    if (k.partes < 3) continue
    if (costoFijo(eq) && k.utilizacion != null && k.utilizacion < UTILIZACION_MIN)
      out.push({
        regla: 'RULE-205', clave: `RULE-205|${eq.id}`, severidad: 'media', titulo: `Baja utilización: ${eq.nombre} (${pct(k.utilizacion, 0)})`, entidad: `${eq.codigo} · ${o.nombre}`,
        datos: [
          { etiqueta: 'Horas trabajadas / disponibles', valor: `${num(k.trabajadas, 1)} / ${num(k.disponibles, 1)}` },
          { etiqueta: 'Tarifa', valor: `${mm(eq.tarifa.monto)} ${MODALIDAD[eq.tarifa.modalidad]}` },
          { etiqueta: 'Costo de horas ociosas', valor: mm(k.costoOcioso) },
        ],
        porQue: 'El equipo tiene costo fijo y estuvo disponible mucho más tiempo del que trabajó.',
        queProvoca: 'Las horas ociosas igual se pagan y encarecen el costo por hora trabajada.',
        accionRequerida: 'Liberar el equipo, reasignarlo a otra obra o cambiarlo a arriendo por hora.',
        responsable: o.administrador, kpi: 'KMQ-01', valorKpi: k.utilizacion,
      })
    if ((k.improductividad != null && k.improductividad > IMPRODUCTIVAS_MAX) || k.causaRepetida)
      out.push({
        regla: 'RULE-206', clave: `RULE-206|${eq.id}`, severidad: 'media', titulo: `Horas improductivas: ${eq.nombre}`, entidad: `${eq.codigo} · ${o.nombre}`,
        datos: [
          { etiqueta: 'Improductivas / disponibles', valor: k.improductividad != null ? pct(k.improductividad, 0) : '—' },
          ...k.porCausa.slice(0, 3).map((x) => ({ etiqueta: CAUSAS_IMPRODUCTIVAS[x.causa], valor: `${num(x.horas, 1)} h` })),
        ],
        porQue: k.causaRepetida ? `La misma causa (${CAUSAS_IMPRODUCTIVAS[k.causaRepetida].toLowerCase()}) se repite al menos 3 días seguidos.` : 'Más del 20 % del tiempo disponible el equipo estuvo detenido.',
        accionRequerida: 'Coordinar frentes de trabajo, operador y combustible para que el equipo no espere.',
        responsable: o.jefeTerreno, kpi: 'KMQ-02', valorKpi: k.improductividad ?? undefined,
      })
  }

  // Abastecimiento (v1.2): RULE-305 OTIF de proveedor bajo y RULE-306 compras urgentes sobre umbral
  const proveedoresObra = new Set(d.ordenesCompra.filter((x) => x.obraId === o.id).map((x) => x.proveedorId))
  for (const pid of proveedoresObra) {
    const ot = otifProveedor(d.ordenesCompra, pid, c.corte)
    if (ot.valor == null || ot.n < 3 || ot.valor >= OTIF_PROVEEDOR_MIN) continue
    const prov = d.proveedores.find((x) => x.id === pid)
    out.push({
      regla: 'RULE-305', clave: `RULE-305|${pid}`, severidad: 'media', titulo: `OTIF bajo del proveedor ${prov?.nombre ?? pid}: ${pct(ot.valor, 0)}`, entidad: prov?.rubro ?? 'Proveedor',
      datos: [{ etiqueta: 'Entregas a tiempo y completas (90 días)', valor: `${ot.ok} de ${ot.n}` }, { etiqueta: 'Mínimo', valor: pct(OTIF_PROVEEDOR_MIN, 0) }],
      porQue: 'El proveedor entrega tarde o incompleto con frecuencia.',
      queProvoca: 'Los atrasos de material detienen cuadrillas y generan compras urgentes.',
      accionRequerida: 'Conversar con el proveedor, exigir compromiso de entrega y evaluar un proveedor alternativo para los materiales críticos.',
      responsable: o.administrador,
    })
  }
  const urg = urgentesMes(d.ordenesCompra, o.id, c.corte)
  if (urg.fraccion != null && urg.n >= 5 && urg.fraccion > URGENTES_MAX)
    out.push({
      regla: 'RULE-306', clave: `RULE-306|${o.id}`, severidad: 'media', titulo: `Compras urgentes del último mes: ${pct(urg.fraccion, 0)}`, entidad: o.nombre,
      datos: [{ etiqueta: 'OC urgentes / emitidas', valor: `${urg.urgentes.length} / ${urg.n}` }, { etiqueta: 'Urgentes', valor: urg.urgentes.map(codigoOC).join(', ') }],
      porQue: 'Más de una de cada cinco compras se pidió como urgente.',
      queProvoca: 'Comprar urgente cuesta más y suele delatar una planificación de corto plazo deficiente.',
      accionRequerida: 'Revisar en la reunión semanal qué partidas originaron las urgencias y anticipar las solicitudes en el plan.',
      responsable: o.administrador,
    })

  // Last Planner (v1.1): RULE-113 PPC de la última semana cerrada bajo meta y RULE-114 restricción sin liberar a 48 h
  const tareas = d.tareasSemanales.filter((x) => x.obraId === o.id)
  const ctxLP = { rfis: d.rfis, submittals: d.submittals }
  const lp = indicadoresLP(tareas, ctxLP, c.corte)
  if (lp.ultima?.ppc != null && lp.ultima.ppc < PPC_ALERTA)
    out.push({
      regla: 'RULE-113', clave: `RULE-113|${lp.ultima.lunes}`, severidad: lp.ultima.ppc < PPC_ROJO ? 'alta' : 'media',
      titulo: `PPC de la semana del ${fmtFecha(lp.ultima.lunes)}: ${pct(lp.ultima.ppc, 0)}`, entidad: o.nombre,
      datos: [
        { etiqueta: 'Cumplidas / comprometidas', valor: `${lp.ultima.cumplidas} / ${lp.ultima.comprometidas}` },
        ...(lp.causas[0] ? [{ etiqueta: 'Causa principal (8 semanas)', valor: `${CAUSAS_CNC[lp.causas[0].causa]} (${lp.causas[0].n})` }] : []),
      ],
      porQue: 'Menos del 70 % de lo comprometido en la reunión semanal se cumplió.',
      queProvoca: 'Un plan que no se cumple deja de ser confiable: el avance real se aleja del programa y se pierde productividad.',
      accionRequerida: 'Revisar las causas de no cumplimiento en la reunión semanal y comprometer solo tareas sin restricciones.',
      responsable: o.jefeTerreno, kpi: 'KPL-04', valorKpi: lp.ultima.ppc,
    })
  const partCriticasLP = partidasCriticas(c)
  for (const x of tareas.filter((y) => restriccionUrgente(y, ctxLP, c.corte))) {
    const abiertas = restriccionesAbiertas(x, ctxLP, c.corte)
    const critica = !!x.partidaId && partCriticasLP.has(x.partidaId)
    out.push({
      regla: 'RULE-114', clave: `RULE-114|${x.id}`, severidad: critica ? 'alta' : 'media', titulo: `Restricción sin liberar: ${x.descripcion}`, entidad: `${o.nombre} · ${x.responsable}`,
      datos: [
        { etiqueta: 'Inicio de la tarea', valor: fmtFecha(x.inicio) },
        ...abiertas.map((r) => ({ etiqueta: TIPOS_RESTRICCION[r.tipo], valor: `${r.descripcion} (${r.responsable})` })),
      ],
      porQue: `La tarea parte el ${fmtFecha(x.inicio)} y tiene ${abiertas.length} restricción(es) sin liberar.${critica ? ' Es de la ruta crítica.' : ''}`,
      accionRequerida: 'Liberar la restricción o sacar la tarea del plan y reasignar a la cuadrilla.',
      responsable: abiertas[0]?.responsable ?? o.jefeTerreno,
    })
  }

  // Gestión documental (v1.1): RULE-903 RFI vencido, RULE-902 folio sin respuesta y RULE-905 plano superado en terreno
  const partCriticas = partidasCriticas(c)
  for (const r of d.rfis.filter((x) => x.obraId === o.id && rfiVencido(x, c.corte))) {
    const critico = tocaCriticas(r.partidaIds, partCriticas)
    out.push({
      regla: 'RULE-903', clave: `RULE-903|${r.id}`, severidad: critico ? 'alta' : 'media', titulo: `RFI N° ${r.numero} sin respuesta: ${r.asunto}`, entidad: `${o.nombre} · ${DESTINATARIOS_RFI[r.destinatario]}`,
      datos: [
        { etiqueta: 'Fecha límite', valor: fmtFecha(r.fechaLimite!) },
        { etiqueta: 'Días de atraso', valor: `${c.corte - r.fechaLimite!}` },
        ...(r.impacto ? [{ etiqueta: 'Impacto potencial', valor: `${mm(r.impacto.monto)} · ${r.impacto.dias} días` }] : []),
      ],
      porQue: `El ${DESTINATARIOS_RFI[r.destinatario].toLowerCase()} no respondió dentro del plazo.${critico ? ' La consulta afecta actividades de la ruta crítica.' : ''}`,
      queProvoca: critico ? 'La demora es causa imputable al mandante: respaldo para solicitar aumento de plazo.' : undefined,
      accionRequerida: critico ? 'Insistir por Libro de Obra, registrar la demora como riesgo y respaldar el aumento de plazo.' : 'Insistir al destinatario y registrar la demora.',
      responsable: o.oficinaTecnica,
    })
  }
  for (const f of d.folios.filter((x) => x.obraId === o.id)) {
    const p = folioPendiente(f, d.folios, c.corte, d.config.diasHabiles)
    if (!p?.vencido) continue
    out.push({
      regla: 'RULE-902', clave: `RULE-902|${f.id}`, severidad: 'media', titulo: `Folio N° ${f.numero} del Libro de Obra sin respuesta`, entidad: `${o.nombre} · ${TIPOS_FOLIO[f.tipo]} de ${f.autor}`,
      datos: [{ etiqueta: 'Fecha del folio', valor: fmtFecha(f.fecha) }, { etiqueta: 'Plazo de respuesta', valor: fmtFecha(p.limite) }],
      porQue: `La ${TIPOS_FOLIO[f.tipo].toLowerCase()} del ITO no tiene respuesta desde el ${fmtFecha(f.fecha)}.`,
      accionRequerida: 'Responder por Libro de Obra: lo no respondido puede entenderse como aceptado.',
      responsable: o.administrador,
    })
  }
  for (const doc of d.documentos.filter((x) => x.obraId === o.id)) {
    const usada = terrenoDesactualizado(doc, c.corte)
    if (!usada) continue
    const vig = revisionVigente(doc, c.corte)!
    out.push({
      regla: 'RULE-905', clave: `RULE-905|${doc.id}`, severidad: 'media', titulo: `Terreno usa una revisión superada: ${doc.codigo} ${doc.titulo}`, entidad: o.nombre,
      datos: [{ etiqueta: 'En terreno', valor: `Rev. ${usada.revision}` }, { etiqueta: 'Vigente', valor: `Rev. ${vig.revision} del ${fmtFecha(vig.fecha)}` }],
      porQue: 'Se publicó una revisión nueva y terreno no ha confirmado que la recibió.',
      queProvoca: 'Construir con un plano superado obliga a demoler y rehacer.',
      accionRequerida: 'Retirar las copias superadas, entregar la revisión vigente a los capataces de las partidas afectadas y confirmar la recepción.',
      responsable: o.jefeTerreno,
    })
  }

  // Registro de riesgos (v1.1): RULE-610 crítico sin plan, RULE-611 revisión vencida y riesgo materializado
  for (const r of d.riesgos.filter((x) => x.obraId === o.id)) {
    const e = estadoRiesgo(r, c.corte)
    const x = exposicionRiesgo(r, c.corte)
    const ev = evaluacionVigente(r, c.corte)
    const entidad = `Riesgo R-${String(r.numero).padStart(3, '0')} · ${CATEGORIAS_RIESGO[r.categoria]}`
    const datosEv = ev && x ? [
      { etiqueta: 'Probabilidad × impacto', valor: `${ESCALA[ev.probabilidad]} × ${ESCALA[ev.impacto]} → ${NIVELES[x.nivel]}` },
      { etiqueta: 'Exposición', valor: `${mm(x.monto)} · ${num(x.dias, 1)} días` },
    ] : []
    const sinPlan = diasSinPlan(r, c.corte)
    if (sinPlan >= DIAS_PLAN_CRITICO)
      out.push({
        regla: 'RULE-610', clave: `RULE-610|${r.id}`, severidad: 'alta', titulo: `Riesgo ${x ? NIVELES[x.nivel].toLowerCase() : ''} sin plan de mitigación: ${r.titulo}`, entidad,
        datos: [...datosEv, { etiqueta: 'Días sin plan', valor: `${sinPlan}` }],
        porQue: `El riesgo se evaluó con exposición ${x ? NIVELES[x.nivel].toLowerCase() : ''} hace ${sinPlan} días y todavía no tiene acciones de mitigación.`,
        queProvoca: 'Si ocurre sin plan, el impacto estimado pasa directo al costo o al plazo de la obra.',
        accionRequerida: 'Registrar el plan de mitigación con responsables y fechas; si no aplica, reevaluar o cerrar el riesgo.',
        responsable: r.responsable ?? o.administrador,
      })
    if (revisionVencida(r, c.corte))
      out.push({
        regla: 'RULE-611', clave: `RULE-611|${r.id}`, severidad: 'media', titulo: `Revisión de riesgo vencida: ${r.titulo}`, entidad,
        datos: [...datosEv, { etiqueta: 'Revisión', valor: r.fechaRevision != null ? fmtFecha(r.fechaRevision) : 'Sin fecha' }],
        porQue: r.fechaRevision != null ? `La revisión estaba programada para el ${fmtFecha(r.fechaRevision)}.` : 'El riesgo está abierto sin fecha de revisión.',
        accionRequerida: 'Revisar el riesgo: reevaluar probabilidad e impacto y fijar la próxima revisión.',
        responsable: r.responsable ?? o.administrador,
      })
    if (e === 'materializado')
      out.push({
        regla: 'RULE-612', clave: `RULE-612|${r.id}`, severidad: x && (x.nivel === 'critico' || x.nivel === 'alto') ? 'alta' : 'media', titulo: `Riesgo materializado: ${r.titulo}`, entidad,
        datos: [...datosEv, ...(r.impactoReal ? [{ etiqueta: 'Impacto real', valor: `${mm(r.impactoReal.monto)} · ${r.impactoReal.dias} días` }] : [])],
        porQue: 'El riesgo ocurrió: su impacto ya no es una probabilidad sino un costo o un atraso.',
        queProvoca: 'El forecast y el programa no lo reflejan hasta que se ajusten.',
        accionRequerida: 'Ajustar el forecast o el programa y, si es imputable al mandante, gestionar una orden de cambio. Cerrar el riesgo con el impacto real.',
        responsable: r.responsable ?? o.administrador,
      })
  }

  // RULE-609
  if (anterior) {
    for (const cel of semaforo(c, d.config)) {
      if (cel.estado === 'rojo' && anterior.obra.semaforo[cel.dim] !== 'rojo')
        out.push({
          regla: 'RULE-609', clave: `RULE-609|${cel.dim}`, severidad: 'alta',
          titulo: `Semáforo: ${cel.nombre} pasó a rojo`, entidad: o.nombre,
          datos: [{ etiqueta: cel.kpi, valor: cel.dim === 'avance' ? pp(cel.valor) : cel.dim === 'productividad' ? signoPct(cel.valor) : idx(cel.valor) }],
          porQue: `${cel.nombre} cambió de ${anterior.obra.semaforo[cel.dim]} a rojo.`,
          accionRequerida: 'Abrir la explicación de la dimensión y asignar acciones.',
          responsable: o.administrador,
        })
    }
  }
  return out
}
