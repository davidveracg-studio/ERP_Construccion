// Piezas comunes de las figuras isométricas (kit anatomy) que usan los gráficos de la app:
// banco, regla con cursor, probeta de vidrio y atajos de dibujo. Todo devuelve SVG en texto.
import * as k from './kit'
import type { Plan, Point3, Projection } from './kit'

export { k }
export type { Projection }

export function atajos(P: Projection) {
  const at = (p: Point3) => k.iso(p, P)
  return {
    at,
    S: k.solidSvg,
    L: k.lineSvg,
    D: k.dotsSvg,
    box: (x: number, y: number, w: number, d: number, z: number, h: number, r = 0.3) => k.slabOf({ x, y, w, d, r }, z, h, P, 2, 0),
    depth: (x: number, y: number, z = 0) => k.depthOf([x, y, z], P),
    seg: (a: Point3, b: Point3) => k.segment(a, b, P),
    rectX: (x0: number, x1: number, y: number, za: number, zb: number) => k.pathOf([at([x0, y, za]), at([x1, y, za]), at([x1, y, zb]), at([x0, y, zb])], true),
    rectY: (y0: number, y1: number, x: number, za: number, zb: number) => k.pathOf([at([x, y0, za]), at([x, y1, za]), at([x, y1, zb]), at([x, y0, zb])], true),
  }
}

/** Puntos encendidos (color "lit" del tema): el dotsSvg del kit no trae ese tono. */
export const puntosLit = (pts: [number, number][], r = 1.4) =>
  `<g class="iso-dots" data-tone="lit">${pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`).join('')}</g>`

/** Banco: placa con patas, ranura perimetral y tornillos en las esquinas. */
export function banco(P: Projection, plate: Plan, { alto = 10, pata = 5, inset = 22 } = {}) {
  const { S, L, D, at, depth } = atajos(P)
  const out = [`<path class="iso-halo" d="${k.haloOf(plate, -alto - pata, alto, P)}"/>`]
  for (const [x, y] of k.corners(plate, inset).sort((a, b) => depth(...a) - depth(...b))) {
    out.push(S(k.cylinder(x, y, 7, -alto - pata, 1.6, P, 28), { tone: 'lo' }))
    out.push(S(k.cylinder(x, y, 5.4, -alto - pata + 1.6, pata - 1.6, P, 28), { tone: 'mid' }))
  }
  out.push(S(k.slabOf(plate, -alto, alto, P, 8, 1.6), { tone: 'mid' }))
  out.push(L(k.planOutline(k.insetPlan(plate, 5), 0, P), { tone: 'lo' }))
  const screws = k.corners(plate, 10)
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }))
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }))
  return out.join('')
}

/** Regla de tiempo: riel con topes y tira con una marca por paso (mayor cada `cada`). */
export function regla(P: Projection, { x0, largo, y, n, cada, hoy }: { x0: number; largo: number; y: number; n: number; cada: number; hoy?: number }) {
  const { S, L, D, at } = atajos(P)
  const out: string[] = []
  const tira = { x: x0 - 6, y: y + 11, w: largo + 12, d: 8, r: 1 }
  out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }))
  const menor: string[] = []
  const mayor: string[] = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + (largo * i) / Math.max(1, n)
    ;(i % cada === 0 ? mayor : menor).push(k.lineOnTop([x, tira.y], [x, tira.y + (i % cada === 0 ? 2.8 : 1.8)], 0.6, P))
  }
  out.push(L(menor.join(''), { tone: 'lo' }), L(mayor.join(''), { tone: 'mid' }))
  if (hoy != null) {
    const x = x0 + (largo * hoy) / Math.max(1, n)
    out.push(L(k.lineOnTop([x, tira.y], [x, tira.y + 5.4], 0.6, P), { tone: 'hi' }))
    out.push(D([at([x, tira.y + 6, 0.6])], { size: 0.6, tone: 'hi' }))
  }
  out.push(D([at([tira.x + 2, tira.y + 4, 0.6]), at([tira.x + tira.w - 2, tira.y + 4, 0.6])], { size: 0.45 }))
  out.push(S(k.slabOf({ x: x0 - 8, y, w: largo + 16, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: 'mid' }))
  for (const xx of [x0 - 14, x0 + largo + 8]) {
    out.push(S(k.slabOf({ x: xx, y: y - 3, w: 6, d: 11, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: 'mid' }))
    out.push(D([at([xx + 3, y - 0.5, 7]), at([xx + 3, y + 5.5, 7])], { size: 0.45 }))
  }
  return out.join('')
}

/** Cursor de fecha construido en x = 0; se mueve con translateAlong. Su lengüeta es la pieza encendida. */
export function cursor(P: Projection, y: number) {
  const { S, L, D, at } = atajos(P)
  return [
    `<path class="iso-halo" d="${k.haloOf({ x: -6, y: y - 2, w: 12, d: 9, r: 2 }, 3, 0.1, P)}" style="filter:blur(3px)"/>`,
    S(k.slabOf({ x: -7, y: y - 3, w: 14, d: 11, r: 2 }, 3, 5, P, 4, 0.6), { tone: 'mid' }),
    D([at([-4.5, y - 1, 8]), at([4.5, y - 1, 8])], { size: 0.4, tone: 'lo' }),
    S(k.slabOf({ x: -1, y: y + 8, w: 2, d: 7, r: 0.6 }, 3.4, 0.8, P, 2), { tone: 'hi', lit: true }),
    S(k.cylinder(0, y + 2.5, 3, 8, 4, P, 24), { tone: 'mid' }),
    L(k.knurl(0, y + 2.5, 3, 8, 12, 20, P), { tone: 'lo' }),
    D([at([0, y + 2.5, 12])], { size: 0.5, tone: 'hi' }),
  ].join('')
}

/** Probeta de vidrio: base, siluetas, boca, marcas y un anillo opcional. El líquido va aparte (liquido). */
export function vaso(P: Projection, { x, y = 0, r, base, alto, marcas = [] as number[] }: { x: number; y?: number; r: number; base: number; alto: number; marcas?: number[] }) {
  const { S, L, D } = atajos(P)
  const a = ((P.azimuth ?? k.AZIMUTH) * Math.PI) / 180
  const pie = [
    S(k.cylinder(x, y, r + 5, 0, 2.4, P, 48, 0.4), { tone: 'lo' }),
    S(k.cylinder(x, y, r + 2, 2.4, base - 2.4, P, 48, 0.4), { tone: 'mid' }),
    D([0, 1, 2, 3].map((i) => { const b = a + Math.PI / 4 + (i * Math.PI) / 2; return k.iso([x + Math.cos(b) * (r + 3.6), y + Math.sin(b) * (r + 3.6), 2.4], P) }), { size: 0.45 }),
  ].join('')
  const sil = [a + Math.PI / 2, a - Math.PI / 2].map((b) => k.segment([x + Math.cos(b) * r, y + Math.sin(b) * r, base], [x + Math.cos(b) * r, y + Math.sin(b) * r, base + alto], P))
  const vidrio = [
    L(sil.join('') + k.sideArc(x, y, r, base, P, 40), { tone: 'lo' }),
    marcas.length ? L(marcas.map((z) => k.sideArc(x, y, r, base + z, P, 40)).join(''), { tone: 'faint' }) : '',
    L(k.ring(x, y, r, base + alto, P, 48), { tone: 'mid' }),
    L(k.ring(x, y, r - 1.2, base + alto, P, 48), { tone: 'faint' }),
  ].join('')
  return { pie, vidrio }
}

export const liquido = (P: Projection, x: number, y: number, r: number, base: number, h: number, lit: boolean) =>
  h < 0.3 ? '' : k.solidSvg(k.cylinder(x, y, r - 0.6, base, h, P, 44), { tone: lit ? 'hi' : 'mid', lit, crease: 'lo' })

export const anillo = (P: Projection, x: number, y: number, r: number, z: number) => k.sideArc(x, y, r, z, P, 40)

/** Paleta de los gráficos de la app (graficos.tsx) y de estados. */
export const COLOR = {
  pv: '#1baf7a', ev: '#2a78d6', ac: '#eb6834',
  cobro: '#1baf7a', pago: '#eb6834', caja: '#2a78d6', retencion: '#8b5cf6', colchon: '#d97706',
  verde: '#10b981', ambar: '#f59e0b', rojo: '#ef4444', contrato: '#dc2626',
} as const

/** Color de estado por puntaje 0–100 (≥ 80 verde, ≥ 60 ámbar, si no rojo). */
export const colorEstado = (v: number) => (v >= 80 ? COLOR.verde : v >= 60 ? COLOR.ambar : COLOR.rojo)

/**
 * Tiñe un trozo de SVG del kit: redefine las variables de tono para que relleno, cara superior,
 * las cuatro sombras y los bordes salgan del color, conservando el sombreado por orientación.
 * `palido` (0–1) aclara todo (p. ej. para lo proyectado).
 */
export function tinte(svg: string, color: string, palido = 0) {
  if (!svg) return ''
  const blanco = (p: number) => `color-mix(in srgb, ${color} ${Math.round(p * (1 - palido * 0.55))}%, white)`
  const negro = (p: number) => `color-mix(in srgb, ${color} ${p}%, black)`
  const vars = [
    `--anatomy-paper:${blanco(62)}`, `--anatomy-face:${blanco(62)}`, `--anatomy-top:${blanco(42)}`, `--anatomy-lit-top:${blanco(42)}`,
    `--anatomy-shade-0:${palido ? blanco(95) : negro(82)}`, `--anatomy-shade-1:${blanco(95)}`, `--anatomy-shade-2:${blanco(82)}`, `--anatomy-shade-3:${blanco(70)}`,
    `--anatomy-hi:${negro(70)}`, `--anatomy-mid:${negro(85)}`, `--anatomy-lo:${blanco(55)}`, `--anatomy-faint:${blanco(35)}`,
    `--anatomy-lit:${negro(90)}`, `--anatomy-dot:${negro(80)}`,
  ].join(';')
  return `<g style="${vars}">${svg}</g>`
}
