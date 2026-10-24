// Contrato de la obra (v1.1): resumen con órdenes de cambio, obligaciones con multa (RULE-904),
// garantías (RULE-404), recepción provisoria y definitiva (10 §16) y exposición a multas.
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, cx, inputCls } from '../components/ui'
import { condicionesDe } from '../domain/caja'
import {
  AVANCE_MINIMO_RECEPCION, ESTADOS_GARANTIA, ESTADOS_OBLIGACION, ESTADOS_OBRA, ESTADOS_RECEPCION, estadoGarantia, estadoObligacion,
  estadoRecepcion, exposicionMultas, garantiasVivas, multaDevengada, OBJETOS_GARANTIA, observacionCerrada, recepcionProvisoria,
  TIPOS_GARANTIA, TIPOS_OBLIGACION, TONO_GARANTIA, TONO_OBLIGACION, TOPE_MULTAS_DEFECTO,
} from '../domain/contrato'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { mm, num, pct } from '../domain/formato'
import { indicadoresOC } from '../domain/ordenesCambio'
import type { Garantia, ObjetoGarantia, Obligacion, RecepcionObra, TipoObligacion } from '../domain/types'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { ayudaKpi, ek } from '../store/umbralesUI'

const fechaInput = (d: number) => iso(d)

export default function Contrato() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [modal, setModal] = useState<null | 'obligacion' | 'garantia' | 'provisoria' | 'definitiva' | { renovar: Garantia }>(null)
  if (!c) return null
  const t = hoy()
  const obra = c.obra
  const gestiona = rol === 'R01' || rol === 'R02' || rol === 'R05'
  const cond = condicionesDe(obra)
  const ocs = indicadoresOC(d.ordenesCambio.filter((o) => o.obraId === obra.id), t, c.venta)
  const obligaciones = d.obligaciones.filter((o) => o.obraId === obra.id).sort((a, b) => a.fechaLimite - b.fechaLimite)
  const garantias = d.garantias.filter((g) => g.obraId === obra.id).sort((a, b) => a.vencimiento - b.vencimiento)
  const vivas = garantiasVivas(garantias, t)
  const porVencer = vivas.filter((g) => estadoGarantia(g, garantias, t) !== 'vigente').length
  const descuentosEP = d.estadosPago.filter((e) => e.obraId === obra.id && e.anulado == null).reduce((s, e) => s + e.descuentos.reduce((x, y) => x + y.monto, 0), 0)
  const multas = exposicionMultas(c, obligaciones, descuentosEP, obra)
  const recepciones = d.recepciones.filter((r) => r.obraId === obra.id).sort((a, b) => a.fecha - b.fecha)
  const provisoria = recepcionProvisoria(d.recepciones, obra.id, t)
  const definitiva = recepciones.find((r) => r.tipo === 'definitiva' && r.resultado === 'recibida')
  const pendientesOblig = obligaciones.filter((o) => ['por_vencer', 'vencida'].includes(estadoObligacion(o, t))).length

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.mandante} · obligaciones, garantías, recepciones y multas`}>
        <span className="flex flex-wrap items-center gap-2">Contrato <Badge tono={obra.estado === 'en_ejecucion' ? 'azul' : obra.estado === 'cerrada' ? 'gris' : 'verde'}>{ESTADOS_OBRA[obra.estado]}</Badge></span>
      </Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Monto vigente" valor={mm(c.venta)} sub={`original ${mm(c.venta - ocs.montoAprobado)} · OC ${mm(ocs.montoAprobado)}`} />
        <Kpi etiqueta="Plazo vigente" valor={`${obra.plazoDias} días`} sub={`término ${fmtFecha(c.terminoContractual - 1)}${ocs.diasPlazoAprobados ? ` · OC +${ocs.diasPlazoAprobados} d` : ''}`} />
        <Kpi etiqueta="Exposición a multas" valor={mm(multas.total)} sub={`tope ${mm(multas.tope)} (${pct(obra.topeMultas ?? TOPE_MULTAS_DEFECTO, 0)})`}
          estado={ek('KDO-05', c.venta > 0 ? multas.total / c.venta : null)} ayuda={ayudaKpi('KDO-05')} />
        <Kpi etiqueta="Garantías en poder del mandante" valor={mm(vivas.reduce((s, g) => s + g.monto, 0))} sub={`${vivas.length} garantías${porVencer ? ` · ${porVencer} por vencer` : ''}`}
          estado={porVencer ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Obligaciones por atender" valor={pendientesOblig} sub={`de ${obligaciones.filter((o) => !o.cumplida).length} pendientes`} estado={pendientesOblig ? 'amarillo' : 'verde'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Card titulo="Condiciones del contrato">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {([
              ['Inicio', fmtFecha(obra.fechaInicio)], ['Término contractual', fmtFecha(c.terminoContractual - 1)],
              ['Multa por atraso', `${mm(obra.multaDiaria)} por día`], ['Tope de multas', pct(obra.topeMultas ?? TOPE_MULTAS_DEFECTO, 0)],
              ['Retención', pct(cond.retencion, 0)], ['Anticipo', pct(cond.anticipo, 0)],
              ['Reajuste', cond.reajuste ? `${cond.reajuste.indice} (base ${num(cond.reajuste.base, 2)})` : 'Sin reajuste'],
              ['Pago de EP', `${cond.diasAprobacion} días de aprobación + ${cond.diasPago} de pago`],
            ] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="tabular font-medium">{v}</dd></div>)}
          </dl>
        </Card>

        <Card titulo="Multas">
          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Por atraso proyectado ({Math.max(0, c.atrasoProyectado)} días × {mm(obra.multaDiaria)})</dt><dd>{mm(multas.atraso)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Por obligaciones atrasadas</dt><dd>{mm(multas.obligaciones)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Aplicadas por el mandante en los EP</dt><dd>{mm(multas.aplicadas)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Exposición total (con tope)</dt><dd>{mm(multas.total)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">El atraso se mide contra el término contractual vigente, que ya incluye los aumentos de plazo aprobados.</p>
        </Card>
      </div>

      <Card titulo="Obligaciones del contrato" accion={gestiona ? <Boton variante="secundario" onClick={() => setModal('obligacion')}>Nueva obligación</Boton> : undefined}>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Obligación</th><th className="font-medium">Responsable</th><th className="font-medium">Fecha límite</th>
                <th className="font-medium">Estado</th><th className="text-right font-medium">Multa</th><th />
              </tr>
            </thead>
            <tbody>
              {obligaciones.map((o) => {
                const e = estadoObligacion(o, t)
                const m = multaDevengada(o, t)
                return (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">{o.titulo}</div><div className="text-xs text-slate-500">{TIPOS_OBLIGACION[o.tipo]}</div></td>
                    <td>{o.responsable}</td>
                    <td>{fmtFecha(o.fechaLimite)}{!o.cumplida && <div className="text-xs text-slate-500">{o.fechaLimite >= t ? `en ${o.fechaLimite - t} días` : `hace ${t - o.fechaLimite} días`}</div>}</td>
                    <td><Badge tono={TONO_OBLIGACION[e]}>{ESTADOS_OBLIGACION[e]}</Badge>{o.cumplida != null && <div className="text-xs text-slate-500">{fmtFecha(o.cumplida)}</div>}</td>
                    <td className="text-right">{m > 0 ? <span className="text-crit">{mm(m)}</span> : o.multa ? <span className="text-xs text-slate-500">{mm(o.multa.monto)}{o.multa.tipo === 'diaria' ? '/día' : ''}</span> : '—'}</td>
                    <td className="text-right">{gestiona && !o.cumplida && <CumplirObligacion o={o} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card titulo="Garantías" accion={gestiona ? <Boton variante="secundario" onClick={() => setModal('garantia')}>Registrar garantía</Boton> : undefined}>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Garantía</th><th className="text-right font-medium">Monto</th><th className="font-medium">Vencimiento</th><th className="font-medium">Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {garantias.map((g) => {
                const e = estadoGarantia(g, garantias, t)
                if (!e) return null
                const viva = e === 'vigente' || e === 'por_vencer' || e === 'vencida'
                return (
                  <tr key={g.id} className="border-b border-slate-100">
                    <td className="py-2"><div className="font-medium">{OBJETOS_GARANTIA[g.objeto]}</div><div className="text-xs text-slate-500">{TIPOS_GARANTIA[g.tipo]} N° {g.numero} · {g.emisor}{g.reemplazaA ? ' · renovación' : ''}</div></td>
                    <td className="text-right">{mm(g.monto)}</td>
                    <td>{fmtFecha(g.vencimiento)}{viva && <div className="text-xs text-slate-500">{g.vencimiento >= t ? `en ${g.vencimiento - t} días` : `hace ${t - g.vencimiento} días`}</div>}</td>
                    <td><Badge tono={TONO_GARANTIA[e]}>{ESTADOS_GARANTIA[e]}</Badge></td>
                    <td className="text-right">{gestiona && viva && <AccionesGarantia g={g} onRenovar={() => setModal({ renovar: g })} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card titulo="Recepción de la obra" accion={gestiona && !definitiva ? (
        provisoria
          ? estadoRecepcion(provisoria, t) === 'provisoria_sin_observaciones' && <Boton variante="secundario" onClick={() => setModal('definitiva')}>Registrar recepción definitiva</Boton>
          : <Boton variante="secundario" onClick={() => setModal('provisoria')} disabled={c.avanceReal < AVANCE_MINIMO_RECEPCION}
            title={c.avanceReal < AVANCE_MINIMO_RECEPCION ? `La obra va en ${pct(c.avanceReal, 0)}: se recibe al terminarla` : undefined}>Registrar recepción provisoria</Boton>
      ) : undefined}>
        {recepciones.length === 0
          ? <p className="text-sm text-slate-500">La obra aún no se recibe{c.avanceReal < AVANCE_MINIMO_RECEPCION ? ` (avance ${pct(c.avanceReal, 0)})` : ''}. Al terminarla se registra la recepción provisoria con el acta y las observaciones del mandante.</p>
          : recepciones.map((r) => <DetalleRecepcion key={r.id} r={r} t={t} />)}
      </Card>

      {modal === 'obligacion' && <NuevaObligacion obraId={obra.id} onCerrar={() => setModal(null)} />}
      {modal === 'garantia' && <NuevaGarantia obraId={obra.id} onCerrar={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <NuevaGarantia obraId={obra.id} renovar={modal.renovar} onCerrar={() => setModal(null)} />}
      {(modal === 'provisoria' || modal === 'definitiva') && <NuevaRecepcion obraId={obra.id} tipo={modal} onCerrar={() => setModal(null)} />}
    </div>
  )
}

/** Detalle de una recepción con sus observaciones; lo usa también el portal del mandante. */
export function DetalleRecepcion({ r, t }: { r: RecepcionObra; t: number }) {
  const rol = useStore((s) => s.ui.rol)
  const accion = useStore((s) => s.observacionRecepcion)
  const e = estadoRecepcion(r, t)
  return (
    <div className="space-y-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Recepción {r.tipo} · {fmtFecha(r.fecha)}</span>{r.acta && <span className="text-slate-500">{r.acta}</span>}
        <Badge tono={e === 'rechazada' ? 'rojo' : e === 'provisoria_con_observaciones' ? 'ambar' : 'verde'}>{ESTADOS_RECEPCION[e]}</Badge>
      </div>
      {r.motivoRechazo && <p className="text-sm text-crit">Motivo: {r.motivoRechazo}</p>}
      {r.observaciones.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {r.observaciones.map((o) => {
            const cerrada = observacionCerrada(o, t)
            return (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-2">
                <span className={cx(cerrada && 'text-slate-500 line-through')}>{o.texto} <span className="text-xs text-slate-500 no-underline">· plazo {fmtFecha(o.plazo)}</span></span>
                <span className="flex items-center gap-2">
                  {cerrada ? <Badge tono="verde">V°B° {fmtFecha(o.vistoBueno!)}</Badge>
                    : o.subsanada != null ? <Badge tono="azul">Subsanada · falta V°B°</Badge>
                    : <Badge tono={o.plazo < t ? 'rojo' : 'ambar'}>Pendiente</Badge>}
                  {!cerrada && o.subsanada == null && rol === 'R02' && <button className="text-xs text-marca hover:underline" onClick={() => accion(r.id, o.id, 'subsanar')}>Marcar subsanada</button>}
                  {!cerrada && (rol === 'R11' || (rol === 'R02' && o.subsanada != null)) && <button className="text-xs text-marca hover:underline" onClick={() => accion(r.id, o.id, 'visto_bueno')}>{rol === 'R11' ? 'Dar V°B°' : 'Registrar V°B° del mandante'}</button>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CumplirObligacion({ o }: { o: Obligacion }) {
  const cumplir = useStore((s) => s.cumplirObligacion)
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(fechaInput(hoy()))
  const [evidencia, setEvidencia] = useState('')
  return (
    <>
      <button className="text-sm text-marca hover:underline" onClick={() => setAbierto(true)}>Cumplir</button>
      <Modal abierto={abierto} titulo={`Cumplir: ${o.titulo}`} onCerrar={() => setAbierto(false)}>
        <div className="space-y-3">
          <Campo etiqueta="Fecha de cumplimiento"><input type="date" className={inputCls} value={fecha} max={fechaInput(hoy())} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Respaldo (opcional)"><input className={inputCls} value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Ej.: carta N° 45 entregada al ITO" /></Campo>
          {o.multa && dia(fecha) > o.fechaLimite && <p className="text-sm text-amber-800">Se cumple con {dia(fecha) - o.fechaLimite} días de atraso: multa devengada {mm(multaDevengada({ ...o, cumplida: dia(fecha) }, dia(fecha)))}.</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton>
          <Boton onClick={() => { cumplir(o.id, dia(fecha), evidencia.trim() || undefined); setAbierto(false) }}>Registrar</Boton>
        </div>
      </Modal>
    </>
  )
}

function AccionesGarantia({ g, onRenovar }: { g: Garantia; onRenovar: () => void }) {
  const cerrar = useStore((s) => s.cerrarGarantia)
  const [confirmar, setConfirmar] = useState<null | 'devuelta' | 'cobrada'>(null)
  return (
    <span className="flex justify-end gap-3 text-sm">
      <button className="text-marca hover:underline" onClick={onRenovar}>Renovar</button>
      <button className="text-marca hover:underline" onClick={() => setConfirmar('devuelta')}>Devuelta</button>
      <button className="text-crit hover:underline" onClick={() => setConfirmar('cobrada')}>Cobrada</button>
      <Modal abierto={confirmar != null} titulo={confirmar === 'cobrada' ? 'Registrar cobro de la garantía' : 'Registrar devolución'} onCerrar={() => setConfirmar(null)}>
        <p className="text-sm text-slate-600">{confirmar === 'cobrada' ? 'El mandante ejecutó la garantía. Es un evento grave: queda registrado para Gerencia.' : 'El mandante devolvió la garantía.'}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Boton>
          <Boton variante={confirmar === 'cobrada' ? 'peligro' : 'primario'} onClick={() => { cerrar(g.id, confirmar!, hoy()); setConfirmar(null) }}>Registrar</Boton>
        </div>
      </Modal>
    </span>
  )
}

function NuevaObligacion({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearObligacion)
  const [v, setV] = useState({ tipo: 'informe' as TipoObligacion, titulo: '', responsable: '', fecha: fechaInput(hoy() + 15), multa: '', multaTipo: 'diaria' as 'diaria' | 'fija' })
  const monto = Number(v.multa.replace(/\./g, '')) || 0
  return (
    <Modal abierto titulo="Nueva obligación del contrato" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Obligación"><input className={inputCls} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ej.: Entregar programa de trabajo actualizado" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoObligacion })}>{(Object.keys(TIPOS_OBLIGACION) as TipoObligacion[]).map((k) => <option key={k} value={k}>{TIPOS_OBLIGACION[k]}</option>)}</select></Campo>
          <Campo etiqueta="Fecha límite"><input type="date" className={inputCls} value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Responsable"><input className={inputCls} value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
          <Campo etiqueta="Multa si se atrasa ($, opcional)">
            <div className="flex gap-1">
              <input className={inputCls} inputMode="numeric" value={v.multa} onChange={(e) => setV({ ...v, multa: e.target.value })} />
              <select className={cx(inputCls, 'w-28')} value={v.multaTipo} onChange={(e) => setV({ ...v, multaTipo: e.target.value as 'diaria' | 'fija' })}><option value="diaria">por día</option><option value="fija">fija</option></select>
            </div>
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!v.titulo.trim() || !v.responsable.trim()} onClick={() => {
          crear({ obraId, tipo: v.tipo, titulo: v.titulo.trim(), responsable: v.responsable.trim(), fechaLimite: dia(v.fecha), multa: monto > 0 ? { tipo: v.multaTipo, monto } : undefined })
          onCerrar()
        }}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function NuevaGarantia({ obraId, renovar, onCerrar }: { obraId: string; renovar?: Garantia; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarGarantia)
  const renovarGarantia = useStore((s) => s.renovarGarantia)
  const [v, setV] = useState({
    tipo: renovar?.tipo ?? 'boleta' as Garantia['tipo'], objeto: renovar?.objeto ?? 'fiel_cumplimiento' as ObjetoGarantia, numero: '', emisor: renovar?.emisor ?? '',
    monto: renovar ? String(renovar.monto) : '', emision: fechaInput(hoy()), vencimiento: fechaInput((renovar?.vencimiento ?? hoy()) + 180),
  })
  const monto = Number(v.monto.replace(/\./g, '')) || 0
  const ok = v.numero.trim() && v.emisor.trim() && monto > 0 && dia(v.vencimiento) > dia(v.emision)
  return (
    <Modal abierto titulo={renovar ? `Renovar garantía N° ${renovar.numero}` : 'Registrar garantía'} onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!renovar && <>
          <Campo etiqueta="Garantiza"><select className={inputCls} value={v.objeto} onChange={(e) => setV({ ...v, objeto: e.target.value as ObjetoGarantia })}>{(Object.keys(OBJETOS_GARANTIA) as ObjetoGarantia[]).map((k) => <option key={k} value={k}>{OBJETOS_GARANTIA[k]}</option>)}</select></Campo>
          <Campo etiqueta="Instrumento"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as Garantia['tipo'] })}>{(Object.keys(TIPOS_GARANTIA) as Garantia['tipo'][]).map((k) => <option key={k} value={k}>{TIPOS_GARANTIA[k]}</option>)}</select></Campo>
        </>}
        <Campo etiqueta="N° del documento"><input className={inputCls} value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} /></Campo>
        <Campo etiqueta="Banco o aseguradora"><input className={inputCls} value={v.emisor} onChange={(e) => setV({ ...v, emisor: e.target.value })} /></Campo>
        <Campo etiqueta="Monto ($)"><input className={inputCls} inputMode="numeric" value={v.monto} onChange={(e) => setV({ ...v, monto: e.target.value })} /></Campo>
        <Campo etiqueta="Emisión"><input type="date" className={inputCls} value={v.emision} onChange={(e) => setV({ ...v, emision: e.target.value })} /></Campo>
        <Campo etiqueta="Vencimiento"><input type="date" className={inputCls} value={v.vencimiento} onChange={(e) => setV({ ...v, vencimiento: e.target.value })} /></Campo>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!ok} onClick={() => {
          const datos = { numero: v.numero.trim(), emisor: v.emisor.trim(), monto, emision: dia(v.emision), vencimiento: dia(v.vencimiento) }
          if (renovar) renovarGarantia(renovar.id, datos)
          else registrar({ obraId, tipo: v.tipo, objeto: v.objeto, ...datos })
          onCerrar()
        }}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function NuevaRecepcion({ obraId, tipo, onCerrar }: { obraId: string; tipo: 'provisoria' | 'definitiva'; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarRecepcion)
  const [fecha, setFecha] = useState(fechaInput(hoy()))
  const [acta, setActa] = useState('')
  const [resultado, setResultado] = useState<'recibida' | 'rechazada'>('recibida')
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState<{ texto: string; plazo: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={`Recepción ${tipo}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Fecha del acta"><input type="date" className={inputCls} value={fecha} max={fechaInput(hoy())} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="N° de acta"><input className={inputCls} value={acta} onChange={(e) => setActa(e.target.value)} placeholder="Ej.: Acta N° 1" /></Campo>
        </div>
        {tipo === 'provisoria' && (
          <>
            <div className="flex gap-4 text-sm">
              {(['recibida', 'rechazada'] as const).map((x) => (
                <label key={x} className="flex items-center gap-1.5"><input type="radio" checked={resultado === x} onChange={() => setResultado(x)} />{x === 'recibida' ? 'El mandante recibe' : 'El mandante no recibe'}</label>
              ))}
            </div>
            {resultado === 'rechazada'
              ? <Campo etiqueta="Motivos del rechazo"><textarea rows={2} className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
              : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">Observaciones del acta</div>
                  {obs.map((o, i) => (
                    <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-1.5">
                      <input className={cx(inputCls, 'py-1.5')} value={o.texto} onChange={(e) => setObs(obs.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} placeholder="Observación" />
                      <input type="date" className={cx(inputCls, 'py-1.5')} value={o.plazo} onChange={(e) => setObs(obs.map((x, j) => (j === i ? { ...x, plazo: e.target.value } : x)))} aria-label="Plazo" />
                      <button className="px-1 text-xs text-crit" onClick={() => setObs(obs.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
                    </div>
                  ))}
                  <button className="text-sm text-marca hover:underline" onClick={() => setObs([...obs, { texto: '', plazo: fechaInput(hoy() + 30) }])}>+ Agregar observación</button>
                </div>
              )}
          </>
        )}
        {error && <p className="text-sm text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={resultado === 'rechazada' && !motivo.trim()} onClick={() => {
          const err = registrar({
            obraId, tipo, fecha: dia(fecha), acta: acta.trim() || undefined, resultado: tipo === 'definitiva' ? 'recibida' : resultado,
            motivoRechazo: resultado === 'rechazada' ? motivo.trim() : undefined,
            observaciones: resultado === 'rechazada' ? [] : obs.filter((o) => o.texto.trim()).map((o, i) => ({ id: `o${i + 1}`, texto: o.texto.trim(), plazo: dia(o.plazo) })),
          })
          if (err) setError(err)
          else onCerrar()
        }}>Registrar</Boton>
      </div>
    </Modal>
  )
}
