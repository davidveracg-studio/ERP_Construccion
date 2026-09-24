// Importadores: itemizado + APU, Carta Gantt, costos reales, compromisos (RF-PRE-02, RF-PLA-05, RF-COS-01/04)
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Boton, Card, Titulo, cx, inputCls } from '../components/ui'
import { programaDe } from '../domain/datos'
import { mm, num } from '../domain/formato'
import { importarCompromisos, importarCostos, importarItemizado, importarPrograma, validarVinculos } from '../domain/importar'
import { puCosto } from '../domain/presupuesto'
import { useDatosDominio, useObra } from '../store/hooks'
import { useStore } from '../store/store'

type Tipo = 'costos' | 'itemizado' | 'programa' | 'compromisos'

const PLANTILLAS: Record<Tipo, string> = {
  itemizado: 'codigo\tdescripcion\tunidad\tcantidad\tpu\thh_unidad\tcosto_hh\tmat_cantidad\tmat_precio\tmat_unidad\teq_cantidad\teq_precio\tsub_precio\n1\tOBRAS PRELIMINARES\t\t\t\n1.1\tInstalación de faena\tgl\t1\t12.000.000\t\t\t\t\t\t\t\t9.500.000\n2\tOBRA GRUESA\t\t\t\n2.1\tHormigón H-25 fundaciones\tm3\t120\t118.000\t0,22\t9.500\t1,03\t92.000\tm3\n2.2\tMoldaje\tm2\t800\t12.500\t0,55\t9.500\t1\t4.200\tm2',
  programa: 'codigo\tnombre\tduracion\tpredecesoras\tpartidas\thito\tcontractual\nA1\tInstalación de faena\t10\t\t1.1\t\t\nA2\tFundaciones\t25\tA1\t2.1;2.2:300\t\t\nA3\tMuros piso 1\t15\tA2FC-3\t2.2:500\t\t\nH1\tTérmino obra gruesa\t0\tA3\tsi\tsi',
  costos: 'fecha\tcuenta\tcentro_costo\tdescripcion\tproveedor\tdocumento\tcantidad\tprecio\tmonto\n18-09-2026\t5-1-01\tLA-32\tHormigón H-30\tHormigones Sur Ltda.\tOC-1021\t42,5\t99.960\t4.248.300\n18-09-2026\t5-2-01\tLA-GG\tArriendo oficina de faena\t\t\t\t\t2.650.000\n18-09-2026\t5-1-99\tLA-GEN\tCompras varias\tFerretería Central\tF-8812\t\t\t380.000',
  compromisos: 'documento\tproveedor\tpartida\ttipo\tmonto\tdescripcion\nOC-2044\tMoldajes Pacífico\t3.4\tMAT\t18.500.000\tArriendo moldaje pisos 4-5',
}

const AYUDA: Record<Tipo, string> = {
  itemizado: 'Pega desde Excel el presupuesto adjudicado. Las filas sin cantidad se toman como títulos de capítulo. Las columnas del APU son opcionales (sin APU se estima el costo en 80% del PU).',
  programa: 'Una fila por actividad. Predecesoras: códigos separados por “;”, con tipo y desfase opcional (A2FC+2, A3CC-1). Partidas: “código:cantidad” separadas por “;” (sin cantidad = toda la partida). Duración 0 = hito.',
  costos: 'Exportación del libro de compras / mayor de costos de tu contabilidad. Se asigna partida y tipo por las reglas de mapeo (cuenta + centro de costo). Lo que no calce queda “sin imputar”.',
  compromisos: 'OC emitidas no recibidas y subcontratos firmados. El saldo pendiente se muestra como costo comprometido.',
}

export default function Importar() {
  const obra = useObra()
  const d = useDatosDominio()
  const { agregarCostos, reemplazarPartidas, cargarPrograma, agregarCompromisos } = useStore()
  const [tipo, setTipo] = useState<Tipo>('costos')
  const [texto, setTexto] = useState('')
  const [hecho, setHecho] = useState<string | null>(null)
  const partidas = d.partidas.filter((p) => p.obraId === obra.id)

  const res = useMemo(() => {
    if (!texto.trim()) return null
    switch (tipo) {
      case 'itemizado': return importarItemizado(texto, obra.id)
      case 'programa': return importarPrograma(texto, obra, partidas)
      case 'costos': return importarCostos(texto, obra, partidas, d.reglasMapeo, d.compromisos)
      case 'compromisos': return importarCompromisos(texto, obra, partidas)
    }
  }, [texto, tipo, obra, partidas, d.reglasMapeo, d.compromisos])

  const tieneDatos = d.rdos.some((r) => r.obraId === obra.id) || d.costos.some((k) => k.obraId === obra.id)
  const tienePrograma = !!programaDe(d, obra.id, 'lineaBase')

  const confirmar = () => {
    if (!res || res.items.length === 0) return
    if (tipo === 'itemizado') { reemplazarPartidas(obra.id, res.items as never); setHecho(`${res.items.length} partidas cargadas.`) }
    if (tipo === 'programa') { cargarPrograma(obra.id, res.items as never); setHecho(tienePrograma ? 'Programa cargado como nueva línea base pendiente de aprobación de Gerencia (ver Carta Gantt).' : `${res.items.length} actividades cargadas. Línea base aprobada.`) }
    if (tipo === 'costos') { agregarCostos(res.items as never); setHecho(`${res.items.length} costos importados.`) }
    if (tipo === 'compromisos') { agregarCompromisos(res.items as never); setHecho(`${res.items.length} compromisos importados.`) }
    setTexto('')
  }

  const leerArchivo = (f: File) => f.text().then(setTexto)

  return (
    <div className="max-w-5xl space-y-4">
      <Titulo sub={`Obra: ${obra.nombre}. Copia desde Excel y pega aquí (o sube un CSV). La primera fila son los encabezados.`}>Importar datos</Titulo>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['costos', 'Costos reales'], ['itemizado', 'Itemizado + APU'], ['programa', 'Carta Gantt'], ['compromisos', 'Compromisos']] as [Tipo, string][]).map(([k, n]) => (
          <button key={k} onClick={() => { setTipo(k); setTexto(''); setHecho(null) }} className={cx('-mb-px border-b-2 px-3 py-2 text-sm', tipo === k ? 'border-marca font-medium text-marca' : 'border-transparent text-slate-600')}>{n}</button>
        ))}
      </div>

      <Card>
        <p className="text-sm text-slate-600">{AYUDA[tipo]}</p>
        {tipo === 'itemizado' && tieneDatos && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Esta obra ya tiene avance o costos: reemplazar el itemizado desvincula los registros existentes. Úsalo solo en obras nuevas.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setTexto(PLANTILLAS[tipo])}>Cargar ejemplo</Boton>
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 text-sm">
            Subir CSV<input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
          </label>
        </div>
        <textarea className={cx(inputCls, 'mt-3 font-mono text-xs')} rows={10} value={texto} onChange={(e) => { setTexto(e.target.value); setHecho(null) }} placeholder="Pega aquí las celdas copiadas desde Excel…" />
      </Card>

      {res && (
        <Card titulo="Vista previa" accion={<Boton disabled={res.items.length === 0 || res.errores.length > 0 && res.items.length === 0} onClick={confirmar}>Importar {res.items.length} registro(s)</Boton>}>
          {res.errores.length > 0 && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{res.errores.map((e) => <p key={e}>✕ {e}</p>)}</div>}
          {res.avisos.length > 0 && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{res.avisos.map((e) => <p key={e}>⚠ {e}</p>)}</div>}
          {tipo === 'programa' && res.items.length > 0 && (
            <div className="mb-3 text-xs text-slate-500">{validarVinculos(res.items as never, partidas).map((v) => <p key={v}>• {v}</p>)}</div>
          )}
          <div className="max-h-80 overflow-auto">
            <Vista tipo={tipo} items={res.items} partidas={partidas} />
          </div>
        </Card>
      )}
      {hecho && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ {hecho} {tipo === 'costos' && <Link to="/costos" className="underline">Ver control de costos</Link>}{tipo === 'programa' && <Link to="/programa" className="underline">Ver Carta Gantt</Link>}
        </p>
      )}

      <Card titulo="Reglas de mapeo contable de esta obra">
        <p className="mb-2 text-xs text-slate-500">Se crean al imputar costos manualmente (“Recordar regla”) y se reutilizan en cada importación semanal.</p>
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">Cuenta</th><th className="font-medium">Centro de costo</th><th className="font-medium">Partida</th><th className="font-medium">Tipo</th></tr></thead>
            <tbody>
              {d.reglasMapeo.filter((r) => r.obraId === obra.id).map((r) => {
                const p = partidas.find((x) => x.id === r.partidaId)
                return <tr key={r.id} className="border-t border-slate-100"><td className="py-1">{r.cuenta ?? '*'}</td><td>{r.centroCosto ?? '*'}</td><td>{p ? `${p.codigo} ${p.descripcion}` : 'Gastos generales'}</td><td><Badge>{r.tipo}</Badge></td></tr>
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Vista({ tipo, items, partidas }: { tipo: Tipo; items: unknown[]; partidas: { id: string; codigo: string; descripcion: string }[] }) {
  const nombre = (id: string | null) => { const p = partidas.find((x) => x.id === id); return p ? `${p.codigo} ${p.descripcion}` : '' }
  if (tipo === 'itemizado')
    return <table className="tabular w-full text-xs"><tbody>{(items as import('../domain/types').Partida[]).map((p) => (
      <tr key={p.id} className="border-b border-slate-100"><td className="py-1">{p.capitulo}</td><td>{p.codigo}</td><td>{p.descripcion}</td><td className="text-right">{num(p.cantidad, 2)} {p.unidad}</td><td className="text-right">PU {mm(p.puVenta)}</td><td className="text-right">costo {mm(puCosto(p))}</td><td>{p.recursos.map((r) => r.tipo).join(', ')}</td></tr>
    ))}</tbody></table>
  if (tipo === 'programa')
    return <table className="w-full text-xs"><tbody>{(items as import('../domain/types').Actividad[]).map((a) => (
      <tr key={a.id} className="border-b border-slate-100"><td className="py-1">{a.codigo}</td><td>{a.nombre}</td><td className="text-right">{a.duracion} d</td><td>{a.predecesoras.length} pred.</td><td>{a.partidas.length} partidas</td><td>{a.esHito && 'hito'}{a.hitoContractual && ' contractual'}</td></tr>
    ))}</tbody></table>
  if (tipo === 'costos')
    return <table className="tabular w-full text-xs"><tbody>{(items as import('../domain/types').CostoReal[]).map((k) => (
      <tr key={k.id} className="border-b border-slate-100"><td className="py-1">{k.descripcion}</td><td>{k.proveedor}</td><td className="text-right">{mm(k.monto)}</td><td>{k.tipo === 'GG' ? 'Gastos generales' : k.partidaId ? nombre(k.partidaId) : <span className="text-amber-700">sin imputar</span>}</td><td>{k.tipo}</td></tr>
    ))}</tbody></table>
  return <table className="tabular w-full text-xs"><tbody>{(items as import('../domain/types').Compromiso[]).map((k) => (
    <tr key={k.id} className="border-b border-slate-100"><td className="py-1">{k.documento}</td><td>{k.proveedor}</td><td>{nombre(k.partidaId)}</td><td className="text-right">{mm(k.monto)}</td></tr>
  ))}</tbody></table>
}
