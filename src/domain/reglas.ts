// Reglas del núcleo de alerta temprana (12). Se evalúan al cerrar el período de control.
import type { Datos } from './datos'
import type { CalcObra } from './evm'
import { estadoGarantia, estadoObligacion, multaDevengada, OBJETOS_GARANTIA, TIPOS_GARANTIA } from './contrato'
import { epAtrasado } from './estadosPago'
import { ETAPAS_OC, etapaOC } from './ordenesCambio'
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
  'RULE-110': 'Registro de HH inconsistente',
  'RULE-304': 'Compromiso sobre presupuesto de partida',
  'RULE-402': 'Estado de pago vencido',
  'RULE-403': 'Estado de pago no presentado a tiempo',
  'RULE-404': 'Garantía por vencer o vencida',
  'RULE-601': 'Margen proyectado bajo mínimo',
  'RULE-904': 'Obligación contractual por vencer o vencida',
  'RULE-602': 'CPI bajo umbral',
  'RULE-603': 'Caja proyectada negativa',
  'RULE-605': 'Desviación proyectada por partida',
  'RULE-606': 'Rendimiento de MO sobre presupuesto',
  'RULE-607': 'Inconsistencia costo–avance',
  'RULE-608': 'VAC de la obra bajo umbral',
  'RULE-609': 'Semáforo ejecutivo en rojo',
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
