import { Link } from 'react-router'
import type { CeldaSemaforo } from '../domain/semaforo'
import { idx, mm, pct, pp, signoPct } from '../domain/formato'
import { cx, Luz } from './ui'

export function valorCelda(c: CeldaSemaforo): string {
  if (c.estado === 'na') return c.disponibleEn ? `en ${c.disponibleEn}` : '—'
  if (c.dim === 'avance') return pp(c.valor)
  if (c.dim === 'productividad') return signoPct(c.valor)
  if (c.dim === 'caja') return mm(c.valor ?? 0)
  if (c.dim === 'compras') return pct(c.valor ?? 0, 0)
  return idx(c.valor)
}

/** Ruta que explica una dimensión: caja y compras tienen su propia pantalla. */
export function rutaDimension(dim: CeldaSemaforo['dim'], obraId?: string) {
  if (dim === 'caja') return '/caja'
  if (dim === 'compras') return '/compras'
  return `/explicacion/${dim}${obraId ? `?obra=${obraId}` : ''}`
}

/** Semáforo ejecutivo de 8 dimensiones (14 §5.3); cada celda abre la explicación. */
export function SemaforoEjecutivo({ celdas, obraId, compacto }: { celdas: CeldaSemaforo[]; obraId?: string; compacto?: boolean }) {
  return (
    <div className={cx('grid gap-2', compacto ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8')}>
      {celdas.map((c) => {
        const contenido = (
          <>
            <div className="flex items-center gap-2">
              <Luz estado={c.estado} tam="sm" />
              <span className="text-xs font-semibold text-slate-700">{c.nombre}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">{c.kpi}</div>
            <div className={cx('tabular text-base font-semibold', c.estado === 'na' ? 'text-slate-400' : 'text-slate-900')}>{valorCelda(c)}</div>
          </>
        )
        const cls = cx('rounded-lg border p-2.5 text-left', c.estado === 'na' ? 'border-dashed border-slate-200 bg-slate-50' : 'border-slate-200 bg-white hover:border-marca hover:shadow-sm')
        return c.estado === 'na' ? (
          <div key={c.dim} className={cls} title={`Disponible en ${c.disponibleEn}`}>{contenido}</div>
        ) : (
          <Link key={c.dim} to={rutaDimension(c.dim, obraId)} className={cls} title="Ver explicación">{contenido}</Link>
        )
      })}
    </div>
  )
}

export function MiniSemaforo({ celdas }: { celdas: CeldaSemaforo[] }) {
  return (
    <div className="flex items-center gap-1" aria-label="Semáforo de la obra">
      {celdas.filter((c) => c.estado !== 'na').map((c) => (
        <Link key={c.dim} to={rutaDimension(c.dim)} title={`${c.nombre}: ${valorCelda(c)}`}>
          <Luz estado={c.estado} tam="sm" />
        </Link>
      ))}
    </div>
  )
}
