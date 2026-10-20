// Fig. EVM: tres probetas sobre un banco. La izquierda se llena con el valor planificado (PV),
// la del centro con el valor ganado (EV, lo que vale lo construido) y la derecha con el costo
// real (AC). En la probeta del centro un anillo marca dónde debería ir (PV): la distancia es el
// atraso (SV, SPI). En la derecha un anillo marca lo ganado (EV): lo que sobra es sobrecosto (CV, CPI).
import { atajos, banco, k, pagina } from "./comun.mjs";

// Modelo: BAC $1.200 MM en 40 semanas, curva S suave. El avance real va ~6 % detrás
// del plan y cada peso ganado cuesta 1,04 (CPI 0,96). Datos ilustrativos.
const MODELO = `
const BAC = 1200, SEMANAS = 40;
const curva = (x) => { const v = Math.min(1, Math.max(0, x)); return v * v * (3 - 2 * v); };
function evm(sem) {
  const x = sem / SEMANAS;
  const pv = BAC * curva(x), ev = BAC * curva(x * 0.94), ac = ev * 1.04;
  return { sem, pv, ev, ac, spi: pv > 0 ? ev / pv : 1, cpi: ac > 0 ? ev / ac : 1, eac: BAC / 0.96 };
}`;
const m = new Function(MODELO + "return { evm, BAC, SEMANAS };")();

const W = 640, H = 470;
const ESC = 0.1; // 1 u por $10 MM
const R = 15;
const BASE = 6;
const TANQUES = [{ x: -62, id: "pv" }, { x: 0, id: "ev" }, { x: 62, id: "ac" }];
const ALTO = m.BAC * 1.08 * ESC; // la probeta tiene espacio para el sobrecosto
const PLATE = { x: -112, y: -42, w: 224, d: 118, r: 8 };
const S0 = -80, POR_SEM = 4; // regla: 40 semanas = 160 u
const xSem = (s) => S0 + s * POR_SEM;

const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-62, 0, BASE + ALTO + 6], [62, 0, BASE + ALTO + 6]], W, H, { pad: 24, azimuth: 38 });
const { S, L, D, at, seg, box } = atajos(P);

function probeta({ x }, i) {
  const out = [];
  out.push(S(k.cylinder(x, 0, R + 5, 0, 2.4, P, 48, 0.4), { tone: "lo" }));
  out.push(S(k.cylinder(x, 0, R + 2, 2.4, BASE - 2.4, P, 48, 0.4), { tone: "mid" }));
  out.push(D(k.corners({ x: x - R - 3.5, y: -R - 3.5, w: (R + 3.5) * 2, d: (R + 3.5) * 2 }).map(([cx, cy]) => {
    const a = Math.atan2(cy, cx - x);
    return at([x + Math.cos(a) * (R + 3.6), Math.sin(a) * (R + 3.6), 2.4]);
  }), { size: 0.45 }));
  // Vidrio: siluetas y boca; marcas cada $300 MM
  const sil = [Math.PI / 2 + (P.azimuth * Math.PI) / 180, -Math.PI / 2 + (P.azimuth * Math.PI) / 180].map((a) => seg([x + Math.cos(a) * R, Math.sin(a) * R, BASE], [x + Math.cos(a) * R, Math.sin(a) * R, BASE + ALTO]));
  out.push(`<g data-part="liquido-${i}"></g>`);
  out.push(L(sil.join("") + k.sideArc(x, 0, R, BASE, P, 40), { tone: "lo" }));
  const marcas = [];
  for (let v = 300; v <= m.BAC; v += 300) marcas.push(k.sideArc(x, 0, R, BASE + v * ESC, P, 40));
  out.push(L(marcas.join(""), { tone: "faint" }));
  out.push(L(k.sideArc(x, 0, R, BASE + m.BAC * ESC, P, 40), { tone: "mid" }));
  out.push(`<path data-part="anillo-${i}" class="iso-line" data-tone="hi" d="" style="stroke-width:1.2"/>`);
  out.push(L(k.ring(x, 0, R, BASE + ALTO, P, 48), { tone: "mid" }));
  out.push(L(k.ring(x, 0, R - 1.2, BASE + ALTO, P, 48), { tone: "faint" }));
  // Llave de vaciado al frente
  const a = (P.azimuth * Math.PI) / 180;
  const fx = x + Math.cos(a) * (R + 2), fy = Math.sin(a) * (R + 2);
  out.push(S(k.cylinder(fx, fy, 1.6, 2.4, 5, P, 14), { tone: "mid" }));
  out.push(S(box(fx - 3, fy - 0.6, 6, 1.2, 7.4, 1, 0.3), { tone: "mid" }));
  return out.join("");
}

function regla() {
  const out = [];
  const tira = { x: S0 - 6, y: 58, w: 40 * POR_SEM + 12, d: 8, r: 1 };
  out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(S0, xSem(40), 4, 5, tira.y, 0.6, [2, 3.2], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([tira.x + 2, tira.y + 4, 0.6]), at([tira.x + tira.w - 2, tira.y + 4, 0.6])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: S0 - 8, y: 47, w: 40 * POR_SEM + 16, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
  for (const xx of [S0 - 14, xSem(40) + 8]) {
    out.push(S(k.slabOf({ x: xx, y: 44, w: 6, d: 11, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([xx + 3, 46.5, 7]), at([xx + 3, 52.5, 7])], { size: 0.45 }));
  }
  return out.join("");
}
function cursor() {
  return [
    `<path class="iso-halo" d="${k.haloOf({ x: -6, y: 45, w: 12, d: 9, r: 2 }, 3, 0.1, P)}" style="filter:blur(3px)"/>`,
    S(k.slabOf({ x: -7, y: 44, w: 14, d: 11, r: 2 }, 3, 5, P, 4, 0.6), { tone: "mid" }),
    D([at([-4.5, 46, 8]), at([4.5, 46, 8])], { size: 0.4, tone: "lo" }),
    S(k.slabOf({ x: -1, y: 55, w: 2, d: 7, r: 0.6 }, 3.4, 0.8, P, 2), { tone: "hi", lit: true }),
    S(k.cylinder(0, 49.5, 3, 8, 4, P, 24), { tone: "mid" }),
    L(k.knurl(0, 49.5, 3, 8, 12, 20, P), { tone: "lo" }),
    D([at([0, 49.5, 12])], { size: 0.5, tone: "hi" }),
  ].join("");
}
// Placa grabada detrás de las probetas
function placa() {
  return S(box(-84, -36, 168, 8, 0, 1, 0.6), { tone: "lo" }) + k.faceTextSvg(k.topMatrix([0, -30.5], 1, P, "x"), "PV · EV · AC  ($ MM)", { size: 3, tone: "lo", anchor: "middle" });
}

const body = [banco(P, PLATE), placa(), ...TANQUES.map(probeta), regla(), `<g data-part="cursor">${cursor()}</g>`];

const live = `
${MODELO}
const P = ${JSON.stringify(P)};
const TANQUES = ${JSON.stringify(TANQUES)}, R = ${R}, BASE = ${BASE}, ESC = ${ESC}, S0 = ${S0}, POR_SEM = ${POR_SEM};
const liq = TANQUES.map((_, i) => part("liquido-" + i));
const anillo = TANQUES.map((_, i) => part("anillo-" + i));
const cur = part("cursor");
const mm = (v) => Math.round(v).toLocaleString("es-CL");
const dos = (v) => v.toFixed(2).replace(".", ",");
function liquido(x, v, lit) {
  if (v < 0.5) return "";
  const p = cylinder(x, 0, R - 0.6, BASE, v * ESC, P, 40);
  return solidSvg(p, { tone: lit ? "hi" : "mid", lit, crease: "lo" });
}
function dibujar(u) {
  const e = evm(u * SEMANAS);
  const v = [e.pv, e.ev, e.ac];
  TANQUES.forEach((t, i) => { liq[i].innerHTML = liquido(t.x, v[i], i === 1); });
  // Centro: dónde debería ir (PV). Derecha: lo ganado (EV).
  anillo[0].setAttribute("d", "");
  anillo[1].setAttribute("d", e.pv > 1 ? sideArc(TANQUES[1].x, 0, R, BASE + e.pv * ESC, P, 40) : "");
  anillo[2].setAttribute("d", e.ev > 1 ? sideArc(TANQUES[2].x, 0, R, BASE + e.ev * ESC, P, 40) : "");
  cur.setAttribute("transform", translateAlong(P, [S0 + u * SEMANAS * POR_SEM, 0, 0]));
  decir("sem " + Math.round(e.sem) + " · SPI " + dos(e.spi) + " · CPI " + dos(e.cpi));
  return false;
}
const x0 = iso([S0, 50, 0], P)[0], x1 = iso([S0 + SEMANAS * POR_SEM, 50, 0], P)[0];
vivo({
  u0: 0.55, paso: 1 / SEMANAS, dibujar,
  tour: (c) => { const t = c % 16; return t < 11 ? t / 11 : t < 13.5 ? 1 : 1 - (t - 13.5) / 2.5; },
  puntero: (ev) => (svgX(ev) - x0) / (x1 - x0),
  describir: (u) => { const e = evm(Math.round(u * SEMANAS)); stage.setAttribute("aria-valuenow", String(e.sem)); stage.setAttribute("aria-valuetext", "Semana " + e.sem + ": planificado " + mm(e.pv) + ", ganado " + mm(e.ev) + ", gastado " + mm(e.ac) + " millones; SPI " + dos(e.spi) + ", CPI " + dos(e.cpi)); },
});
`;

const e0 = m.evm(22);
pagina({
  nombre: "curva-s",
  titulo: "Valor ganado",
  fig: "Fig EVM",
  hint: "Mueve el cursor sobre la regla",
  readout: `sem 22 · SPI ${e0.spi.toFixed(2).replace(".", ",")} · CPI ${e0.cpi.toFixed(2).replace(".", ",")}`,
  keys: [
    { mark: "lit", label: "EV: lo que vale lo construido (centro)" },
    { mark: "raised", label: "PV planificado (izq.) y AC gastado (der.)" },
    { mark: "line", label: "Anillo: PV en el centro, EV a la derecha" },
  ],
  caption:
    "Presupuesto de $1.200 MM en 40 semanas (ilustrativo). SPI = EV ÷ PV: bajo 1 el anillo del centro queda sobre el líquido y la obra va atrasada. CPI = EV ÷ AC: bajo 1 la probeta de la derecha rebalsa su anillo y cada peso ganado costó más. La curva S de la app es la altura de estas tres probetas semana a semana.",
  aria: "Valor ganado: flechas cambian la semana, Inicio y Fin van a los extremos",
  valor: { min: 0, max: 40, now: 22 },
  width: W,
  height: H,
  label: "Tres probetas sobre un banco con una regla de 40 semanas: valor planificado, valor ganado y costo real. Un anillo en la del centro marca el valor planificado y uno en la de la derecha el valor ganado.",
  body,
  live,
});
