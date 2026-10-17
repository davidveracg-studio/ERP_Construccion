import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Datos } from '../domain/datos'
import { calcularObra, type CalcObra } from '../domain/evm'
import { hoy } from '../domain/fechas'
import { semaforo, type CeldaSemaforo } from '../domain/semaforo'
import { useStore } from './store'

/** Datos del dominio con referencias estables (se recalcula solo si cambian). */
export function useDatosDominio(): Datos {
  const s = useStore(
    useShallow((s) => ({
      config: s.config, obras: s.obras, partidas: s.partidas, programas: s.programas, cuadrillas: s.cuadrillas,
      rdos: s.rdos, costos: s.costos, compromisos: s.compromisos, reglasMapeo: s.reglasMapeo, ajustes: s.ajustes,
      periodos: s.periodos, alertas: s.alertas, estadosPago: s.estadosPago,
    })),
  )
  return s
}

export function useCorte() {
  return useMemo(() => hoy(), [])
}

export function useCalc(obraId?: string, corte?: number): { d: Datos; c: CalcObra | null; sem: CeldaSemaforo[] } {
  const d = useDatosDominio()
  const actual = useStore((s) => s.ui.obraId)
  const id = obraId ?? actual
  const t = corte ?? hoy()
  const c = useMemo(() => {
    if (!d.obras.some((o) => o.id === id)) return null
    return calcularObra(d, id, t)
  }, [d, id, t])
  const sem = useMemo(() => (c ? semaforo(c, d.config) : []), [c, d.config])
  return { d, c, sem }
}

export function useObra() {
  const obraId = useStore((s) => s.ui.obraId)
  const obras = useStore((s) => s.obras)
  return obras.find((o) => o.id === obraId) ?? obras[0]
}
