import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { EstadoSemaforo, Severidad } from '../domain/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Card({ titulo, accion, children, className }: { titulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(titulo || accion) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          {accion}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Boton({ variante = 'primario', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro' }) {
  const v = {
    primario: 'bg-marca text-white hover:bg-marca-oscuro disabled:bg-slate-300',
    secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
    fantasma: 'text-marca hover:bg-blue-50',
    peligro: 'bg-crit text-white hover:bg-red-700',
  }[variante]
  return <button {...p} className={cx('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed', v, className)} />
}

export const COLOR_SEM: Record<EstadoSemaforo, string> = {
  verde: 'bg-ok', amarillo: 'bg-warn', rojo: 'bg-crit', na: 'bg-na',
}
const ICONO_SEM: Record<EstadoSemaforo, string> = { verde: '✓', amarillo: '!', rojo: '✕', na: '–' }
const TEXTO_SEM: Record<EstadoSemaforo, string> = { verde: 'En objetivo', amarillo: 'Alerta', rojo: 'Crítico', na: 'No disponible' }

export function Luz({ estado, tam = 'md' }: { estado: EstadoSemaforo; tam?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-4 w-4 text-[10px]', md: 'h-6 w-6 text-xs', lg: 'h-9 w-9 text-base' }[tam]
  return (
    <span role="img" aria-label={TEXTO_SEM[estado]} title={TEXTO_SEM[estado]}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', COLOR_SEM[estado], s)}>
      {ICONO_SEM[estado]}
    </span>
  )
}

const SEV: Record<Severidad, string> = {
  critica: 'bg-red-100 text-red-800 ring-red-200',
  alta: 'bg-orange-100 text-orange-800 ring-orange-200',
  media: 'bg-amber-50 text-amber-800 ring-amber-200',
  baja: 'bg-slate-100 text-slate-700 ring-slate-200',
}
export function BadgeSeveridad({ s }: { s: Severidad }) {
  return <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium ring-1', SEV[s])}>{s === 'critica' ? 'Crítica' : s[0].toUpperCase() + s.slice(1)}</span>
}

export function Badge({ children, tono = 'gris' }: { children: ReactNode; tono?: 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo' }) {
  const t = {
    gris: 'bg-slate-100 text-slate-700', azul: 'bg-blue-50 text-blue-800', verde: 'bg-emerald-50 text-emerald-800',
    ambar: 'bg-amber-50 text-amber-800', rojo: 'bg-red-50 text-red-800',
  }[tono]
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>
}

export function Kpi({ etiqueta, valor, sub, estado, ayuda }: { etiqueta: string; valor: ReactNode; sub?: ReactNode; estado?: EstadoSemaforo; ayuda?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" title={ayuda}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{etiqueta}</span>
        {estado && estado !== 'na' && <Luz estado={estado} tam="sm" />}
      </div>
      <div className="tabular mt-1 text-xl font-semibold text-slate-900">{valor}</div>
      {sub && <div className="tabular mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function Modal({ abierto, titulo, onCerrar, children }: { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode }) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[90vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <button onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  )
}

export const inputCls = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-2 focus:ring-blue-100'

export function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-800">{titulo}</p>
      <p className="mt-1 text-sm text-slate-500">{texto}</p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

export function Barra({ valor, max = 1, color = 'bg-marca' }: { valor: number; max?: number; color?: string }) {
  const w = Math.max(0, Math.min(100, (valor / (max || 1)) * 100))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${w}%` }} />
    </div>
  )
}

export function Titulo({ children, sub, accion }: { children: ReactNode; sub?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{children}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {accion && <div className="no-print flex flex-wrap gap-2">{accion}</div>}
    </div>
  )
}
