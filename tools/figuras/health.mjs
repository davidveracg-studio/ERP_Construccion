// Fig. Health Score: siete tubos comunicantes, uno por dimensión, con sección proporcional a
// su peso (costo 25, plazo 20, seguridad 15, avance 10, productividad 10, caja 10, calidad 5).
// Cada tubo se llena hasta el puntaje de su dimensión. Al abrir la válvula del colector el agua
// se nivela: la altura común es exactamente el promedio ponderado. Un flotador en el tubo de
// lectura marca el score; un accidente grave baja el tope a 59.
import { atajos, banco, k, pagina } from "./comun.mjs";

const DIM = [
  { id: "costo", peso: 25, v: 82 },
  { id: "plazo", peso: 20, v: 76 },
  { id: "seguridad", peso: 15, v: 92 },
  { id: "avance", peso: 10, v: 70 },
  { id: "productividad", peso: 10, v: 64 },
  { id: "caja", peso: 10, v: 88 },
  { id: "calidad", peso: 5, v: 96 },
];
const W = 680, H = 470;
const ESC = 0.8; // u por punto
const FONDO = 16, GAP = 4, Y0 = -8, Z0 = 7;
let x = -96;
for (const d of DIM) { d.w = d.peso * 1.2; d.x = x; x += d.w + GAP; }
const GX = x + 6; // tubo de lectura
const PLATE = { x: -122, y: -34, w: 248, d: 72, r: 8 };
const ALTO = 100 * ESC + 6;
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-96, Y0, Z0 + ALTO], [GX + 6, Y0, Z0 + ALTO + 10]], W, H, { pad: 24, azimuth: 62 });
const { S, L, D, at, seg, box } = atajos(P);

function tubo(d, i) {
  const out = [];
  const [x0, x1, y0, y1] = [d.x, d.x + d.w, Y0, Y0 + FONDO];
  out.push(`<g data-part="liq-${i}"></g>`);
  const zt = Z0 + ALTO;
  out.push(L([[x0, y1], [x1, y1], [x1, y0]].map(([a, b]) => seg([a, b, Z0], [a, b, zt])).join(""), { tone: "lo" }));
  out.push(L(k.pathOf([at([x0, y0, zt]), at([x1, y0, zt]), at([x1, y1, zt]), at([x0, y1, zt])], true), { tone: "mid" }));
  out.push(L(k.pathOf([at([x0, y1, Z0]), at([x1, y1, Z0]), at([x1, y0, Z0])]), { tone: "lo" }));
  // Marcas de 20 en 20 en la cara frontal
  out.push(L([20, 40, 60, 80, 100].map((v) => seg([x0, y1, Z0 + v * ESC], [x1, y1, Z0 + v * ESC])).join(""), { tone: "faint" }));
  return out.join("");
}

function colector() {
  const out = [];
  out.push(S(box(-100, Y0 - 2, GX + 12 + 100, FONDO + 4, 0, Z0, 1), { tone: "mid" }));
  out.push(D([-97, GX + 9].flatMap((xx) => [at([xx, Y0, Z0]), at([xx, Y0 + FONDO, Z0])]), { size: 0.45 }));
  // Cuerpo de la válvula al frente
  out.push(S(box(-14, Y0 + FONDO + 2, 12, 8, 0, 6, 0.8), { tone: "mid" }));
  out.push(S(k.cylinder(-8, Y0 + FONDO + 6, 2.2, 6, 2, P, 20), { tone: "mid" }));
  return out.join("");
}

function lectura() {
  const out = [];
  out.push(`<g data-part="liq-g"></g>`);
  const zt = Z0 + ALTO + 8;
  const [x0, x1, y0, y1] = [GX, GX + 6, Y0 + 5, Y0 + 11];
  out.push(L([[x0, y1], [x1, y1], [x1, y0]].map(([a, b]) => seg([a, b, Z0], [a, b, zt])).join(""), { tone: "lo" }));
  out.push(L(k.pathOf([at([x0, y0, zt]), at([x1, y0, zt]), at([x1, y1, zt]), at([x0, y1, zt])], true), { tone: "mid" }));
  out.push(L(k.pathOf([at([x0, y1, Z0]), at([x1, y1, Z0]), at([x1, y0, Z0])]), { tone: "lo" }));
  // Regleta graduada al lado
  out.push(S(box(GX + 8, Y0 + 6, 4, 4, Z0, ALTO, 0.2), { tone: "lo" }));
  const ticks = [];
  for (let v = 0; v <= 100; v += 10) ticks.push(k.pathOf([at([GX + 8, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 6, Z0 + v * ESC])]));
  out.push(L(ticks.join(""), { tone: "mid" }));
  out.push(L([60, 80].map((v) => k.pathOf([at([GX + 8, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 6, Z0 + v * ESC])])).join(""), { tone: "hi" }));
  return out.join("");
}

const body = [
  banco(P, PLATE),
  colector(),
  ...DIM.map(tubo),
  lectura(),
  `<g data-part="tope">${S(box(GX - 1.5, Y0 + 3.5, 9, 9, 0, 2.4, 0.6), { tone: "mid" })}</g>`,
  `<g data-part="flotador">${S(box(GX + 0.8, Y0 + 5.8, 4.4, 4.4, 0, 3, 0.4), { tone: "hi", lit: true })}</g>`,
  `<g data-part="palanca"></g>`,
  k.faceTextSvg(k.topMatrix([-60, Y0 + FONDO + 12], 0, P, "x"), "HEALTH SCORE", { size: 2.8, tone: "lo", anchor: "middle" }),
];

const live = `
const DIM = ${JSON.stringify(DIM)};
const P = ${JSON.stringify(P)};
const ESC = ${ESC}, FONDO = ${FONDO}, Y0 = ${Y0}, Z0 = ${Z0}, GX = ${GX};
const liq = DIM.map((_, i) => part("liq-" + i)), liqG = part("liq-g"), tope = part("tope"), flot = part("flotador"), palanca = part("palanca");
const total = DIM.reduce((s, d) => s + d.peso, 0);
const promedio = () => DIM.reduce((s, d) => s + d.v * d.peso, 0) / total;
let accidente = false, topeZ = 108, sel = 0;
const caja = (x, y, w, d, z, h, lit) => solidSvg(slabOf({ x, y, w, d, r: 0.2 }, z, h, P, 2, 0), { tone: lit ? "hi" : "mid", lit, crease: "lo" });
function palancaSvg(u) {
  const a = (u * Math.PI) / 2, cx = -8, cy = Y0 + FONDO + 6, L = 12, w = 1.2;
  const dx = Math.sin(a), dy = Math.cos(a);
  const ring = [[cx - dy * w, cy + dx * w], [cx + dx * L - dy * w, cy + dy * L + dx * w], [cx + dx * L + dy * w, cy + dy * L - dx * w], [cx + dy * w, cy - dx * w]];
  return solidSvg(extrude(ring, 8, 1.2, P), { tone: "mid" });
}
function dibujar(u, dt, calm) {
  const m = promedio();
  DIM.forEach((d, i) => {
    const v = d.v + (m - d.v) * u;
    liq[i].innerHTML = caja(d.x + 0.4, Y0 + 0.4, d.w - 0.8, FONDO - 0.8, Z0, v * ESC, false);
  });
  const want = accidente ? 59 : 108;
  topeZ = calm ? want : topeZ + (want - topeZ) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(want - topeZ) < 0.05) topeZ = want;
  const lectura = Math.min(m * u, accidente ? Math.max(0, topeZ) : 100);
  liqG.innerHTML = u > 0.01 ? caja(GX + 0.4, Y0 + 5.4, 5.2, 5.2, Z0, m * ESC * u, false) : "";
  flot.setAttribute("transform", translateAlong(P, [0, 0, Z0 + lectura * ESC]));
  tope.setAttribute("transform", translateAlong(P, [0, 0, Z0 + topeZ * ESC + 3]));
  palanca.innerHTML = palancaSvg(u);
  const score = accidente ? Math.min(m, 59) : m;
  decir(u < 0.98 ? (u < 0.02 ? "válvula cerrada · " : "nivelando · ") + DIM[sel].id + " " + Math.round(DIM[sel].v) : "score " + score.toFixed(1).replace(".", ",") + (accidente ? " · tope 59 (accidente grave)" : score >= 80 ? " · saludable" : score >= 60 ? " · alerta" : " · riesgo"));
  return topeZ !== want;
}
let objetivo = 0;
const tour = (c) => {
  const s = c % 18;
  accidente = s >= 10 && s < 14;
  return s < 2 ? 0 : s < 16 ? 1 : 0;
};
const tuboEn = (ev) => {
  const x = svgX(ev);
  return DIM.findIndex((d) => { const a = iso([d.x, Y0 + FONDO, 0], P)[0], b = iso([d.x + d.w, Y0 + FONDO, 0], P)[0]; return x >= a && x <= b; });
};
const ctl = vivo({
  u0: 1, tau: 0.6, dibujar, tour,
  puntero: (ev, presion) => {
    const i = tuboEn(ev);
    if (i < 0) { if (presion) { objetivo = ctl.u > 0.5 ? 0 : 1; return objetivo; } return null; }
    if (!ev.buttons && !presion) return null;
    sel = i;
    const d = DIM[i];
    const base = iso([d.x + d.w / 2, Y0 + FONDO, Z0], P)[1];
    d.v = Math.round(acotar((base - svgY(ev)) / (iso([0, 0, 0], P)[1] - iso([0, 0, ESC], P)[1]), 0, 100));
    ctl.pausar(); ctl.run();
    return null;
  },
  teclas: (ev) => {
    if (ev.key === " " || ev.key === "Enter") { objetivo = ctl.u > 0.5 ? 0 : 1; ctl.steer(objetivo); return true; }
    if (ev.key === "a" || ev.key === "A") { accidente = !accidente; return true; }
    if (ev.key === "ArrowRight") { sel = (sel + 1) % DIM.length; return true; }
    if (ev.key === "ArrowLeft") { sel = (sel + DIM.length - 1) % DIM.length; return true; }
    if (ev.key === "ArrowUp") { DIM[sel].v = Math.min(100, DIM[sel].v + 5); return true; }
    if (ev.key === "ArrowDown") { DIM[sel].v = Math.max(0, DIM[sel].v - 5); return true; }
    return false;
  },
  describir: () => stage.setAttribute("aria-valuetext", DIM[sel].id + " " + Math.round(DIM[sel].v) + ". Score ponderado " + Math.round(promedio()) + (accidente ? ", con tope 59 por accidente grave" : "")),
});
`;

const m = DIM.reduce((s, d) => s + d.v * d.peso, 0) / DIM.reduce((s, d) => s + d.peso, 0);
pagina({
  nombre: "health-score",
  titulo: "Health Score",
  fig: "Fig HS",
  hint: "Arrastra un tubo · Espacio: válvula · A: accidente",
  readout: `score ${m.toFixed(1).replace(".", ",")} · saludable`,
  keys: [
    { mark: "lit", label: "Flotador: el score de la obra" },
    { mark: "raised", label: "Tubos: costo, plazo, seguridad, avance, productividad, caja y calidad" },
    { mark: "line", label: "Regleta: 60 alerta, 80 saludable" },
  ],
  caption:
    "Cada tubo es una dimensión del semáforo y su ancho es su peso (25, 20, 15, 10, 10, 10 y 5). Al abrir la válvula el agua se nivela en el promedio ponderado: un tubo ancho mueve mucho el nivel, el de calidad casi nada. Si en el mes hubo un accidente grave el tope baja a 59 y la obra queda en Riesgo aunque lo demás esté bien. Si una dimensión no tiene datos, su tubo se saca y los pesos se reparten entre los otros.",
  aria: "Health Score: izquierda y derecha eligen un tubo, arriba y abajo cambian su puntaje, Espacio abre o cierra la válvula y A activa un accidente grave",
  rol: "group",
  width: W,
  height: H,
  label: "Siete tubos de vidrio de distinto ancho sobre un colector con válvula, uno por dimensión del Health Score, y un tubo de lectura con flotador y regleta.",
  body,
  live,
});
