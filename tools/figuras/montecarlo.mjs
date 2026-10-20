// Fig. Monte Carlo: un tablero de Galton. Cada bolita es una simulación del programa: en cada
// fila de clavos la duración de una actividad sale más corta o más larga (sesgada según el SPI)
// y al final una lluvia puede sumar un día perdido. Las bolitas se apilan por semana de término;
// la placa iluminada es el término contractual. P50 y P80 se leen en la regla.
import { atajos, banco, k, pagina } from "./comun.mjs";

const MODELO = `
const FILAS = 10, BINS = 12, N = 400, LLUVIA = 0.15, CONTRATO = 6.5, SEM = 7;
const sesgo = (spi) => Math.min(0.8, Math.max(0.3, 0.5 + (1 - spi) * 1.2));
// Probabilidad exacta de cada casillero: binomial(FILAS, p) más la lluvia
function distribucion(spi) {
  const p = sesgo(spi);
  const bin = Array(BINS).fill(0);
  let c = 1;
  for (let j = 0; j <= FILAS; j++) {
    const pj = c * p ** j * (1 - p) ** (FILAS - j);
    bin[j] += pj * (1 - LLUVIA);
    bin[j + 1] += pj * LLUVIA;
    c = (c * (FILAS - j)) / (j + 1);
  }
  return bin;
}
function percentilBin(cuentas, q) {
  const n = cuentas.reduce((s, v) => s + v, 0);
  let a = 0;
  for (let b = 0; b < cuentas.length; b++) { a += cuentas[b]; if (a >= q * n - 1e-9) return b; }
  return cuentas.length - 1;
}
const diasDe = (b) => Math.round((b - CONTRATO) * SEM);
const cumple = (cuentas) => { const n = cuentas.reduce((s, v) => s + v, 0); return n ? cuentas.slice(0, Math.ceil(CONTRATO)).reduce((s, v) => s + v, 0) / n : 0; };`;
const m = new Function(MODELO + "return { distribucion, percentilBin, diasDe, cumple, N, BINS };")();

const W = 600, H = 520;
const PASO = 8, ZF = 100, DZ = 7, ZB = 10, YB = 4;
const xBin = (b) => (b - 5) * PASO;
const PLATE = { x: -84, y: -30, w: 176, d: 70, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-60, 0, 126], [68, 0, 126]], W, H, { pad: 24, azimuth: 66 });
const { S, L, D, at, seg, box } = atajos(P);

function tablero() {
  const out = [];
  out.push(S(box(-62, -8, 132, 18, 0, ZB, 1), { tone: "mid" }));
  out.push(D([[-58, -4], [66, -4], [-58, 6], [66, 6]].map(([x, y]) => at([x, y, ZB])), { size: 0.45 }));
  out.push(S(box(-58, -2, 124, 4, ZB, 112, 0.6), { tone: "mid", crease: "lo" }));
  out.push(L(k.pathOf([at([-54, 2, ZB + 4]), at([62, 2, ZB + 4]), at([62, 2, ZB + 108]), at([-54, 2, ZB + 108])], true), { tone: "faint" }));
  // Tolva
  out.push(S(box(-9, 2, 18, 6, ZF + 10, 8, 0.6), { tone: "mid" }));
  out.push(L(seg([-2, 8, ZF + 10], [2, 8, ZF + 10]), { tone: "hi" }));
  // Clavos
  const clavos = [];
  for (let r = 0; r < 10; r++) for (let j = 0; j <= r; j++) clavos.push(at([(j - r / 2) * PASO, 2.4, ZF - r * DZ]));
  out.push(L(clavos.map(([x, y]) => `M${(x - 0.9).toFixed(1)} ${y.toFixed(1)}a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0`).join(""), { tone: "mid" }));
  out.push(D(clavos, { size: 0.45, tone: "hi" }));
  return out.join("");
}

function casilleros() {
  const out = [`<g data-part="pilas"></g>`];
  for (let b = 0; b <= 12; b++) {
    const x = xBin(b) - PASO / 2;
    out.push(S(box(x - 0.4, 2, 0.8, 5, ZB, 26, 0.1), { tone: b === 7 ? "hi" : "lo", crease: "none" }));
  }
  return out.join("");
}

function regla() {
  const out = [];
  const tira = { x: -50, y: 12, w: 104, d: 7, r: 1 };
  out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = [];
  for (let b = 0; b < 12; b++) ticks.push(k.lineOnTop([xBin(b), tira.y], [xBin(b), tira.y + 2.4], 0.6, P));
  out.push(L(ticks.join(""), { tone: "lo" }));
  out.push(L(k.lineOnTop([xBin(6.5), tira.y], [xBin(6.5), tira.y + tira.d - 1], 0.6, P), { tone: "hi" }));
  out.push(D([at([xBin(6.5), tira.y + tira.d - 1, 0.6])], { size: 0.6, tone: "hi" }));
  for (const id of ["p50", "p80"]) out.push(`<g data-part="${id}">${S(k.slabOf({ x: -1.4, y: tira.y + 3.2, w: 2.8, d: 3, r: 0.6 }, 0.6, id === "p50" ? 1.6 : 2.8, P, 2), { tone: id === "p50" ? "mid" : "hi" })}</g>`);
  out.push(D([at([tira.x + 2, tira.y + 3.5, 0.6]), at([tira.x + tira.w - 2, tira.y + 3.5, 0.6])], { size: 0.45 }));
  return out.join("");
}

const body = [banco(P, PLATE), regla(), tablero(), casilleros(), `<g class="iso-dots" data-tone="lit" data-part="bolitas"></g>`];

const live = `
${MODELO}
const P = ${JSON.stringify(P)};
const PASO = ${PASO}, ZF = ${ZF}, DZ = ${DZ}, ZB = ${ZB}, YB = ${YB};
const xBin = (b) => (b - 5) * PASO;
const pilas = part("pilas"), bolitasG = part("bolitas"), p50 = part("p50"), p80 = part("p80");
const POOL = 36;
for (let i = 0; i < POOL; i++) bolitasG.insertAdjacentHTML("beforeend", '<circle r="1.25" cx="0" cy="0" style="display:none"/>');
const circ = [...bolitasG.children];
let cuentas = Array(BINS).fill(0), vivas = [], spiAct = null, reloj = 0, lanzadas = 0, semilla = 1;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const ALTO = 0.8;
// Pilas de bolitas: 3 columnas por casillero, cada bolita dibujada vale 3 corridas
function pilasSvg() {
  const pts = [];
  cuentas.forEach((c, b) => {
    const n = Math.round(c / 3);
    for (let i = 0; i < n; i++) {
      const col = i % 3, fila = Math.floor(i / 3);
      pts.push(iso([xBin(b) + (col - 1) * 2.4, YB, ZB + 1.3 + fila * 2.4], P));
    }
  });
  return '<g class="iso-dots" data-tone="lit">' + pts.map(([x, y]) => '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.2"/>').join("") + "</g>";
}
function reiniciar(spi, calm) {
  spiAct = spi; vivas = []; lanzadas = 0;
  cuentas = calm ? distribucion(spi).map((v) => v * N) : Array(BINS).fill(0);
  if (calm) lanzadas = N;
  pilas.innerHTML = pilasSvg();
}
function lanzar(p) {
  const pasos = []; let j = 0;
  for (let r = 0; r < FILAS; r++) { pasos.push(j); if (azar() < p) j++; }
  pasos.push(j);
  return { pasos, bin: j + (azar() < LLUVIA ? 1 : 0), s: 0 };
}
const xEn = (r, j) => (j - r / 2) * PASO;
function dibujar(u, dt, calm) {
  const spi = Math.round((0.8 + u * 0.3) * 100) / 100;
  if (spi !== spiAct) reiniciar(spi, calm);
  if (!calm && lanzadas < N) {
    reloj += dt;
    while (reloj > 1 / 60 && lanzadas < N) { reloj -= 1 / 60; vivas.push(lanzar(sesgo(spi))); lanzadas++; }
  }
  let cambio = false;
  const quedan = [];
  for (const b of vivas) {
    b.s += dt / 0.075;
    if (b.s >= FILAS + 2.2) { cuentas[b.bin]++; cambio = true; } else quedan.push(b);
  }
  vivas = quedan;
  if (cambio) pilas.innerHTML = pilasSvg();
  circ.forEach((c, i) => {
    const b = vivas[vivas.length - 1 - i];
    if (!b) { if (c.style.display !== "none") c.style.display = "none"; return; }
    if (c.style.display) c.style.display = "";
    let x, z;
    if (b.s < FILAS) {
      const r = Math.floor(b.s), f = b.s - r;
      const xa = xEn(r, b.pasos[r]), xb = r + 1 < FILAS ? xEn(r + 1, b.pasos[r + 1]) : xBin(b.pasos[FILAS]);
      x = xa + (xb - xa) * f; z = ZF - r * DZ - DZ * f + 2.2 + Math.sin(Math.PI * f) * 1.6;
    } else {
      const f = Math.min(1, (b.s - FILAS) / 2.2);
      const xa = xBin(b.pasos[FILAS]), xb = xBin(b.bin);
      x = xa + (xb - xa) * Math.min(1, f * 2); z = ZF - FILAS * DZ + 2.2 - (ZF - FILAS * DZ - ZB - Math.min(26, Math.floor(cuentas[b.bin] / 9) * 2.4)) * f * f;
    }
    const [sx, sy] = iso([x, YB, z], P);
    c.setAttribute("cx", sx.toFixed(1)); c.setAttribute("cy", sy.toFixed(1));
  });
  const n = cuentas.reduce((s, v) => s + v, 0);
  const b50 = percentilBin(cuentas, 0.5), b80 = percentilBin(cuentas, 0.8);
  p50.setAttribute("transform", translateAlong(P, [xBin(b50), 0, 0]));
  p80.setAttribute("transform", translateAlong(P, [xBin(b80), 0, 0]));
  const f = (d) => (d > 0 ? "+" : "") + d + " d";
  decir(n < 1 ? "SPI " + spi.toFixed(2).replace(".", ",") + " · simulando" : "SPI " + spi.toFixed(2).replace(".", ",") + " · P50 " + f(diasDe(b50)) + " · P80 " + f(diasDe(b80)) + " · cumple " + Math.round(cumple(cuentas) * 100) + " %");
  return vivas.length > 0 || lanzadas < N;
}
const x0 = iso([-60, 0, 0], P)[0], x1 = iso([68, 0, 0], P)[0];
vivo({
  u0: 0.4, paso: 0.01 / 0.3, tau: 0.01, dibujar,
  tour: (c) => [0.67, 0.4, 0.17, 0.83][Math.floor(c / 9) % 4],
  puntero: (ev, presion) => (presion || ev.buttons ? (svgX(ev) - x0) / (x1 - x0) : null),
  describir: (u) => { const spi = 0.8 + u * 0.3; const d = distribucion(spi); stage.setAttribute("aria-valuetext", "SPI " + spi.toFixed(2) + ": probabilidad de cumplir el plazo " + Math.round(cumple(d) * 100) + " por ciento"); },
});
`;

// Estado inicial sin JavaScript: SPI 0,92 con la distribución esperada
const d0 = m.distribucion(0.92).map((v) => v * m.N);
const b50 = m.percentilBin(d0, 0.5), b80 = m.percentilBin(d0, 0.8);
pagina({
  nombre: "montecarlo",
  titulo: "Monte Carlo del plazo",
  fig: "Fig MC",
  hint: "Haz clic o arrastra para cambiar el SPI",
  readout: `SPI 0,92 · P50 ${m.diasDe(b50) > 0 ? "+" : ""}${m.diasDe(b50)} d · P80 ${m.diasDe(b80) > 0 ? "+" : ""}${m.diasDe(b80)} d · cumple ${Math.round(m.cumple(d0) * 100)} %`,
  keys: [
    { mark: "lit", label: "Bolitas y pilas: una corrida del programa cada una, por semana de término" },
    { mark: "raised", label: "Placa marcada: término contractual" },
    { mark: "line", label: "Regla: marcador bajo = P50, alto = P80" },
  ],
  caption:
    "Cada bolita es una corrida del programa: en cada fila la duración sale más corta o más larga, con sesgo al atraso cuando el SPI es bajo, y la lluvia del mes puede sumar días. Con 400 corridas las pilas dibujan la distribución de la fecha de término. P50 es la fecha que se cumple la mitad de las veces y P80 la que se cumple 8 de cada 10. La app hace lo mismo sobre el CPM real de la obra.",
  aria: "Monte Carlo del plazo: flechas cambian el SPI, Inicio y Fin van a los extremos",
  valor: { min: 0, max: 1, now: 0.4 },
  width: W,
  height: H,
  label: "Un tablero de Galton sobre un banco: bolitas caen por diez filas de clavos y se apilan en casilleros por semana de término; una placa marca el término contractual.",
  body,
  live,
});
