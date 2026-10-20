// Health Score como tubos comunicantes (kit anatomy): un tubo por dimensión del semáforo, con
// sección proporcional a su peso y lleno hasta su puntaje. Con la válvula abierta el agua se nivela
// en el promedio ponderado, que es el score; el flotador del tubo de lectura lo marca y un collar
// baja al tope 59 si hubo accidente grave. Al señalar un tubo la válvula se cierra y se ve su nivel.
import { useMemo, useState } from 'react'
import type { DimensionHealth } from '../../domain/semaforo'
import { atajos, banco, COLOR, colorEstado, k, tinte } from './base'
import { enViewBox, FiguraIso, useCursorVivo } from './Figura'

const W = 640, H = 430
const ESC = 0.8, FONDO = 16, GAP = 4, Y0 = -8, Z0 = 7, ALTO = 100 * ESC + 6
const PLATE = { x: -122, y: -34, w: 248, d: 72, r: 8 }
const P = k.fitProjection([...k.boxCorners(PLATE, -15, 0), [-96, Y0, Z0 + ALTO + 14], [96, Y0, Z0 + ALTO + 14], [0, PLATE.y + PLATE.d, -40]], W, H, { pad: 12, azimuth: 90, elevation: 18 })
const { S, L, D, at, seg, box } = atajos(P)


export default function FiguraHealth({ dimensiones, score, sinTope, tope }: { dimensiones: DimensionHealth[]; score: number | null; sinTope: number | null; tope: boolean }) {
  const [sel, setSel] = useState<number | null>(null)
  const tubos = useMemo(() => {
    const total = dimensiones.reduce((s, d) => s + d.peso, 0)
    let x = -96
    return dimensiones.map((d) => { const w = (d.peso / total) * 132; const t = { ...d, x, w }; x += w + GAP; return t })
  }, [dimensiones])
  const GX = (tubos.at(-1)?.x ?? 0) + (tubos.at(-1)?.w ?? 0) + 6
  const estatico = useMemo(() => {
    const vidrio = (x0: number, x1: number, y0: number, y1: number, zt: number) =>
      L([[x0, y1], [x1, y1], [x1, y0]].map(([a, b]) => seg([a, b, Z0], [a, b, zt])).join(''), { tone: 'lo' }) +
      L(k.pathOf([at([x0, y0, zt]), at([x1, y0, zt]), at([x1, y1, zt]), at([x0, y1, zt])], true), { tone: 'mid' }) +
      L(k.pathOf([at([x0, y1, Z0]), at([x1, y1, Z0]), at([x1, y0, Z0])]), { tone: 'lo' })
    const colector = [
      banco(P, PLATE),
      S(box(-100, Y0 - 2, GX + 12 + 100, FONDO + 4, 0, Z0, 1), { tone: 'mid' }),
      D([-97, GX + 9].flatMap((xx) => [at([xx, Y0, Z0]), at([xx, Y0 + FONDO, Z0])]), { size: 0.45 }),
      S(box(-14, Y0 + FONDO + 2, 12, 8, 0, 6, 0.8), { tone: 'mid' }),
      S(k.cylinder(-8, Y0 + FONDO + 6, 2.2, 6, 2, P, 20), { tone: 'mid' }),
    ].join('')
    const tuboV = tubos.map((t) => vidrio(t.x, t.x + t.w, Y0, Y0 + FONDO, Z0 + ALTO) +
      L([20, 40, 60, 80, 100].map((v) => seg([t.x, Y0 + FONDO, Z0 + v * ESC], [t.x + t.w, Y0 + FONDO, Z0 + v * ESC])).join(''), { tone: 'faint' }))
    const ticks = []
    for (let v = 0; v <= 100; v += 10) ticks.push(k.pathOf([at([GX + 8, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 6, Z0 + v * ESC])]))
    const lectura = vidrio(GX, GX + 6, Y0 + 5, Y0 + 11, Z0 + ALTO + 8) +
      S(box(GX + 8, Y0 + 6, 4, 4, Z0, ALTO, 0.2), { tone: 'lo' }) + L(ticks.join(''), { tone: 'mid' }) +
      L([60, 80].map((v) => k.pathOf([at([GX + 8, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 10, Z0 + v * ESC]), at([GX + 12, Y0 + 6, Z0 + v * ESC])])).join(''), { tone: 'hi' })
    return { colector, tuboV, lectura, tope: S(box(GX - 1.5, Y0 + 3.5, 9, 9, 0, 2.4, 0.6), { tone: 'mid' }), flot: S(box(GX + 0.8, Y0 + 5.8, 4.4, 4.4, 0, 3, 0.4), { tone: 'hi', lit: true }) }
  }, [tubos, GX])
  // u = apertura de la válvula; recorrido: cerrada 2 s (cada tubo en su nivel) y luego abierta
  const vivo = useCursorVivo({ foco: sel != null ? 0 : null, reposo: 1, tau: 0.5, tour: (s) => (s % 14 < 2.5 ? 0 : 1) })
  const u = Math.min(1, Math.max(0, vivo.u))
  const m = sinTope ?? 0
  const caja = (x: number, y: number, w: number, d: number, z: number, h: number, lit = false) => k.solidSvg(k.slabOf({ x, y, w, d, r: 0.2 }, z, Math.max(0.01, h), P, 2, 0), { tone: lit ? 'hi' : 'mid', lit, crease: 'lo' })
  const lecturaV = Math.min(m * u, tope ? 59 : 100)
  const ang = (u * Math.PI) / 2, cx0 = -8, cy0 = Y0 + FONDO + 6
  const dx = Math.sin(ang), dy = Math.cos(ang)
  const palanca = k.solidSvg(k.extrude([[cx0 - dy * 1.2, cy0 + dx * 1.2], [cx0 + dx * 12 - dy * 1.2, cy0 + dy * 12 + dx * 1.2], [cx0 + dx * 12 + dy * 1.2, cy0 + dy * 12 - dx * 1.2], [cx0 + dy * 1.2, cy0 - dx * 1.2]], 8, 1.2, P), { tone: 'mid' })
  const d = sel != null ? tubos[sel] : null
  const tuboEn = (e: React.PointerEvent<HTMLDivElement>) => {
    const [x] = enViewBox(e, vivo.ref.current, W, H)
    return tubos.findIndex((t) => x >= at([t.x, Y0 + FONDO, 0])[0] && x <= at([t.x + t.w, Y0 + FONDO, 0])[0])
  }
  return (
    <div className="mx-auto max-w-2xl">
      <FiguraIso width={W} height={H} stageRef={vivo.ref}
        label="Siete tubos de vidrio de distinto ancho sobre un colector con válvula, uno por dimensión del Health Score, y un tubo de lectura con flotador."
        aria="Health Score: flechas eligen un tubo; Escape abre la válvula"
        hint={u < 0.98 ? 'Válvula cerrada · cada tubo en su nivel' : 'Válvula abierta · nivel común'}
        leyenda={[
          { color: COLOR.verde, texto: '≥ 80 saludable' },
          { color: COLOR.ambar, texto: '60–79 alerta' },
          { color: COLOR.rojo, texto: '< 60 riesgo' },
          ...(tope ? [{ color: COLOR.contrato, texto: 'Tope 59 por accidente grave' }] : []),
        ]}
        lectura={d ? <>{d.nombre} {d.valor != null ? Math.round(d.valor) : 'sin datos'} · peso {Math.round(d.peso * 100)} %</> : <>score <b>{score != null ? Math.round(score) : '—'}</b>{tope ? ' · tope 59 por accidente grave' : ''}</>}
        onPointerMove={(e) => { const i = tuboEn(e); setSel(i >= 0 ? i : null) }}
        onPointerLeave={() => setSel(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setSel((s) => ((s ?? -1) + (e.key === 'ArrowRight' ? 1 : tubos.length - 1)) % tubos.length) }
          if (e.key === 'Escape') setSel(null)
        }}
        capas={[
          estatico.colector,
          ...tubos.flatMap((t, i) => [
            t.valor != null ? tinte(caja(t.x + 0.4, Y0 + 0.4, t.w - 0.8, FONDO - 0.8, Z0, (t.valor + (m - t.valor) * u) * ESC), colorEstado(t.valor), sel != null && i !== sel ? 0.55 : 0) : '',
            estatico.tuboV[i],
          ]),
          u > 0.01 ? tinte(caja(GX + 0.4, Y0 + 5.4, 5.2, 5.2, Z0, m * ESC * u), colorEstado(score ?? m)) : '',
          estatico.lectura,
          <g key="tp" style={tope ? { ['--anatomy-mid' as string]: COLOR.contrato, ['--anatomy-paper' as string]: '#fecaca', ['--anatomy-top' as string]: '#fee2e2' } : undefined} transform={k.translateAlong(P, [0, 0, Z0 + (tope ? 59 : 108) * ESC + 3])} dangerouslySetInnerHTML={{ __html: estatico.tope }} />,
          <g key="fl" transform={k.translateAlong(P, [0, 0, Z0 + lecturaV * ESC])} dangerouslySetInnerHTML={{ __html: estatico.flot }} />,
          palanca,
          <g key="rot" fontFamily="ui-sans-serif, system-ui, sans-serif">
            {tubos.map((t, i) => {
              const [bx, by] = at([t.x + t.w / 2, PLATE.y + PLATE.d, -15])
              const [tx, ty] = at([t.x + t.w / 2, Y0 + FONDO, Z0 + ALTO + 3])
              const corto = t.w >= 20 ? t.nombre : ({ Productividad: 'Prod.', Calidad: 'Cal.', Seguridad: 'Seg.' } as Record<string, string>)[t.nombre] ?? t.nombre
              return (
                <g key={t.id} opacity={sel != null && sel !== i ? 0.45 : 1}>
                  <text x={tx} y={ty} textAnchor="middle" fontSize="13" fontWeight="700" fill={t.valor != null ? colorEstado(t.valor) : '#94a3b8'}>{t.valor != null ? Math.round(t.valor) : '—'}</text>
                  <text x={bx} y={by + 14} textAnchor="middle" fontSize="11.5" fill="#334155">{corto}</text>
                  <text x={bx} y={by + 28} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{Math.round(t.peso * 100)} %</text>
                </g>
              )
            })}
            {(() => {
              const [gx, gy] = at([GX + 3, Y0 + 8, Z0 + ALTO + 10])
              const [lx, ly] = at([GX + 14, PLATE.y + PLATE.d, -15])
              return (
                <g>
                  <text x={gx} y={gy - 4} textAnchor="middle" fontSize="13" fontWeight="700" fill={colorEstado(score ?? 0)}>{score != null ? Math.round(score) : '—'}</text>
                  <text x={lx} y={ly + 14} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#334155">Score</text>
                </g>
              )
            })()}
            {[60, 80].map((v) => { const [x, y] = at([GX + 12, Y0 + 10, Z0 + v * ESC]); return <text key={v} x={x + 4} y={y + 4} fontSize="10" fill="#64748b">{v}</text> })}
          </g>,
        ]}
      />
    </div>
  )
}
