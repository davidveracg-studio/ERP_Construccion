// Caja chica y rendiciones (v1.2, 10 §17): fondo fijo de la obra, rendición en preparación con sus
// comprobantes e imputación, revisión ítem por ítem (RN-P04: el administrador hasta 10 UF; sobre eso
// Finanzas o Gerencia), observaciones de RULE-401 y reposición del fondo por Finanzas (costo real).
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import {
  abiertaCaja, aprobadoRendicion, COMPROBANTES, estadoRendicion, ESTADOS_RENDICION, indicadoresCaja, limiteRendicion, observacionesItem,
  observacionesRendicion, puedeAdministrarCaja, puedeRendir, puedeRevisarItem, rechazadoRendicion, TONO_RENDICION, totalRendicion,
} from '../domain/cajaChica'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { clp, mm, pct } from '../domain/formato'
import type { ItemRendicion, Rendicion } from '../domain/types'
import { useCalc, useDatosDominio } from '../store/hooks'
import { useStore } from '../store/store'

function useImputaciones(obraId: string) {
  const d = useDatosDominio()
  const partidas = d.partidas.filter((p) => p.obraId === obraId && !p.ordenCambioId)
  return { opciones: [{ id: 'GG', nombre: 'Gastos generales (GG)' }, ...partidas.map((p) => ({ id: p.id, nombre: `${p.codigo} ${p.descripcion}` }))], nombre: (id: string) => (id === 'GG' ? 'GG' : partidas.find((p) => p.id === id)?.codigo ?? 'Sin imputar') }
}

export default function CajaChica() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const abrir = useStore((s) => s.abrirCajaChica)
  const cerrar = useStore((s) => s.cerrarCajaChica)
  const crear = useStore((s) => s.crearRendicion)
  const [ver, setVer] = useState<string | null>(null)
  const [abrirModal, setAbrirModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!c) return null
  const t = hoy()
  const caja = d.cajasChicas.filter((x) => x.obraId === c.obra.id && x.abierta <= t).sort((a, b) => b.abierta - a.abierta)[0]
  if (!caja) {
    return (
      <div className="space-y-4">
        <Titulo sub={c.obra.nombre}>Caja chica y rendiciones</Titulo>
        <Vacio titulo="Sin caja chica" texto="Finanzas asigna el fondo fijo de la obra y su responsable." accion={puedeAdministrarCaja(rol) ? <Boton onClick={() => setAbrirModal(true)}>Abrir caja chica</Boton> : undefined} />
        {abrirModal && <AbrirCaja obraId={c.obra.id} responsable={c.obra.jefeTerreno} onAbrir={abrir} onCerrar={() => setAbrirModal(false)} />}
      </div>
    )
  }
  const ind = indicadoresCaja(caja, d.rendiciones, t)
  const rends = d.rendiciones.filter((r) => r.cajaId === caja.id && r.creado <= t).sort((a, b) => b.numero - a.numero)
  const borrador = rends.find((r) => estadoRendicion(r, t) === 'borrador')
  const sel = rends.find((r) => r.id === ver)
  const abierta = abiertaCaja(caja, t)

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · responsable ${caja.responsable} · fondo fijo ${clp(caja.fondo)}`}
        accion={<>
          {abierta && puedeRendir(rol) && !borrador && <Boton onClick={() => setError(crear(caja.id))}>Nueva rendición</Boton>}
          {abierta && puedeAdministrarCaja(rol) && <Boton variante="secundario" onClick={() => setError(cerrar(caja.id))}>Cerrar caja</Boton>}
        </>}>
        Caja chica y rendiciones
      </Titulo>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {caja.cerrada && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Caja cerrada el {fmtFecha(caja.cerrada.fecha)} con devolución de {clp(caja.cerrada.devolucion)}.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi etiqueta="Saldo disponible" valor={mm(ind.saldo)} sub={`${pct(ind.usado, 0)} del fondo usado`} estado={ind.usado > 0.9 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Por reponer" valor={mm(caja.fondo - ind.saldo)} sub="gastos rendidos o en preparación" />
        <Kpi etiqueta="Desde la última reposición" valor={`${ind.diasSinReponer} días`} />
        <Kpi etiqueta="Rendiciones por revisar" valor={ind.presentadas} sub="RULE-401 si traen observaciones" estado={ind.presentadas ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Rechazado (90 días)" valor={ind.rechazado != null ? pct(ind.rechazado, 1) : '—'} sub="gastos sin respaldo o no imputables" />
      </div>
      {borrador && <RendicionEnPreparacion r={borrador} obraId={c.obra.id} fondo={caja.fondo} />}
      <Card titulo="Rendiciones">
        {rends.filter((r) => r !== borrador).length === 0 ? <p className="text-sm text-slate-500">Sin rendiciones presentadas.</p> : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm [&_td+td]:whitespace-nowrap [&_td+td]:pl-3 [&_th+th]:pl-3">
              <thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-2 text-left font-medium">Rendición</th><th className="font-medium">Rendido</th><th className="font-medium">Aprobado</th><th className="font-medium">Rechazado</th><th className="text-left font-medium">Estado</th><th /></tr></thead>
              <tbody>
                {rends.filter((r) => r !== borrador).map((r) => {
                  const e = estadoRendicion(r, t)!
                  const obs = observacionesRendicion(r, caja, d.config)
                  return (
                    <tr key={r.id} className="border-b border-slate-100 text-right">
                      <td className="py-2 text-left">N° {r.numero} · {r.items.length} gastos<div className="text-xs text-slate-500">presentada {fmtFecha(r.historial.find((h) => h.estado === 'presentada')?.fecha ?? r.creado)}</div></td>
                      <td>{clp(totalRendicion(r))}</td><td>{e === 'aprobada' ? clp(aprobadoRendicion(r)) : '—'}</td><td className={cx(rechazadoRendicion(r) > 0 && 'text-crit')}>{rechazadoRendicion(r) ? clp(rechazadoRendicion(r)) : '—'}</td>
                      <td className="text-left"><Badge tono={TONO_RENDICION[e]}>{ESTADOS_RENDICION[e]}</Badge>{e === 'presentada' && (obs.items.length > 0 || obs.sobreFondo) && <Badge tono="rojo">RULE-401</Badge>}</td>
                      <td><button className="text-marca hover:underline" onClick={() => setVer(r.id)}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel && <DetalleRendicion r={sel} obraId={c.obra.id} onCerrar={() => setVer(null)} />}
    </div>
  )
}

function AbrirCaja({ obraId, responsable, onAbrir, onCerrar }: { obraId: string; responsable: string; onAbrir: (c: { obraId: string; responsable: string; fondo: number }) => string | null; onCerrar: () => void }) {
  const [v, setV] = useState({ responsable, fondo: '1000000' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo="Abrir caja chica" onCerrar={onCerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Responsable"><input className={inputCls} value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
        <Campo etiqueta="Fondo fijo"><input type="number" className={inputCls} value={v.fondo} onChange={(e) => setV({ ...v, fondo: e.target.value })} /></Campo>
      </div>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => { const err = onAbrir({ obraId, responsable: v.responsable, fondo: Number(v.fondo || 0) }); if (err) setError(err); else onCerrar() }}>Abrir</Boton>
      </div>
    </Modal>
  )
}

function RendicionEnPreparacion({ r, obraId, fondo }: { r: Rendicion; obraId: string; fondo: number }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const agregar = useStore((s) => s.agregarItemRendicion)
  const quitar = useStore((s) => s.quitarItemRendicion)
  const presentar = useStore((s) => s.presentarRendicion)
  const { opciones, nombre } = useImputaciones(obraId)
  const t = hoy()
  const [v, setV] = useState({ fecha: iso(t), proveedor: '', comprobante: 'boleta' as ItemRendicion['comprobante'], numero: '', descripcion: '', monto: '', imputacion: 'GG' })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const edita = puedeRendir(rol)
  const total = totalRendicion(r)
  const conObs = r.items.filter((i) => observacionesItem(i, d.config).length).length

  return (
    <Card titulo={`Rendición N° ${r.numero} en preparación`} accion={edita ? <Boton disabled={!r.items.length} onClick={() => setError(presentar(r.id))}>Presentar ({r.items.length})</Boton> : undefined}>
      {r.items.length === 0 ? <p className="text-sm text-slate-500">Registra los gastos con su comprobante.</p> : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[680px] text-sm [&_td+td]:pl-3 [&_th+th]:pl-3">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Fecha</th><th className="font-medium">Gasto</th><th className="font-medium">Comprobante</th><th className="font-medium">Imputación</th><th className="text-right font-medium">Monto</th><th /></tr></thead>
            <tbody>
              {r.items.map((i) => {
                const obs = observacionesItem(i, d.config)
                return (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap py-1.5">{fmtFecha(i.fecha)}</td>
                    <td>{i.descripcion}<div className="text-xs text-slate-500">{i.proveedor}</div>{obs.length > 0 && <div className="text-xs text-amber-700">{obs.join(' · ')}</div>}</td>
                    <td className="whitespace-nowrap">{COMPROBANTES[i.comprobante]}{i.numero ? ` N° ${i.numero}` : ''}</td>
                    <td className="whitespace-nowrap">{nombre(i.imputacion)}</td>
                    <td className="whitespace-nowrap text-right">{clp(i.monto)}</td>
                    <td className="text-right">{edita && <button className="text-xs text-slate-500 hover:text-crit" onClick={() => quitar(r.id, i.id)}>Quitar</button>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr className="font-semibold"><td colSpan={4} className="py-1.5 text-right">Total</td><td className="text-right">{clp(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      {(conObs > 0 || total > fondo) && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">RULE-401: {conObs ? `${conObs} gasto(s) con observaciones` : ''}{conObs && total > fondo ? ' y ' : ''}{total > fondo ? 'la suma supera el fondo' : ''}. Al presentarla quedará observada para Finanzas.</p>}
      {edita && (
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
          <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={v.fecha} onChange={set('fecha')} /></Campo>
          <Campo etiqueta="Gasto"><input className={inputCls} value={v.descripcion} onChange={set('descripcion')} placeholder="Discos de corte" /></Campo>
          <Campo etiqueta="Proveedor"><input className={inputCls} value={v.proveedor} onChange={set('proveedor')} /></Campo>
          <Campo etiqueta="Monto"><input type="number" className={inputCls} value={v.monto} onChange={set('monto')} /></Campo>
          <Campo etiqueta="Comprobante"><select className={inputCls} value={v.comprobante} onChange={set('comprobante')}>{(Object.keys(COMPROBANTES) as ItemRendicion['comprobante'][]).map((k) => <option key={k} value={k}>{COMPROBANTES[k]}</option>)}</select></Campo>
          <Campo etiqueta="N° comprobante"><input className={inputCls} value={v.numero} onChange={set('numero')} /></Campo>
          <Campo etiqueta="Imputación"><select className={inputCls} value={v.imputacion} onChange={set('imputacion')}>{opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></Campo>
          <div className="flex items-end"><Boton className="w-full" onClick={() => {
            const err = agregar(r.id, { fecha: dia(v.fecha), proveedor: v.proveedor, comprobante: v.comprobante, numero: v.numero || undefined, descripcion: v.descripcion, monto: Number(v.monto || 0), imputacion: v.imputacion })
            if (err) setError(err)
            else { setError(null); setV({ ...v, proveedor: '', numero: '', descripcion: '', monto: '' }) }
          }}>Agregar gasto</Boton></div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">Tope por gasto sin aprobación de Finanzas: {clp(limiteRendicion(d.config))} (10 UF).</p>
    </Card>
  )
}

function DetalleRendicion({ r, obraId, onCerrar }: { r: Rendicion; obraId: string; onCerrar: () => void }) {
  const d = useDatosDominio()
  const rol = useStore((s) => s.ui.rol)
  const revisar = useStore((s) => s.revisarItemRendicion)
  const reponer = useStore((s) => s.reponerFondo)
  const { nombre } = useImputaciones(obraId)
  const [rechazo, setRechazo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = hoy()
  const e = estadoRendicion(r, t)!
  const pendientes = r.items.filter((i) => !i.revision).length
  return (
    <Modal abierto titulo={`Rendición N° ${r.numero} · ${ESTADOS_RENDICION[e]}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-sm">
        <ul className="divide-y divide-slate-100">
          {r.items.map((i) => {
            const obs = observacionesItem(i, d.config)
            const puede = e === 'presentada' && puedeRevisarItem(rol, i, d.config)
            return (
              <li key={i.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{i.descripcion} · {clp(i.monto)}</div>
                    <div className="text-xs text-slate-500">{fmtFecha(i.fecha)} · {i.proveedor || '—'} · {COMPROBANTES[i.comprobante]}{i.numero ? ` N° ${i.numero}` : ''} · {nombre(i.imputacion)}</div>
                    {obs.length > 0 && <div className="text-xs text-amber-700">{obs.join(' · ')}</div>}
                  </div>
                  {i.revision ? <Badge tono={i.revision.estado === 'aprobado' ? 'verde' : 'rojo'}>{i.revision.estado === 'aprobado' ? 'Aprobado' : `Rechazado: ${i.revision.motivo ?? ''}`}</Badge>
                    : puede ? <span className="flex gap-2 text-xs"><button className="text-marca hover:underline" onClick={() => setError(revisar(r.id, i.id, 'aprobado'))}>Aprobar</button><button className="text-slate-500 hover:text-crit" onClick={() => { setRechazo(i.id); setMotivo('') }}>Rechazar</button></span>
                      : e === 'presentada' ? <span className="text-xs text-slate-500">{i.monto > limiteRendicion(d.config) ? 'Lo aprueba Finanzas' : 'Por revisar'}</span> : null}
                </div>
                {rechazo === i.id && (
                  <div className="mt-2 flex gap-2">
                    <input className={cx(inputCls, 'py-1')} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Motivo (sin documento, no imputable…)" />
                    <Boton variante="peligro" className="min-h-0 py-1" onClick={() => { const err = revisar(r.id, i.id, 'rechazado', motivo); setError(err); if (!err) setRechazo(null) }}>Rechazar</Boton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <dl className="tabular space-y-1 border-t border-slate-200 pt-2">
          <div className="flex justify-between"><dt className="text-slate-600">Rendido</dt><dd>{clp(totalRendicion(r))}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Aprobado (a reponer)</dt><dd>{clp(aprobadoRendicion(r))}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Rechazado</dt><dd>{clp(rechazadoRendicion(r))}</dd></div>
        </dl>
        {error && <p className="text-crit">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {e === 'presentada' && puedeAdministrarCaja(rol) && <Boton disabled={pendientes > 0} onClick={() => { const err = reponer(r.id); if (err) setError(err); else onCerrar() }}>{pendientes ? `Faltan ${pendientes} por revisar` : 'Reponer fondo'}</Boton>}
      </div>
    </Modal>
  )
}
