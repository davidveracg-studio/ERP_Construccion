// Alertas con responsable y acción correctiva (10 §28, 12 §Formato estándar)
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertaCard, ESTADO_ALERTA } from '../components/AlertaCard'
import { Badge, BadgeSeveridad, Boton, Campo, Card, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { dia, fmtFecha, hoy, iso } from '../domain/fechas'
import { NOMBRES_REGLA } from '../domain/reglas'
import type { EstadoAccion, Severidad } from '../domain/types'
import { useStore } from '../store/store'

const ORDEN: Severidad[] = ['critica', 'alta', 'media', 'baja']

export default function Alertas() {
  const obraId = useStore((s) => s.ui.obraId)
  const alertas = useStore((s) => s.alertas)
  const [filtro, setFiltro] = useState<'abiertas' | 'resueltas' | 'todas'>('abiertas')
  const lista = alertas
    .filter((a) => a.obraId === obraId)
    .filter((a) => filtro === 'todas' || (filtro === 'abiertas' ? ['activa', 'reconocida', 'en_accion'].includes(a.estado) : ['resuelta', 'descartada'].includes(a.estado)))
    .sort((a, b) => ORDEN.indexOf(a.severidad) - ORDEN.indexOf(b.severidad) || b.actualizadaEnPeriodo - a.actualizadaEnPeriodo)
  return (
    <div className="space-y-4">
      <Titulo sub="Generadas por el motor de reglas al cerrar cada período semanal. Toda alerta tiene un responsable y se cierra con acción o con motivo."
        accion={<div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(['abiertas', 'resueltas', 'todas'] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={cx('rounded-md px-3 py-1.5 capitalize', filtro === f ? 'bg-slate-800 text-white' : 'text-slate-600')}>{f}</button>
          ))}
        </div>}>Alertas y acciones</Titulo>
      {lista.length === 0 ? <Vacio titulo="Sin alertas" texto="No hay alertas en este filtro. Se generan al cerrar el período de control." /> : (
        <div className="grid gap-3 xl:grid-cols-2">{lista.map((a) => <AlertaCard key={a.id} a={a} />)}</div>
      )}
    </div>
  )
}

const ESTADOS_ACC: Record<EstadoAccion, [string, 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo']> = {
  pendiente: ['Pendiente', 'gris'], en_curso: ['En curso', 'azul'], completada: ['Completada (por verificar)', 'ambar'],
  verificada_efectiva: ['Efectiva ✓', 'verde'], verificada_inefectiva: ['Inefectiva', 'rojo'], cancelada: ['Cancelada', 'gris'],
}

export function AlertaDetalle() {
  const { id } = useParams()
  const a = useStore((s) => s.alertas.find((x) => x.id === id))
  const ui = useStore((s) => s.ui)
  const { reconocerAlerta, descartarAlerta, agregarAccion, cambiarEstadoAccion } = useStore()
  const [modal, setModal] = useState<'accion' | 'descartar' | null>(null)
  const [desc, setDesc] = useState('')
  const [resp, setResp] = useState('')
  const [fecha, setFecha] = useState(iso(hoy() + 7))
  const [esperado, setEsperado] = useState('')
  const [motivo, setMotivo] = useState('')
  if (!a) return <Vacio titulo="Alerta no encontrada" texto="Puede haber sido eliminada al reiniciar la demo." accion={<Link to="/alertas" className="text-marca">Volver</Link>} />
  const abierta = ['activa', 'reconocida', 'en_accion'].includes(a.estado)
  const puedeDescartar = a.severidad !== 'critica' || ui.rol === 'R01' || ui.rol === 'R02'

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/alertas" className="text-sm text-marca">← Alertas</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeSeveridad s={a.severidad} />
          <Badge tono={ESTADO_ALERTA[a.estado][1]}>{ESTADO_ALERTA[a.estado][0]}</Badge>
          <span className="text-xs text-slate-500">{a.regla} · {NOMBRES_REGLA[a.regla]} · período {a.periodo}{a.actualizadaEnPeriodo !== a.periodo && ` (actualizada en ${a.actualizadaEnPeriodo})`}</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold">{a.titulo}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
          {a.datos.map((d) => (
            <div key={d.etiqueta} className="flex justify-between gap-4 border-b border-slate-200/60 pb-1">
              <dt className="text-slate-500">{d.etiqueta}</dt><dd className="tabular font-medium">{d.valor}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 space-y-2 text-sm">
          <p><span className="font-semibold">¿Por qué?</span> {a.porQue}</p>
          {a.queProvoca && <p><span className="font-semibold">¿Qué la provoca?</span> {a.queProvoca}</p>}
          {a.queExplica && <p><span className="font-semibold">¿Qué la explica?</span> {a.queExplica}</p>}
          <p className="rounded-lg border-l-4 border-marca bg-blue-50 px-3 py-2"><span className="font-semibold">Acción requerida:</span> {a.accionRequerida}</p>
          <p className="text-slate-600">Responsable: <span className="font-medium">{a.responsable}</span> · creada {fmtFecha(a.creadaEn)}</p>
          {a.motivoDescarte && <p className="text-slate-600">Descartada: {a.motivoDescarte}</p>}
        </div>
        {abierta && (
          <div className="mt-4 flex flex-wrap gap-2">
            {a.estado === 'activa' && <Boton variante="secundario" onClick={() => reconocerAlerta(a.id)}>Reconocer</Boton>}
            <Boton onClick={() => { setResp(a.responsable); setModal('accion') }}>Registrar acción correctiva</Boton>
            <Boton variante="fantasma" disabled={!puedeDescartar} onClick={() => setModal('descartar')} title={puedeDescartar ? '' : 'Las alertas críticas solo las descarta Gerencia o el Administrador de Obra (RN-P12)'}>Descartar</Boton>
          </div>
        )}
      </Card>

      <Card titulo={`Acciones correctivas (${a.acciones.length})`}>
        {a.acciones.length === 0 ? <p className="text-sm text-slate-500">Aún no hay acciones. Una alerta crítica no se cierra sin acción o motivo de descarte.</p> : (
          <div className="space-y-3">
            {a.acciones.map((x) => (
              <div key={x.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{x.descripcion}</span>
                  <Badge tono={ESTADOS_ACC[x.estado][1]}>{ESTADOS_ACC[x.estado][0]}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {x.responsable} · comprometida al {fmtFecha(x.fechaCompromiso)}
                  {x.valorEsperado != null && ` · efecto esperado: ${a.kpi?.startsWith('rend') ? `${x.valorEsperado.toFixed(3)} HH/u` : x.valorEsperado.toFixed(2)} (base ${x.valorBase?.toFixed(3) ?? '—'})`}
                </p>
                {['pendiente', 'en_curso'].includes(x.estado) && (
                  <div className="mt-2 flex gap-2">
                    {x.estado === 'pendiente' && <Boton variante="secundario" className="min-h-8 px-3 text-xs" onClick={() => cambiarEstadoAccion(a.id, x.id, 'en_curso')}>Iniciar</Boton>}
                    <Boton variante="secundario" className="min-h-8 px-3 text-xs" onClick={() => cambiarEstadoAccion(a.id, x.id, 'completada')}>Marcar completada</Boton>
                    <Boton variante="fantasma" className="min-h-8 px-3 text-xs" onClick={() => cambiarEstadoAccion(a.id, x.id, 'cancelada')}>Cancelar</Boton>
                  </div>
                )}
                {x.estado === 'completada' && <p className="mt-2 text-xs text-slate-500">Se verificará automáticamente en los próximos 2 cierres semanales si el indicador alcanza el efecto esperado.</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal abierto={modal === 'accion'} titulo="Registrar acción correctiva" onCerrar={() => setModal(null)}>
        <div className="space-y-3">
          <Campo etiqueta="Acción"><textarea className={inputCls} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej.: reforzar supervisión del vaciado y reorganizar la cuadrilla en dos frentes" /></Campo>
          <Campo etiqueta="Responsable"><input className={inputCls} value={resp} onChange={(e) => setResp(e.target.value)} /></Campo>
          <Campo etiqueta="Fecha comprometida"><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          {a.kpi && (
            <Campo etiqueta={`Efecto esperado en el indicador (${a.kpi.split(':')[0].toUpperCase()}), valor actual ${a.valorKpi?.toFixed(3) ?? '—'}`} ayuda="Con este valor el sistema verifica si la acción fue efectiva.">
              <input className={inputCls} inputMode="decimal" value={esperado} onChange={(e) => setEsperado(e.target.value)} placeholder={a.valorKpi != null ? (a.valorKpi * (a.kpi.startsWith('rend') || a.kpi.startsWith('hito') || a.kpi.startsWith('act') ? 0.85 : 1.05)).toFixed(3) : ''} />
            </Campo>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
            <Boton disabled={!desc.trim()} onClick={() => {
              const ev = Number(esperado.replace(',', '.'))
              const menor = a.kpi?.startsWith('rend') || a.kpi?.startsWith('hito') || a.kpi?.startsWith('act')
              agregarAccion(a.id, {
                descripcion: desc.trim(), responsable: resp, fechaCompromiso: dia(fecha),
                kpi: a.kpi, valorBase: a.valorKpi, valorEsperado: esperado && isFinite(ev) ? ev : undefined, mejorSiMenor: !!menor,
              })
              setDesc(''); setEsperado(''); setModal(null)
            }}>Guardar</Boton>
          </div>
        </div>
      </Modal>

      <Modal abierto={modal === 'descartar'} titulo="Descartar alerta" onCerrar={() => setModal(null)}>
        <Campo etiqueta="Motivo (obligatorio)"><textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: falso positivo, dato erróneo ya corregido" /></Campo>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
          <Boton variante="peligro" disabled={!motivo.trim()} onClick={() => { descartarAlerta(a.id, motivo.trim()); setModal(null) }}>Descartar</Boton>
        </div>
      </Modal>
    </div>
  )
}
