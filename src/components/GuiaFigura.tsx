// Botón "¿Cómo se lee?" que abre una figura explicativa (public/figuras, kit anatomy) en un modal.
import { useState } from 'react'
import { Boton, Modal } from './ui'

export type Figura = 'obra-4d' | 'curva-s' | 'ruta-critica' | 'caja' | 'health-score' | 'montecarlo' | 'last-planner'

export default function GuiaFigura({ figura, titulo, texto, etiqueta = '¿Cómo se lee?' }: { figura: Figura; titulo: string; texto: string; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false)
  const url = `${import.meta.env.BASE_URL}figuras/${figura}-light.html`
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>{etiqueta}</Boton>
      <Modal abierto={abierto} titulo={titulo} onCerrar={() => setAbierto(false)} ancho="sm:max-w-4xl">
        <p className="mb-3 text-sm text-slate-600">{texto}</p>
        {abierto && <iframe title={`Figura: ${titulo}`} src={url} className="h-[70vh] w-full rounded-lg border border-slate-200" />}
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-marca">Abrir en una pestaña</a>
      </Modal>
    </>
  )
}
