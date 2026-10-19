import { describe, expect, it } from 'vitest'
import { origenElemento, reagruparPorActividad, type AgrupacionIfc } from './bim'
import { aplicaAlPiso } from './bimContexto'
import { avanceElemento, elementosDe } from './modelo4d'
import type { Actividad, Modelo4D } from './types'

const agr: AgrupacionIfc = {
  niveles: [], pisos: 2, sinCapa: 0,
  grupos: new Map([['estructura|1', [1, 2, 3, 4]], ['estructura|2', [5, 6]], ['muros|1', [7, 8]]]),
  claveDe: new Map([[1, 'estructura|1'], [2, 'estructura|1'], [3, 'estructura|1'], [4, 'estructura|1'], [5, 'estructura|2'], [6, 'estructura|2'], [7, 'muros|1'], [8, 'muros|1']]),
}
const act = (id: string, nombre: string): Actividad => ({ id, codigo: id, nombre, duracion: 10, predecesoras: [], partidas: [], inicio: 0, fin: 10 })

describe('Detalle por tarea en el modelo BIM', () => {
  it('los elementos asignados salen de su grupo capa|piso y forman el de la actividad', () => {
    const r = reagruparPorActividad(agr, [{ actividadId: 'A1', capa: 'estructura', pisos: [1], elementos: [3, 4] }])
    expect(r.grupos.get('estructura|1')).toEqual([1, 2])
    expect(r.grupos.get('act|A1')).toEqual([3, 4])
    expect(r.claveDe.get(3)).toBe('act|A1')
    // El origen (capa y piso de la regla automática) se conserva para filtrar y etiquetar
    expect(origenElemento(r, 3)).toEqual({ capa: 'estructura', piso: 1 })
    // Sin asignaciones no cambia nada
    expect(reagruparPorActividad(agr, [{ actividadId: 'A1', capa: 'estructura', pisos: [1] }])).toBe(agr)
  })

  it('los elementos asignados avanzan solo con su actividad; el resto sigue la regla (sin huérfanos); sin IFC, todo por regla', () => {
    const modelo: Modelo4D = {
      pisos: 2, largo: 20, ancho: 10, alturaPiso: 3,
      enlaces: [
        { actividadId: 'A1', capa: 'estructura', pisos: [1], elementos: [3, 4] },
        { actividadId: 'A2', capa: 'estructura', pisos: [1, 2] },
      ],
    }
    const acts = [act('A1', 'Losa piso 1 ejes A-D'), act('A2', 'Estructura')]
    const r = reagruparPorActividad(agr, modelo.enlaces)
    const conBim = elementosDe(modelo, acts, r)
    const a1 = conBim.find((e) => e.clave === 'act|A1')!
    expect(a1).toMatchObject({ capa: 'estructura', piso: 1, actividad: 'A1' })
    expect(avanceElemento(a1, new Map([['A1', 0.5]]))).toBe(0.5)
    // El resto del grupo estructura|1 sigue con A1 y A2 por la regla de capa y piso
    expect(conBim.find((e) => e.clave === 'estructura|1')!.aportes.map((x) => x.actividadId)).toEqual(['A1', 'A2'])
    const sinBim = elementosDe(modelo, acts)
    expect(sinBim.find((e) => e.clave === 'estructura|1')!.aportes.map((x) => x.actividadId)).toEqual(['A1', 'A2'])
  })

  it('la ficha relaciona registros por el piso que menciona su ubicación', () => {
    expect(aplicaAlPiso('Estructura piso 3', 3)).toBe(true)
    expect(aplicaAlPiso('Losa piso 2', 3)).toBe(false)
    expect(aplicaAlPiso('Albañilería', 3)).toBe(true)
    expect(aplicaAlPiso('Pisos 1 al 4', 3)).toBe(true)
  })
})
