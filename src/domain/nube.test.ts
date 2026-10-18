import { describe, expect, it } from 'vitest'
import { COLECCIONES } from './datos'
import { hoy } from './fechas'
import { generarDemo } from './seed'

describe('demo para la nube', () => {
  it('ids únicos por colección (clave primaria empresa_id + id) y obraId en cada documento', () => {
    const d = generarDemo(hoy())
    for (const c of COLECCIONES) {
      const ids = (d[c] as { id: string }[]).map((x) => x.id)
      expect(new Set(ids).size, c).toBe(ids.length)
      // Proveedores y materiales son de la empresa (obra_id nulo en la tabla)
      if (!['obras', 'proveedores', 'materiales'].includes(c)) for (const x of d[c] as { obraId?: string }[]) expect(x.obraId, c).toBeTruthy()
    }
    const resumen = COLECCIONES.map((c) => `${c}:${(d[c] as unknown[]).length}/${Math.round(JSON.stringify(d[c]).length / 1024)}KB`)
    console.log(resumen.join(' '))
  })
})
