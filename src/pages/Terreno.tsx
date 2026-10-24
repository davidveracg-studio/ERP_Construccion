// Jefe de terreno: validación de RDO y rendimientos por cuadrilla (07 Workspace R03)
import { useState } from 'react'
import { BarrasRendimiento } from '../components/graficos'
import { Badge, Boton, Card, Kpi, Modal, Titulo, Vacio, inputCls } from '../components/ui'
import { hhDeRegistro, rendimientosPorCuadrilla } from '../domain/evm'
import { fmtFecha } from '../domain/fechas'
import { num, pct } from '../domain/formato'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { ResumenRDO } from './RDO'
import { ayudaKpi, ek } from '../store/umbralesUI'

export default function Terreno() {
  const { d, c } = useCalc()
  const { validarRDO, rechazarRDO } = useStore()
  const [rechazo, setRechazo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  if (!c) return null
  const pendientes = d.rdos.filter((r) => r.obraId === c.obra.id && r.estado === 'enviado').sort((a, b) => a.fecha - b.fecha)
  const rend = rendimientosPorCuadrilla(d, c.obra.id, c.corte - 13, c.corte).filter((r) => r.rendReal != null)
  const cuad = (id: string) => d.cuadrillas.find((q) => q.id === id)?.nombre ?? id

  return (
    <div className="space-y-4">
      <Titulo sub="Valida avance y HH de los capataces: solo lo validado alimenta el valor ganado y los rendimientos">Validación y rendimientos</Titulo>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="RDO por validar" valor={pendientes.length} estado={pendientes.length > 5 ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Cumplimiento de RDO (7 días)" valor={c.cumplimientoRDO != null ? pct(c.cumplimientoRDO, 0) : '—'} estado={ek('KPR-05', c.cumplimientoRDO)} ayuda={ayudaKpi('KPR-05')}
          sub={c.diasSinRDO.length ? `sin RDO: ${c.diasSinRDO.map(fmtFecha).join(', ')}` : 'todos los días hábiles con RDO'} />
        <Kpi etiqueta="HH no productivas" valor={pct(c.hhTotal ? c.hhNoProd / c.hhTotal : 0)} sub={`${num(c.hhNoProd)} HH acumuladas`} estado={ek('KPR-09', c.hhTotal ? c.hhNoProd / c.hhTotal : null)} ayuda={ayudaKpi('KPR-09')} />
        <Kpi etiqueta="HH extraordinarias" valor={pct(c.hhTotal ? c.hhExtra / c.hhTotal : 0)} estado={ek('KPR-08', c.hhTotal ? c.hhExtra / c.hhTotal : null)} ayuda={ayudaKpi('KPR-08')} />
      </div>

      <Card titulo={`Reportes por validar (${pendientes.length})`}>
        {pendientes.length === 0 ? <Vacio titulo="Todo validado" texto="Cuando los capataces envíen su reporte diario aparecerá aquí." /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {pendientes.map((r) => {
              const hh = r.hh.reduce((s, h) => s + hhDeRegistro(h), 0)
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fmtFecha(r.fecha)} · {cuad(r.cuadrillaId)}</span>
                    <Badge tono="azul">{r.clima}</Badge>
                    <span className="tabular ml-auto text-sm text-slate-600">{num(hh, 1)} HH</span>
                  </div>
                  <ResumenRDO r={r} />
                  <div className="mt-3 flex gap-2">
                    <Boton className="flex-1" onClick={() => validarRDO(r.id)}>✓ Validar</Boton>
                    <Boton variante="secundario" onClick={() => { setRechazo(r.id); setMotivo('') }}>Devolver</Boton>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {pendientes.length > 1 && <Boton variante="fantasma" className="mt-3" onClick={() => pendientes.forEach((r) => validarRDO(r.id))}>Validar todos ({pendientes.length})</Boton>}
      </Card>

      <Card titulo="Rendimiento de MO por cuadrilla y partida · últimas 2 semanas">
        {rend.length === 0 ? <p className="text-sm text-slate-500">Sin HH validadas en el período.</p> : (
          <BarrasRendimiento items={rend.map((r) => ({ etiqueta: `${cuad(r.cuadrillaId)} · ${r.partida?.codigo} ${r.partida?.descripcion}`, real: r.rendReal!, pres: r.rendPres!, unidad: r.partida?.unidad ?? 'u' }))} />
        )}
      </Card>

      <Modal abierto={!!rechazo} titulo="Devolver reporte al capataz" onCerrar={() => setRechazo(null)}>
        <textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo: ej. la cantidad de moldaje no coincide con lo medido" />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setRechazo(null)}>Cancelar</Boton>
          <Boton disabled={!motivo.trim()} onClick={() => { rechazarRDO(rechazo!, motivo.trim()); setRechazo(null) }}>Devolver</Boton>
        </div>
      </Modal>
    </div>
  )
}
