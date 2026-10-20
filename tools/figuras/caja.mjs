// Fig. Caja: un estanque es la caja de la obra. Entra agua por arriba cuando se cobra un EP
// (40 días después del corte), sale por la llave de abajo con cada pago, y el 5 % de cada EP
// se queda en el estanque chico de retenciones hasta 60 días después de la recepción.
// El anillo marcado es el colchón mínimo (2 % de la venta): el punto bajo de la curva es el
// capital de trabajo que la obra necesita.
import { atajos, banco, cursor, k, LIQUIDO, pagina, regla, vaso, fuente } from "./comun.mjs";
import { DIAS, VENTA, COLCHON, cajaEn, movimientos } from "./caja-modelo.mjs";

const W = 640, H = 500;
const ESC = 0.25; // u por $ MM
const RET_ESC = 0.6;
const T = { x: 8, y: 0, r: 30, base: 6, alto: 84 };
const RT = { x: -62, y: -16, r: 11, base: 6, alto: 34 };
const PLATE = { x: -104, y: -56, w: 214, d: 140, r: 8 };
const S0 = -72, POR_DIA = 0.4, RY = 50;
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [T.x, -40, 108], [T.x, 0, 96]], W, H, { pad: 24, azimuth: 38 });
const { S, L, D, at, seg, box } = atajos(P);
const A = (P.azimuth * Math.PI) / 180;
const frente = (t, dr = 0) => [t.x + Math.cos(A) * (t.r - 0.6 + dr), t.y + Math.sin(A) * (t.r - 0.6 + dr)];

function entrada() {
  const out = [];
  const [sx, sy] = frente(T);
  out.push(S(box(-44, -40, 5, 5, 0, 1.5, 0.4), { tone: "lo" }));
  out.push(S(box(-43, -39, 3, 3, 1.5, 102, 0.3), { tone: "mid" }));
  out.push(S(box(-43, -39, sx + 44.5, 3, 101.5, 3, 0.3), { tone: "mid", crease: "lo" }));
  out.push(S(box(sx - 1.5, -39, 3, sy + 40.5, 101.5, 3, 0.3), { tone: "mid", crease: "lo" }));
  out.push(S(box(sx - 2, sy - 2, 4, 4, 96, 6, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(-41.5, -33, 3.6, 60, 1.6, P, 24), { tone: "mid" }));
  out.push(D([at([-41.5, -33, 61.6])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function retorno() {
  const out = [];
  out.push(S(box(RT.x + RT.r - 1, RT.y - 1.5, T.x - T.r - (RT.x + RT.r) + 2, 3, 3, 3, 0.3), { tone: "mid", crease: "lo" }));
  const vx = (RT.x + RT.r + T.x - T.r) / 2;
  out.push(S(box(vx - 2.5, RT.y - 2.5, 5, 5, 2, 5, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(vx, RT.y, 0.6, 7, 3, P, 10), { tone: "mid", crease: "none" }));
  out.push(`<g data-part="valvula">${S(k.cylinder(vx, RT.y, 3.4, 10, 1, P, 24), { tone: "mid" })}</g>`);
  return out.join("");
}

function salida() {
  const [fx, fy] = frente(T, 3);
  return [
    S(box(fx - 7, fy - 6, 14, 18, 0, 1, 0.6), { tone: "lo" }),
    L([0, 1, 2, 3, 4].map((i) => k.lineOnTop([fx - 7, fy - 3 + i * 3], [fx + 7, fy - 3 + i * 3], 1, P)).join(""), { tone: "faint" }),
    S(box(fx - 1.5, fy - 3, 3, 3, 8, 3, 0.3), { tone: "mid" }),
    S(box(fx - 1.5, fy - 1.5, 3, 3, 6.5, 2, 0.3), { tone: "mid" }),
  ].join("");
}

const [sx, sy] = frente(T);
const [ox, oy] = frente(T, 3);
const body = [
  banco(P, PLATE),
  regla(P, { x0: S0, largo: DIAS * POR_DIA, y: RY, paso: 12, cada: 3 }),
  entrada(),
  vaso(P, { ...RT, id: "ret", marcas: [10, 20, 30] }),
  retorno(),
  vaso(P, { ...T, id: "caja", marcas: [100, 200, 300].map((v) => v * ESC), fuerte: COLCHON * ESC }),
  `<path data-part="chorro" class="iso-line" data-tone="lit" data-flow="" d="" style="stroke-width:1.6;opacity:0"/>`,
  salida(),
  `<path data-part="desague" class="iso-line" data-tone="hi" data-flow="" d="${seg([ox, oy, 6.5], [ox, oy, 1])}" style="stroke-width:1.2;opacity:0"/>`,
  `<g data-part="cursor">${cursor(P, RY)}</g>`,
];

const live = `
${fuente("caja-modelo.mjs")}
${LIQUIDO}
const P = ${JSON.stringify(P)};
const T = ${JSON.stringify(T)}, RT = ${JSON.stringify(RT)}, ESC = ${ESC}, RET_ESC = ${RET_ESC}, S0 = ${S0}, POR_DIA = ${POR_DIA};
const SPOUT = [${sx}, ${sy}];
const MOV = movimientos();
const caja = part("caja"), ret = part("ret"), chorro = part("chorro"), desague = part("desague"), cur = part("cursor"), valvula = part("valvula");
const mm = (v) => "$" + Math.round(v).toLocaleString("es-CL") + " MM";
function dibujar(u) {
  const e = cajaEn(u * DIAS, MOV);
  const h = Math.max(0, e.caja) * ESC;
  caja.innerHTML = liquidoSvg(T.x, T.y, T.r, T.base, h, true);
  ret.innerHTML = liquidoSvg(RT.x, RT.y, RT.r, RT.base, e.retenido * RET_ESC, false);
  chorro.setAttribute("d", segment([SPOUT[0], SPOUT[1], 96], [SPOUT[0], SPOUT[1], T.base + h], P));
  chorro.style.opacity = e.entra ? "1" : "0";
  desague.style.opacity = e.sale ? "1" : "0";
  valvula.firstChild.toggleAttribute("data-lit", !!e.devuelve);
  cur.setAttribute("transform", translateAlong(P, [S0 + u * DIAS * POR_DIA, 0, 0]));
  decir("día " + Math.round(e.t) + " · caja " + mm(e.caja) + " · retenido " + mm(e.retenido));
  return false;
}
const x0 = iso([S0, ${RY}, 0], P)[0], x1 = iso([S0 + DIAS * POR_DIA, ${RY}, 0], P)[0];
vivo({
  u0: 186 / DIAS, paso: 15 / DIAS, tau: 0.3, dibujar,
  tour: (c) => { const t = c % 20; return t < 16 ? t / 16 : t < 18 ? 1 : 1 - (t - 18) / 2; },
  puntero: (ev) => (svgX(ev) - x0) / (x1 - x0),
  describir: (u) => { const e = cajaEn(Math.round(u * DIAS), MOV); stage.setAttribute("aria-valuenow", String(Math.round(u * DIAS))); stage.setAttribute("aria-valuetext", "Día " + Math.round(u * DIAS) + ": caja " + mm(e.caja) + ", retenido " + mm(e.retenido)); },
});
`;

const e0 = cajaEn(186);
pagina({
  nombre: "caja",
  titulo: "Caja de la obra",
  fig: "Fig Caja",
  hint: "Mueve el cursor sobre la regla",
  readout: `día 186 · caja $${Math.round(e0.caja)} MM · retenido $${Math.round(e0.retenido)} MM`,
  keys: [
    { mark: "lit", label: "Caja disponible y cobro de EP entrando" },
    { mark: "raised", label: "Retenciones del 5 % (estanque chico)" },
    { mark: "line", label: "Anillo marcado: colchón mínimo (2 % de la venta)" },
  ],
  caption: `Obra de $${VENTA.toLocaleString("es-CL")} MM con margen de 11 % (ilustrativo, condiciones por defecto de la app). Los costos salen antes de que entren los cobros: cada EP se paga 40 días después del corte y el 5 % queda retenido hasta 60 días después de la recepción. Con $200 MM de capital de trabajo el punto más bajo (día 186) apenas pasa el colchón; con menos, la obra se queda sin caja aunque gane plata.`,
  aria: "Caja de la obra: flechas cambian la fecha de a 15 días, Inicio y Fin van a los extremos",
  valor: { min: 0, max: DIAS, now: 186 },
  width: W,
  height: H,
  label: "Un estanque de vidrio sobre un banco representa la caja de la obra: se llena por un caño superior con cada cobro y se vacía por una llave con cada pago. Un estanque chico guarda las retenciones y las devuelve al final.",
  body,
  live,
});
