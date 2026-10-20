// Animación de entrada de los gráficos: el progreso p va de 0 a 1 en `ms` milisegundos y
// arranca cuando el gráfico aparece en pantalla. Con "reducir movimiento" queda en 1 de inmediato.
import { useCallback, useEffect, useRef, useState } from 'react'

const quieto = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useProgreso<T extends Element>(ms: number, clave: unknown = null) {
  const ref = useRef<T | null>(null)
  const [p, setP] = useState(() => (quieto() ? 1 : 0))
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (quieto()) { setP(1); return }
    setP(0)
    let frame = 0
    let inicio = 0
    const tick = (ahora: number) => {
      if (!inicio) inicio = ahora
      const v = Math.min(1, (ahora - inicio) / ms)
      setP(v)
      if (v < 1) frame = requestAnimationFrame(tick)
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame) }
    const io = new IntersectionObserver((entradas) => {
      if (entradas[entradas.length - 1].isIntersecting && !frame) { frame = requestAnimationFrame(tick); io.disconnect() }
    }, { threshold: 0.25 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(frame) }
  }, [ms, clave, vuelta])
  const repetir = useCallback(() => setVuelta((v) => v + 1), [])
  return { ref, p, repetir }
}

/** Suavizado estándar (entra y sale despacio). */
export const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
