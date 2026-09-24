// Reporte Diario de Obra del capataz: avance en cantidades + HH por partida (17 §4.1, 20 §6.1)
import { useEffect, useMemo, useState } from 'react'
import { Badge, Boton, Card, Titulo, cx, inputCls } from '../components/ui'
import { hhDeRegistro } from '../domain/evm'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { num, uid } from '../domain/formato'
import { CAUSAS_NP, type CausaNoProductiva, type Clima, type RDO, type RegistroHH } from '../domain/types'
import type { CalcObra } from '../domain/evm'
import type { Cuadrilla } from '../domain/types'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'

const CLIMAS: [Clima, string, string][] = [['despejado', '☀', 'Despejado'], ['nublado', '☁', 'Nublado'], ['lluvia', '☔', 'Lluvia'], ['viento', '༄', 'Viento']]

interface FilaPartida { cantidad: string; trabajadores: number; horas: number; extra: number }

export default function RDOPage() {
  const { d, c } = useCalc()
  const ui = useStore((s) => s.ui)
  const cuadrillas = d.cuadrillas.filter((q) => q.obraId === ui.obraId)
  const propia = cuadrillas.find((q) => q.capataz === ui.usuario) ?? cuadrillas[0]
  const [cuadrillaId, setCuadrillaId] = useState(propia?.id ?? '')
  // Si cambia el usuario (o la obra), preselecciona su propia cuadrilla
  useEffect(() => { if (propia) setCuadrillaId(propia.id) }, [propia?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [fecha, setFecha] = useState(iso(hoy()))
  const existente = d.rdos.find((r) => r.obraId === ui.obraId && r.cuadrillaId === cuadrillaId && r.fecha === dia(fecha))
  const bloqueado = existente && (existente.estado === 'validado' || existente.estado === 'enviado')
  const cq = cuadrillas.find((q) => q.id === cuadrillaId)

  // Partidas de la semana: actividades en curso + partidas reportadas recientemente por la cuadrilla
  const partidasSemana = useMemo(() => {
    if (!c) return []
    const ids = new Set<string>()
    for (const a of c.actualizado?.actividades ?? []) {
      const r = c.cpm.get(a.id)
      const enCurso = (a.inicioReal != null && a.finReal == null) || (r && !r.terminada && r.es <= c.corte + 7 && a.inicioReal == null && !a.esHito)
      if (enCurso) a.partidas.forEach((p) => ids.add(p.partidaId))
    }
    for (const r of d.rdos) if (r.cuadrillaId === cuadrillaId && r.fecha >= hoy() - 14) r.avances.forEach((a) => ids.add(a.partidaId))
    return c.partidas.filter((p) => ids.has(p.p.id) && p.avance < 1)
  }, [c, d.rdos, cuadrillaId])

  if (!c || !cq) return <p className="text-slate-500">Esta obra no tiene cuadrillas.</p>
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo sub={`${c.obra.nombre} · ${cq.nombre}`}>Reporte de hoy</Titulo>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Fecha</span>
            <input type="date" className={inputCls} value={fecha} max={iso(hoy())} onChange={(e) => setFecha(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Cuadrilla</span>
            <select className={inputCls} value={cuadrillaId} onChange={(e) => setCuadrillaId(e.target.value)}>
              {cuadrillas.map((q) => <option key={q.id} value={q.id}>{q.nombre}</option>)}
            </select></label>
        </div>
        {existente && <p className="mt-3 text-sm">Estado: <Badge tono={existente.estado === 'validado' ? 'verde' : existente.estado === 'rechazado' ? 'rojo' : 'azul'}>{existente.estado}</Badge>
          {existente.motivoRechazo && <span className="ml-2 text-crit">Devuelto: {existente.motivoRechazo}</span>}</p>}
      </Card>
      {bloqueado ? (
        <Card><p className="text-sm text-slate-600">Este reporte ya fue {existente!.estado}. {existente!.estado === 'enviado' ? 'El jefe de terreno lo está revisando.' : 'Es inmutable; cualquier corrección se hace con un ajuste auditado.'}</p>
          <ResumenRDO r={existente!} /></Card>
      ) : (
        <Formulario key={`${cuadrillaId}|${fecha}`} c={c} cq={cq} existente={existente} partidasSemana={partidasSemana} fecha={fecha} />
      )}
      <Card titulo="Mis reportes recientes">
        <ul className="space-y-1 text-sm">
          {d.rdos.filter((r) => r.cuadrillaId === cuadrillaId).sort((a, b) => b.fecha - a.fecha).slice(0, 8).map((r) => (
            <li key={r.id} className="flex justify-between">
              <button className="text-marca" onClick={() => setFecha(iso(r.fecha))}>{fmtFecha(r.fecha)}</button>
              <span className="tabular text-slate-500">{num(r.hh.reduce((s, h) => s + hhDeRegistro(h), 0))} HH</span>
              <Badge tono={r.estado === 'validado' ? 'verde' : r.estado === 'rechazado' ? 'rojo' : r.estado === 'enviado' ? 'azul' : 'gris'}>{r.estado}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Formulario({ c, cq, existente, partidasSemana, fecha }: {
  c: CalcObra; cq: Cuadrilla; existente?: RDO; partidasSemana: CalcObra['partidas']; fecha: string
}) {
  const ui = useStore((s) => s.ui)
  const guardar = useStore((s) => s.guardarRDO)
  const cuadrillaId = cq.id
  const [clima, setClima] = useState<Clima>(existente?.clima ?? 'despejado')
  const [filas, setFilas] = useState<Record<string, FilaPartida>>(() => {
    const o: Record<string, FilaPartida> = {}
    for (const a of existente?.avances ?? []) {
      const h = existente!.hh.find((x) => x.partidaId === a.partidaId)
      o[a.partidaId] = { cantidad: String(a.cantidad), trabajadores: h?.trabajadores ?? 0, horas: h?.horasNormales ?? 9, extra: h?.horasExtra ?? 0 }
    }
    return o
  })
  const [np, setNp] = useState<{ causa: CausaNoProductiva; trabajadores: number; horas: number } | null>(null)
  const [obs, setObs] = useState(existente?.observaciones ?? '')
  const [msg, setMsg] = useState<string | null>(null)

  const fila = (id: string) => filas[id] ?? { cantidad: '', trabajadores: 0, horas: 9, extra: 0 }
  const setFila = (id: string, f: Partial<FilaPartida>) => setFilas({ ...filas, [id]: { ...fila(id), ...f } })
  const hhTotal = Object.values(filas).reduce((s, f) => s + f.trabajadores * (f.horas + f.extra), 0) + (np ? np.trabajadores * np.horas : 0)
  const maxHH = cq.trabajadores * 11

  const armar = (estado: RDO['estado']): RDO => {
    const avances = Object.entries(filas).map(([partidaId, f]) => ({ partidaId, cantidad: Number(f.cantidad.replace(',', '.')) || 0 })).filter((a) => a.cantidad > 0)
    const hh: RegistroHH[] = Object.entries(filas).filter(([, f]) => f.trabajadores > 0).map(([partidaId, f]) => ({ partidaId, trabajadores: f.trabajadores, horasNormales: f.horas, horasExtra: f.extra }))
    if (np && np.trabajadores > 0) hh.push({ partidaId: null, trabajadores: np.trabajadores, horasNormales: np.horas, horasExtra: 0, causaNoProductiva: np.causa })
    return {
      id: existente?.id ?? uid('rdo'), obraId: ui.obraId, cuadrillaId, fecha: dia(fecha), clima, estado,
      autor: ui.usuario, avances, hh, observaciones: obs, motivoRechazo: undefined,
    }
  }

  const advertencias: string[] = []
  for (const [pid, f] of Object.entries(filas)) {
    const cp = c.partidas.find((p) => p.p.id === pid)
    const q = Number(f.cantidad.replace(',', '.')) || 0
    if (cp && cp.cantEjec + q > cp.p.cantidad) advertencias.push(`${cp.p.codigo}: supera la cantidad contratada (${num(cp.p.cantidad)} ${cp.p.unidad}). Oficina Técnica revisará si es mayor obra (RULE-102).`)
    if (q > 0 && f.trabajadores === 0 && cp?.rendPres) advertencias.push(`${cp.p.codigo}: registraste avance sin HH (RULE-110).`)
  }
  if (hhTotal > maxHH) advertencias.push(`Las HH (${num(hhTotal)}) superan la dotación de la cuadrilla × 11 h (RULE-110).`)

  return (
    <>
          <Card titulo="1 · Clima">
            <div className="grid grid-cols-4 gap-2">
              {CLIMAS.map(([k, i, n]) => (
                <button key={k} onClick={() => setClima(k)} className={cx('flex min-h-16 flex-col items-center justify-center rounded-xl border-2 text-2xl', clima === k ? 'border-marca bg-blue-50' : 'border-slate-200')}>
                  {i}<span className="text-xs">{n}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card titulo="2 · ¿Qué avanzaron y cuántas HH usaron?">
            {partidasSemana.length === 0 && <p className="text-sm text-slate-500">No hay partidas en curso para esta cuadrilla.</p>}
            <div className="space-y-4">
              {partidasSemana.map((p) => {
                const f = fila(p.p.id)
                const falta = p.p.cantidad - p.cantEjec
                return (
                  <div key={p.p.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{p.p.codigo} {p.p.descripcion}</span>
                      <span className="text-xs text-slate-500">faltan {num(falta, 1)} {p.p.unidad}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-ev" style={{ width: `${p.avance * 100}%` }} /></div>
                    <label className="mt-3 block">
                      <span className="text-xs text-slate-500">Cantidad ejecutada hoy ({p.p.unidad})</span>
                      <input inputMode="decimal" className={cx(inputCls, 'mt-1 h-12 text-lg')} value={f.cantidad} onChange={(e) => setFila(p.p.id, { cantidad: e.target.value })} placeholder="0" />
                    </label>
                    {p.rendPres != null && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Stepper etiqueta="Trabajadores" valor={f.trabajadores} onChange={(v) => setFila(p.p.id, { trabajadores: v })} max={cq.trabajadores} />
                        <Stepper etiqueta="Horas c/u" valor={f.horas} onChange={(v) => setFila(p.p.id, { horas: v })} max={12} paso={0.5} />
                        <Stepper etiqueta="Horas extra" valor={f.extra} onChange={(v) => setFila(p.p.id, { extra: v })} max={6} paso={0.5} />
                      </div>
                    )}
                    {p.rendPres == null && <p className="mt-2 text-xs text-slate-500">Partida subcontratada o sin mano de obra propia: solo cantidad.</p>}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              {np ? (
                <>
                  <div className="text-sm font-medium">HH no productivas</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(Object.keys(CAUSAS_NP) as CausaNoProductiva[]).map((k) => (
                      <button key={k} onClick={() => setNp({ ...np, causa: k })} className={cx('min-h-11 rounded-lg border text-sm', np.causa === k ? 'border-marca bg-blue-50' : 'border-slate-200')}>{CAUSAS_NP[k]}</button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Stepper etiqueta="Trabajadores" valor={np.trabajadores} onChange={(v) => setNp({ ...np, trabajadores: v })} max={cq.trabajadores} />
                    <Stepper etiqueta="Horas c/u" valor={np.horas} onChange={(v) => setNp({ ...np, horas: v })} max={10} paso={0.5} />
                  </div>
                  <button onClick={() => setNp(null)} className="mt-2 text-xs text-slate-500">Quitar</button>
                </>
              ) : <button onClick={() => setNp({ causa: 'espera_material', trabajadores: cq.trabajadores, horas: 1 })} className="w-full text-sm text-marca">+ Registrar HH no productivas (esperas, clima…)</button>}
            </div>
            <p className="tabular mt-3 text-sm text-slate-600">Total HH del día: <span className="font-semibold">{num(hhTotal, 1)}</span> · dotación {cq.trabajadores} trabajadores</p>
          </Card>

          <Card titulo="3 · Observaciones y restricciones">
            <textarea className={inputCls} rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej.: faltó bomba de hormigón en la tarde" />
          </Card>

          {advertencias.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{advertencias.map((a) => <p key={a}>⚠ {a}</p>)}</div>
          )}
          {msg && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}

          <div className="sticky bottom-0 -mx-4 flex gap-2 bg-slate-100/95 px-4 py-3 backdrop-blur">
            <Boton variante="secundario" className="h-14 flex-1" onClick={() => { guardar(armar('borrador')); setMsg('Borrador guardado en este dispositivo.') }}>Guardar borrador</Boton>
            <Boton className="h-14 flex-[2] text-base" onClick={() => { guardar(armar('enviado')); setMsg(navigator.onLine ? 'Reporte enviado. El jefe de terreno lo validará.' : 'Sin señal: guardado en el teléfono, se enviará al recuperar conexión.') }}>
              Enviar reporte
            </Boton>
          </div>
    </>
  )
}

function Stepper({ etiqueta, valor, onChange, max, paso = 1 }: { etiqueta: string; valor: number; onChange: (v: number) => void; max: number; paso?: number }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{etiqueta}</span>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white">
        <button className="h-12 w-11 text-xl text-slate-600" onClick={() => onChange(Math.max(0, valor - paso))} aria-label={`Menos ${etiqueta}`}>−</button>
        <span className="tabular flex-1 text-center text-lg font-semibold">{valor}</span>
        <button className="h-12 w-11 text-xl text-slate-600" onClick={() => onChange(Math.min(max, valor + paso))} aria-label={`Más ${etiqueta}`}>+</button>
      </div>
    </div>
  )
}

export function ResumenRDO({ r }: { r: RDO }) {
  const partidas = useStore((s) => s.partidas)
  const nombre = (id: string | null) => { const p = partidas.find((x) => x.id === id); return p ? `${p.codigo} ${p.descripcion}` : '—' }
  return (
    <div className="mt-3 space-y-1 text-sm">
      {r.avances.map((a) => {
        const h = r.hh.find((x) => x.partidaId === a.partidaId)
        const p = partidas.find((x) => x.id === a.partidaId)
        return <div key={a.partidaId} className="flex justify-between gap-2"><span>{nombre(a.partidaId)}</span><span className="tabular">{num(a.cantidad, 2)} {p?.unidad}{h && ` · ${num(hhDeRegistro(h), 1)} HH`}</span></div>
      })}
      {r.hh.filter((h) => h.causaNoProductiva).map((h, i) => <div key={i} className="flex justify-between text-amber-700"><span>No productivas: {CAUSAS_NP[h.causaNoProductiva!]}</span><span className="tabular">{num(hhDeRegistro(h), 1)} HH</span></div>)}
      {r.observaciones && <p className="text-slate-500">“{r.observaciones}”</p>}
    </div>
  )
}
