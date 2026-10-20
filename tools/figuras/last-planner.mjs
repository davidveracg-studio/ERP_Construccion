// Fig. Last Planner: un clasificador de bandejas en cascada. Arriba están las 20 tareas que
// el plan intermedio dice que "deberían" hacerse; las que tienen restricciones (anillos) no
// están listas. Cada semana se comprometen 12 tareas que bajan a la bandeja "se hará"; la
// rejilla las filtra: con rejilla cerrada sólo bajan tareas sin restricciones. Al final de la
// semana las cumplidas caen a "hecho" y las otras a "no cumplidas" (con su causa). PPC =
// cumplidas ÷ comprometidas; la meta es 80 %.
import { atajos, banco, k, pagina } from "./comun.mjs";

const MODELO = `
const TOTAL = 20, RESTRINGIDAS = 8, COMPROMISO = 12, P_LIBRE = 0.9, P_RESTR = 0.2, META = 0.8;
// u = qué tan cerrada está la rejilla (0: se compromete a ciegas, 1: sólo tareas listas)
function semana(u) {
  const restr = Math.round(COMPROMISO * (RESTRINGIDAS / TOTAL) * (1 - u));
  const libres = COMPROMISO - restr;
  const okL = Math.round(libres * P_LIBRE), okR = Math.round(restr * P_RESTR);
  return { restr, libres, okL, okR, cumplidas: okL + okR, ppc: (okL + okR) / COMPROMISO };
}`;
const m = new Function(MODELO + "return { semana };")();

const W = 640, H = 470;
const PLATE = { x: -106, y: -54, w: 200, d: 104, r: 8 };
const BAND = {
  a: { x: -94, y: -44, w: 58, d: 48, z: 40, r: 1 },
  b: { x: -22, y: -40, w: 44, d: 40, z: 24, r: 1 },
  c: { x: 38, y: -40, w: 44, d: 40, z: 8, r: 1 },
  d: { x: 38, y: 12, w: 44, d: 26, z: 8, r: 1 },
};
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-94, -44, 50]], W, H, { pad: 24, azimuth: 48 });
const { S, L, D, at, seg, box, depth } = atajos(P);

function bandeja(t, lit = false) {
  const out = [];
  if (t.z > 3) {
    const postes = k.corners(t, 3).sort((a, b) => depth(...a) - depth(...b));
    for (const [x, y] of postes.slice(0, 2)) out.push(S(k.cylinder(x, y, 1.4, 0, t.z, P, 12), { tone: "lo", crease: "none" }));
    out.push(S(k.slabOf(t, t.z - 1.6, 1.6, P, 2, 0.3), { tone: "mid" }));
    for (const [x, y] of postes.slice(2)) out.push(S(k.cylinder(x, y, 1.4, 0, t.z - 1.6, P, 12), { tone: "lo", crease: "none" }));
  } else out.push(S(k.slabOf(t, 0, t.z, P, 2, 0.3), { tone: "mid" }));
  // Borde de la bandeja
  out.push(L(k.planOutline(k.insetPlan(t, 2.4), t.z, P, 2), { tone: "lo" }));
  out.push(D(k.corners(t, 1.2).map(([x, y]) => at([x, y, t.z])), { size: 0.45 }));
  return out.join("");
}

function rejilla() {
  const x = BAND.a.x + BAND.a.w + 1.4;
  const out = [S(box(x - 1.4, BAND.a.y + 4, 2.8, BAND.a.d - 8, BAND.a.z, 1.4, 0.3), { tone: "mid" })];
  out.push(`<g data-part="rejilla">`);
  for (let y = BAND.a.y + 7; y < BAND.a.y + BAND.a.d - 6; y += 4) out.push(S(k.cylinder(x, y, 0.7, BAND.a.z + 1.4, 6, P, 8), { tone: "hi", crease: "none" }));
  out.push(`</g>`);
  return out.join("");
}

const body = [
  banco(P, PLATE),
  bandeja(BAND.a),
  rejilla(),
  bandeja(BAND.b),
  bandeja(BAND.c),
  bandeja(BAND.d),
  // Rampa de "se hará" a "hecho"
  S(box(BAND.b.x + BAND.b.w, -24, 16, 8, 14, 1, 0.3), { tone: "lo" }),
  `<g data-part="anillos"></g><g class="iso-dots" data-tone="lit" data-part="tareas"></g>`,
];

const live = `
${MODELO}
const P = ${JSON.stringify(P)};
const BAND = ${JSON.stringify(BAND)};
const tareasG = part("tareas"), anillosG = part("anillos"), rejilla = part("rejilla");
// Lugar de la i-ésima bolita en una bandeja (grilla de 9 u)
function lugar(t, i, cols) {
  const c = i % cols, f = Math.floor(i / cols);
  return [t.x + 6 + c * 9 + (f % 2) * 2, t.y + 6 + f * 9, t.z + 1.4];
}
let tareas = [], u_semana = null;
function armar(u) {
  const s = semana(u);
  u_semana = u;
  tareas = [];
  // 20 tareas: 8 con restricciones. Comprometidas: s.libres libres y s.restr restringidas.
  let iL = 0, iR = 0, iB = 0, iC = 0, iD = 0;
  for (let i = 0; i < TOTAL; i++) {
    const restr = i % 5 === 1 || i % 5 === 3; // 8 de 20, repartidas
    const comp = restr ? iR++ < s.restr : iL++ < s.libres;
    let destino = null, ok = false;
    if (comp) {
      const n = restr ? iR : iL; // 1-based dentro de su grupo
      ok = restr ? n <= s.okR : n <= s.okL;
      destino = ok ? lugar(BAND.c, iC++, 4) : lugar(BAND.d, iD++, 4);
    }
    tareas.push({ restr, comp, ok, a: lugar(BAND.a, i, 5), b: comp ? lugar(BAND.b, iB++, 4) : null, c: destino });
  }
}
const salto = (p, q, f) => { const e = f * f * (3 - 2 * f); return [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e + Math.sin(Math.PI * f) * 8]; };
const CICLO = 9;
let reloj = 0;
function dibujar(u, dt, calm) {
  const uq = Math.round(u * 20) / 20;
  if (uq !== u_semana) { armar(uq); reloj = calm ? 8 : 0; }
  reloj = calm ? 8 : reloj + dt;
  const t = reloj % CICLO;
  const fB = acotar((t - 1.4) / 1.6, 0, 1), fC = acotar((t - 4.2) / 1.6, 0, 1);
  const lit = [], anillos = [];
  for (const x of tareas) {
    let p = x.a;
    if (x.comp) p = fC > 0 ? salto(x.b, x.c, fC) : fB > 0 ? salto(x.a, x.b, fB) : x.a;
    const [sx, sy] = iso(p, P);
    if (x.restr) anillos.push("M" + (sx - 1.5).toFixed(1) + " " + sy.toFixed(1) + "a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0");
    else lit.push('<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="1.6"/>');
  }
  tareasG.innerHTML = lit.join("");
  anillosG.innerHTML = '<path class="iso-line" data-tone="hi" d="' + anillos.join("") + '" style="stroke-width:1.1"/>';
  rejilla.style.opacity = (0.25 + 0.75 * uq).toFixed(2);
  const s = semana(uq);
  const fase = t < 1.4 ? "plan intermedio · 20 tareas" : t < 4.2 ? "comprometidas 12 (" + s.restr + " con restricción)" : "cumplidas " + s.cumplidas + " de 12 · PPC " + Math.round(s.ppc * 100) + " %";
  decir(fase);
  return !calm;
}
const ctl = vivo({
  u0: 1, paso: 0.25, tau: 0.01, dibujar,
  teclas: (ev) => { if (ev.key === " " || ev.key === "Enter") { ctl.steer(u_semana > 0.5 ? 0 : 1); return true; } return false; },
  tour: (c) => [1, 1, 0, 0, 0.5][Math.floor(c / CICLO) % 5],
  puntero: (ev, presion) => (presion ? (u_semana > 0.5 ? 0 : 1) : null),
  describir: (u) => { const s = semana(Math.round(u * 20) / 20); stage.setAttribute("aria-valuetext", "Rejilla " + Math.round(u * 100) + " por ciento cerrada: " + s.restr + " tareas comprometidas con restricciones, PPC " + Math.round(s.ppc * 100) + " por ciento"); },
});
`;

const s1 = m.semana(1), s0 = m.semana(0);
pagina({
  nombre: "last-planner",
  titulo: "Last Planner",
  fig: "Fig LPS",
  hint: "Clic: abre o cierra la rejilla · flechas: gradual",
  readout: `cumplidas ${s1.cumplidas} de 12 · PPC ${Math.round(s1.ppc * 100)} %`,
  keys: [
    { mark: "lit", label: "Tarea lista (sin restricciones)" },
    { mark: "line", label: "Anillo: tarea con restricciones; pines: la rejilla" },
    { mark: "raised", label: "Bandejas: debería → se hará → hecho / no cumplida" },
  ],
  caption: `Cada semana se comprometen 12 de las 20 tareas del plan intermedio. Una tarea lista se cumple 9 de cada 10 veces; una con restricciones (materiales, información, permisos) sólo 2 de cada 10. Con la rejilla cerrada sólo se comprometen tareas listas y el PPC llega a ${Math.round(s1.ppc * 100)} %; comprometiendo a ciegas baja a ${Math.round(s0.ppc * 100)} %, bajo la alerta de 60 %. Por eso el plan semanal de la app pide liberar restricciones antes de comprometer.`,
  aria: "Last Planner: clic o Espacio abre y cierra la rejilla; flechas la ajustan de a 25 por ciento",
  valor: { min: 0, max: 1, now: 1 },
  width: W,
  height: H,
  label: "Un clasificador de bandejas en cascada: arriba 20 tareas, con una rejilla de pines a la salida; al centro las 12 comprometidas; adelante las cumplidas y las no cumplidas.",
  body,
  live,
});
