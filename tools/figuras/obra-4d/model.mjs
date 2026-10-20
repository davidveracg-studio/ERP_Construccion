// Modelo de verdad de la figura 4D: programa del Edificio Los Aromos (demo VPAI).
// 5 pisos de 2,6 m sobre fundaciones, plazo 250 días, hoy = día 112.
// Cada actividad avanza lineal entre su inicio y su término; el avance de la obra
// es la suma ponderada (pesos = % del presupuesto). Lo "real" sigue al plan con un
// leve desfase (≤ 5 días); después de hoy es proyección, no dato.
export const DIAS = 250;
export const HOY = 112;
export const PISOS = 5;

export const ACTS = [
  { id: "faena", ini: 0, dur: 10, peso: 3 },
  { id: "fund", ini: 10, dur: 25, peso: 10 },
  ...[1, 2, 3, 4, 5].map((k) => ({ id: "est" + k, ini: 35 + 20 * (k - 1), dur: 20, peso: 9 })),
  ...[1, 2, 3, 4, 5].map((k) => ({ id: "term" + k, ini: 90 + 24 * (k - 1), dur: 26, peso: 7 })),
  { id: "recep", ini: 215, dur: 35, peso: 7 },
];

const acotar = (v, a, b) => Math.min(b, Math.max(a, v)); // (modelo)
export const fraccion = (act, t) => acotar((t - act.ini) / act.dur, 0, 1);
export const desfase = (t) => Math.min(5, t * 0.045);

export function estadoEn(t) {
  const plan = {};
  const real = {};
  let avancePlan = 0;
  let avanceReal = 0;
  for (const a of ACTS) {
    plan[a.id] = fraccion(a, t);
    real[a.id] = fraccion(a, t - desfase(t));
    avancePlan += plan[a.id] * a.peso;
    avanceReal += real[a.id] * a.peso;
  }
  return { t, plan, real, avancePlan, avanceReal, proyectado: t > HOY };
}
