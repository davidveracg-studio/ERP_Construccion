// Libro de Obra digital (v1.1, 08 Folio de Libro de Obra, RN-P03): folios numerados, fechados,
// firmados e inmutables. El ITO (R11) firma como mandante; el administrador y el jefe de terreno,
// como contratista. Las instrucciones y observaciones del ITO esperan respuesta (RULE-902).
import { useState } from 'react'
import { Badge, Boton, Campo, Card, Kpi, Modal, Titulo, Vacio, cx, inputCls } from '../components/ui'
import { emisorFolio, folioPendiente, respuestaDe, TIPOS_FOLIO } from '../domain/documental'
import { dia, fmtFecha, hoy } from '../domain/fechas'
import type { Folio, TipoFolio } from '../domain/types'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'

export default function LibroObra() {
  const { d, c } = useCalc()
  const rol = useStore((s) => s.ui.rol)
  const [nuevo, setNuevo] = useState<null | { respondeA?: Folio }>(null)
  if (!c) return null
  const t = hoy()
  const folios = d.folios.filter((f) => f.obraId === c.obra.id && f.fecha <= t).sort((a, b) => b.numero - a.numero)
  const emisor = emisorFolio(rol)
  const pendientes = folios.map((f) => ({ f, p: folioPendiente(f, folios, t, d.config.diasHabiles) })).filter((x) => x.p)
  const vencidos = pendientes.filter((x) => x.p!.vencido).length

  return (
    <div className="space-y-4">
      <Titulo sub={`${c.obra.nombre} · folios numerados, fechados, firmados e inmutables`}
        accion={emisor ? <Boton onClick={() => setNuevo({})}>Nuevo folio</Boton> : undefined}>
        Libro de Obra
      </Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi etiqueta="Folios" valor={folios.length} sub={folios[0] ? `último el ${fmtFecha(folios[0].fecha)}` : undefined} />
        <Kpi etiqueta="Esperan respuesta" valor={pendientes.length} sub="instrucciones y observaciones del ITO" estado={vencidos ? 'amarillo' : 'verde'} />
        <Kpi etiqueta="Fuera de plazo" valor={vencidos} sub="RULE-902" estado={vencidos ? 'amarillo' : 'verde'} />
      </div>

      <Card>
        {folios.length === 0 ? <Vacio titulo="Libro sin folios" texto="El primer folio suele dejar constancia del inicio de las obras." /> : (
          <ol className="divide-y divide-slate-100">
            {folios.map((f) => {
              const p = folioPendiente(f, folios, t, d.config.diasHabiles)
              const resp = respuestaDe(f, folios, t)
              const original = f.respondeA ? folios.find((x) => x.id === f.respondeA) : undefined
              return (
                <li key={f.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">Folio N° {f.numero}</span>
                    <span className="text-slate-500">{fmtFecha(f.fecha)}</span>
                    <Badge tono={f.emisor === 'mandante' ? 'azul' : 'gris'}>{TIPOS_FOLIO[f.tipo]}</Badge>
                    {original && <span className="text-xs text-slate-500">responde al folio N° {original.numero}</span>}
                    {p && <Badge tono={p.vencido ? 'rojo' : 'ambar'}>{p.vencido ? `Sin respuesta desde ${fmtFecha(p.limite)}` : `Responder hasta ${fmtFecha(p.limite)}`}</Badge>}
                    {resp && <Badge tono="verde">Respondido en folio N° {resp.numero}</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{f.texto}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Firma: {f.autor} ({f.emisor === 'mandante' ? 'mandante / ITO' : 'contratista'})</span>
                    {p && emisor === 'contratista' && <button className="text-sm text-marca hover:underline" onClick={() => setNuevo({ respondeA: f })}>Responder</button>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
      {nuevo && emisor && <NuevoFolio obraId={c.obra.id} emisor={emisor} respondeA={nuevo.respondeA} onCerrar={() => setNuevo(null)} />}
    </div>
  )
}

function NuevoFolio({ obraId, emisor, respondeA, onCerrar }: { obraId: string; emisor: Folio['emisor']; respondeA?: Folio; onCerrar: () => void }) {
  const registrar = useStore((s) => s.registrarFolio)
  const usuario = useStore((s) => s.ui.usuario)
  const tipos: TipoFolio[] = respondeA ? ['respuesta'] : emisor === 'mandante' ? ['instruccion', 'observacion', 'comunicacion'] : ['comunicacion', 'observacion']
  const [tipo, setTipo] = useState<TipoFolio>(tipos[0])
  const [texto, setTexto] = useState('')
  const [plazo, setPlazo] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal abierto titulo={respondeA ? `Responder folio N° ${respondeA.numero}` : 'Nuevo folio'} onCerrar={onCerrar}>
      {respondeA && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{respondeA.texto}</p>}
      <div className="space-y-3">
        {tipos.length > 1 && (
          <Campo etiqueta="Tipo">
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoFolio)}>{tipos.map((k) => <option key={k} value={k}>{TIPOS_FOLIO[k]}</option>)}</select>
          </Campo>
        )}
        <Campo etiqueta="Anotación"><textarea rows={4} className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
        {emisor === 'mandante' && (tipo === 'instruccion' || tipo === 'observacion') && (
          <Campo etiqueta="Plazo de respuesta (opcional)" ayuda="Si no se indica, son 3 días hábiles."><input type="date" className={inputCls} value={plazo} onChange={(e) => setPlazo(e.target.value)} /></Campo>
        )}
      </div>
      <p className={cx('mt-3 text-xs text-slate-500')}>Firmará {usuario} el {fmtFecha(hoy())}. Un folio registrado no se puede editar ni borrar; para corregirlo se agrega otro folio.</p>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={() => {
          const err = registrar({ obraId, tipo, texto, plazoRespuesta: plazo ? dia(plazo) : undefined, respondeA: respondeA?.id })
          if (err) setError(err)
          else onCerrar()
        }}>Firmar y registrar</Boton>
      </div>
    </Modal>
  )
}
