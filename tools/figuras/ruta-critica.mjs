// Fig. CPM: dos varillas empujan un travesaño que marca la fecha de término. La varilla A
// (actividad crítica) toca el travesaño: cada día de atraso lo corre un día. La varilla B
// tiene una holgura de 6 días: avanza en vacío hasta cerrar la luz y recién ahí empuja.
// El término es el máximo de los dos caminos: término = máx(A, B − holgura).
import { atajos, banco, k, pagina } from "./comun.mjs";

const MODELO = `
const HOLGURA = 6, TERMINO = 180, MAX_ATRASO = 15;
const termino = (a, b) => TERMINO + Math.max(a, b - HOLGURA, 0);`;
const W = 660, H = 430;
const D = 3; // u por día
const PLATE = { x: -122, y: -52, w: 252, d: 112, r: 8 };
const YA = -16, YB = 16;
const BAR_X = 40;
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [BAR_X, 0, 16], [118, 0, 18]], W, H, { pad: 24, azimuth: 36 });
const { S, L, D: Dots, at, seg, box, depth } = atajos(P);

function empujador(y, tip, tono) {
  const out = [];
  out.push(S(box(-100, y - 5, 14, 10, 2, 8, 0.8), { tone: "mid" }));
  out.push(Dots([at([-97, y - 3, 10]), at([-89, y - 3, 10])], { size: 0.4, tone: "lo" }));
  out.push(S(k.cylinder(-93, y, 3.2, 10, 4, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(-93, y, 3.2, 10, 14, 20, P), { tone: "lo" }));
  out.push(Dots([at([-93, y, 14])], { size: 0.5, tone: "hi" }));
  out.push(S(box(-86, y - 2, tip + 86, 4, 6, 4, 0.4), { tone: tono, crease: "lo" }));
  out.push(S(box(tip - 2, y - 2.6, 2, 5.2, 5.4, 5.2, 0.4), { tone: tono }));
  return out.join("");
}

function guias(y) {
  const out = [S(box(-106, y - 7, 44, 14, 0, 2, 1), { tone: "lo" })];
  out.push(Dots([at([-103, y - 4, 2]), at([-65, y - 4, 2]), at([-103, y + 4, 2]), at([-65, y + 4, 2])], { size: 0.45 }));
  for (const x of [-48, -10, 20]) {
    out.push(S(box(x, y - 4, 8, 8, 0, 6, 0.6), { tone: "mid" }));
    out.push(L(k.ring(x + 4, y, 1.6, 6, P, 16), { tone: "lo" }));
  }
  return out.join("");
}

function holgura() {
  const strip = { x: 22 - 1, y: YB + 6, w: 18 + 2, d: 4, r: 0.6 };
  const ticks = [];
  for (let i = 0; i <= 6; i++) ticks.push(k.lineOnTop([22 + i * D, strip.y], [22 + i * D, strip.y + strip.d], 0.6, P));
  return S(k.slabOf(strip, 0, 0.6, P, 2), { tone: "lo", crease: "none" }) + L(ticks.join(""), { tone: "mid" });
}

function regla() {
  const tira = { x: 28, y: 38, w: 82, d: 8, r: 1 };
  const out = [S(k.slabOf(tira, 0, 0.6, P, 3), { tone: "lo", crease: "none" })];
  const t = k.topTicks(30 + 0.0001, 108, 3, 5, tira.y, 0.6, [1.6, 2.8], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(Dots([at([tira.x + 2, tira.y + 4, 0.6]), at([tira.x + tira.w - 2, tira.y + 4, 0.6])], { size: 0.45 }));
  return out.join("");
}

function travesano() {
  const out = [];
  out.push(S(box(BAR_X, -30, 6, 60, 4, 8, 0.6), { tone: "mid", crease: "lo" }));
  out.push(Dots([at([BAR_X + 3, -26, 12]), at([BAR_X + 3, 26, 12])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: BAR_X + 2, y: 30, w: 2, d: 12, r: 0.6 }, 5, 0.8, P, 2), { tone: "hi", lit: true }));
  return out.join("");
}

const fijos = [
  banco(P, PLATE),
  regla(),
  S(box(30, -32, 84, 4, 0, 4, 0.6), { tone: "mid" }),
  S(box(30, 26, 84, 4, 0, 4, 0.6), { tone: "mid" }),
  guias(YA),
  `<g data-part="rodA">${empujador(YA, BAR_X, "hi")}</g>`,
  guias(YB),
  holgura(),
  `<g data-part="rodB">${empujador(YB, BAR_X - 6 * D, "mid")}</g>`,
  k.faceTextSvg(k.topMatrix([-84, YB + 5.4], 2, P, "x"), "HOLGURA 6 d", { size: 2.6, tone: "lo", anchor: "middle" }),
  `<g data-part="bar">${travesano()}</g>`,
  `<g data-part="resorte"></g>`,
  S(box(114, -9, 6, 18, 0, 16, 0.6), { tone: "mid" }),
  Dots([at([117, -5, 16]), at([117, 5, 16])], { size: 0.45 }),
];

const live = `
${MODELO}
const P = ${JSON.stringify(P)};
const D = ${D}, BAR_X = ${BAR_X};
const rodA = part("rodA"), rodB = part("rodB"), bar = part("bar"), resorte = part("resorte");
let a = 0, b = 0, ta = 0, tb = 0, sel = "b";
function dibujar(_, dt, calm) {
  const f = calm ? 1 : 1 - Math.exp(-dt / 0.22);
  a += (ta - a) * f; b += (tb - b) * f;
  if (Math.abs(ta - a) < 0.005) a = ta;
  if (Math.abs(tb - b) < 0.005) b = tb;
  const t = termino(a, b) - TERMINO;
  rodA.setAttribute("transform", translateAlong(P, [a * D, 0, 0]));
  rodB.setAttribute("transform", translateAlong(P, [b * D, 0, 0]));
  bar.setAttribute("transform", translateAlong(P, [t * D, 0, 0]));
  const c = coil(BAR_X + 6 + t * D, 114, [0, 8], 4, 9, "x", P, 18);
  resorte.innerHTML = lineSvg(c.back, { tone: "lo" }) + lineSvg(c.front, { tone: "mid" }) + dotsSvg([iso([BAR_X + 6 + t * D, 4, 8], P), iso([114, 4, 8], P)], { size: 0.7, tone: "mid" });
  const usados = Math.min(HOLGURA, b);
  decir("A +" + a.toFixed(0) + " d · B +" + b.toFixed(0) + " d (holgura " + (HOLGURA - usados).toFixed(0) + " d) · término +" + t.toFixed(0) + " d");
  return a !== ta || b !== tb;
}
// Recorrido: B consume su holgura y luego empuja; después A empuja de inmediato
const tour = (c) => {
  const s = c % 14;
  ta = s >= 8 && s < 10.5 ? Math.min(5, (s - 8) * 3) : s >= 10.5 && s < 12 ? 5 : s >= 12 ? Math.max(0, 5 - (s - 12) * 4) : 0;
  tb = s < 4 ? s * 2.5 : s < 5.5 ? 10 : s < 7 ? Math.max(0, 10 - (s - 5.5) * 8) : 0;
  return 0;
};
const yMed = (iso([0, ${YA}, 0], P)[1] + iso([0, ${YB}, 0], P)[1]) / 2;
const x0 = iso([0, 0, 0], P)[0], x1 = iso([MAX_ATRASO * D * 3, 0, 0], P)[0];
const ctl = vivo({
  dibujar, tour, paso: 0,
  puntero: (ev) => {
    sel = svgY(ev) < yMed ? "a" : "b";
    const v = Math.round(acotar((svgX(ev) - x0) / (x1 - x0), 0, 1) * MAX_ATRASO);
    if (sel === "a") ta = v; else tb = v;
    ctl.pausar(); ctl.run();
    return null;
  },
  teclas: (ev) => {
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") { sel = sel === "a" ? "b" : "a"; return true; }
    const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
    if (ev.key === "Home") { ta = tb = 0; return true; }
    if (!d) return false;
    if (sel === "a") ta = acotar(ta + d, 0, MAX_ATRASO); else tb = acotar(tb + d, 0, MAX_ATRASO);
    return true;
  },
  describir: () => stage.setAttribute("aria-valuetext", "Varilla " + sel.toUpperCase() + " seleccionada. Atraso A " + ta + " días, B " + tb + " días; término " + (termino(ta, tb) - TERMINO) + " días más tarde"),
});
`;

pagina({
  nombre: "ruta-critica",
  titulo: "Ruta crítica",
  fig: "Fig CPM",
  hint: "Arrastra una varilla · ↑↓ cambia de varilla",
  readout: "A +0 d · B +0 d (holgura 6 d) · término +0 d",
  keys: [
    { mark: "lit", label: "Travesaño: fecha de término del programa" },
    { mark: "raised", label: "Varilla A (crítica) toca el travesaño; B tiene luz" },
    { mark: "line", label: "Regla de holgura de B: 6 días" },
  ],
  caption:
    "El término lo fija el camino más largo: término = máx(atraso A, atraso B − holgura). Atrasar B hasta 6 días no mueve la obra, sólo se come su holgura; desde el séptimo día B pasa a ser crítica. Atrasar A mueve el término día por día. Es lo que calcula el CPM de la Carta Gantt para cada actividad.",
  aria: "Ruta crítica: flechas izquierda y derecha cambian el atraso de la varilla seleccionada, arriba y abajo cambian de varilla, Inicio vuelve a cero",
  rol: "group",
  width: W,
  height: H,
  label: "Dos varillas sobre un banco empujan un travesaño contra un resorte. La varilla A toca el travesaño; la B queda a 6 días de distancia. El travesaño señala la fecha de término en una regla.",
  body: fijos,
  live,
});
