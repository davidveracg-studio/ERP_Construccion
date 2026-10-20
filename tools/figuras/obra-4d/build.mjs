// Figura 4D (anatomy): una maqueta de obra sobre un banco. La regla del frente es el
// programa (250 días); al mover el cursor de fecha la obra se levanta piso a piso:
// sólido = ejecutado (real), contorno marcado = lo que el plan ya pedía y aún no está.
// El reloj de la derecha lee el avance: aguja blanca = real, aguja corta = plan.
//   node tools/figuras/obra-4d/build.mjs [--light]   → public/figuras/obra-4d(-light).html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { ACTS, DIAS, HOY, PISOS, estadoEn } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "..", "public", "figuras");
const theme = process.argv.includes("--light") ? "light" : "dark";
const strip = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "");

const WIDTH = 720;
const HEIGHT = 560;

// ── Mundo (1 m = 6 u) ────────────────────────────────────────────────────────
const PLATE = { x: -150, y: -114, w: 345, d: 228, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const H = 15.6; // 2,6 m por piso
const FUND = 3; // cota superior de fundaciones
const z0 = (p) => FUND + (p - 1) * H;
const B = { x: -40, y: -36, w: 120, d: 72 };
const XS = [-40, 0, 40, 80];
const YS = [-36, 0, 36];
const COL = 1.6;
const LOSA = { x: B.x - COL, y: B.y - COL, w: B.w + COL * 2, d: B.d + COL * 2, r: 0.6 };
const MAST = [-80, 0];
const MAST_TOP = 112;
const TROLLEY_X = 20;
const DIA0 = -112; // x del día 0 en la regla
const POR_DIA = 1.12;
const xDia = (t) => DIA0 + t * POR_DIA;
const DIAL = [152, 34];
const DIAL_R = 23;
const DIAL_TOP = 10;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [MAST[0], 0, 136], [80, 0, 122], [-114, 0, 128]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const box = (x, y, w, d, z, h, r = 0.3) => k.slabOf({ x, y, w, d, r }, z, h, P, 2, 0);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const rectX = (x0, x1, y, za, zb) => k.pathOf([at([x0, y, za]), at([x1, y, za]), at([x1, y, zb]), at([x0, y, zb])], true);
const rectY = (y0, y1, x, za, zb) => k.pathOf([at([x, y0, za]), at([x, y1, za]), at([x, y1, zb]), at([x, y0, zb])], true);
const seg = (a, b) => k.segment(a, b, P);

// Estado inicial (hoy) para que la figura se lea sin JavaScript
const HOY_E = estadoEn(HOY);
const visible = (act, min, max = 2, act2, max2 = 2) => {
  const s = HOY_E.real;
  return s[act] >= min && s[act] < max && (!act2 || s[act2] < max2);
};
// Grupo que aparece/desaparece según el avance real de una actividad
function toggle(body, act, min, { max, act2, max2 } = {}) {
  const on = visible(act, min, max, act2, max2);
  const extra = `${max != null ? ` data-max="${max}"` : ""}${act2 ? ` data-act2="${act2}" data-max2="${max2}"` : ""}`;
  return `<g data-act="${act}" data-min="${min}"${extra} style="opacity:${on ? 1 : 0}">${body}</g>`;
}

// ── Banco ────────────────────────────────────────────────────────────────────
function banco() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = k.corners(PLATE, 26).sort((a, b) => depth(...a) - depth(...b));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Placa de identificación en el canto frontal derecho
  const placa = { x: 120, y: PLATE.y + PLATE.d, z: -7.5 };
  out.push(L(rectX(placa.x, placa.x + 40, placa.y, placa.z, placa.z + 5), { tone: "lo" }));
  out.push(D([at([placa.x + 2, placa.y, placa.z + 2.5]), at([placa.x + 38, placa.y, placa.z + 2.5])], { size: 0.4 }));
  return out.join("");
}

// ── Instalación de faena (atrás a la derecha) ────────────────────────────────
function contenedor(x, y, z, w, d, h, { puerta = false, ventanas = 2 } = {}) {
  const out = [S(box(x, y, w, d, z, h, 0.4), { tone: "mid" })];
  const yf = y + d;
  const ribs = [];
  for (let xx = x + 3; xx < x + w - 2; xx += 3) ribs.push(seg([xx, yf, z], [xx, yf, z + h]));
  out.push(L(ribs.join(""), { tone: "faint" }));
  const win = [];
  for (let i = 0; i < ventanas; i++) {
    const cx = x + (w / (ventanas + 1)) * (i + 1);
    win.push(rectX(cx - 4, cx + 4, yf + 0.05, z + h * 0.4, z + h * 0.75));
  }
  out.push(L(win.join(""), { tone: "mid" }));
  if (puerta) out.push(L(rectY(y + 3, y + d - 3, x + w + 0.05, z + 1, z + h - 2), { tone: "mid" }));
  return out.join("");
}

// Cierre perimetral de malla por los dos cantos del fondo
function cierre() {
  const out = [];
  const tramo = (a, b) => {
    const wires = [];
    const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.4);
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const x = a[0] + (b[0] - a[0]) * u;
      const y = a[1] + (b[1] - a[1]) * u;
      wires.push(seg([x, y, 1.2], [x, y, 11]));
    }
    return L(wires.join(""), { tone: "faint" }) + L(seg([...a, 1.2], [...b, 1.2]) + seg([...a, 11], [...b, 11]), { tone: "lo" });
  };
  const fondo = [-142, -124, -106, -88, -70, -52, -34, -16, 2, 20, 38, 56, 74, 92, 110, 128, 146, 164, 184].map((x) => [x, -108]);
  const lado = [-108, -90, -72, -54, -36, -18, 0, 18, 36].map((y) => [-142, y]);
  const postes = [...fondo, ...lado.slice(1)];
  const tramos = [];
  for (let i = 0; i + 1 < fondo.length; i++) tramos.push([fondo[i], fondo[i + 1]]);
  for (let i = 0; i + 1 < lado.length; i++) tramos.push([lado[i], lado[i + 1]]);
  const piezas = [
    ...tramos.map(([a, b]) => ({ d: depth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) - 0.5, svg: tramo(a, b) })),
    ...postes.map(([x, y]) => ({ d: depth(x, y), svg: S(k.cylinder(x, y, 0.7, 0, 12.4, P, 10), { tone: "mid", crease: "none" }) })),
  ];
  return piezas.sort((a, b) => a.d - b.d).map((p) => p.svg).join("");
}

function faena() {
  const out = [cierre()];
  // Losa de faena
  out.push(S(box(34, -106, 112, 26, 0, 0.6, 1), { tone: "lo", crease: "none" }));
  out.push(contenedor(38, -104, 0.6, 36, 14.6, 15.5, { puerta: false }));
  out.push(contenedor(86, -104, 0.6, 36, 14.6, 15.5, { puerta: true, ventanas: 1 }));
  out.push(contenedor(38, -104, 16.1, 36, 14.6, 15.5, { puerta: true }));
  // Escalera y descanso al contenedor de arriba
  const steps = [];
  for (let i = 5; i >= 0; i--) steps.push(S(box(75.5, -89.4 + (5 - i) * 2.4, 8, 2.4, 0.6, (i + 1) * 2.6 - 0.6, 0.2), { tone: "mid", crease: "lo" }));
  out.push(S(box(74, -104, 9, 14.6, 15.4, 0.7, 0.3), { tone: "mid" }));
  // Bodega y baño químico
  out.push(S(box(126, -104, 16, 14, 0.6, 12, 0.5), { tone: "mid" }));
  out.push(L(rectY(-101, -93, 142.05, 1.2, 10), { tone: "mid" }));
  out.push(D([at([142, -94.5, 5.6])], { size: 0.45 }));
  out.push(S(box(126, -88, 7, 7, 0.6, 13, 0.6), { tone: "mid" }));
  out.push(L(rectY(-86.8, -82.2, 133.05, 1.4, 11), { tone: "mid" }));
  out.push(D([at([133, -83, 6.2])], { size: 0.45 }));
  return toggle(out.join("") + steps.join(""), "faena", 0.3);
}

// ── Grúa torre ───────────────────────────────────────────────────────────────
function gruaMastil() {
  const [mx, my] = MAST;
  const out = [];
  out.push(S(box(mx - 10, my - 10, 20, 20, 0, 3, 0.6), { tone: "lo" }));
  for (const [x, y] of [[-8.5, -8.5], [3.5, -8.5], [-8.5, 3.5], [3.5, 3.5]].sort((a, b) => depth(...a) - depth(...b)))
    out.push(S(box(mx + x, my + y, 5, 5, 3, 3, 0.4), { tone: "mid" }));
  out.push(S(box(mx - 3, my - 3, 6, 6, 6, MAST_TOP - 6, 0.2), { tone: "mid", crease: "lo" }));
  // Celosía en las dos caras visibles
  const zig = [];
  const rungs = [];
  for (let z = 6; z + 6 <= MAST_TOP - 8; z += 6) {
    zig.push(seg([mx + 3, my - 3, z], [mx + 3, my + 3, z + 6]));
    zig.push(seg([mx + 3, my + 3, z], [mx - 3, my + 3, z + 6]));
    rungs.push(seg([mx + 3, my - 3, z], [mx + 3, my + 3, z]));
    rungs.push(seg([mx + 3, my + 3, z], [mx - 3, my + 3, z]));
    if (z + 12 > MAST_TOP - 8) rungs.push(seg([mx + 3, my - 3, z + 6], [mx + 3, my + 3, z + 6]), seg([mx + 3, my + 3, z + 6], [mx - 3, my + 3, z + 6]));
  }
  out.push(L(rungs.join(""), { tone: "lo" }), L(zig.join(""), { tone: "lo" }));
  out.push(D([[mx - 7, my - 7], [mx + 7, my - 7], [mx - 7, my + 7], [mx + 7, my + 7]].map(([x, y]) => at([x, y, 3])), { size: 0.45 }));
  return out.join("");
}

function gruaPluma() {
  const [mx, my] = MAST;
  const out = [];
  out.push(S(k.cylinder(mx, my, 5, MAST_TOP, 2.4, P, 28), { tone: "mid" }));
  // Contrapluma con contrapesos
  out.push(S(box(-114, -2.5, 34, 5, 116, 3.4, 0.3), { tone: "mid" }));
  out.push(S(box(-113, -4, 5.5, 8, 119.4, 7, 0.3), { tone: "mid" }));
  out.push(S(box(-107, -4, 5.5, 8, 119.4, 7, 0.3), { tone: "mid" }));
  // Torre de punta (cúspide)
  out.push(S(box(mx - 1.6, my - 1.6, 3.2, 3.2, 114.4, 22, 0.2), { tone: "mid" }));
  // Cabina
  out.push(S(box(mx + 3, my + 3, 6, 6, 114.4, 6.5, 0.6), { tone: "mid" }));
  out.push(L(rectY(my + 4, my + 8, mx + 9.05, 116.5, 120), { tone: "mid" }));
  // Pluma en celosía
  out.push(S(box(mx + 3, -2, 158, 4, 116, 4, 0.2), { tone: "mid", crease: "lo" }));
  const zig = [];
  for (let x = mx + 3; x + 6 <= mx + 161; x += 6) zig.push(seg([x, 2, 116], [x + 3, 2, 120]), seg([x + 3, 2, 120], [x + 6, 2, 116]));
  out.push(L(zig.join(""), { tone: "lo" }));
  // Tirantes desde la cúspide
  out.push(L(seg([mx, my, 136.4], [40, 0, 120]) + seg([mx, my, 136.4], [-110, 0, 126.4]), { tone: "mid" }));
  out.push(D([at([40, 0, 120]), at([-110, 0, 126.4]), at([mx, my, 136.4])], { size: 0.5 }));
  // Carro
  out.push(S(box(TROLLEY_X - 4, -3, 8, 6, 113.4, 2.6, 0.4), { tone: "mid" }));
  return out.join("");
}

// Gancho y balde de hormigón, construidos en reposo (z = 0) y movidos en z
const BALDE = 9;
function gancho() {
  const out = [];
  out.push(S(k.cylinder(TROLLEY_X, 0, 3.6, 0, 6, P, 24), { tone: "mid" }));
  out.push(L(seg([TROLLEY_X - 3.6, 0, 6], [TROLLEY_X - 1.2, 0, BALDE]) + seg([TROLLEY_X + 3.6, 0, 6], [TROLLEY_X + 1.2, 0, BALDE]), { tone: "lo" }));
  out.push(S(box(TROLLEY_X - 2.4, -1.8, 4.8, 3.6, BALDE, 4.2, 0.4), { tone: "mid" }));
  return out.join("");
}

// ── Edificio ─────────────────────────────────────────────────────────────────
function fundaciones() {
  const plan = { x: B.x - 5, y: B.y - 5, w: B.w + 10, d: B.d + 10, r: 0.6 };
  const ghost = L(k.planOutline(plan, FUND, P, 2), { tone: "faint" });
  const solid = S(k.slabOf(plan, 0, FUND, P, 2, 0.5), { tone: "mid" }) + L(k.planOutline(k.insetPlan(plan, 3), FUND, P, 2), { tone: "faint" });
  return toggle(ghost, "fund", -1, { max: 0.6 }) + toggle(solid, "fund", 0.6);
}

function piso(p) {
  const zb = z0(p);
  const zt = zb + H;
  const est = "est" + p;
  const term = "term" + p;
  const items = [];
  // Pilares (aparecen uno a uno en la primera mitad de la estructura)
  const cols = [];
  for (const y of YS) for (const x of XS) cols.push([x, y]);
  cols.sort((a, b) => depth(...a) - depth(...b));
  cols.forEach(([x, y], i) => {
    const body = S(box(x - COL, y - COL, COL * 2, COL * 2, zb, H - 2, 0.3), { tone: "mid" });
    items.push({ d: depth(x, y), svg: toggle(body, est, (0.04 + i * 0.035).toFixed(3)) });
  });
  // Alzaprimas bajo la losa: se retiran cuando el piso de arriba va en la mitad
  const sobre = p < PISOS ? "est" + (p + 1) : term;
  const maxSobre = p < PISOS ? 0.5 : 0.1;
  for (const x of [-30, -10, 10, 30, 50, 70])
    for (const y of [-18, 18]) {
      const body = S(k.cylinder(x, y, 0.8, zb, H - 2.6, P, 10), { tone: "lo", crease: "none" });
      items.push({ d: depth(x, y), svg: toggle(body, est, 0.45, { act2: sobre, max2: maxSobre }) });
    }
  // Tabiques y ventanas (terminaciones), en las cuatro caras
  const paneles = [];
  for (let i = 0; i < 3; i++) {
    const xa = XS[i] + COL;
    const xb = XS[i + 1] - COL;
    paneles.push({ x: (xa + xb) / 2, y: B.y - 1, body: S(box(xa, B.y - COL, xb - xa, 1.2, zb, H - 2, 0), { tone: "mid", crease: "lo" }) });
    const yf = B.y + B.d + COL;
    const win = rectX(xa + 7, xb - 7, yf + 0.05, zb + 3, zb + H - 5.5);
    const mid = seg([(xa + xb) / 2, yf + 0.05, zb + 3], [(xa + xb) / 2, yf + 0.05, zb + H - 5.5]);
    paneles.push({ x: (xa + xb) / 2, y: yf, body: S(box(xa, yf - 1.2, xb - xa, 1.2, zb, H - 2, 0), { tone: "mid", crease: "lo" }) + L(win, { tone: "mid" }) + L(mid, { tone: "lo" }) });
  }
  for (let i = 0; i < 2; i++) {
    const ya = YS[i] + COL;
    const yb = YS[i + 1] - COL;
    paneles.push({ x: B.x - 1, y: (ya + yb) / 2, body: S(box(B.x - COL, ya, 1.2, yb - ya, zb, H - 2, 0), { tone: "mid", crease: "lo" }) });
    const xf = B.x + B.w + COL;
    const win = rectY(ya + 6, yb - 6, xf + 0.05, zb + 3, zb + H - 5.5);
    paneles.push({ x: xf, y: (ya + yb) / 2, body: S(box(xf - 1.2, ya, 1.2, yb - ya, zb, H - 2, 0), { tone: "mid", crease: "lo" }) + L(win, { tone: "mid" }) });
  }
  paneles
    .sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y))
    .forEach((pn, j) => items.push({ d: depth(pn.x, pn.y), svg: toggle(pn.body, term, (0.05 + j * 0.08).toFixed(2)) }));
  items.sort((a, b) => a.d - b.d);

  const out = items.map((it) => it.svg);
  // Moldaje y losa
  out.push(toggle(S(k.slabOf(k.insetPlan(LOSA, COL), zt - 2.6, 0.6, P, 2), { tone: "lo", crease: "none" }), est, 0.45));
  const losa = S(k.slabOf(LOSA, zt - 2, 2, P, 2, 0.4), { tone: "mid", crease: "lo" }) + L(k.planOutline(k.insetPlan(LOSA, 4), zt, P, 2), { tone: "faint" });
  out.push(toggle(losa, est, 0.7));
  // Contorno del plan: visible mientras la losa real no existe; se marca si el plan ya la pedía
  const cs = k.corners(LOSA);
  const ghost =
    L(k.planOutline(LOSA, zt, P, 2) + cs.map(([x, y]) => seg([x, y, zb], [x, y, zt])).join(""), { tone: HOY_E.plan[est] >= 0.7 ? "hi" : "faint" }).replace("<path", `<path data-ghost="${est}"`) +
    D(cs.map(([x, y]) => at([x, y, zb])), { size: 0.4, tone: "lo" });
  out.push(toggle(ghost, est, -1, { max: 0.7 }));
  out.push(andamio(p));
  return out.join("");
}

// Andamio de fachada (cara frontal izquierda) mientras dura la terminación del piso
function andamio(p) {
  const zb = z0(p);
  const deck = zb + H - 1.4;
  const ya = B.y + B.d + COL + 3;
  const yb = ya + 6;
  const xs = [-38, -14, 10, 34, 58, 78];
  const out = [];
  for (const x of xs) out.push(S(k.cylinder(x, ya, 0.55, zb, H, P, 8), { tone: "lo", crease: "none" }));
  out.push(S(box(xs[0], ya - 0.6, xs[5] - xs[0], yb - ya + 1.2, deck, 0.6, 0.2), { tone: "mid", crease: "none" }));
  for (const x of xs) out.push(S(k.cylinder(x, yb, 0.55, zb, H, P, 8), { tone: "lo", crease: "none" }));
  const rails = [deck - 6, deck - 11].map((z) => seg([xs[0], yb, z], [xs[5], yb, z])).join("");
  const braces = xs.slice(0, -1).map((x, i) => seg([x, yb, zb], [xs[i + 1], yb, deck])).join("");
  out.push(L(rails, { tone: "lo" }), L(braces, { tone: "faint" }));
  return toggle(out.join(""), "term" + p, 0.001, { max: 0.999 });
}

// ── Acopio de fierro (adelante a la izquierda) ───────────────────────────────
function acopio() {
  const out = [];
  for (const x of [-136, -118, -100]) out.push(S(box(x, 44, 4, 26, 0, 2.2, 0.3), { tone: "lo" }));
  for (let i = 0; i < 2; i++) {
    const y = 47 + i * 11;
    out.push(S(box(-140, y, 48, 8, 2.2 + 0, 1.6, 0.4), { tone: "mid", crease: "lo" }));
    const bars = [];
    for (let b = 1; b < 8; b++) bars.push(k.lineOnTop([-140, y + b], [-92, y + b], 3.8, P));
    out.push(L(bars.join(""), { tone: "lo" }));
  }
  // Pallet de bloques
  for (const [px, py] of [[-82, 56], [-58, 56]]) {
    out.push(S(box(px, py, 20, 16, 0, 1.6, 0.2), { tone: "lo" }));
    out.push(S(box(px + 1, py + 1, 18, 14, 1.6, 8, 0.2), { tone: "mid", crease: "lo" }));
    const rows = [2.6, 5.2].map((z) => seg([px + 19, py + 1, 1.6 + z], [px + 19, py + 15, 1.6 + z]) + seg([px + 1, py + 15, 1.6 + z], [px + 19, py + 15, 1.6 + z])).join("");
    out.push(L(rows, { tone: "faint" }));
  }
  return toggle(out.join(""), "fund", 0.2);
}

// ── Acopio de moldajes y alzaprimas (adelante del edificio) ─────────────────
function moldajes() {
  const out = [];
  for (const [px, py] of [[62, 60], [92, 60]]) {
    out.push(S(box(px, py, 24, 14, 0, 1.4, 0.2), { tone: "lo" }));
    out.push(S(box(px + 0.5, py + 0.5, 23, 13, 1.4, 7, 0.2), { tone: "mid", crease: "lo" }));
    const capas = [];
    for (let z = 2.4; z < 8.4; z += 1) capas.push(seg([px + 23.5, py + 0.5, z], [px + 23.5, py + 13.5, z]) + seg([px + 0.5, py + 13.5, z], [px + 23.5, py + 13.5, z]));
    out.push(L(capas.join(""), { tone: "faint" }));
    out.push(D(k.corners({ x: px + 0.5, y: py + 0.5, w: 23, d: 13 }, 2).map(([x, y]) => at([x, y, 8.4])), { size: 0.4 }));
  }
  // Atado de alzaprimas tendidas
  out.push(S(box(124, 65, 2, 14, 0, 1.6, 0.2), { tone: "lo" }), S(box(148, 65, 2, 14, 0, 1.6, 0.2), { tone: "lo" }));
  out.push(S(box(120, 66, 34, 12, 1.6, 3.2, 0.6), { tone: "mid", crease: "lo" }));
  const tubos = [];
  for (let y = 68; y < 77; y += 2) tubos.push(k.lineOnTop([120, y], [154, y], 4.8, P));
  out.push(L(tubos.join(""), { tone: "lo" }));
  return toggle(out.join(""), "est1", 0.2);
}

// ── Reloj de avance ──────────────────────────────────────────────────────────
const ANG0 = (-150 * Math.PI) / 180;
const SPAN = (300 * Math.PI) / 180;
const agujaD = (pct, largo, cola) => {
  const a = ANG0 + (SPAN * pct) / 100;
  const [x, y] = DIAL;
  return k.lineOnTop([x - Math.sin(a) * cola, y + Math.cos(a) * cola], [x + Math.sin(a) * largo, y - Math.cos(a) * largo], DIAL_TOP + 0.2, P);
};
// Marca del plan: desde el anillo hacia adentro, como un índice en el bisel
const marcaD = (pct) => {
  const a = ANG0 + (SPAN * pct) / 100;
  const [x, y] = DIAL;
  return k.lineOnTop([x + Math.sin(a) * (DIAL_R - 2), y - Math.cos(a) * (DIAL_R - 2)], [x + Math.sin(a) * (DIAL_R - 8), y - Math.cos(a) * (DIAL_R - 8)], DIAL_TOP + 0.2, P);
};
function reloj() {
  const [x, y] = DIAL;
  const out = [];
  out.push(S(k.cylinder(x, y, DIAL_R + 4, 0, 3, P, 56), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, DIAL_R, 3, DIAL_TOP - 3, P, 64, 0.8), { tone: "mid", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 90, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, DIAL_R - 2.6, 20, 2, DIAL_TOP, [1.4, 3], P, ANG0, SPAN);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 10], DIAL_TOP, P, "x"), "% AVANCE", { size: 2.4, tone: "lo", anchor: "middle" }));
  out.push(D(k.corners({ x: x - DIAL_R - 2, y: y - DIAL_R - 2, w: DIAL_R * 2 + 4, d: DIAL_R * 2 + 4 }).map(([cx, cy]) => {
    const a = Math.atan2(cy - y, cx - x);
    return at([x + Math.cos(a) * (DIAL_R + 2), y + Math.sin(a) * (DIAL_R + 2), 3]);
  }), { size: 0.45 }));
  return out.join("");
}

// ── Regla de tiempo y cursor de fecha ────────────────────────────────────────
function regla() {
  const out = [];
  const tira = { x: DIA0 - 6, y: 98, w: DIAS * POR_DIA + 12, d: 8, r: 1 };
  out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(DIA0, xDia(DIAS), 11.2, 5, tira.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([xDia(HOY), tira.y + 0.8], [xDia(HOY), tira.y + 6], 0.6, P), { tone: "hi" }));
  out.push(D([at([xDia(HOY), tira.y + 6.6, 0.6])], { size: 0.6, tone: "hi" }));
  out.push(D([at([tira.x + 2, tira.y + 4, 0.6]), at([tira.x + tira.w - 2, tira.y + 4, 0.6])], { size: 0.45 }));
  // Riel y topes
  out.push(S(k.slabOf({ x: DIA0 - 8, y: 87, w: DIAS * POR_DIA + 16, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
  out.push(D([DIA0 - 2, xDia(DIAS) + 2].map((xx) => at([xx, 89.5, 3])), { size: 0.4 }));
  for (const xx of [DIA0 - 14, xDia(DIAS) + 8]) {
    out.push(S(k.slabOf({ x: xx, y: 84, w: 6, d: 11, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([xx + 3, 86.5, 7]), at([xx + 3, 92.5, 7])], { size: 0.45 }));
  }
  return out.join("");
}
function cursor() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -6, y: 85, w: 12, d: 9, r: 2 }, 3, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf({ x: -7, y: 84, w: 14, d: 11, r: 2 }, 3, 5, P, 4, 0.6), { tone: "mid" }));
  out.push(D([at([-4.5, 86, 8]), at([4.5, 86, 8])], { size: 0.4, tone: "lo" }));
  out.push(S(k.slabOf({ x: -1, y: 95, w: 2, d: 7, r: 0.6 }, 3.4, 0.8, P, 2), { tone: "hi", lit: true }));
  out.push(S(k.cylinder(0, 89.5, 3, 8, 4, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(0, 89.5, 3, 8, 12, 20, P), { tone: "lo" }));
  out.push(D([at([0, 89.5, 12])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

// ── Composición ──────────────────────────────────────────────────────────────
const pisos = [];
for (let p = 1; p <= PISOS; p++) pisos.push(piso(p));
const gruaOn = (body) => toggle(body, "fund", 0.4, { act2: "est5", max2: 1 });

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Maqueta isométrica de una obra de cinco pisos sobre un banco: al fondo la instalación de faena y una grúa torre; adelante una regla de 250 días con un cursor de fecha y un reloj de avance. Al mover el cursor el edificio se levanta piso a piso: pilares, alzaprimas, losa, tabiques y andamio aparecen según el avance real, y el contorno marca lo que el plan ya pedía.",
  body: [
    banco(),
    faena(),
    gruaOn(gruaMastil()),
    fundaciones(),
    ...pisos,
    gruaOn(gruaPluma() + `<path data-part="cable" class="iso-line" data-tone="lo" d=""/><g data-part="gancho">${gancho()}</g>`),
    acopio(),
    reloj(),
    `<path data-part="plan" class="iso-line" data-tone="hi" data-free="end" d="${marcaD(HOY_E.avancePlan)}" style="stroke-width:1.6"/>`,
    `<path data-part="real" class="iso-line" data-tone="lit" data-free="start" d="${agujaD(HOY_E.avanceReal, DIAL_R - 2, 3.4)}" style="stroke-width:1.1"/>`,
    `<g>${D([at([DIAL[0], DIAL[1], DIAL_TOP + 0.2])], { size: 1.3, tone: "hi" })}</g>`,
    moldajes(),
    regla(),
    `<g data-part="cursor" transform="${k.translateAlong(P, [xDia(HOY), 0, 0])}">${cursor()}</g>`,
  ],
});

const fmt = (v) => v.toFixed(1).replace(".", ",");
const leer = (e) => `día ${Math.round(e.t)} · plan ${fmt(e.avancePlan)} % · ${e.proyectado ? "proy." : "real"} ${fmt(e.avanceReal)} %`;

const live = `
${strip("model.mjs")}
const P = ${JSON.stringify(P)};
const DIA0 = ${DIA0}, POR_DIA = ${POR_DIA}, H = ${H}, FUND = ${FUND}, TROLLEY_X = ${TROLLEY_X}, BALDE = ${BALDE};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, ANG0 = ${ANG0}, SPAN = ${SPAN};
const lineOnTopK = (a, b, z) => onTop([a, b], z, P);
const agujaD = (pct, largo, cola) => {
  const a = ANG0 + (SPAN * pct) / 100;
  const [x, y] = DIAL;
  return lineOnTopK([x - Math.sin(a) * cola, y + Math.cos(a) * cola], [x + Math.sin(a) * largo, y - Math.cos(a) * largo], DIAL_TOP + 0.2);
};
const marcaD = (pct) => {
  const a = ANG0 + (SPAN * pct) / 100;
  const [x, y] = DIAL;
  return lineOnTopK([x + Math.sin(a) * (DIAL_R - 2), y - Math.cos(a) * (DIAL_R - 2)], [x + Math.sin(a) * (DIAL_R - 8), y - Math.cos(a) * (DIAL_R - 8)], DIAL_TOP + 0.2);
};
const fmt = ${fmt.toString()};
const leer = ${leer.toString()};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (n) => svg.querySelector('[data-part="' + n + '"]');
const cursorG = $("cursor"), cable = $("cable"), gancho = $("gancho"), agPlan = $("plan"), agReal = $("real");
const readout = document.querySelector("[data-readout]");
const toggles = [...svg.querySelectorAll("[data-act]")].map((g) => ({
  g, act: g.dataset.act, min: +g.dataset.min, max: g.dataset.max ? +g.dataset.max : 2,
  act2: g.dataset.act2, max2: g.dataset.max2 ? +g.dataset.max2 : 2, on: g.style.opacity === "1",
}));
const ghosts = [...svg.querySelectorAll("[data-ghost]")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
// z del balde: sobre la losa del piso en obra (o sobre las fundaciones)
let hook = { at: 60, rate: 0 };
function hookTarget(e) {
  for (let p = 1; p <= PISOS; p++) {
    const v = e.real["est" + p];
    if (v > 0 && v < 1) return FUND + p * H + 10 - (v < 0.7 ? H : 0) + (v < 0.7 ? 2 : 0);
  }
  return e.real.fund < 1 ? FUND + 14 : FUND + PISOS * H + 14;
}
function draw(t) {
  const e = estadoEn(t);
  cursorG.setAttribute("transform", translateAlong(P, [DIA0 + t * POR_DIA, 0, 0]));
  for (const x of toggles) {
    const on = e.real[x.act] >= x.min && e.real[x.act] < x.max && (!x.act2 || e.real[x.act2] < x.max2);
    if (on !== x.on) { x.on = on; x.g.style.opacity = on ? "1" : "0"; }
  }
  for (const gp of ghosts) {
    const tone = e.plan[gp.dataset.ghost] >= 0.7 ? "hi" : "faint";
    if (gp.dataset.tone !== tone) gp.dataset.tone = tone;
  }
  agPlan.setAttribute("d", marcaD(e.avancePlan));
  agReal.setAttribute("d", agujaD(e.avanceReal, DIAL_R - 2, 3.4));
  gancho.setAttribute("transform", translateAlong(P, [0, 0, hook.at]));
  cable.setAttribute("d", pathOf([iso([TROLLEY_X, 0, 113.4], P), iso([TROLLEY_X, 0, hook.at + 6], P)]));
  const text = leer(e);
  if (readout.textContent !== text) readout.textContent = text;
  return e;
}
let dia = HOY, target = HOY, frame = 0, last = 0, clock = 0, touring = !still.matches, visibleNow = false, idle = 0;
// Recorrido: del día 0 al 250 en 15 s con una pausa de 2,4 s en hoy
const TOUR = 20;
const tourAt = (c) => {
  const u = c % TOUR;
  if (u < 7) return (u / 7) * HOY;
  if (u < 9.4) return HOY;
  if (u < 17) return HOY + ((u - 9.4) / 7.6) * (DIAS - HOY);
  return DIAS;
};
function describe() {
  const e = estadoEn(Math.round(target));
  stage.setAttribute("aria-valuenow", String(Math.round(target)));
  stage.setAttribute("aria-valuetext", "Día " + Math.round(target) + ": avance plan " + fmt(e.avancePlan) + " %, " + (e.proyectado ? "proyectado " : "real ") + fmt(e.avanceReal) + " %");
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = tourAt(clock); }
  dia = calm ? target : dia + (target - dia) * (1 - Math.exp(-dt / (touring ? 0.08 : 0.22)));
  if (Math.abs(target - dia) < 0.02) dia = target;
  const e = estadoEn(dia);
  const want = hookTarget(e);
  if (calm) { hook.at = want; hook.rate = 0; }
  else for (let i = 0; i < 4; i++) { hook.rate += ((want - hook.at) * 30 - hook.rate * 9) * dt / 4; hook.at += hook.rate * dt / 4; }
  if (Math.abs(want - hook.at) < 0.01 && Math.abs(hook.rate) < 0.01) { hook.at = want; hook.rate = 0; }
  draw(dia);
  const settled = !touring && dia === target && hook.rate === 0;
  frame = visibleNow && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visibleNow) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false; target = acotar(next, 0, DIAS); describe();
  clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = (target / HOY) * 7 * (target <= HOY ? 1 : 0); run(); }, 3600);
  run();
};
new IntersectionObserver((entries) => { visibleNow = entries[entries.length - 1].isIntersecting; if (visibleNow) run(); }, { rootMargin: "120px 0px" }).observe(stage);
const svgBox = () => svg.getBoundingClientRect();
const diaDesde = (ev) => {
  const b = svgBox();
  const sx = (ev.clientX - b.left) / b.width * ${WIDTH};
  const x0 = iso([DIA0, 0, 0], P)[0], x1 = iso([DIA0 + DIAS * POR_DIA, 0, 0], P)[0];
  return acotar((sx - x0) / (x1 - x0), 0, 1) * DIAS;
};
stage.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse" || ev.buttons) steer(diaDesde(ev)); });
stage.addEventListener("pointerdown", (ev) => steer(diaDesde(ev)));
stage.addEventListener("keydown", (ev) => {
  const paso = ev.shiftKey ? 30 : 7;
  let to = null;
  if (ev.key === "ArrowRight" || ev.key === "ArrowUp") to = target + paso;
  if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") to = target - paso;
  if (ev.key === "Home") to = 0;
  if (ev.key === "End") to = DIAS;
  if (ev.key === "Enter" || ev.key === " ") to = HOY;
  if (to === null) return;
  ev.preventDefault();
  steer(Math.round(to));
});
// ?dia=N fija la fecha (enlaces desde la app y pruebas)
const fijo = Number(new URLSearchParams(location.search).get("dia"));
if (Number.isFinite(fijo) && new URLSearchParams(location.search).has("dia")) { touring = false; dia = target = acotar(fijo, 0, DIAS); }
hook.at = hookTarget(estadoEn(dia));
draw(dia);
describe();
`;

const css = `<style>[data-act]{transition:opacity .35s var(--anatomy-ease)}@media (prefers-reduced-motion:reduce){[data-act]{transition:none}}.iso-stage{touch-action:pan-y;cursor:ew-resize;border-radius:2px}.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}</style>`;

const body =
  css +
  k.plateHtml({
    fig: "Fig 4D",
    title: "Obra en el tiempo",
    hint: "Mueve el cursor sobre la regla",
    readout: leer(HOY_E),
    keys: [
      { mark: "lit", label: "Cursor de fecha y aguja de avance real" },
      { mark: "raised", label: "Sólido: ejecutado según el avance real" },
      { mark: "line", label: "Contorno marcado: el plan ya lo pedía y falta" },
    ],
    caption:
      "Edificio Los Aromos (datos de la demo): 5 pisos de 2,6 m, plazo 250 días, hoy es el día 112. Cada actividad del programa enciende sus elementos del modelo: pilares, alzaprimas y losa con la estructura; tabiques, ventanas y andamio con las terminaciones; la grúa vive mientras dura la obra gruesa. Después de hoy el avance real es una proyección.",
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Simulación 4D: flechas cambian la fecha de a una semana (Mayús: un mes), Inicio y Fin van a los extremos, Enter vuelve a hoy" aria-valuemin="0" aria-valuemax="${DIAS}" aria-valuenow="${HOY}">${svg}</div>`,
  });

mkdirSync(OUT, { recursive: true });
const name = theme === "light" ? "obra-4d-light.html" : "obra-4d.html";
const html = k.pageHtml({ title: "Obra en el tiempo", theme, body, script: strip("../kit/iso-kit.mjs") + live, width: 780 }).replace('<html lang="en">', '<html lang="es">');
writeFileSync(join(OUT, name), html);
console.log("wrote", join(OUT, name), Math.round(html.length / 1024) + " KB", "· actividades", ACTS.length);
