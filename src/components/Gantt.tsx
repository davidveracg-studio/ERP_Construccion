// Carta Gantt: línea base (fina) vs actualizado/proyectado (gruesa), ruta crítica,
// holgura, hitos (rombos) y línea "hoy" (18 §4).
import type { ResultadoCPM } from '../domain/cpm'
import { fmtFecha, fmtFechaCorta } from '../domain/fechas'
import type { Actividad, Dia } from '../domain/types'

export function Gantt({ actividades, lb, cpm, avance, corte, inicio, termino, contractual, onSelect, seleccion }: {
  actividades: Actividad[]
  lb: Map<string, Actividad>
  cpm: Map<string, ResultadoCPM>
  avance: Map<string, number>
  corte: Dia
  inicio: Dia
  termino: Dia
  contractual: Dia
  onSelect?: (id: string) => void
  seleccion?: string
}) {
  const fila = 28, izq = 230, W = 980
  const fin = Math.max(termino, contractual, ...actividades.map((a) => cpm.get(a.id)?.ef ?? a.fin)) + 7
  const x = (d: number) => izq + ((d - inicio) / Math.max(1, fin - inicio)) * (W - izq - 16)
  const H = actividades.length * fila + 34
  const meses: Dia[] = []
  for (let d = inicio; d < fin; d += 14) meses.push(d)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[720px]" role="img" aria-label="Carta Gantt">
      {meses.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={22} y2={H} stroke="#f1f5f9" />
          <text x={x(d) + 2} y={14} fontSize="10" fill="#64748b">{fmtFechaCorta(d)}</text>
        </g>
      ))}
      <line x1={x(contractual)} x2={x(contractual)} y1={18} y2={H} stroke="#dc2626" strokeDasharray="4 3" />
      <text x={x(contractual) - 4} y={14} fontSize="10" textAnchor="end" fill="#dc2626">Término contractual</text>
      {actividades.map((a, i) => {
        const y0 = 24 + i * fila
        const r = cpm.get(a.id)
        const b = lb.get(a.id)
        const av = avance.get(a.id) ?? 0
        const critica = r?.critica
        const color = critica ? '#dc2626' : '#2a78d6'
        const sel = seleccion === a.id
        const es = r?.es ?? a.inicio
        const ef = r?.ef ?? a.fin
        const tip = `${a.codigo} ${a.nombre}\nLínea base: ${b ? `${fmtFecha(b.inicio)} → ${fmtFecha(Math.max(b.inicio, b.fin - 1))}` : '—'}\nProyectado: ${fmtFecha(es)} → ${fmtFecha(Math.max(es, ef - 1))}\nAvance: ${Math.round(av * 100)}%${r?.holgura != null ? `\nHolgura total: ${r.holgura} días` : ''}${critica ? '\nRuta crítica' : ''}`
        return (
          <g key={a.id} onClick={() => onSelect?.(a.id)} className={onSelect ? 'cursor-pointer' : undefined}>
            <title>{tip}</title>
            <rect x={0} y={y0 - 2} width={W} height={fila} fill={sel ? '#eff6ff' : i % 2 ? '#fafafa' : 'white'} />
            <text x={6} y={y0 + 14} fontSize="12" fill="#0f172a" fontWeight={critica ? 600 : 400}>
              {a.codigo} {a.nombre.length > 26 ? a.nombre.slice(0, 25) + '…' : a.nombre}
            </text>
            {a.esHito ? (
              <>
                {b && <path d={`M${x(b.inicio)},${y0 + 3} l5,6 l-5,6 l-5,-6z`} fill="none" stroke="#94a3b8" strokeWidth="1.5" />}
                <path d={`M${x(es)},${y0 + 2} l7,8 l-7,8 l-7,-8z`} fill={a.finReal != null ? '#059669' : critica ? '#dc2626' : '#0f172a'} stroke="white" strokeWidth="1.5" />
                {a.hitoContractual && <text x={x(es) + 10} y={y0 + 14} fontSize="10" fill="#64748b">contractual</text>}
              </>
            ) : (
              <>
                {b && <rect x={x(b.inicio)} y={y0 + 2} width={Math.max(2, x(b.fin) - x(b.inicio))} height={4} rx="2" fill="#94a3b8" />}
                <rect x={x(es)} y={y0 + 9} width={Math.max(3, x(ef) - x(es))} height={12} rx="3" fill={color} opacity={0.25} />
                <rect x={x(es)} y={y0 + 9} width={Math.max(0, (x(ef) - x(es)) * av)} height={12} rx="3" fill={color} />
                {r?.holgura != null && r.holgura > 0 && (
                  <line x1={x(ef)} x2={x(ef + r.holgura)} y1={y0 + 15} y2={y0 + 15} stroke="#94a3b8" strokeDasharray="2 2" />
                )}
              </>
            )}
          </g>
        )
      })}
      <line x1={x(corte)} x2={x(corte)} y1={18} y2={H} stroke="#0f172a" strokeWidth="1.5" />
      <text x={x(corte) + 3} y={H - 4} fontSize="10" fill="#0f172a">hoy</text>
    </svg>
  )
}
