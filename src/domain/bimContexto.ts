// Ficha de un elemento del modelo 4D/BIM: qué actividades y partidas lo construyen y qué pasa en ese
// lugar (protocolos de calidad, no conformidades, RFI, incidentes y postventa). Los registros se
// relacionan por partida y, cuando su ubicación menciona pisos ("Losa piso 3"), por piso.
import { programaDe, type Datos } from './datos'
import { estadoNCR, estadoProtocolo } from './calidad'
import { estadoRFI } from './documental'
import type { CalcObra } from './evm'
import { pisosEnNombre, type Elemento, type Linea4D } from './modelo4d'
import { estadoPostventa } from './postventa'
import { estadoIncidente } from './seguridad'
import type { Dia } from './types'

/** El texto aplica al piso: no menciona pisos (vale para todos) o menciona este. */
export function aplicaAlPiso(texto: string, piso: number) {
  const pisos = pisosEnNombre(texto)
  return pisos.length === 0 || pisos.includes(piso)
}

export function contextoElemento(d: Datos, c: CalcObra, linea: Linea4D, t: Dia, e: Elemento) {
  const lb = new Map((programaDe(d, c.obra.id, 'lineaBase')?.actividades ?? []).map((a) => [a.id, a]))
  const plan = linea.plan(t)
  const real = linea.real(t)
  const actividades = e.aportes.map((x) => linea.actividades.find((a) => a.id === x.actividadId)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => {
    const r = c.cpm.get(a.id)
    const base = lb.get(a.id)
    return { act: a, plan: plan.get(a.id) ?? 0, real: real.get(a.id) ?? 0, critica: !!r?.critica && !r.terminada, inicioLB: base?.inicio ?? null, finLB: base?.fin ?? null, finProyectado: r?.ef ?? null }
  })
  const ids = new Set(actividades.flatMap((x) => x.act.partidas.map((p) => p.partidaId)))
  const partidas = c.partidas.filter((cp) => ids.has(cp.p.id))
  // Con detalle por tarea el lugar es el de la actividad (su nombre suele traer el piso o el sector)
  const piso = e.piso
  const delLugar = (texto: string) => aplicaAlPiso(texto, piso)
  const protocolos = d.protocolosCalidad.filter((p) => p.obraId === c.obra.id && p.creado <= t && ids.has(p.partidaId) && delLugar(p.ubicacion))
    .map((p) => ({ p, estado: estadoProtocolo(p, t)! })).sort((a, b) => b.p.programado - a.p.programado)
  const ncrs = d.noConformidades.filter((n) => n.obraId === c.obra.id && n.creado <= t && ids.has(n.partidaId) && delLugar(n.descripcion))
    .map((n) => ({ n, estado: estadoNCR(n, t)! })).sort((a, b) => b.n.creado - a.n.creado)
  const rfis = d.rfis.filter((r) => r.obraId === c.obra.id && r.creado <= t && r.partidaIds.some((x) => ids.has(x)) && delLugar(`${r.asunto} ${r.pregunta}`))
    .map((r) => ({ r, estado: estadoRFI(r, t) })).filter((x) => x.estado)
  // Incidentes y postventa: solo los que mencionan este piso (o la partida, en postventa)
  const incidentes = d.incidentes.filter((i) => i.obraId === c.obra.id && i.creado <= t && pisosEnNombre(i.lugar).includes(piso))
    .map((i) => ({ i, estado: estadoIncidente(i, t)! }))
  const postventa = d.solicitudesPostventa.filter((s) => s.obraId === c.obra.id && s.creado <= t && ((s.partidaId && ids.has(s.partidaId) && delLugar(s.ubicacion)) || pisosEnNombre(s.ubicacion).includes(piso)))
    .map((s) => ({ s, estado: estadoPostventa(s, t)! }))
  return { actividades, partidas, protocolos, ncrs, rfis, incidentes, postventa }
}
