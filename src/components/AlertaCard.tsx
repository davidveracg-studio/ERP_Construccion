import { Link } from 'react-router'
import { fmtFecha } from '../domain/fechas'
import { NOMBRES_REGLA } from '../domain/reglas'
import type { Alerta } from '../domain/types'
import { Badge, BadgeSeveridad, cx } from './ui'

const ESTADO: Record<Alerta['estado'], [string, 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo']> = {
  activa: ['Activa', 'rojo'], reconocida: ['Reconocida', 'ambar'], en_accion: ['En acción', 'azul'],
  resuelta: ['Resuelta', 'verde'], descartada: ['Descartada', 'gris'],
}

/** Formato estándar de alerta (12 §Formato estándar). */
export function AlertaCard({ a, compacta }: { a: Alerta; compacta?: boolean }) {
  return (
    <Link to={`/alertas/${a.id}`} className={cx('block rounded-xl border bg-white p-4 shadow-sm hover:border-marca',
      a.severidad === 'critica' ? 'border-red-300' : 'border-slate-200')}>
      <div className="flex flex-wrap items-center gap-2">
        <BadgeSeveridad s={a.severidad} />
        <Badge tono={ESTADO[a.estado][1]}>{ESTADO[a.estado][0]}</Badge>
        <span className="text-xs text-slate-500">{a.regla} · {NOMBRES_REGLA[a.regla]}</span>
        <span className="ml-auto text-xs text-slate-500">Período {a.actualizadaEnPeriodo}</span>
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{a.titulo}</h3>
      {!compacta && (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {a.datos.map((d) => (
              <div key={d.etiqueta}>
                <dt className="text-xs text-slate-500">{d.etiqueta}</dt>
                <dd className="tabular font-medium">{d.valor}</dd>
              </div>
            ))}
          </dl>
          {a.queProvoca && <p className="mt-2 text-sm"><span className="font-medium">¿Qué la provoca?</span> {a.queProvoca}</p>}
        </>
      )}
      <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Acción requerida:</span> {a.accionRequerida}</p>
      <p className="mt-1 text-xs text-slate-500">Responsable: {a.responsable} · creada {fmtFecha(a.creadaEn)} · {a.acciones.length} acción(es)</p>
    </Link>
  )
}

export { ESTADO as ESTADO_ALERTA }
