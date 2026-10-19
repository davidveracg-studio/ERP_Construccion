// Comparación de fechas en el modelo 4D (avance del período) y exportación como imagen. Lo usan la
// simulación 4D, el informe semanal y el portal del mandante.
import { useMemo, useRef } from 'react'
import Vista4D, { COLOR_PERIODO, type ModeloBim, type Visor4D } from './Vista4D'
import { Boton } from './ui'
import { agruparIfc, reagruparPorActividad } from '../domain/bim'
import type { Datos } from '../domain/datos'
import { serieCurvaS, type CalcObra } from '../domain/evm'
import { fmtFecha } from '../domain/fechas'
import { pct, pp } from '../domain/formato'
import { elementosDe, estadoElementos, interpolarSerie, lineaTiempo4D, modeloDe } from '../domain/modelo4d'
import { useGeometriaIfc } from '../ifc/cargar'

/** Modelo 4D de la obra listo para dibujar (paramétrico o BIM con su detalle por tarea). */
export function useModelo4D(d: Datos, c: CalcObra | null | undefined) {
  const acts = c?.actualizado?.actividades
  const linea = useMemo(() => (c ? lineaTiempo4D(d, c) : null), [d, c])
  const modelo = useMemo(() => (c && acts ? modeloDe(c.obra, acts) : null), [c, acts])
  const carga = useGeometriaIfc(modelo?.ifc?.ruta)
  const geo = carga.estado === 'listo' ? carga.geo : null
  const bim = useMemo<ModeloBim | null>(() => (geo && modelo ? { geo, grupos: reagruparPorActividad(agruparIfc(geo.niveles, geo.elementos), modelo.enlaces) } : null), [geo, modelo])
  const elementos = useMemo(() => (modelo && linea ? elementosDe(modelo, linea.actividades, bim?.grupos) : []), [modelo, linea, bim])
  return { linea, modelo, bim, elementos, carga }
}

/** Avance de la obra en dos fechas según la Curva S (el real solo existe hasta el corte). */
export function avancePeriodo(d: Datos, c: CalcObra, desde: number, hasta: number) {
  const serie = serieCurvaS(d, c.obra.id, c.corte)
  const ini = c.obra.fechaInicio
  const real = (t: number) => interpolarSerie(serie, ini, Math.min(t, c.corte), 'avanceReal') ?? 0
  return { a: real(desde), b: real(hasta), planB: interpolarSerie(serie, ini, hasta, 'avancePlan') ?? 0 }
}

/**
 * Imagen para informes: encabezado (obra y fechas), la vista 3D, la leyenda y las cifras del período.
 * Devuelve un PNG (data URL).
 */
export async function componerImagen(captura: string, titulo: string, subtitulo: string, leyenda: { color: string; texto: string; borde?: boolean }[], cifras: string[]) {
  const img = new Image()
  img.src = captura
  await img.decode()
  const escala = Math.max(1, 1200 / img.width)
  const W = Math.round(img.width * escala)
  const H3 = Math.round(img.height * escala)
  const cab = 78
  const pie = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = cab + H3 + pie
  const g = canvas.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, canvas.height)
  g.fillStyle = '#0f172a'
  g.font = '600 26px system-ui, sans-serif'
  g.fillText(titulo, 24, 36)
  g.fillStyle = '#475569'
  g.font = '18px system-ui, sans-serif'
  g.fillText(subtitulo, 24, 62)
  g.drawImage(img, 0, cab, W, H3)
  let x = 24
  const y = cab + H3 + 26
  g.font = '16px system-ui, sans-serif'
  for (const l of leyenda) {
    g.fillStyle = l.color
    if (l.borde) { g.strokeStyle = l.color; g.setLineDash([4, 3]); g.strokeRect(x, y - 12, 16, 16); g.setLineDash([]) } else g.fillRect(x, y - 12, 16, 16)
    g.fillStyle = '#334155'
    g.fillText(l.texto, x + 22, y + 1)
    x += 30 + g.measureText(l.texto).width
  }
  g.fillStyle = '#0f172a'
  g.font = '600 16px system-ui, sans-serif'
  g.fillText(cifras.join('   ·   '), 24, y + 28)
  g.fillStyle = '#94a3b8'
  g.font = '13px system-ui, sans-serif'
  const marca = 'VPAI · Control de gestión de obras'
  g.fillText(marca, W - 24 - g.measureText(marca).width, y + 28)
  return canvas.toDataURL('image/png')
}

export function descargarImagen(dataUrl: string, nombre: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nombre
  a.click()
}

export const LEYENDA_PERIODO = (desde: number) => [
  { color: '#a8a29e', texto: `Construido al ${fmtFecha(desde)}` },
  { color: COLOR_PERIODO, texto: 'Avance del período' },
  { color: '#64748b', texto: 'Planificado sin ejecutar', borde: true },
]

/** Vista de comparación (informe semanal, portal del mandante): avance entre dos fechas. */
export default function Comparacion4D({ d, c, desde, hasta, alto = 'h-80', titulo }: { d: Datos; c: CalcObra; desde: number; hasta: number; alto?: string; titulo: string }) {
  const { linea, modelo, bim, elementos, carga } = useModelo4D(d, c)
  const visor = useRef<Visor4D | null>(null)
  const estados = useMemo(() => (linea ? estadoElementos(elementos, linea, hasta, c) : []), [elementos, linea, hasta, c])
  const estadosA = useMemo(() => (linea ? estadoElementos(elementos, linea, desde, c) : []), [elementos, linea, desde, c])
  if (!linea || !modelo || !linea.actividades.length || !elementos.length) return <p className="text-sm text-slate-500">La obra no tiene modelo 4D (falta la Carta Gantt).</p>
  const av = avancePeriodo(d, c, desde, hasta)
  const cifras = [`Avance ${pct(av.a, 0)} → ${pct(av.b, 0)} (${pp(av.b - av.a)})`, `Planificado al ${fmtFecha(hasta)}: ${pct(av.planB, 0)}`]
  const descargar = async () => {
    const cap = visor.current?.captura()
    if (!cap) return
    descargarImagen(await componerImagen(cap, `${c.obra.nombre} · ${titulo}`, `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`, LEYENDA_PERIODO(desde), cifras), `avance-4d-${c.obra.nombre.toLowerCase().replace(/\s+/g, '-')}-${fmtFecha(hasta)}.png`)
  }
  return (
    <div>
      <div className={`relative ${alto} overflow-hidden rounded-lg bg-slate-100`}>
        {modelo.ifc && carga.estado === 'cargando'
          ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando modelo BIM… {pct(carga.progreso, 0)}</div>
          : <Vista4D modelo={modelo} bim={bim} estados={estados} modo="realista" girar={false} desde={estadosA} visor={visor} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {LEYENDA_PERIODO(desde).map((l) => <span key={l.texto} className="flex items-center gap-1.5"><span className={l.borde ? 'h-3 w-3 rounded-sm border border-dashed border-slate-500' : 'h-3 w-3 rounded-sm'} style={l.borde ? undefined : { background: l.color }} />{l.texto}</span>)}
        <span className="tabular font-medium text-slate-800">{cifras[0]}</span>
        <Boton variante="secundario" className="no-print ml-auto min-h-0 py-1 text-xs" onClick={descargar}>Descargar imagen</Boton>
      </div>
    </div>
  )
}
