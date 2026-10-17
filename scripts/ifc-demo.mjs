// Genera el modelo BIM de ejemplo del Edificio Los Aromos (IFC4, sin dependencias):
// nivel de fundaciones + 5 pisos de 24 × 16 m con losas por paño, pilares, vigas, muros,
// ventanas, puertas, cielos, instalaciones y cubierta. Lo usan la demo y los tests.
//   node scripts/ifc-demo.mjs   → escribe public/demo/edificio-los-aromos.ifc
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function generarIfcDemo({ pisos = 5, altura = 2.6 } = {}) {
  const lineas = []
  let n = 0
  const e = (s) => { lineas.push(`#${++n}=${s};`); return `#${n}` }
  const f = (x) => { const r = Math.round(x * 1000) / 1000; return Number.isInteger(r) ? `${r}.` : `${r}` }
  // STEP solo admite ASCII: el resto va como \X2\HHHH\X0\ (UTF-16)
  const esc = (t) => t.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
  let g = 0
  const guid = () => { let x = ++g; let s = ''; for (let i = 0; i < 22; i++) { s = B64[x % 64] + s; x = Math.floor(x / 64) } return `'${s}'` }

  const origen = e('IFCCARTESIANPOINT((0.,0.,0.))')
  const dirZ = e('IFCDIRECTION((0.,0.,1.))')
  const dirX = e('IFCDIRECTION((1.,0.,0.))')
  const eje0 = e(`IFCAXIS2PLACEMENT3D(${origen},${dirZ},${dirX})`)
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${eje0},$)`)
  const body = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`)
  const unidades = e(`IFCUNITASSIGNMENT((${[
    e('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), e('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    e('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), e('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ].join(',')}))`)
  const proyecto = e(`IFCPROJECT(${guid()},$,'Edificio Los Aromos',$,$,$,$,(${ctx}),${unidades})`)
  const plSitio = e(`IFCLOCALPLACEMENT($,${eje0})`)
  const sitio = e(`IFCSITE(${guid()},$,'Terreno',$,$,${plSitio},$,$,.ELEMENT.,$,$,$,$,$)`)
  const plEdif = e(`IFCLOCALPLACEMENT(${plSitio},${eje0})`)
  const edificio = e(`IFCBUILDING(${guid()},$,'Edificio Los Aromos',$,$,${plEdif},$,$,.ELEMENT.,$,$,$)`)
  e(`IFCRELAGGREGATES(${guid()},$,$,$,${proyecto},(${sitio}))`)
  e(`IFCRELAGGREGATES(${guid()},$,$,$,${sitio},(${edificio}))`)

  const estilos = new Map()
  const estilo = ([r, gg, b, t = 0]) => {
    const k = `${r},${gg},${b},${t}`
    if (!estilos.has(k)) {
      const c = e(`IFCCOLOURRGB($,${f(r)},${f(gg)},${f(b)})`)
      const sh = e(`IFCSURFACESTYLESHADING(${c},${f(t)})`)
      estilos.set(k, e(`IFCSURFACESTYLE($,.BOTH.,(${sh}))`))
    }
    return estilos.get(k)
  }

  const niveles = []
  const nivel = (nombre, elev) => {
    const p = e(`IFCCARTESIANPOINT((0.,0.,${f(elev)}))`)
    const pl = e(`IFCLOCALPLACEMENT(${plEdif},${e(`IFCAXIS2PLACEMENT3D(${p},$,$)`)})`)
    const id = e(`IFCBUILDINGSTOREY(${guid()},$,'${esc(nombre)}',$,$,${pl},$,$,.ELEMENT.,${f(elev)})`)
    const nv = { id, pl, elementos: [] }
    niveles.push(nv)
    return nv
  }

  /** Caja extruida en Z con esquina mínima (x, y, z) relativa al nivel. */
  const caja = (nv, clase, nombre, [x, y, z], [dx, dy, dz], color, extra) => {
    const p = e(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`)
    const pl = e(`IFCLOCALPLACEMENT(${nv.pl},${e(`IFCAXIS2PLACEMENT3D(${p},$,$)`)})`)
    const perfil = e(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${e(`IFCAXIS2PLACEMENT2D(${e(`IFCCARTESIANPOINT((${f(dx / 2)},${f(dy / 2)}))`)},$)`)},${f(dx)},${f(dy)})`)
    const solido = e(`IFCEXTRUDEDAREASOLID(${perfil},${eje0},${dirZ},${f(dz)})`)
    e(`IFCSTYLEDITEM(${solido},(${estilo(color)}),$)`)
    const rep = e(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solido}))`)
    const pds = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`)
    nv.elementos.push(e(`${clase}(${guid()},$,'${esc(nombre)}',$,$,${pl},${pds},$,${extra})`))
  }

  const HORMIGON = [0.75, 0.74, 0.72]
  const PILAR = [0.66, 0.66, 0.67]
  const MURO = [0.87, 0.83, 0.77]
  const VIDRIO = [0.55, 0.76, 0.92, 0.5]
  const PUERTA = [0.55, 0.36, 0.22]
  const CIELO = [0.95, 0.95, 0.94]
  const CANERIA = [0.2, 0.45, 0.85]
  const DUCTO = [0.62, 0.64, 0.68]
  const BARANDA = [0.3, 0.31, 0.33]

  const X = [0, 6, 12, 18, 24]
  const Y = [0, 8, 16]
  const cX = [0.2, 6, 12, 18, 23.8]
  const cY = [0.2, 8, 15.8]
  const H = altura
  const LOSA = 0.2

  // Fundaciones: zapatas bajo cada pilar
  const fund = nivel('Fundaciones', -1.2)
  cX.forEach((x, i) => cY.forEach((y, j) => caja(fund, 'IFCFOOTING', `Zapata Z${i + 1}${j + 1}`, [x - 0.8, y - 0.8, 0], [1.6, 1.6, 0.6], HORMIGON, '.PAD_FOOTING.')))

  for (let k = 1; k <= pisos; k++) {
    const nv = nivel(`Piso ${k}`, (k - 1) * H)
    // Losa por paños
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++)
      caja(nv, 'IFCSLAB', `Losa P${k} paño ${i + 1}${j + 1}`, [X[i], Y[j], 0], [6, 8, LOSA], HORMIGON, '.FLOOR.')
    // Pilares y vigas
    cX.forEach((x, i) => cY.forEach((y, j) => caja(nv, 'IFCCOLUMN', `Pilar C${i + 1}${j + 1}`, [x - 0.2, y - 0.2, LOSA], [0.4, 0.4, H - LOSA], PILAR, '.COLUMN.')))
    cY.forEach((y, j) => { for (let i = 0; i < 4; i++) caja(nv, 'IFCBEAM', `Viga VX${j + 1}${i + 1}`, [cX[i], y - 0.125, H - 0.5], [cX[i + 1] - cX[i], 0.25, 0.5], PILAR, '.BEAM.') })
    cX.forEach((x, i) => { for (let j = 0; j < 2; j++) caja(nv, 'IFCBEAM', `Viga VY${i + 1}${j + 1}`, [x - 0.125, cY[j], H - 0.5], [0.25, cY[j + 1] - cY[j], 0.5], PILAR, '.BEAM.') })
    // Muros perimetrales con una ventana por vano
    const alto = H - 0.5 - LOSA
    for (let i = 0; i < 4; i++) {
      const [a, b] = [cX[i] + 0.2, cX[i + 1] - 0.2]
      const mitad = (a + b) / 2
      caja(nv, 'IFCWALL', `Muro fachada sur ${i + 1}`, [a, 0.1, LOSA], [b - a, 0.2, alto], MURO, '.STANDARD.')
      caja(nv, 'IFCWALL', `Muro fachada norte ${i + 1}`, [a, 15.7, LOSA], [b - a, 0.2, alto], MURO, '.STANDARD.')
      caja(nv, 'IFCWINDOW', `Ventana sur ${i + 1}`, [mitad - 1.2, 0.03, 0.9], [2.4, 0.06, 1.2], VIDRIO, '1.2,2.4,.WINDOW.,$,$')
      caja(nv, 'IFCWINDOW', `Ventana norte ${i + 1}`, [mitad - 1.2, 15.91, 0.9], [2.4, 0.06, 1.2], VIDRIO, '1.2,2.4,.WINDOW.,$,$')
    }
    for (let j = 0; j < 2; j++) {
      const [a, b] = [cY[j] + 0.2, cY[j + 1] - 0.2]
      const mitad = (a + b) / 2
      caja(nv, 'IFCWALL', `Muro fachada oeste ${j + 1}`, [0.1, a, LOSA], [0.2, b - a, alto], MURO, '.STANDARD.')
      caja(nv, 'IFCWALL', `Muro fachada este ${j + 1}`, [23.7, a, LOSA], [0.2, b - a, alto], MURO, '.STANDARD.')
      caja(nv, 'IFCWINDOW', `Ventana oeste ${j + 1}`, [0.03, mitad - 1.2, 0.9], [0.06, 2.4, 1.2], VIDRIO, '1.2,2.4,.WINDOW.,$,$')
      caja(nv, 'IFCWINDOW', `Ventana este ${j + 1}`, [23.91, mitad - 1.2, 0.9], [0.06, 2.4, 1.2], VIDRIO, '1.2,2.4,.WINDOW.,$,$')
    }
    // Tabiques del pasillo central, puertas, cielo e instalaciones
    for (let i = 0; i < 4; i++) {
      caja(nv, 'IFCWALL', `Tabique pasillo A${i + 1}`, [cX[i] + 0.3, 7.0, LOSA], [5.4, 0.1, alto], MURO, '.PARTITIONING.')
      caja(nv, 'IFCWALL', `Tabique pasillo B${i + 1}`, [cX[i] + 0.3, 8.9, LOSA], [5.4, 0.1, alto], MURO, '.PARTITIONING.')
    }
    caja(nv, 'IFCDOOR', `Puerta P${k}-1`, [4.5, 6.97, LOSA], [0.9, 0.16, 2.0], PUERTA, '2.,0.9,.DOOR.,$,$')
    caja(nv, 'IFCDOOR', `Puerta P${k}-2`, [16.5, 8.87, LOSA], [0.9, 0.16, 2.0], PUERTA, '2.,0.9,.DOOR.,$,$')
    caja(nv, 'IFCCOVERING', `Cielo P${k} oeste`, [0.4, 0.4, H - 0.55], [11.6, 15.2, 0.02], CIELO, '.CEILING.')
    caja(nv, 'IFCCOVERING', `Cielo P${k} este`, [12, 0.4, H - 0.55], [11.6, 15.2, 0.02], CIELO, '.CEILING.')
    caja(nv, 'IFCPIPESEGMENT', `Bajada agua P${k}`, [11.3, 7.5, 0], [0.15, 0.15, H], CANERIA, '.RIGIDSEGMENT.')
    caja(nv, 'IFCPIPESEGMENT', `Alcantarillado P${k}`, [12.6, 7.5, 0], [0.18, 0.18, H], CANERIA, '.RIGIDSEGMENT.')
    caja(nv, 'IFCDUCTSEGMENT', `Ducto clima P${k}`, [2, 7.75, H - 0.85], [20, 0.5, 0.25], DUCTO, '.RIGIDSEGMENT.')
    // Cubierta sobre el último piso
    if (k === pisos) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++)
        caja(nv, 'IFCSLAB', `Losa cubierta paño ${i + 1}${j + 1}`, [X[i], Y[j], H], [6, 8, LOSA], HORMIGON, '.ROOF.')
      caja(nv, 'IFCRAILING', 'Baranda cubierta sur', [0, 0, H + LOSA], [24, 0.1, 1], BARANDA, '.GUARDRAIL.')
      caja(nv, 'IFCRAILING', 'Baranda cubierta norte', [0, 15.9, H + LOSA], [24, 0.1, 1], BARANDA, '.GUARDRAIL.')
      caja(nv, 'IFCRAILING', 'Baranda cubierta oeste', [0, 0.1, H + LOSA], [0.1, 15.8, 1], BARANDA, '.GUARDRAIL.')
      caja(nv, 'IFCRAILING', 'Baranda cubierta este', [23.9, 0.1, H + LOSA], [0.1, 15.8, 1], BARANDA, '.GUARDRAIL.')
    }
  }

  e(`IFCRELAGGREGATES(${guid()},$,$,$,${edificio},(${niveles.map((v) => v.id).join(',')}))`)
  for (const v of niveles) e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},$,$,$,(${v.elementos.join(',')}),${v.id})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('edificio-los-aromos.ifc','2026-10-17T00:00:00',('VPAI'),('VPAI'),'VPAI generador IFC demo','VPAI','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lineas,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destino = new URL('../public/demo/edificio-los-aromos.ifc', import.meta.url)
  writeFileSync(destino, generarIfcDemo())
  console.log(`Escrito ${fileURLToPath(destino)}`)
}
