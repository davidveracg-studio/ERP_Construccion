const nf0 = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function num(v: number, dec = 0): string {
  if (!isFinite(v)) return '—'
  return dec === 0 ? nf0.format(v) : dec === 1 ? nf1.format(v) : nf2.format(v)
}

/** Monto en pesos: $ 12.345.678 */
export function clp(v: number): string {
  if (!isFinite(v)) return '—'
  return `$ ${nf0.format(Math.round(v))}`
}

/** Monto abreviado en millones: $ 45,2 MM */
export function mm(v: number): string {
  if (!isFinite(v)) return '—'
  const s = v < 0 ? '−' : ''
  return `${s}$ ${nf1.format(Math.abs(v) / 1_000_000)} MM`
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return '—'
  return `${dec === 0 ? nf0.format(v * 100) : nf1.format(v * 100)} %`
}

export function pp(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${s}${nf1.format(Math.abs(v) * 100)} pp`
}

export function idx(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return nf2.format(v)
}

export function signoPct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  const s = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${s}${nf1.format(Math.abs(v) * 100)} %`
}

let idDeterminista: ((prefijo: string) => string) | null = null

export function uid(prefijo = 'id'): string {
  if (idDeterminista) return idDeterminista(prefijo)
  return `${prefijo}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

/** Ejecuta f con ids correlativos derivados de la semilla (misma semilla → mismos ids). */
export function conIdsDeterministas<T>(semilla: string, f: () => T): T {
  const anterior = idDeterminista
  let n = 0
  idDeterminista = (prefijo) => `${prefijo}_${semilla}_${++n}`
  try {
    return f()
  } finally {
    idDeterminista = anterior
  }
}
