// Lee el IFC fuera del hilo principal: un modelo grande no congela la pantalla.
import { IfcAPI } from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import { extraerIfc } from './extraer'

let api: Promise<IfcAPI> | null = null
const iniciar = () =>
  (api ??= (async () => {
    const a = new IfcAPI()
    // Un solo hilo: la versión multihilo exige SharedArrayBuffer (cabeceras COOP/COEP)
    await a.Init(() => wasmUrl, true)
    return a
  })())

self.onmessage = async (ev: MessageEvent<{ id: number; bytes: Uint8Array }>) => {
  const { id, bytes } = ev.data
  try {
    const geo = extraerIfc(await iniciar(), bytes, (progreso) => self.postMessage({ id, progreso }))
    const transfer = geo.mallas.flatMap((m) => [m.posiciones.buffer, m.normales.buffer, m.colores.buffer, m.indices.buffer])
    self.postMessage({ id, geo }, { transfer })
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
