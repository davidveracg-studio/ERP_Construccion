// Modelo de caja de una obra (ilustrativo, con las condiciones por defecto de caja.ts):
// venta $1.000 MM, costo $890 MM, 10 meses. EP mensual = venta × avance del mes; se cobra el
// 95 % a los 40 días del corte (10 de aprobación + 30 de pago) y el 5 % queda retenido hasta
// 60 días después de la recepción. Los costos se pagan a los 30 días (proveedores) y 50 % al
// mes (remuneraciones). Aporte inicial de capital de trabajo: $200 MM.
export const VENTA = 1000, COSTO = 890, MESES = 10, DIAS = 400, APORTE = 200, RET = 0.05, COLCHON = 20;
const curvaS = (x) => { const v = Math.min(1, Math.max(0, x)); return v * v * (3 - 2 * v); };
export function movimientos() {
  const mov = [{ dia: 0, monto: APORTE, tipo: "aporte" }];
  let retenido = 0;
  for (let m = 1; m <= MESES; m++) {
    const av = curvaS(m / MESES) - curvaS((m - 1) / MESES);
    const corte = m * 30;
    mov.push({ dia: corte + 40, monto: VENTA * av * (1 - RET), tipo: "cobro", ret: VENTA * av * RET, corte });
    retenido += VENTA * av * RET;
    mov.push({ dia: corte, monto: -COSTO * av * 0.5, tipo: "remuneraciones" });
    mov.push({ dia: corte + 30, monto: -COSTO * av * 0.5, tipo: "proveedores" });
  }
  mov.push({ dia: MESES * 30 + 60, monto: retenido, tipo: "retencion" });
  return mov.sort((a, b) => a.dia - b.dia);
}
// Estado continuo en el día t: los movimientos se reparten en 6 días para que el flujo se vea
export function cajaEn(t, mov = movimientos()) {
  const r = (dia) => Math.min(1, Math.max(0, (t - dia) / 6));
  let caja = 0, retenido = 0, entra = 0, sale = 0, devuelve = 0;
  for (const x of mov) {
    const f = r(x.dia);
    caja += x.monto * f;
    if (x.tipo === "cobro") retenido += x.ret * (t >= x.corte ? 1 : 0);
    if (x.tipo === "retencion") retenido -= x.monto * f, devuelve = Math.max(devuelve, f > 0 && f < 1 ? 1 : 0);
    if (f > 0 && f < 1) { if (x.monto > 0 && x.tipo !== "retencion") entra = 1; if (x.monto < 0) sale = 1; }
  }
  return { t, caja, retenido: Math.max(0, retenido), entra, sale, devuelve };
}
