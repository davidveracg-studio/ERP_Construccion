// Reglas del núcleo de alerta temprana (12). Se evalúan al cerrar el período de control.
import type { Datos } from './datos'
import type { CalcObra } from './evm'
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
  'RULE-106': 'Atraso de obra (SPI)',
  'RULE-107': 'Hito en riesgo o vencido',
  'RULE-108': 'Actividad crítica atrasada',
  'RULE-109': 'Avance rezagado respecto del plazo',
  'RULE-110': 'Registro de HH inconsistente',
  'RULE-304': 'Compromiso sobre presupuesto de partida',
  'RULE-601': 'Margen proyectado bajo mínimo',
  'RULE-602': 'CPI bajo umbral',
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

  // RULE-109
  const brecha = c.plazoConsumido - c.avanceReal
  if (brecha > u.avanceVsPlazoPp[0])
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
