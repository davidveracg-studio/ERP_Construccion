// Cierre del período de control (10 §28, 11 PeriodoControlCerrado).
import type { Datos } from './datos'
import { programaDe } from './datos'
import { calcularObra, type CalcObra } from './evm'
import { uid } from './formato'
import { evaluarReglas, type Candidata } from './reglas'
import { semaforo, semaforoRecord } from './semaforo'
import type { Alerta, Dia, PeriodoControl } from './types'

export function periodosDe(d: Datos, obraId: string): PeriodoControl[] {
  return d.periodos.filter((p) => p.obraId === obraId).sort((a, b) => a.numero - b.numero)
}

export function snapshot(d: Datos, c: CalcObra, numero: number, usuario: string, cerradoEn: Dia): PeriodoControl {
  return {
    id: uid('per'),
    obraId: c.obra.id,
    numero,
    fechaCorte: c.corte,
    cerradoPor: usuario,
    cerradoEn,
    lineaBaseVersion: programaDe(d, c.obra.id, 'lineaBase')?.version ?? 0,
    obra: {
      pv: c.pv, ev: c.ev, ac: c.ac, bac: c.bac, eac: c.eac, cpi: c.cpi, spi: c.spi,
      avanceReal: c.avanceReal, avancePlan: c.avancePlan, plazoConsumido: c.plazoConsumido,
      atrasoProyectado: c.atrasoProyectado, margenProyectado: c.margenProyectado,
      productividadDesv: c.productividadDesv,
      semaforo: semaforoRecord(semaforo(c, d.config)),
      confianza: c.confianza,
    },
    partidas: c.partidas.map((p) => ({
      partidaId: p.p.id, bac: p.bac, pv: p.pv, ev: p.ev, ac: p.ac, eac: p.eac, cpi: p.cpi,
      rendimientoReal: p.rendReal, rendimientoPres: p.rendPres,
    })),
  }
}

/** Valor actual del KPI con que se verifica una acción (clave del tipo 'cpi:partidaId'). */
function valorKpi(c: CalcObra, kpi: string, cands: Candidata[]): number | undefined {
  const [k, id] = kpi.split(':')
  if (k === 'spi') return c.spi ?? undefined
  if (k === 'cpi' && !id) return c.cpi ?? undefined
  if (k === 'margen') return c.margenProyectado
  if (k === 'vac') return c.vac
  if (k === 'cpi') return c.partidas.find((p) => p.p.id === id)?.cpi ?? undefined
  return cands.find((x) => x.kpi === kpi)?.valorKpi
}

export interface ResultadoCierre {
  periodo: PeriodoControl
  alertas: Alerta[]
  nuevas: number
  resueltas: number
  calc: CalcObra
}

export function cerrarPeriodo(d: Datos, obraId: string, fechaCorte: Dia, usuario: string, hoyReal: Dia): ResultadoCierre {
  const previos = periodosDe(d, obraId)
  const anterior = previos[previos.length - 1]
  if (anterior && fechaCorte <= anterior.fechaCorte) throw new Error('La fecha de corte debe ser posterior al último período cerrado.')
  const numero = (anterior?.numero ?? 0) + 1
  const c = calcularObra(d, obraId, fechaCorte)
  const periodo = snapshot(d, c, numero, usuario, hoyReal)
  const cands = evaluarReglas(d, c, anterior)
  const porClave = new Map(cands.map((x) => [x.clave, x]))

  const otras = d.alertas.filter((a) => a.obraId !== obraId)
  const propias = d.alertas.filter((a) => a.obraId === obraId).map((a) => ({ ...a, acciones: a.acciones.map((x) => ({ ...x })) }))
  let nuevas = 0
  let resueltas = 0

  for (const a of propias) {
    const abierta = a.estado === 'activa' || a.estado === 'reconocida' || a.estado === 'en_accion'
    const cand = porClave.get(a.clave)
    if (abierta) {
      if (cand) {
        Object.assign(a, { ...cand, estado: a.estado, acciones: a.acciones, actualizadaEnPeriodo: numero, id: a.id, creadaEn: a.creadaEn, periodo: a.periodo, valorKpi: a.valorKpi })
        porClave.delete(a.clave)
      } else {
        a.estado = 'resuelta'
        a.actualizadaEnPeriodo = numero
        resueltas++
      }
    } else if (a.estado === 'resuelta' && cand && numero - a.actualizadaEnPeriodo <= 2) {
      // Reapertura: la condición reaparece dentro de 2 períodos
      Object.assign(a, { ...cand, estado: 'activa', acciones: a.acciones, actualizadaEnPeriodo: numero, id: a.id, creadaEn: a.creadaEn, periodo: a.periodo })
      porClave.delete(a.clave)
    }
    // Verificación de efectividad de acciones completadas (10 §28.2)
    for (const acc of a.acciones) {
      if (acc.estado !== 'completada' || !acc.kpi) continue
      const desde = acc.completadaEnPeriodo ?? numero
      const actual = a.estado === 'resuelta' ? undefined : valorKpi(c, acc.kpi, cands)
      const logrado =
        a.estado === 'resuelta' ||
        (actual != null && acc.valorEsperado != null && (acc.mejorSiMenor ? actual <= acc.valorEsperado : actual >= acc.valorEsperado))
      if (logrado) acc.estado = 'verificada_efectiva'
      else if (numero - desde >= 2) acc.estado = 'verificada_inefectiva'
    }
  }

  for (const cand of porClave.values()) {
    nuevas++
    propias.push({
      ...cand,
      id: uid('al'),
      obraId,
      estado: 'activa',
      creadaEn: fechaCorte,
      periodo: numero,
      actualizadaEnPeriodo: numero,
      acciones: [],
    })
  }
  return { periodo, alertas: [...otras, ...propias], nuevas, resueltas, calc: c }
}
