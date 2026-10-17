import { beforeAll, describe, expect, it } from 'vitest'
import { IfcAPI } from 'web-ifc'
// @ts-expect-error módulo JS del generador (sin tipos)
import { generarIfcDemo } from '../../scripts/ifc-demo.mjs'
import { agruparIfc, capaIfc, elementosConstruidos } from '../domain/bim'
import { generarDemo } from '../domain/seed'
import { extraerIfc, type GeometriaIfc } from './extraer'

let geo: GeometriaIfc

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  geo = extraerIfc(api, new TextEncoder().encode(generarIfcDemo() as string))
})

describe('BIM: clases IFC → capas', () => {
  it('asigna capas por clase', () => {
    expect(capaIfc('IFCFOOTING')).toBe('fundaciones')
    expect(capaIfc('IFCSLABSTANDARDCASE')).toBe('estructura')
    expect(capaIfc('IFCSTAIRFLIGHT')).toBe('estructura')
    expect(capaIfc('IFCWALLSTANDARDCASE')).toBe('muros')
    expect(capaIfc('IFCCURTAINWALL')).toBe('muros')
    expect(capaIfc('IFCWINDOW')).toBe('terminaciones')
    expect(capaIfc('IFCPIPESEGMENT')).toBe('instalaciones')
    expect(capaIfc('IFCFLOWTERMINAL')).toBe('instalaciones')
    expect(capaIfc('IFCSPACE')).toBeNull()
    expect(capaIfc('IFCBUILDINGELEMENTPROXY')).toBeNull()
  })

  it('reparte el avance entre los elementos de un grupo', () => {
    expect(elementosConstruidos(10, 0)).toBe(0)
    expect(elementosConstruidos(10, 0.34)).toBe(3)
    expect(elementosConstruidos(10, 1)).toBe(10)
    expect(elementosConstruidos(1, 0.6)).toBe(1)
  })
})

describe('BIM: lectura del IFC de ejemplo', () => {
  it('rechaza archivos que no son IFC con un mensaje claro', async () => {
    const api = new IfcAPI()
    await api.Init()
    expect(() => extraerIfc(api, new TextEncoder().encode('esto no es un IFC'))).toThrow(/no parece un IFC válido/)
  })

  it('lee niveles, elementos y nombres con tildes', () => {
    expect(geo.schema).toBe('IFC4')
    expect(geo.niveles.map((n) => n.nombre)).toEqual(['Fundaciones', 'Piso 1', 'Piso 2', 'Piso 3', 'Piso 4', 'Piso 5'])
    expect(geo.niveles.find((n) => n.nombre === 'Piso 2')!.elevacion).toBeCloseTo(2.6)
    expect(geo.elementos).toHaveLength(447)
    expect(geo.mallas).toHaveLength(447)
    expect(geo.elementos.some((e) => e.nombre === 'Losa P1 paño 11')).toBe(true)
  })

  it('numera pisos (las fundaciones van al nivel de terreno) y agrupa por capa', () => {
    const g = agruparIfc(geo.niveles, geo.elementos)
    expect(g.pisos).toBe(5)
    expect(g.niveles.map((n) => n.piso)).toEqual([0, 1, 2, 3, 4, 5])
    expect(g.grupos.get('fundaciones|0')).toHaveLength(15)
    expect(g.grupos.get('estructura|1')).toHaveLength(45)
    expect(g.grupos.get('estructura|5')).toHaveLength(53) // + losa de cubierta
    expect(g.grupos.get('muros|3')).toHaveLength(20)
    expect(g.grupos.get('terminaciones|1')).toHaveLength(16)
    expect(g.grupos.get('instalaciones|2')).toHaveLength(3)
    expect(g.sinCapa).toBe(0)
    // Orden constructivo: primero la losa, al final las vigas
    const porId = new Map(geo.elementos.map((e) => [e.id, e]))
    const est = g.grupos.get('estructura|1')!.map((id) => porId.get(id)!.tipo)
    expect(est[0]).toBe('IFCSLAB')
    expect(est[est.length - 1]).toBe('IFCBEAM')
  })

  it('coincide con los niveles que la demo guarda para el Edificio Los Aromos', () => {
    const aromos = generarDemo(20_000).obras.find((o) => o.id === 'obra_aromos')!
    expect(aromos.modelo4d?.ifc?.niveles).toEqual(agruparIfc(geo.niveles, geo.elementos).niveles)
    expect(aromos.modelo4d?.pisos).toBe(5)
  })

  it('entrega la geometría con Y hacia arriba, centrada y con el primer piso en y = 0', () => {
    const losa1 = geo.elementos.find((e) => e.nombre === 'Losa P1 paño 11')!
    const pilar2 = geo.elementos.find((e) => e.nombre === 'Pilar C11' && e.min[1] > 1)!
    expect(losa1.min[1]).toBeCloseTo(0, 3)
    expect(losa1.max[1]).toBeCloseTo(0.2, 3)
    expect(pilar2.min[1]).toBeCloseTo(2.8, 3)
    // Planta de 24 × 16 m más 0,6 m de zapatas por lado
    expect(geo.min[0]).toBeCloseTo(-12.6, 1)
    expect(geo.max[0]).toBeCloseTo(12.6, 1)
    expect(geo.max[2] - geo.min[2]).toBeCloseTo(17.2, 1)
    expect(geo.max[1]).toBeCloseTo(5 * 2.6 + 0.2 + 1, 1) // cubierta + baranda
    expect(geo.min[1]).toBeCloseTo(-1.2, 1) // zapatas
  })
})
