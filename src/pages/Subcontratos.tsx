// Subcontratos (v1.2, RF-SUB-01, 10 §14–15): contrato con sus partidas y PU, avance validado, EP del
// período (RULE-703: no más que lo validado), retención acumulada (RULE-704), adicionales, descuentos y
// multas, y pago. Cada EP aprobado es costo real contra el compromiso del subcontrato.
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { calcularObra } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, num, pct } from '../domain/formato'
import {
  ACCIONES_EPSUB, ACCIONES_SUB, accionesEPSub, accionesSub, ADICIONALES_AMBAR, ADICIONALES_ROJO, avanceValidado, cobradoPartida, epsDe, estadoEPSub,
  estadoSub, ESTADOS_EPSUB, ESTADOS_SUB, excesosRULE703, indicadoresSub, limiteSubcontrato, montosEPSub, pesoSubcontratos, puedeCrearSubcontrato,
  puedeEditarSubcontratistas, requiereGerenciaSub, TONO_SUB, type AccionEPSub, type AccionSub,
} from '../domain/subcontratos'
import type { AjusteSubcontrato, EPSubcontrato, Proveedor, Subcontrato } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { acreditacion, estadoEPConDocs, indicadoresCumplimiento, periodo, periodoAnterior } from '../domain/cumplimiento'
import { DocumentacionLaboral, EstadoEPDocsBadge } from './Cumplimiento'
import { useStore } from '../store/store'

const q = (n: number) => num(n, Math.abs(n % 1) > 0.0001 ? 2 : 0)
export function EstadoSubBadge({ sc, t }: { sc: Subcontrato; t: number }) {
  const e = estadoSub(sc, t)
  return e ? <Badge tono={TONO_SUB[e]}>{ESTADOS_SUB[e]}</Badge> : null
}

export default function Subcontratos() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [params, setParams] = useSearchParams()
  const ver = params.get('ver') === 'subcontratistas' ? 'subcontratistas' : 'subcontratos'
  const [nuevo, setNuevo] = useState(false)
  if (!c) return null
  const t = hoy()
  const lista = d.subcontratos.filter((s) => s.obraId === c.obra.id && s.creado <= t).sort((a, b) => a.numero - b.numero)
  const inds = lista.map((s) => ({ s, i: indicadoresSub(s, d.epsSubcontrato, d.rdos, c, t) }))
  const suma = (f: (x: ReturnType<typeof indicadoresSub>) => number) => inds.reduce((s, x) => s + f(x.i), 0)
  const peso = pesoSubcontratos(c)
  const original = suma((i) => i.original)
  const adic = original ? suma((i) => i.adicionales) / original : null
  const cum = indicadoresCumplimiento(d, c.obra.id, t)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · contratos, avance, estados de pago, retenciones y pagos`}
        accion={puedeCrearSubcontrato(rol) ? <Boton onClick={() => setNuevo(true)}>Nuevo subcontrato</Boton> : undefined}>
        Subcontratos
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Cumplimiento documental" valor={cum.alDia != null ? pct(cum.alDia, 0) : '—'} sub={`KSU-01 · ${cum.porRevisar} documento(s) por revisar`} estado={cum.alDia == null ? undefined : cum.alDia >= 1 ? 'verde' : cum.alDia >= 0.8 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="EP bloqueados" valor={cum.bloqueados} sub="KSU-02 · RULE-701, falta F30-1" estado={cum.bloqueados ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Documentos por vencer" valor={cum.porVencer} sub="F30 y documentos de trabajadores" estado={cum.porVencer ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Monto vigente" valor={mm(suma((i) => i.vigente))} sub={`${lista.length} subcontratos`} />
        <Kpi etiqueta="Pagado" valor={mm(suma((i) => i.pagado))} sub={`aprobado ${mm(suma((i) => i.aprobado))}`} />
        <Kpi etiqueta="Saldo contractual" valor={mm(suma((i) => i.saldo))} sub="KSU-05 · es compromiso" />
        <Kpi etiqueta="Retención acumulada" valor={mm(suma((i) => i.retencion))} sub="RULE-704 · se devuelve al cierre" />
        <Kpi etiqueta="Adicionales" valor={adic != null ? pct(adic, 1) : '—'} sub="KSU-08 · sobre lo contratado" estado={adic == null ? undefined : adic > ADICIONALES_ROJO ? 'rojo' : adic > ADICIONALES_AMBAR ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Peso de subcontratos" valor={peso != null ? pct(peso, 0) : '—'} sub="KSU-04 · del costo real" />
      </div>
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {(['subcontratos', 'subcontratistas'] as const).map((p) => (
          <button key={p} role="tab" aria-selected={p === ver} onClick={() => setParams({ ver: p }, { replace: true })}
            className={cx('border-b-2 px-3 py-2 text-sm font-medium', p === ver ? 'border-marca text-marca' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            {p === 'subcontratos' ? 'Subcontratos' : 'Subcontratistas'}
          </button>
        ))}
      </div>
      {ver === 'subcontratos' ? (
        <Card>
          {lista.length === 0 ? <Vacio titulo="Sin subcontratos" texto="Registra los subcontratos con sus partidas y precios unitarios." /> : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[820px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">Subcontrato</th><th className="font-medium">Vigente</th><th className="font-medium">Avance</th>
                    <th className="font-medium">Pagado</th><th className="font-medium">Saldo</th><th className="text-left font-medium">Estado</th><th />
                  </tr>
                </thead>
                <tbody>
                  {inds.map(({ s, i }) => {
                    const prov = d.proveedores.find((p) => p.id === s.subcontratistaId)
                    return (
                      <tr key={s.id} className="border-b border-slate-100 text-right">
                        <td className="py-2 text-left"><div className="font-medium">{s.codigo} · {prov?.nombre}</div><div className="text-xs text-slate-500">{s.descripcion}{i.epsPendientes ? ` · ${i.epsPendientes} EP en trámite` : ''}</div></td>
                        <td>{mm(i.vigente)}</td><td>{i.avance != null ? pct(i.avance, 0) : '—'}</td><td>{mm(i.pagado)}</td><td>{mm(i.saldo)}</td>
                        <td className="text-left"><EstadoSubBadge sc={s} t={t} /></td>
                        <td><Link to={`/subcontratos/${s.id}`} className="text-marca hover:underline">Ver</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : <Subcontratistas rol={rol} />}
      {nuevo && <NuevoSubcontrato obraId={c.obra.id} onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function Subcontratistas({ rol }: { rol: string }) {
  const d = useDatosDominio()
  const guardar = useStore((s) => s.guardarSubcontratista)
  const [edit, setEdit] = useState<Partial<Proveedor> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const lista = d.proveedores.filter((p) => p.esSubcontratista).sort((a, b) => a.nombre.localeCompare(b.nombre))
  return (
    <Card titulo="Subcontratistas" accion={puedeEditarSubcontratistas(rol as never) ? <Boton variante="secundario" onClick={() => { setEdit({}); setError(null) }}>Nuevo subcontratista</Boton> : undefined}>
      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[600px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
          <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Subcontratista</th><th className="font-medium">RUT</th><th className="font-medium">Subcontratos</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => {
              const subs = d.subcontratos.filter((s) => s.subcontratistaId === p.id)
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2"><div className="font-medium">{p.nombre}</div><div className="text-xs text-slate-500">{p.especialidad ?? p.rubro}{p.contacto ? ` · ${p.contacto}` : ''}</div></td>
                  <td className="whitespace-nowrap">{p.rut}</td>
                  <td>{subs.map((s) => <Badge key={s.id} tono={estadoSub(s, t) === 'vigente' ? 'azul' : 'gris'}>{s.codigo}</Badge>)}</td>
                  <td className="text-right">{puedeEditarSubcontratistas(rol as never) && <button className="text-marca hover:underline" onClick={() => { setEdit(p); setError(null) }}>Editar</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal abierto titulo={edit.id ? `Editar ${edit.nombre}` : 'Nuevo subcontratista'} onCerrar={() => setEdit(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Razón social"><input className={inputCls} value={edit.nombre ?? ''} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="RUT"><input className={inputCls} value={edit.rut ?? ''} onChange={(e) => setEdit({ ...edit, rut: e.target.value })} /></Campo>
            <Campo etiqueta="Especialidad"><input className={inputCls} value={edit.especialidad ?? ''} onChange={(e) => setEdit({ ...edit, especialidad: e.target.value })} /></Campo>
            <Campo etiqueta="Contacto"><input className={inputCls} value={edit.contacto ?? ''} onChange={(e) => setEdit({ ...edit, contacto: e.target.value })} /></Campo>
          </div>
          {error && <p className="mt-2 text-sm text-crit">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setEdit(null)}>Cancelar</Boton>
            <Boton onClick={() => {
              const err = guardar({ id: edit.id, nombre: edit.nombre ?? '', rut: edit.rut ?? '', rubro: edit.rubro ?? edit.especialidad ?? 'Subcontratos', especialidad: edit.especialidad, contacto: edit.contacto })
              if (err) setError(err)
              else setEdit(null)
            }}>Guardar</Boton>
          </div>
        </Modal>
      )}
    </Card>
  )
}

function NuevoSubcontrato({ obraId, onCerrar }: { obraId: string; onCerrar: () => void }) {
  const crear = useStore((s) => s.crearSubcontrato)
  const d = useDatosDominio()
  const nav = useNavigate()
  const t = hoy()
  const obra = d.obras.find((o) => o.id === obraId)!
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  const subs = d.proveedores.filter((p) => p.esSubcontratista)
  const precioSub = (pid: string) => d.partidas.find((p) => p.id === pid)?.recursos.find((r) => r.tipo === 'SUB')?.precio ?? 0
  const [v, setV] = useState({ subcontratistaId: subs[0]?.id ?? '', partidaId: partidas[0]?.id ?? '', cantidad: String(partidas[0]?.cantidad ?? ''), pu: String(precioSub(partidas[0]?.id ?? '') || ''), retencion: '5', inicio: iso(t + 7), termino: iso(obra.fechaInicio + obra.plazoDias) })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const p = partidas.find((x) => x.id === v.partidaId)
  return (
    <Modal abierto titulo="Nuevo subcontrato" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Subcontratista" ayuda={subs.length ? undefined : 'Registra primero el subcontratista en la pestaña Subcontratistas.'}>
          <select className={inputCls} value={v.subcontratistaId} onChange={set('subcontratistaId')}>{subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Partida asignada">
          <select className={inputCls} value={v.partidaId} onChange={(e) => { const x = partidas.find((y) => y.id === e.target.value); setV({ ...v, partidaId: e.target.value, cantidad: String(x?.cantidad ?? ''), pu: String(precioSub(e.target.value) || '') }) }}>
            {partidas.map((x) => <option key={x.id} value={x.id}>{x.codigo} {x.descripcion}</option>)}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta={`Cantidad${p ? ` (${p.unidad})` : ''}`}><input type="number" className={inputCls} value={v.cantidad} onChange={set('cantidad')} /></Campo>
          <Campo etiqueta="PU del subcontrato"><input type="number" className={inputCls} value={v.pu} onChange={set('pu')} /></Campo>
          <Campo etiqueta="Retención (%)"><input type="number" className={inputCls} value={v.retencion} onChange={set('retencion')} /></Campo>
          <Campo etiqueta="Inicio"><input type="date" className={inputCls} value={v.inicio} onChange={set('inicio')} /></Campo>
          <Campo etiqueta="Término"><input type="date" className={inputCls} value={v.termino} onChange={set('termino')} /></Campo>
        </div>
        <p className="text-sm">Monto: <b>{clp(Math.round(Number(v.cantidad || 0) * Number(v.pu || 0)))}</b>{Number(v.cantidad) * Number(v.pu) > limiteSubcontrato(d.config) && <span className="ml-2 text-amber-700">· sobre {clp(limiteSubcontrato(d.config))}: lo firma Gerencia</span>}</p>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const r = crear({ obraId, subcontratistaId: v.subcontratistaId, descripcion: p?.descripcion ?? 'Subcontrato', lineas: [{ partidaId: v.partidaId, cantidad: Number(v.cantidad || 0), pu: Number(v.pu || 0) }], retencion: Number(v.retencion || 0) / 100, inicio: dia(v.inicio), termino: dia(v.termino) })
          if (r.error) setError(r.error)
          else { onCerrar(); nav(`/subcontratos/${r.id}`) }
        }}>Crear borrador</Boton>
      </div>
    </Modal>
  )
}

// ───────────────────────── Detalle ─────────────────────────

export function DetalleSubcontrato() {
  const { id } = useParams<{ id: string }>()
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const crearEP = useStore((s) => s.crearEPSub)
  const [accion, setAccion] = useState<AccionSub | null>(null)
  const [ajuste, setAjuste] = useState(false)
  const [epSel, setEpSel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sc = d.subcontratos.find((x) => x.id === id)
  if (!sc) return <Vacio titulo="Subcontrato no encontrado" texto="Puede haberse eliminado al renovarse la demo." accion={<Link to="/subcontratos" className="text-marca">Volver</Link>} />
  const t = hoy()
  const obra = d.obras.find((o) => o.id === sc.obraId)!
  const c = calcularObra(d, obra.id, t)
  const prov = d.proveedores.find((p) => p.id === sc.subcontratistaId)
  const i = indicadoresSub(sc, d.epsSubcontrato, d.rdos, c, t)
  const acciones = accionesSub(sc, t, rol, d.config)
  const eps = epsDe(d.epsSubcontrato, sc.id).sort((a, b) => b.numero - a.numero)
  const e = estadoSub(sc, t)!
  const puedeEP = rol === 'R02' && (e === 'vigente' || e === 'terminado')
  const sel = eps.find((x) => x.id === epSel)

  return (
    <div className="space-y-4">
      <Titulo sub={`${obra.nombre} · ${prov?.nombre ?? ''}${prov?.rut ? ` (${prov.rut})` : ''}`}
        accion={<>
          {puedeEP && <Boton onClick={() => { const r = crearEP(sc.id, t - 1); if (r.error) setError(r.error); else { setError(null); setEpSel(r.id!) } }}>Nuevo EP</Boton>}
          {acciones.map((a) => <Boton key={a} variante={a === 'suspender' || a === 'resolver' ? 'secundario' : 'primario'} onClick={() => setAccion(a)}>{ACCIONES_SUB[a]}</Boton>)}
        </>}>
        <span className="flex flex-wrap items-center gap-2">{sc.codigo} · {sc.descripcion}<EstadoSubBadge sc={sc} t={t} /></span>
      </Titulo>
      <Link to="/subcontratos" className="text-sm text-marca">← Subcontratos</Link>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {e === 'en_acreditacion' && !acreditacion(sc, d.trabajadores, d.documentosLaborales, t).ok && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">RULE-702: para acreditar se necesita el F30 vigente y los trabajadores con contrato, información de riesgos y EPP validados.</p>}
      {e === 'borrador' && requiereGerenciaSub(sc, d.config) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Supera {clp(limiteSubcontrato(d.config))} (RN-P04): lo firma Gerencia (R01).</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi etiqueta="Monto vigente" valor={mm(i.vigente)} sub={`original ${mm(i.original)}`} />
        <Kpi etiqueta="Avance validado" valor={i.avance != null ? pct(i.avance, 0) : '—'} sub={i.avanceVsPrograma != null ? `KSU-03 · ${pct(i.avanceVsPrograma, 0)} del programa` : 'KSU-03'}
          estado={i.avanceVsPrograma == null ? undefined : i.avanceVsPrograma >= 1 ? 'verde' : i.avanceVsPrograma >= 0.8 ? 'amarillo' : 'rojo'} />
        <Kpi etiqueta="Pagado vs avance" valor={i.pagadoVsAvance != null ? pct(i.pagadoVsAvance, 0) : '—'} sub="KSU-06" estado={i.pagadoVsAvance == null ? undefined : i.pagadoVsAvance <= 1 ? 'verde' : 'amarillo'} />
        <Kpi etiqueta="Saldo contractual" valor={mm(i.saldo)} sub={`pagado ${mm(i.pagado)} · KSU-05`} />
        <Kpi etiqueta="Retención" valor={mm(i.retencion)} sub={sc.retencionDevuelta != null ? `devuelta ${fmtFecha(sc.retencionDevuelta)}` : `${pct(sc.retencion, 0)} de cada EP`} />
        <Kpi etiqueta="Multas y descuentos" valor={mm(i.descuentosMultas)} sub={i.multasDescuentos != null ? `KSU-07 · ${pct(i.multasDescuentos, 1)}` : 'KSU-07'} />
      </div>

      <Card titulo="Partidas asignadas">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[720px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">PU</th><th className="font-medium">Monto</th><th className="font-medium">Avance validado</th><th className="font-medium">Cobrado</th><th className="font-medium">Por cobrar</th></tr></thead>
            <tbody>
              {sc.lineas.map((l) => {
                const p = d.partidas.find((x) => x.id === l.partidaId)
                const val = Math.min(l.cantidad, avanceValidado(d.rdos, sc.obraId, l.partidaId, t))
                const cob = cobradoPartida(d.epsSubcontrato, sc.id, l.partidaId, t)
                return (
                  <tr key={l.partidaId} className="border-b border-slate-100 text-right">
                    <td className="py-2 text-left">{p?.codigo} {p?.descripcion}</td><td>{q(l.cantidad)} {p?.unidad}</td><td>{clp(l.pu)}</td><td>{mm(l.cantidad * l.pu)}</td>
                    <td>{q(val)}</td><td>{q(cob)}</td><td className={cx(val - cob > 0 && 'font-medium text-marca')}>{q(Math.max(0, val - cob))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card titulo="Estados de pago">
          {eps.length === 0 ? <p className="text-sm text-slate-500">Sin estados de pago.</p> : (
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[620px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
                <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">EP</th><th className="font-medium">Bruto</th><th className="font-medium">Retención</th><th className="font-medium">Desc./multas</th><th className="font-medium">Neto</th><th className="text-left font-medium">Estado</th><th /></tr></thead>
                <tbody>
                  {eps.map((x) => {
                    const m = montosEPSub(x, sc)
                    return (
                      <tr key={x.id} className="border-b border-slate-100 text-right">
                        <td className="py-2 text-left">N° {x.numero} · corte {fmtFecha(x.fechaCorte)}</td><td>{mm(m.bruto)}</td><td>{mm(m.retencion)}</td><td>{m.descuentos ? mm(m.descuentos) : '—'}</td><td className="font-medium">{mm(m.neto)}</td>
                        <td className="text-left"><EstadoEPDocsBadge ep={x} sc={sc} /></td>
                        <td><button className="text-marca hover:underline" onClick={() => setEpSel(x.id)}>Ver</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card titulo="Adicionales, descuentos y multas" accion={(rol === 'R02' || rol === 'R01') && e !== 'cerrado' ? <Boton variante="secundario" onClick={() => setAjuste(true)}>Registrar</Boton> : undefined}>
          {sc.ajustes.length === 0 ? <p className="text-sm text-slate-500">Sin ajustes.</p> : (
            <ul className="space-y-2 text-sm">
              {sc.ajustes.filter((a) => a.fecha <= t).map((a) => (
                <li key={a.id}><Badge tono={a.tipo === 'adicional' ? 'azul' : 'ambar'}>{a.tipo === 'adicional' ? 'Adicional' : a.tipo === 'descuento' ? 'Descuento' : 'Multa'}</Badge> <b>{mm(a.monto)}</b> · {fmtFecha(a.fecha)}<div className="text-xs text-slate-600">{a.descripcion}</div></li>
              ))}
            </ul>
          )}
          <ol className="mt-4 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
            <li>{fmtFecha(sc.creado)} · Borrador · {sc.creadoPor}</li>
            {sc.historial.filter((h) => h.fecha <= t).map((h, k) => <li key={k}>{fmtFecha(h.fecha)} · {ESTADOS_SUB[h.estado]} · {h.por}{h.texto ? ` · “${h.texto}”` : ''}</li>)}
          </ol>
        </Card>
      </div>
      <DocumentacionLaboral sc={sc} />
      {accion && <AccionSubModal sc={sc} accion={accion} onCerrar={() => setAccion(null)} />}
      {ajuste && <AjusteModal sc={sc} onCerrar={() => setAjuste(false)} />}
      {sel && <DetalleEPSub ep={sel} sc={sc} onCerrar={() => setEpSel(null)} />}
    </div>
  )
}

function AccionSubModal({ sc, accion, onCerrar }: { sc: Subcontrato; accion: AccionSub; onCerrar: () => void }) {
  const ejecutar = useStore((s) => s.accionSubcontrato)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ayuda: Partial<Record<AccionSub, string>> = {
    firmar: 'El saldo de cada partida queda comprometido en el control de costos. El subcontratista debe acreditar su documentación de ingreso.',
    acreditar: 'Documentación de ingreso completa: el subcontratista puede trabajar y presentar estados de pago.',
    terminar: 'Exige sus partidas 100 % validadas.',
    cerrar: 'Exige todos los EP pagados. Registra la devolución de la retención acumulada.',
  }
  const conTexto = accion === 'suspender' || accion === 'resolver'
  return (
    <Modal abierto titulo={`${ACCIONES_SUB[accion]} · ${sc.codigo}`} onCerrar={onCerrar}>
      {ayuda[accion] && <p className="mb-3 text-sm text-slate-600">{ayuda[accion]}</p>}
      {conTexto && <Campo etiqueta="Motivo"><input className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante={conTexto ? 'peligro' : 'primario'} onClick={() => { const err = ejecutar(sc.id, accion, texto); if (err) setError(err); else onCerrar() }}>{ACCIONES_SUB[accion]}</Boton>
      </div>
    </Modal>
  )
}

function AjusteModal({ sc, onCerrar }: { sc: Subcontrato; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarAjusteSub)
  const [v, setV] = useState<{ tipo: AjusteSubcontrato['tipo']; monto: string; descripcion: string }>({ tipo: 'multa', monto: '', descripcion: '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={`Ajuste · ${sc.codigo}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">Los adicionales y descuentos cambian el monto vigente y el compromiso; las multas se descuentan en un estado de pago.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tipo"><select className={inputCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as AjusteSubcontrato['tipo'] })}><option value="adicional">Adicional</option><option value="descuento">Descuento</option><option value="multa">Multa</option></select></Campo>
        <Campo etiqueta="Monto"><input type="number" className={inputCls} value={v.monto} onChange={(e) => setV({ ...v, monto: e.target.value })} /></Campo>
      </div>
      <div className="mt-3"><Campo etiqueta="Descripción"><input className={inputCls} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></Campo></div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = registrar(sc.id, { tipo: v.tipo, monto: Number(v.monto || 0), descripcion: v.descripcion }); if (err) setError(err); else onCerrar() }}>Registrar</Boton>
      </div>
    </Modal>
  )
}

function DetalleEPSub({ ep, sc, onCerrar }: { ep: EPSubcontrato; sc: Subcontrato; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const editar = useStore((s) => s.editarEPSub)
  const ejecutar = useStore((s) => s.accionEPSub)
  const [accion, setAccion] = useState<AccionEPSub | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const e = estadoEPSub(ep, t)!
  const m = montosEPSub(ep, sc)
  const excesos = excesosRULE703(ep, d.epsSubcontrato, d.rdos, t)
  // RULE-701: bloqueado por F30-1 no se puede pagar
  const acciones = accionesEPSub(ep, t, rol).filter((x) => !(x === 'pagar' && estadoEPConDocs(ep, sc, d.documentosLaborales, t) === 'bloqueado'))
  const editable = e === 'borrador' && rol === 'R02'
  return (
    <Modal abierto titulo={`EP N° ${ep.numero} · ${sc.codigo} · corte ${fmtFecha(ep.fechaCorte)}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><EstadoEPDocsBadge ep={ep} sc={sc} />{e === 'aprobado' && <span className="text-xs text-slate-500">Aprobado: es costo real de la partida.</span>}</div>
        {estadoEPConDocs(ep, sc, d.documentosLaborales, t) === 'bloqueado' && <p className="rounded-lg bg-red-50 p-2 text-red-900">RULE-701: falta el F30-1 validado de {periodo(ep.fechaCorte)} o {periodoAnterior(periodo(ep.fechaCorte))}. El pago queda bloqueado hasta que el subcontratista lo cargue y se valide.</p>}
        {excesos.length > 0 && ['borrador', 'presentado'].includes(e) && <p className="rounded-lg bg-red-50 p-2 text-red-900">RULE-703: se cobra más que el avance validado ({excesos.map((x) => `exceso ${q(x.exceso)}`).join(', ')}). No se puede validar.</p>}
        <table className="tabular w-full text-right">
          <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-1 text-left font-medium">Partida</th><th className="font-medium">Cantidad</th><th className="font-medium">Monto</th></tr></thead>
          <tbody>
            {ep.lineas.map((l, k) => {
              const p = d.partidas.find((x) => x.id === l.partidaId)
              const pu = sc.lineas.find((x) => x.partidaId === l.partidaId)?.pu ?? 0
              return (
                <tr key={l.partidaId} className="border-b border-slate-100">
                  <td className="py-1 text-left">{p?.codigo} {p?.descripcion}</td>
                  <td>{editable ? <input type="number" className={cx(inputCls, 'w-28 py-0.5 text-right')} defaultValue={l.cantidad} aria-label="Cantidad"
                    onBlur={(ev) => editar(ep.id, { lineas: ep.lineas.map((x, j) => (j === k ? { ...x, cantidad: Number(ev.target.value) } : x)) })} /> : `${q(l.cantidad)} ${p?.unidad ?? ''}`}</td>
                  <td>{mm(l.cantidad * pu)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <dl className="tabular space-y-1">
          <div className="flex justify-between"><dt className="text-slate-600">Bruto</dt><dd>{clp(m.bruto)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Retención ({pct(sc.retencion, 0)})</dt><dd>−{clp(m.retencion)}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-slate-600">Descuentos y multas</dt><dd>{editable ? <input type="number" className={cx(inputCls, 'w-32 py-0.5 text-right')} defaultValue={ep.descuentos} aria-label="Descuentos" onBlur={(ev) => editar(ep.id, { descuentos: Number(ev.target.value) })} /> : `−${clp(m.descuentos)}`}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Neto a pagar</dt><dd>{clp(m.neto)}</dd></div>
        </dl>
        <ol className="space-y-0.5 text-xs text-slate-600">
          {ep.historial.filter((h) => h.fecha <= t).map((h, k) => <li key={k}>{fmtFecha(h.fecha)} · {ESTADOS_EPSUB[h.estado]} · {h.por}{h.texto ? ` · “${h.texto}”` : ''}</li>)}
        </ol>
        {accion === 'rechazar' && <Campo etiqueta="Motivo"><input className={inputCls} value={texto} onChange={(ev) => setTexto(ev.target.value)} /></Campo>}
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {accion === 'rechazar'
          ? <><Boton variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton><Boton variante="peligro" onClick={() => { const err = ejecutar(ep.id, 'rechazar', texto); if (err) setError(err); else setAccion(null) }}>Rechazar</Boton></>
          : acciones.map((a) => <Boton key={a} variante={a === 'rechazar' ? 'secundario' : 'primario'} onClick={() => (a === 'rechazar' ? setAccion(a) : setError(ejecutar(ep.id, a)))}>{ACCIONES_EPSUB[a]}</Boton>)}
      </div>
    </Modal>
  )
}
