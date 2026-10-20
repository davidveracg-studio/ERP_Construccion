// Base común de las figuras explicativas (kit anatomy): página, tarjeta y bucle vivo.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

export { k };
const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, "..", "..", "public", "figuras");
export const fuente = (archivo) => readFileSync(join(HERE, archivo), "utf8").replace(/^export /gm, "");

// Atajos de dibujo atados a una proyección
export function atajos(P) {
  const at = (p) => k.iso(p, P);
  return {
    at,
    S: (paths, style) => k.solidSvg(paths, style),
    L: (d, style) => k.lineSvg(d, style),
    D: (pts, style) => k.dotsSvg(pts, style),
    box: (x, y, w, d, z, h, r = 0.3) => k.slabOf({ x, y, w, d, r }, z, h, P, 2, 0),
    depth: (x, y, z = 0) => k.depthOf([x, y, z], P),
    seg: (a, b) => k.segment(a, b, P),
    rectX: (x0, x1, y, za, zb) => k.pathOf([at([x0, y, za]), at([x1, y, za]), at([x1, y, zb]), at([x0, y, zb])], true),
    rectY: (y0, y1, x, za, zb) => k.pathOf([at([x, y0, za]), at([x, y1, za]), at([x, y1, zb]), at([x, y0, zb])], true),
  };
}

// Banco: placa con patas, ranura perimetral y tornillos en las esquinas
export function banco(P, plate, { alto = 10, pata = 5, inset = 22 } = {}) {
  const { S, L, D, at, depth } = atajos(P);
  const out = [`<path class="iso-halo" d="${k.haloOf(plate, -alto - pata, alto, P)}"/>`];
  for (const [x, y] of k.corners(plate, inset).sort((a, b) => depth(...a) - depth(...b))) {
    out.push(S(k.cylinder(x, y, 7, -alto - pata, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -alto - pata + 1.6, pata - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(plate, -alto, alto, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(plate, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

const CSS = `<style>.iso-stage{touch-action:pan-y;cursor:ew-resize;border-radius:2px}.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}[data-fade]{transition:opacity .35s var(--anatomy-ease)}.iso-dots[data-tone="lit"] circle{fill:var(--anatomy-lit);opacity:1}@media (prefers-reduced-motion:reduce){[data-fade]{transition:none}}</style>`;

// Escribe la página en los dos temas
export function pagina({ nombre, titulo, fig, hint, readout, keys, caption, aria, width, height, label, body, live, ancho = 760, rol = "slider", valor = {} }) {
  const svg = k.figureSvg({ width, height, label, body });
  const extra = Object.entries(valor).map(([a, v]) => ` aria-value${a}="${v}"`).join("");
  const html = (theme) =>
    k
      .pageHtml({
        title: titulo,
        theme,
        width: ancho,
        body:
          CSS +
          k.plateHtml({ fig, title: titulo, hint, readout, keys, caption, body: `<div class="iso-stage" tabindex="0" role="${rol}" aria-label="${aria}"${extra}>${svg}</div>` }),
        script: fuente("kit/iso-kit.mjs") + VIVO + `\nconst W = ${width};\n` + live,
      })
      .replace('<html lang="en">', '<html lang="es">');
  mkdirSync(OUT, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const archivo = join(OUT, theme === "light" ? `${nombre}-light.html` : `${nombre}.html`);
    writeFileSync(archivo, html(theme));
  }
  console.log("figura", nombre, Math.round(html("dark").length / 1024) + " KB");
}

// Runtime compartido: un valor u ∈ [0, 1] que sigue a su objetivo con suavizado,
// recorrido automático en reposo, puntero, teclado, pausa fuera de pantalla y movimiento reducido.
const VIVO = `
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const part = (n) => svg.querySelector('[data-part="' + n + '"]');
const parts = (n) => [...svg.querySelectorAll('[data-part="' + n + '"]')];
const acotar = (v, a, b) => Math.min(b, Math.max(a, v));
const decir = (texto) => { if (readout.textContent !== texto) readout.textContent = texto; };
const mostrar = (el, on) => { const o = on ? "1" : "0"; if (el.style.opacity !== o) el.style.opacity = o; };
const svgX = (ev) => { const b = svg.getBoundingClientRect(); return ((ev.clientX - b.left) / b.width) * W; };
const svgY = (ev) => { const b = svg.getBoundingClientRect(); return ((ev.clientY - b.top) / b.height) * (W * b.height / b.width); };
function vivo({ u0 = 0, tour, dibujar, puntero, teclas, paso = 0.05, tau = 0.25, describir }) {
  let u = u0, target = u0, frame = 0, last = 0, clock = 0, touring = !still.matches && !!tour, visible = false, idle = 0;
  const qs = new URLSearchParams(location.search);
  if (qs.has("u")) { touring = false; u = target = acotar(Number(qs.get("u")) || 0, 0, 1); }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const calm = still.matches;
    if (touring) { clock += dt; target = tour(clock); }
    u = calm ? target : u + (target - u) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - u) < 1e-4) u = target;
    const ocupado = dibujar(u, dt, calm);
    const quieto = !touring && u === target && !ocupado;
    frame = visible && !quieto ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
  const pausar = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches && !!tour; run(); }, 3600); };
  const steer = (next) => { pausar(); target = acotar(next, 0, 1); if (describir) describir(target); run(); };
  new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
  if (puntero) {
    stage.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse" || ev.buttons) { const v = puntero(ev); if (v != null) steer(v); } });
    stage.addEventListener("pointerdown", (ev) => { const v = puntero(ev, true); if (v != null) steer(v); });
  }
  stage.addEventListener("keydown", (ev) => {
    if (teclas && teclas(ev)) { ev.preventDefault(); pausar(); if (describir) describir(target); run(); return; }
    const p = ev.shiftKey ? paso * 4 : paso;
    let to = null;
    if (ev.key === "ArrowRight" || ev.key === "ArrowUp") to = target + p;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") to = target - p;
    if (ev.key === "Home") to = 0;
    if (ev.key === "End") to = 1;
    if (to === null) return;
    ev.preventDefault();
    steer(to);
  });
  dibujar(u, 0, true);
  if (describir) describir(u);
  return { steer, run, pausar, get u() { return u; } };
}
`;

// Probeta de vidrio: base, siluetas, boca y marcas. El líquido va en <g data-part="{id}">
// y se reconstruye en la página con liquidoSvg (ver LIQUIDO).
export function vaso(P, { x, y = 0, r, base, alto, id, marcas = [], fuerte = null }) {
  const { S, L, D } = atajos(P);
  const a = (P.azimuth * Math.PI) / 180;
  const out = [];
  out.push(S(k.cylinder(x, y, r + 5, 0, 2.4, P, 48, 0.4), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, r + 2, 2.4, base - 2.4, P, 48, 0.4), { tone: "mid" }));
  out.push(D([0, 1, 2, 3].map((i) => { const b = a + Math.PI / 4 + (i * Math.PI) / 2; return k.iso([x + Math.cos(b) * (r + 3.6), y + Math.sin(b) * (r + 3.6), 2.4], P); }), { size: 0.45 }));
  out.push(`<g data-part="${id}"></g>`);
  const sil = [a + Math.PI / 2, a - Math.PI / 2].map((b) => k.segment([x + Math.cos(b) * r, y + Math.sin(b) * r, base], [x + Math.cos(b) * r, y + Math.sin(b) * r, base + alto], P));
  out.push(L(sil.join("") + k.sideArc(x, y, r, base, P, 40), { tone: "lo" }));
  if (marcas.length) out.push(L(marcas.map((z) => k.sideArc(x, y, r, base + z, P, 40)).join(""), { tone: "faint" }));
  if (fuerte != null) out.push(L(k.sideArc(x, y, r, base + fuerte, P, 40), { tone: "hi" }));
  out.push(L(k.ring(x, y, r, base + alto, P, 48), { tone: "mid" }));
  out.push(L(k.ring(x, y, r - 1.2, base + alto, P, 48), { tone: "faint" }));
  return out.join("");
}
export const LIQUIDO = `
const liquidoSvg = (x, y, r, base, h, lit) => (h < 0.3 ? "" : solidSvg(cylinder(x, y, r - 0.6, base, h, P, 44), { tone: lit ? "hi" : "mid", lit, crease: "lo" }));
`;

// Regla de tiempo con riel y topes (el riel corre en x; la tira de la regla queda delante)
export function regla(P, { x0, largo, y, paso, cada }) {
  const { S, L, D } = atajos(P);
  const at = (p) => k.iso(p, P);
  const out = [];
  const tira = { x: x0 - 6, y: y + 11, w: largo + 12, d: 8, r: 1 };
  out.push(S(k.slabOf(tira, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(x0, x0 + largo, paso, cada, tira.y, 0.6, [2, 3.2], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([tira.x + 2, tira.y + 4, 0.6]), at([tira.x + tira.w - 2, tira.y + 4, 0.6])], { size: 0.45 }));
  out.push(S(k.slabOf({ x: x0 - 8, y, w: largo + 16, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
  for (const xx of [x0 - 14, x0 + largo + 8]) {
    out.push(S(k.slabOf({ x: xx, y: y - 3, w: 6, d: 11, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([xx + 3, y - 0.5, 7]), at([xx + 3, y + 5.5, 7])], { size: 0.45 }));
  }
  return out.join("");
}
// Cursor de fecha en x = 0 (se mueve con translateAlong); su lengüeta ilumina la regla
export function cursor(P, y) {
  const { S, L, D } = atajos(P);
  const at = (p) => k.iso(p, P);
  return [
    `<path class="iso-halo" d="${k.haloOf({ x: -6, y: y - 2, w: 12, d: 9, r: 2 }, 3, 0.1, P)}" style="filter:blur(3px)"/>`,
    S(k.slabOf({ x: -7, y: y - 3, w: 14, d: 11, r: 2 }, 3, 5, P, 4, 0.6), { tone: "mid" }),
    D([at([-4.5, y - 1, 8]), at([4.5, y - 1, 8])], { size: 0.4, tone: "lo" }),
    S(k.slabOf({ x: -1, y: y + 8, w: 2, d: 7, r: 0.6 }, 3.4, 0.8, P, 2), { tone: "hi", lit: true }),
    S(k.cylinder(0, y + 2.5, 3, 8, 4, P, 24), { tone: "mid" }),
    L(k.knurl(0, y + 2.5, 3, 8, 12, 20, P), { tone: "lo" }),
    D([at([0, y + 2.5, 12])], { size: 0.5, tone: "hi" }),
  ].join("");
}
