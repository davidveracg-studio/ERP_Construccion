// Visor 3D de la simulación 4D (three.js). El edificio se construye una vez por modelo; al
// mover la fecha solo cambian escala, visibilidad y color. En el modelo paramétrico cada parte
// crece desde una esquina según el avance; en un modelo BIM (IFC) se muestran construidos los
// primeros elementos de cada capa/piso en orden constructivo.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { elementosConstruidos, type AgrupacionIfc } from '../domain/bim'
import { CAPAS, ESTADOS_4D, type Estado4D, type EstadoElemento } from '../domain/modelo4d'
import { pct } from '../domain/formato'
import type { Capa, Modelo4D } from '../domain/types'
import type { GeometriaIfc } from '../ifc/extraer'

export type Modo4D = 'estado' | 'realista'

/** Modelo BIM leído y agrupado por capa y piso. */
export interface ModeloBim {
  geo: GeometriaIfc
  grupos: AgrupacionIfc
}

/** Mismos tonos que el semáforo (index.css). */
export const COLOR_ESTADO: Record<Estado4D, string> = {
  pendiente: '#cbd5e1', al_dia: '#059669', atrasado: '#d97706', critico: '#dc2626', terminado: '#94a3b8',
}

const COLOR_CAPA: Record<Capa, string> = {
  terreno: '#8b6b4a', fundaciones: '#9ca3af', estructura: '#d6d3d1', muros: '#c9b8a6', instalaciones: '#3b82f6', terminaciones: '#7dd3fc',
}

const LOSA = 0.22

interface Spec { x: number; y: number; z: number; w: number; h: number; d: number; eje: 'x' | 'y' | 'z'; fase?: [number, number] }
interface Parte { mesh: THREE.Object3D; s: Spec }
interface Visual {
  capa: Capa
  piso: number
  mat: THREE.MeshStandardMaterial
  partes: Parte[]
  fantasma: Parte[]
  /** Elementos IFC del grupo en orden constructivo. */
  ifc?: THREE.Mesh[]
}

/** Partes de un elemento (coordenadas de la esquina mínima, en metros). */
function partesDe(capa: Capa, piso: number, m: Modelo4D): { solidas: Spec[]; fantasma: Spec[] } {
  const { largo: L, ancho: A, alturaPiso: H } = m
  const x0 = -L / 2
  const z0 = -A / 2
  const y0 = (piso - 1) * H
  switch (capa) {
    case 'terreno': {
      const s: Spec = { x: x0 - 2, y: -0.06, z: z0 - 2, w: L + 4, h: 0.05, d: A + 4, eje: 'x' }
      return { solidas: [s], fantasma: [s] }
    }
    case 'fundaciones': {
      const s: Spec = { x: x0, y: -0.5, z: z0, w: L, h: 0.5, d: A, eje: 'x' }
      return { solidas: [s], fantasma: [s] }
    }
    case 'estructura': {
      const solidas: Spec[] = [{ x: x0, y: y0, z: z0, w: L, h: LOSA, d: A, eje: 'x', fase: [0, 0.5] }]
      const nx = Math.max(2, Math.round(L / 6) + 1)
      const nz = Math.max(2, Math.round(A / 6) + 1)
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++)
          solidas.push({ x: x0 + (i * (L - 0.4)) / (nx - 1), y: y0 + LOSA, z: z0 + (j * (A - 0.4)) / (nz - 1), w: 0.4, h: H - LOSA, d: 0.4, eje: 'y', fase: [0.4, 1] })
      if (piso === m.pisos) solidas.push({ x: x0, y: y0 + H, z: z0, w: L, h: LOSA, d: A, eje: 'x', fase: [0.85, 1] })
      return { solidas, fantasma: [{ x: x0, y: y0, z: z0, w: L, h: H, d: A, eje: 'y' }] }
    }
    case 'muros': {
      const t = 0.2
      const r = 0.25
      const y = y0 + LOSA
      const h = H - LOSA - 0.02
      return {
        solidas: [
          { x: x0 + r, y, z: z0 + r, w: L - 2 * r, h, d: t, eje: 'y' },
          { x: x0 + r, y, z: z0 + A - r - t, w: L - 2 * r, h, d: t, eje: 'y' },
          { x: x0 + r, y, z: z0 + r, w: t, h, d: A - 2 * r, eje: 'y' },
          { x: x0 + L - r - t, y, z: z0 + r, w: t, h, d: A - 2 * r, eje: 'y' },
        ],
        fantasma: [],
      }
    }
    case 'instalaciones':
      return {
        solidas: [
          { x: -1.2, y: y0 + LOSA, z: -0.3, w: 0.6, h: H - LOSA, d: 0.6, eje: 'y' },
          { x: 0.6, y: y0 + LOSA, z: -0.3, w: 0.6, h: H - LOSA, d: 0.6, eje: 'y' },
          { x: x0 + L * 0.15, y: y0 + H - 0.45, z: -0.15, w: L * 0.7, h: 0.25, d: 0.3, eje: 'x' },
        ],
        fantasma: [],
      }
    case 'terminaciones': {
      const r = 0.25
      const y = y0 + 0.8
      const h = H - 1.25
      return {
        solidas: [
          { x: x0 + 0.6, y, z: z0 + r - 0.06, w: L - 1.2, h, d: 0.05, eje: 'x' },
          { x: x0 + 0.6, y, z: z0 + A - r + 0.01, w: L - 1.2, h, d: 0.05, eje: 'x' },
          { x: x0 + r - 0.06, y, z: z0 + 0.6, w: 0.05, h, d: A - 1.2, eje: 'z' },
          { x: x0 + L - r + 0.01, y, z: z0 + 0.6, w: 0.05, h, d: A - 1.2, eje: 'z' },
        ],
        fantasma: [],
      }
    }
  }
}

function aplicar(p: Parte, f: number) {
  const [a, b] = p.s.fase ?? [0, 1]
  const local = Math.min(1, Math.max(0, (f - a) / (b - a)))
  p.mesh.visible = local > 0.001
  if (!p.mesh.visible) return
  const { w, h, d, eje } = p.s
  p.mesh.scale.set(eje === 'x' ? w * local : w, eje === 'y' ? h * local : h, eje === 'z' ? d * local : d)
}

interface Motor {
  construir: (m: Modelo4D, bim: ModeloBim | null) => void
  actualizar: (estados: EstadoElemento[], modo: Modo4D) => void
  girar: (si: boolean) => void
  destruir: () => void
}

function crearMotor(cont: HTMLDivElement, onTip: (t: { x: number; y: number; texto: string[] } | null) => void): Motor {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  cont.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#eef2f6')
  scene.fog = new THREE.Fog('#eef2f6', 140, 320)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.48
  controls.autoRotateSpeed = 0.6

  scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.6))
  const sol = new THREE.DirectionalLight('#ffffff', 2.2)
  sol.castShadow = true
  sol.shadow.mapSize.set(1024, 1024)
  scene.add(sol, sol.target)

  const caja = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5)
  const bordes = new THREE.EdgesGeometry(caja)
  const matFantasma = new THREE.MeshBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.08, depthWrite: false })
  const matBorde = new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.55 })
  // Elementos IFC: colores del archivo (por vértice); vidrios aparte; fantasma = plan sin construir
  const matIfc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
  const matIfcVidrio = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false })
  const matFantasmaIfc = new THREE.MeshBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.13, depthWrite: false })

  // Entorno fijo: suelo y árboles
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 1 }))
  suelo.rotation.x = -Math.PI / 2
  suelo.position.y = -0.08
  suelo.receiveShadow = true
  scene.add(suelo)

  let edificio = new THREE.Group()
  let entorno = new THREE.Group()
  scene.add(edificio, entorno)
  let visuales = new Map<string, Visual>()
  let ultimos = new Map<string, EstadoElemento>()
  const grua = new THREE.Group()
  const pluma = new THREE.Group()
  const matGrua = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.6 })
  scene.add(grua)
  const fijos = new Set<THREE.Material>([matFantasma, matGrua, matIfc, matIfcVidrio, matFantasmaIfc])

  function caja3(s: Spec, mat: THREE.Material) {
    const mesh = new THREE.Mesh(caja, mat)
    mesh.position.set(s.x, s.y, s.z)
    mesh.scale.set(s.w, s.h, s.d)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  function limpiar(g: THREE.Group) {
    for (const m of (g.userData.materiales ?? []) as THREE.Material[]) m.dispose()
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== caja) o.geometry.dispose()
      if (o instanceof THREE.Mesh && !fijos.has(o.material as THREE.Material)) (o.material as THREE.Material).dispose()
    })
    g.removeFromParent()
  }

  const nuevoMaterial = (capa: Capa) => {
    const vidrio = capa === 'terminaciones'
    return new THREE.MeshStandardMaterial({ color: COLOR_CAPA[capa], roughness: vidrio ? 0.2 : 0.85, metalness: vidrio ? 0.1 : 0, transparent: vidrio, opacity: vidrio ? 0.6 : 1 })
  }

  function construirBim(bim: ModeloBim) {
    const mallas = new Map(bim.geo.mallas.map((x) => [x.id, x]))
    const elementos = new Map(bim.geo.elementos.map((x) => [x.id, x]))
    const sombras = bim.geo.mallas.length < 4000
    for (const [clave, ids] of bim.grupos.grupos) {
      const [capa, piso] = clave.split('|') as [Capa, string]
      const mat = nuevoMaterial(capa)
      const v: Visual = { capa, piso: Number(piso), mat, partes: [], fantasma: [], ifc: [] }
      // El material del grupo no cuelga de ninguna malla al limpiar: se libera aparte
      edificio.userData.materiales = [...(edificio.userData.materiales ?? []), mat]
      for (const id of ids) {
        const x = mallas.get(id)
        if (!x) continue
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(x.posiciones, 3))
        g.setAttribute('normal', new THREE.BufferAttribute(x.normales, 3))
        g.setAttribute('color', new THREE.BufferAttribute(x.colores, 3))
        g.setIndex(new THREE.BufferAttribute(x.indices, 1))
        const original = x.transparente ? matIfcVidrio : matIfc
        const mesh = new THREE.Mesh(g, original)
        mesh.receiveShadow = sombras
        const el = elementos.get(id)
        mesh.userData = { clave, original, sombra: sombras && !x.transparente, nombre: el?.nombre }
        edificio.add(mesh)
        v.ifc!.push(mesh)
      }
      visuales.set(clave, v)
    }
  }

  function construir(m: Modelo4D, bim: ModeloBim | null) {
    limpiar(edificio)
    limpiar(entorno)
    edificio = new THREE.Group()
    entorno = new THREE.Group()
    scene.add(edificio, entorno)
    visuales = new Map()
    // Con IFC las medidas salen de la caja envolvente del modelo (ya centrado en planta)
    const L = bim ? bim.geo.max[0] - bim.geo.min[0] : m.largo
    const A = bim ? bim.geo.max[2] - bim.geo.min[2] : m.ancho
    const alto = bim ? bim.geo.max[1] : m.pisos * m.alturaPiso
    const { pisos } = m
    if (bim) construirBim(bim)

    // El movimiento de tierra no viene en el IFC: se dibuja igual que en el paramétrico
    const capas: Capa[] = bim ? ['terreno'] : ['terreno', 'fundaciones', 'estructura', 'muros', 'instalaciones', 'terminaciones']
    const dims = { ...m, largo: L, ancho: A }
    for (const capa of capas) {
      const niveles = capa === 'terreno' || capa === 'fundaciones' ? [0] : Array.from({ length: pisos }, (_, i) => i + 1)
      for (const piso of niveles) {
        const mat = nuevoMaterial(capa)
        const { solidas, fantasma } = partesDe(capa, piso, dims)
        const v: Visual = { capa, piso, mat, partes: [], fantasma: [] }
        const clave = `${capa}|${piso}`
        for (const s of solidas) {
          const mesh = caja3(s, mat)
          mesh.userData.clave = clave
          edificio.add(mesh)
          v.partes.push({ mesh, s })
        }
        for (const s of fantasma) {
          const g = new THREE.Group()
          g.position.set(s.x, s.y, s.z)
          g.add(new THREE.Mesh(caja, matFantasma), new THREE.LineSegments(bordes, matBorde))
          edificio.add(g)
          v.fantasma.push({ mesh: g, s })
        }
        visuales.set(clave, v)
      }
    }

    // Terreno de la faena y árboles alrededor (escala humana)
    const faena = new THREE.Mesh(new THREE.PlaneGeometry(L + 18, A + 18), new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 1 }))
    faena.rotation.x = -Math.PI / 2
    faena.position.y = -0.07
    faena.receiveShadow = true
    entorno.add(faena)
    const matCopa = new THREE.MeshStandardMaterial({ color: '#86b39a', roughness: 0.9 })
    const matTronco = new THREE.MeshStandardMaterial({ color: '#8b6b4a' })
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + (i % 3) * 0.3
      const rx = (L / 2 + 14 + (i % 4) * 3) * Math.cos(ang)
      const rz = (A / 2 + 14 + ((i * 7) % 5) * 2) * Math.sin(ang)
      const copa = new THREE.Mesh(new THREE.SphereGeometry(1.6 + (i % 3) * 0.4, 12, 10), matCopa)
      copa.position.set(rx, 3.2, rz)
      copa.castShadow = true
      const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4), matTronco)
      tronco.position.set(rx, 1.2, rz)
      entorno.add(copa, tronco)
    }

    // Grúa torre junto al edificio
    grua.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    grua.clear()
    pluma.clear()
    const hg = alto + 8
    const mastil = new THREE.Mesh(new THREE.BoxGeometry(1, hg, 1), matGrua)
    mastil.position.y = hg / 2
    mastil.castShadow = true
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.6, 0.6), matGrua)
    brazo.position.set(L * 0.3, 0, 0)
    const contra = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: '#64748b' }))
    contra.position.set(-L * 0.12, -0.4, 0)
    pluma.add(brazo, contra)
    pluma.position.y = hg
    grua.add(mastil, pluma)
    grua.position.set(-L / 2 - 4, 0, A / 4)

    // Cámara y sol según el tamaño del edificio
    const r = Math.max(L, A, alto) * 1.6 + 12
    camera.position.set(r * 0.95, alto * 0.6 + r * 0.55, r * 1.15)
    controls.target.set(0, alto * 0.35, 0)
    controls.minDistance = 8
    controls.maxDistance = r * 3
    sol.position.set(r * 0.8, r * 1.4, r * 0.5)
    const sc = sol.shadow.camera
    sc.left = sc.bottom = -r
    sc.right = sc.top = r
    sc.far = r * 4
    sc.updateProjectionMatrix()
    controls.update()
  }

  function actualizar(estados: EstadoElemento[], modo: Modo4D) {
    ultimos = new Map(estados.map((e) => [e.elemento.clave, e]))
    let estructuraIniciada = false
    let estructuraPendiente = false
    for (const [clave, v] of visuales) {
      const e = ultimos.get(clave)
      const real = e?.real ?? 0
      const plan = e?.plan ?? 0
      const natural = modo === 'realista' || !e || e.estado === 'terminado' || e.estado === 'pendiente'
      if (v.ifc) {
        const hechos = elementosConstruidos(v.ifc.length, real)
        const planeados = elementosConstruidos(v.ifc.length, plan)
        v.ifc.forEach((mesh, i) => {
          mesh.visible = i < Math.max(hechos, planeados)
          mesh.material = i < hechos ? (natural ? mesh.userData.original : v.mat) : matFantasmaIfc
          mesh.castShadow = i < hechos && mesh.userData.sombra
        })
      }
      for (const p of v.partes) aplicar(p, real)
      for (const p of v.fantasma) {
        aplicar(p, plan)
        p.mesh.visible = p.mesh.visible && plan > real + 0.005
      }
      v.mat.color.set(natural ? COLOR_CAPA[v.capa] : COLOR_ESTADO[e!.estado])
      if (v.capa === 'terminaciones') v.mat.opacity = natural ? 0.6 : 0.9
      if (v.capa === 'estructura' && e) {
        if (real > 0) estructuraIniciada = true
        if (real < 1) estructuraPendiente = true
      }
    }
    grua.visible = estructuraIniciada && estructuraPendiente
  }

  // Tooltip: elemento bajo el puntero
  const ray = new THREE.Raycaster()
  const puntero = new THREE.Vector2()
  function alMover(ev: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    puntero.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(puntero, camera)
    const hit = ray.intersectObjects(edificio.children, false).find((h) => h.object.visible && h.object.userData.clave)
    const e = hit && ultimos.get(hit.object.userData.clave as string)
    if (!e) { onTip(null); return }
    const nivel = e.elemento.piso === 0 ? 'Terreno' : `Piso ${e.elemento.piso}`
    const nombre = hit.object.userData.nombre as string | undefined
    onTip({
      x: ev.clientX - rect.left, y: ev.clientY - rect.top,
      texto: [
        ...(nombre ? [nombre] : []),
        `${nivel} · ${CAPAS[e.elemento.capa]}`, `Plan ${pct(e.plan, 0)} · Real ${pct(e.real, 0)}`, ESTADOS_4D[e.estado],
      ],
    })
  }
  const alSalir = () => onTip(null)
  renderer.domElement.addEventListener('pointermove', alMover)
  renderer.domElement.addEventListener('pointerleave', alSalir)

  const ajustar = () => {
    const w = cont.clientWidth
    const h = cont.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  ajustar()

  // Se dibuja solo cuando algo cambia (cámara, fecha, giro): ahorra batería en el celular de obra
  let frame = 0
  const dibujar = () => {
    frame = 0
    // update() devuelve true mientras la cámara sigue moviéndose (amortiguación o giro)
    if (controls.update() || controls.autoRotate) pedir()
    renderer.render(scene, camera)
  }
  const pedir = () => { if (!frame) frame = requestAnimationFrame(dibujar) }
  controls.addEventListener('change', pedir)
  const ro = new ResizeObserver(() => { ajustar(); pedir() })
  ro.observe(cont)
  pedir()

  return {
    construir: (m, bim) => { construir(m, bim); pedir() },
    actualizar: (e, modo) => { actualizar(e, modo); pedir() },
    girar: (si) => { controls.autoRotate = si; pedir() },
    destruir: () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', alMover)
      renderer.domElement.removeEventListener('pointerleave', alSalir)
      controls.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

export default function Vista4D({ modelo, bim = null, estados, modo, girar }: { modelo: Modelo4D; bim?: ModeloBim | null; estados: EstadoElemento[]; modo: Modo4D; girar: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const motor = useRef<Motor | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; texto: string[] } | null>(null)

  useEffect(() => {
    const m = crearMotor(ref.current!, setTip)
    motor.current = m
    return () => { m.destruir(); motor.current = null }
  }, [])
  useEffect(() => { motor.current?.construir(modelo, bim) }, [modelo, bim])
  useEffect(() => { motor.current?.actualizar(estados, modo) }, [estados, modo, modelo, bim])
  useEffect(() => { motor.current?.girar(girar) }, [girar])

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden rounded-lg" aria-label="Modelo 3D de la obra">
      {tip && (
        <div className="pointer-events-none absolute z-10 rounded-md bg-slate-900/90 px-2 py-1 text-xs text-white shadow"
          style={{ left: Math.min(tip.x + 12, (ref.current?.clientWidth ?? 0) - 170), top: Math.max(tip.y - 52, 4) }}>
          {tip.texto.map((t, i) => <div key={i} className={i === 0 ? 'font-medium' : 'tabular'}>{t}</div>)}
        </div>
      )}
    </div>
  )
}
