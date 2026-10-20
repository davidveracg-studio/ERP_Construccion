// Elementos temporales y de faena del visor 4D: lo que se ve en una obra real y cambia con el avance.
// Alzaprimas y moldaje bajo la losa del piso en curso, barandas de borde, andamio de fachada que sube
// con la estructura, grúa torre en celosía y la instalación de faena (oficinas, cierre, acopios).
// Las piezas repetidas son InstancedMesh: cientos de piezas en pocas llamadas de dibujo.
import * as THREE from 'three'

export interface Huella { x0: number; x1: number; z0: number; z1: number }
/** Cota de piso (base) y altura de cada piso 1..n. */
export interface Niveles { base: (p: number) => number; alto: (p: number) => number; pisos: number }

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra })

/** Instancias de una caja: posiciones de la esquina mínima y tamaño común. */
function cajas(lista: [number, number, number][], tam: [number, number, number], m: THREE.Material, sombra = true) {
  const g = new THREE.BoxGeometry(tam[0], tam[1], tam[2]).translate(tam[0] / 2, tam[1] / 2, tam[2] / 2)
  const im = new THREE.InstancedMesh(g, m, Math.max(1, lista.length))
  const o = new THREE.Object3D()
  lista.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix) })
  im.count = lista.length
  im.castShadow = sombra
  im.receiveShadow = true
  return im
}

/** Cilindros verticales instanciados (base en y). */
function postes(lista: [number, number, number][], r: number, h: number, m: THREE.Material) {
  const g = new THREE.CylinderGeometry(r, r, h, 8).translate(0, h / 2, 0)
  const im = new THREE.InstancedMesh(g, m, Math.max(1, lista.length))
  const o = new THREE.Object3D()
  lista.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix) })
  im.count = lista.length
  im.castShadow = true
  return im
}

const rango = (a: number, b: number, paso: number) => { const n = Math.max(1, Math.round((b - a) / paso)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n) }

export interface ObraTemporal {
  grupo: THREE.Group
  /** Muestra lo que corresponde al estado: piso en curso, altura alcanzada y si la obra está en terminaciones. */
  actualizar: (s: { enCurso: number | null; alcanzado: number; terminada: boolean; visible: boolean }) => void
  materiales: THREE.Material[]
}

export function construirObraTemporal(h: Huella, nv: Niveles): ObraTemporal {
  const grupo = new THREE.Group()
  const mAcero = mat('#9ca3af', { metalness: 0.4, roughness: 0.5 })
  // Moldaje algo translúcido: deja ver el estado (plan vs real) de la losa que se está ejecutando
  const mMoldaje = mat('#b7834d', { roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false })
  const mBaranda = mat('#eab308', { roughness: 0.6 })
  const mTabla = mat('#a16207', { roughness: 0.9 })
  const mTubo = mat('#94a3b8', { metalness: 0.5, roughness: 0.45 })
  const materiales: THREE.Material[] = [mAcero, mMoldaje, mBaranda, mTabla, mTubo]

  // --- Alzaprimas y moldaje por piso (bajo la losa que se hormigona) ---
  const porPiso: { alz: THREE.Object3D; bar: THREE.Object3D }[] = []
  const xs = rango(h.x0 + 0.7, h.x1 - 0.7, 1.4)
  const zs = rango(h.z0 + 0.7, h.z1 - 0.7, 1.4)
  for (let p = 1; p <= nv.pisos; p++) {
    const y0 = nv.base(p)
    const H = nv.alto(p)
    const alz = new THREE.Group()
    const altoPuntal = Math.max(0.5, H - 0.42)
    alz.add(postes(xs.flatMap((x) => zs.map((z) => [x, y0 + 0.02, z] as [number, number, number])), 0.035, altoPuntal, mAcero))
    // Vigas de moldaje (dirección x) y tableros sobre ellas
    alz.add(cajas(zs.map((z) => [h.x0 + 0.5, y0 + altoPuntal, z - 0.06] as [number, number, number]), [h.x1 - h.x0 - 1, 0.14, 0.12], mTabla))
    alz.add(cajas([[h.x0 + 0.4, y0 + altoPuntal + 0.14, h.z0 + 0.4]], [h.x1 - h.x0 - 0.8, 0.05, h.z1 - h.z0 - 0.8], mMoldaje, false))
    // Barandas de borde en el nivel de la losa superior: postes cada ~2 m y dos pasamanos
    const bar = new THREE.Group()
    const yb = y0 + H + 0.22
    const borde: [number, number, number][] = []
    for (const x of rango(h.x0, h.x1, 2)) borde.push([x, yb, h.z0], [x, yb, h.z1])
    for (const z of rango(h.z0, h.z1, 2)) borde.push([h.x0, yb, z], [h.x1, yb, z])
    bar.add(postes(borde, 0.03, 1.0, mBaranda))
    for (const yy of [0.5, 0.98]) {
      bar.add(cajas([[h.x0, yb + yy, h.z0 - 0.02], [h.x0, yb + yy, h.z1 - 0.02]], [h.x1 - h.x0, 0.04, 0.04], mBaranda))
      bar.add(cajas([[h.x0 - 0.02, yb + yy, h.z0], [h.x1 - 0.02, yb + yy, h.z0]], [0.04, 0.04, h.z1 - h.z0], mBaranda))
    }
    alz.visible = false
    bar.visible = false
    grupo.add(alz, bar)
    porPiso.push({ alz, bar })
  }

  // --- Andamio de fachada (frente z1): cuerpos de 2 m que suben con la estructura ---
  const cuerpos: { y: number; o: THREE.Object3D }[] = []
  const zf = h.z1 + 0.35
  const zi = zf + 0.9
  const xa = rango(h.x0 + 0.5, h.x1 - 0.5, 2.5)
  const top = nv.base(nv.pisos) + nv.alto(nv.pisos) + 1
  for (let y = 0; y < top; y += 2) {
    const c = new THREE.Group()
    c.add(postes(xa.flatMap((x) => [[x, y, zf], [x, y, zi]] as [number, number, number][]), 0.03, 2, mTubo))
    c.add(cajas([[xa[0], y + 1.95, zf - 0.03], [xa[0], y + 1.95, zi - 0.03]], [xa[xa.length - 1] - xa[0], 0.05, 0.05], mTubo))
    c.add(cajas([[xa[0], y + 1.9, zf + 0.05]], [xa[xa.length - 1] - xa[0], 0.04, 0.8], mTabla, false))
    // Diagonal de arriostramiento en cada vano alterno
    const diag: [number, number, number][] = []
    xa.slice(0, -1).forEach((x, i) => { if (i % 2 === 0) diag.push([x, y, zi]) })
    const gd = new THREE.BoxGeometry(0.04, 3.2, 0.04)
    const md = new THREE.InstancedMesh(gd, mTubo, Math.max(1, diag.length))
    const o = new THREE.Object3D()
    const paso = xa[1] - xa[0]
    diag.forEach(([x, yy, z], i) => { o.position.set(x + paso / 2, yy + 1, z); o.rotation.set(0, 0, Math.atan2(paso, 2)); o.updateMatrix(); md.setMatrixAt(i, o.matrix) })
    md.count = diag.length
    c.add(md)
    c.visible = false
    grupo.add(c)
    cuerpos.push({ y, o: c })
  }

  // --- Instalación de faena (fija) ---
  const faena = construirFaena(h)
  grupo.add(faena.grupo)
  materiales.push(...faena.materiales)

  return {
    grupo, materiales,
    actualizar: ({ enCurso, alcanzado, terminada, visible }) => {
      porPiso.forEach(({ alz, bar }, i) => { const p = i + 1; alz.visible = visible && enCurso === p; bar.visible = visible && enCurso === p })
      // El andamio llega a la altura alcanzada por la estructura y se retira cuando la obra termina
      for (const c of cuerpos) c.o.visible = visible && !terminada && alcanzado > 0 && c.y < alcanzado
      faena.grupo.visible = true
    },
  }
}

/** Oficinas en contenedores, bodega, baño químico, acopio de fierro y pallets, y cierre perimetral. */
function construirFaena(h: Huella) {
  const grupo = new THREE.Group()
  const mCont = mat('#e2e8f0', { roughness: 0.6 })
  const mCont2 = mat('#93c5fd', { roughness: 0.6 })
  const mVentana = mat('#1e3a5f', { roughness: 0.2, metalness: 0.3 })
  const mBano = mat('#2563eb')
  const mFierro = mat('#7c2d12', { metalness: 0.5, roughness: 0.5 })
  const mPallet = mat('#a16207', { roughness: 0.95 })
  const mBloque = mat('#a8a29e')
  const mMalla = new THREE.MeshStandardMaterial({ color: '#166534', transparent: true, opacity: 0.35, roughness: 1, depthWrite: false })
  const mPoste = mat('#64748b')
  const materiales: THREE.Material[] = [mCont, mCont2, mVentana, mBano, mFierro, mPallet, mBloque, mMalla, mPoste]
  // Oficinas: dos contenedores de 6 × 2,4 × 2,6 m, uno sobre otro, con ventanas y puerta
  const xo = h.x1 + 3.5
  const zo = h.z0 - 1
  grupo.add(cajas([[xo, 0, zo]], [2.4, 2.6, 6], mCont))
  grupo.add(cajas([[xo, 2.62, zo + 0.5]], [2.4, 2.6, 6], mCont2))
  grupo.add(cajas([[xo - 0.02, 1.0, zo + 0.8], [xo - 0.02, 1.0, zo + 3.6], [xo - 0.02, 3.6, zo + 1.3], [xo - 0.02, 3.6, zo + 4.1]], [0.04, 0.9, 1.4], mVentana, false))
  grupo.add(cajas([[xo - 0.02, 0, zo + 2.4]], [0.04, 2.1, 0.9], mVentana, false))
  // Escalera de acceso al contenedor superior (peldaños)
  grupo.add(cajas(Array.from({ length: 9 }, (_, i) => [xo - 1.2, 0.29 * i, zo + 6.2 + 0.25 * i] as [number, number, number]).slice(0, 9), [1, 0.06, 0.28], mPoste))
  // Baño químico y bodega de materiales
  grupo.add(cajas([[xo + 0.2, 0, zo + 8.5], [xo + 1.4, 0, zo + 8.5]], [1.1, 2.3, 1.1], mBano))
  grupo.add(cajas([[h.x0 - 7.5, 0, h.z1 - 5]], [3, 2.6, 5], mCont2))
  // Acopio de fierro: barras sobre durmientes
  const barras: [number, number, number][] = []
  for (let capa = 0; capa < 3; capa++) for (let i = 0; i < 9 - capa; i++) barras.push([h.x0 - 7.6 + i * 0.14 + capa * 0.07, 0.18 + capa * 0.12, h.z0 - 1])
  const gb = new THREE.CylinderGeometry(0.05, 0.05, 9, 6).rotateX(Math.PI / 2).translate(0, 0, 4.5)
  const ib = new THREE.InstancedMesh(gb, mFierro, barras.length)
  const o = new THREE.Object3D()
  barras.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); ib.setMatrixAt(i, o.matrix) })
  ib.castShadow = true
  grupo.add(ib, cajas([[h.x0 - 7.8, 0, h.z0 - 0.8], [h.x0 - 7.8, 0, h.z0 + 3.6], [h.x0 - 7.8, 0, h.z0 + 7.6]], [1.6, 0.12, 0.2], mPallet))
  // Pallets de bloques
  const pallets: [number, number, number][] = [[h.x0 - 4.2, 0, h.z0 - 3.6], [h.x0 - 2.8, 0, h.z0 - 3.6], [h.x0 - 4.2, 0, h.z0 - 2.2]]
  grupo.add(cajas(pallets, [1.2, 0.14, 1.2], mPallet), cajas(pallets.map(([x, , z]) => [x + 0.1, 0.14, z + 0.1] as [number, number, number]), [1, 0.8, 1], mBloque))
  // Cierre perimetral: postes cada 3 m con malla
  const x0 = h.x0 - 9.5, x1 = h.x1 + 9.5, z0 = h.z0 - 9.5, z1 = h.z1 + 9.5
  const pts: [number, number, number][] = []
  for (const x of rango(x0, x1, 3)) pts.push([x, 0, z0], [x, 0, z1])
  for (const z of rango(z0, z1, 3)) pts.push([x0, 0, z], [x1, 0, z])
  grupo.add(postes(pts, 0.05, 2, mPoste))
  // Malla del cierre, con un portón abierto al frente para el acceso de camiones
  const ancho = x1 - x0
  grupo.add(cajas([[x0, 0.05, z0 - 0.01], [x0, 0.05, z1 - 0.01]], [ancho, 1.9, 0.02], mMalla, false))
  grupo.add(cajas([[x0 - 0.01, 0.05, z0], [x1 - 0.01, 0.05, z0]], [0.02, 1.9, z1 - z0], mMalla, false))
  return { grupo, materiales }
}

/** Grúa torre en celosía: mástil, pluma y contrapluma con cordones y diagonales, cabina, carro y gancho. */
export function construirGrua(alto: number, largoPluma: number) {
  const g = new THREE.Group()
  const mG = mat('#eab308', { roughness: 0.55 })
  const mCab = mat('#f8fafc', { roughness: 0.4 })
  const mVid = mat('#1e3a5f', { roughness: 0.2 })
  const mCont = mat('#64748b')
  const mCable = new THREE.LineBasicMaterial({ color: '#334155' })
  const lado = 1.2
  // Mástil: 4 cordones y diagonales en zigzag por cara
  for (const [x, z] of [[0, 0], [lado, 0], [0, lado], [lado, lado]]) g.add(cajas([[x - 0.06, 0, z - 0.06]], [0.12, alto, 0.12], mG))
  const diag: THREE.Vector3[] = []
  for (let y = 0; y < alto - 0.6; y += 1.2) {
    const y2 = y + 1.2
    diag.push(new THREE.Vector3(0, y, 0), new THREE.Vector3(lado, y2, 0), new THREE.Vector3(lado, y, lado), new THREE.Vector3(0, y2, lado))
    diag.push(new THREE.Vector3(0, y, lado), new THREE.Vector3(0, y2, 0), new THREE.Vector3(lado, y, 0), new THREE.Vector3(lado, y2, lado))
  }
  const mDiag = new THREE.LineBasicMaterial({ color: '#ca8a04' })
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(diag), mDiag))
  // Pluma y contrapluma: cordón inferior doble, superior simple y diagonales
  const yP = alto
  const c = lado / 2
  const pluma = new THREE.Group()
  pluma.add(cajas([[-largoPluma * 0.28, 0, c - 0.5], [-largoPluma * 0.28, 0, c + 0.4]], [largoPluma * 1.28, 0.1, 0.1], mG))
  pluma.add(cajas([[0, 1.1, c - 0.05]], [largoPluma, 0.1, 0.1], mG))
  const dp: THREE.Vector3[] = []
  for (let x = 0; x < largoPluma; x += 1.2) dp.push(new THREE.Vector3(x, 0.05, c - 0.45), new THREE.Vector3(x + 0.6, 1.1, c), new THREE.Vector3(x + 0.6, 1.1, c), new THREE.Vector3(x + 1.2, 0.05, c + 0.45))
  pluma.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dp), mDiag))
  // Contrapeso, cabina, torreta y tirantes
  pluma.add(cajas([[-largoPluma * 0.27, -0.9, c - 0.6]], [2.2, 0.9, 1.2], mCont))
  pluma.add(cajas([[lado + 0.05, -1.6, -0.4]], [1.4, 1.5, 1.2], mCab))
  pluma.add(cajas([[lado + 1.44, -1.3, -0.3]], [0.03, 0.9, 1.0], mVid, false))
  pluma.add(cajas([[c - 0.3, 1.1, c - 0.3]], [0.6, 2.6, 0.6], mG))
  pluma.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(c, 3.7, c), new THREE.Vector3(largoPluma * 0.7, 1.2, c),
    new THREE.Vector3(c, 3.7, c), new THREE.Vector3(-largoPluma * 0.26, 0.1, c),
  ]), mCable))
  // Carro, cable y gancho con una carga de fierro
  const xc = largoPluma * 0.55
  pluma.add(cajas([[xc - 0.4, -0.25, c - 0.45]], [0.8, 0.25, 0.9], mCont))
  const largoCable = alto * 0.45
  pluma.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xc - 0.1, -0.25, c), new THREE.Vector3(xc - 0.1, -largoCable, c), new THREE.Vector3(xc + 0.1, -0.25, c), new THREE.Vector3(xc + 0.1, -largoCable, c)]), mCable))
  pluma.add(cajas([[xc - 0.25, -largoCable - 0.5, c - 0.2]], [0.5, 0.5, 0.4], mCont))
  pluma.add(cajas([[xc - 1.6, -largoCable - 0.85, c - 0.35]], [3.2, 0.3, 0.7], mat('#7c2d12', { metalness: 0.5 })))
  pluma.position.set(0, yP, 0)
  g.add(pluma)
  return { grupo: g, pluma, materiales: [mG, mCab, mVid, mCont, mDiag, mCable] }
}
