import { describe, expect, it } from 'vitest'
import { calcularObra, serieCurvaS } from './evm'
import { dia } from './fechas'
import {
  actividadesEnCurso, avanceElemento, capaDe, clasificar, elementosDe, estadoElementos, inferirModelo,
  interpolarSerie, leerPisos, lineaTiempo4D, pisosEnNombre, textoPisos,
} from './modelo4d'
import { generarDemo } from './seed'

const HOY = dia('2026-10-14')

describe('Modelo 4D: inferencia', () => {
  it('asigna capa y pisos según el nombre', () => {
    expect(capaDe('Estructura piso 3')).toBe('estructura')
    expect(capaDe('Instalación de faena')).toBeNull()
    expect(capaDe('Instalaciones eléctricas')).toBe('instalaciones')
    expect(capaDe('Excavación masiva')).toBe('terreno')
    expect(capaDe('Albañilería')).toBe('muros')
    expect(capaDe('Cielos modulares')).toBe('terminaciones')
    expect(pisosEnNombre('Estructura piso 5 y cubierta')).toEqual([5])
    expect(pisosEnNombre('Tabiques pisos 2 al 4')).toEqual([2, 3, 4])
    expect(pisosEnNombre('Pavimentos')).toEqual([])
  })

  it('infiere el edificio de la demo', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const acts = c.actualizado!.actividades
    const m = inferirModelo(acts)
    const enlace = (codigo: string) => m.enlaces.find((e) => e.actividadId === acts.find((a) => a.codigo === codigo)!.id)
    expect(m.pisos).toBe(5)
    expect(enlace('A06')).toMatchObject({ capa: 'estructura', pisos: [1] })
    expect(enlace('A11')).toMatchObject({ capa: 'muros', pisos: [1, 2, 3, 4, 5] })
    expect(enlace('A03')).toMatchObject({ capa: 'terreno', pisos: [0] })
    expect(enlace('A01')).toBeUndefined() // faena
    expect(enlace('H1')).toBeUndefined() // hito
  })

  it('lee y escribe listas de pisos', () => {
    expect(leerPisos('todos', 5)).toEqual([1, 2, 3, 4, 5])
    expect(leerPisos('1-3, 5', 5)).toEqual([1, 2, 3, 5])
    expect(leerPisos('7', 5)).toBeNull()
    expect(leerPisos('uno', 5)).toBeNull()
    expect(textoPisos([1, 2, 3, 5], 5)).toBe('1-3, 5')
    expect(textoPisos([1, 2, 3, 4, 5], 5)).toBe('todos')
    expect(textoPisos([0], 5)).toBe('terreno')
  })
})

describe('Modelo 4D: avance y estado', () => {
  it('reparte el avance de una actividad de abajo hacia arriba', () => {
    const m = { pisos: 4, largo: 10, ancho: 10, alturaPiso: 3, enlaces: [{ actividadId: 'X', capa: 'muros' as const, pisos: [1, 2, 3, 4] }] }
    const els = elementosDe(m, [{ id: 'X', codigo: 'X', nombre: 'Muros', duracion: 10, predecesoras: [], partidas: [], inicio: 0, fin: 10 }])
    const av = new Map([['X', 0.5]])
    expect(els.map((e) => avanceElemento(e, av))).toEqual([1, 1, 0, 0])
    av.set('X', 0.625)
    expect(avanceElemento(els[2], av)).toBeCloseTo(0.5)
  })

  it('clasifica según la desviación real − plan', () => {
    expect(clasificar(0, 0)).toBe('pendiente')
    expect(clasificar(0.5, 0.48)).toBe('al_dia')
    expect(clasificar(0.5, 0.4)).toBe('atrasado')
    expect(clasificar(0.5, 0.4, true)).toBe('critico')
    expect(clasificar(0.5, 0.2)).toBe('critico')
    expect(clasificar(0.8, 1)).toBe('terminado')
  })

  it('el avance real al corte coincide con el EVM y no usa fechas reales futuras', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const linea = lineaTiempo4D(d, c)
    for (const [id, v] of c.avanceAct) expect(linea.real(HOY).get(id)).toBe(v)
    // Al inicio de la obra nada está construido, aunque hoy haya actividades terminadas
    expect([...linea.real(c.obra.fechaInicio).values()].every((v) => v < 0.2)).toBe(true)
    // El avance real nunca retrocede en el tiempo
    for (const a of linea.actividades) {
      let prev = 0
      for (let t = c.obra.fechaInicio; t <= linea.fin; t += 3) {
        const v = linea.real(t).get(a.id) ?? 0
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = v
      }
    }
    // Al término proyectado todo está terminado
    expect([...linea.real(linea.fin).values()].every((v) => v >= 0.999)).toBe(true)
  })

  it('marca elementos atrasados en la demo y lista actividades en curso', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const linea = lineaTiempo4D(d, c)
    const els = elementosDe(inferirModelo(linea.actividades), linea.actividades)
    const estados = estadoElementos(els, linea, HOY, c)
    expect(estados.some((e) => e.estado === 'terminado')).toBe(true)
    expect(estados.some((e) => e.estado === 'atrasado' || e.estado === 'critico')).toBe(true)
    const enCurso = actividadesEnCurso(linea, HOY, c)
    expect(enCurso.length).toBeGreaterThan(0)
    expect(enCurso[0].real - enCurso[0].plan).toBeLessThanOrEqual(enCurso[enCurso.length - 1].real - enCurso[enCurso.length - 1].plan)
  })

  it('interpola la Curva S y no inventa avance real futuro', () => {
    const d = generarDemo(HOY)
    const c = calcularObra(d, 'obra_aromos', HOY)
    const serie = serieCurvaS(d, 'obra_aromos', HOY)
    const ini = c.obra.fechaInicio
    expect(interpolarSerie(serie, ini, ini - 1, 'avanceReal')).toBe(0)
    expect(interpolarSerie(serie, ini, HOY, 'avanceReal')).toBeCloseTo(c.avanceReal, 6)
    expect(interpolarSerie(serie, ini, HOY + 10, 'avanceReal')).toBeNull()
    expect(interpolarSerie(serie, ini, ini + c.obra.plazoDias + 30, 'avancePlan')).toBeCloseTo(1, 2)
  })
})
