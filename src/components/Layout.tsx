import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { ROLES, type Rol } from '../domain/types'
import { modoNube } from '../lib/supabase'
import { useSesion } from '../store/sesion'
import { useSync, type EstadoSync } from '../store/sync'
import { useCalc } from '../store/hooks'
import { useStore } from '../store/store'
import { MiniSemaforo } from './Semaforo'
import { Badge, cx, inputCls } from './ui'

interface Item { to: string; etiqueta: string; roles: Rol[]; icono: string }

const SYNC: Record<EstadoSync, { texto: string; tono: 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo' }> = {
  inactivo: { texto: 'Local', tono: 'gris' },
  sincronizando: { texto: 'Sincronizando…', tono: 'azul' },
  pendiente: { texto: 'Guardando…', tono: 'azul' },
  al_dia: { texto: 'Guardado', tono: 'verde' },
  sin_conexion: { texto: 'Sin conexión · cambios en espera', tono: 'ambar' },
  error: { texto: 'Error al guardar', tono: 'rojo' },
}

function EstadoGuardado() {
  const { estado, pendientes, error } = useSync()
  const e = SYNC[estado]
  return <span title={error ?? (pendientes ? `${pendientes} cambios por subir` : undefined)}><Badge tono={e.tono}>{e.texto}</Badge></span>
}



/** Menú agrupado por áreas (17 §2): cada rol ve solo sus áreas y ítems. */
interface Grupo { id: string; nombre: string; icono: string; items: Item[] }

const GRUPOS: Grupo[] = [
  {
    id: 'control', nombre: 'Control de gestión', icono: '◉', items: [
      { to: '/cartera', etiqueta: 'Control Tower cartera', roles: ['R01', 'R05'], icono: '◧' },
      { to: '/obra', etiqueta: 'Control Tower obra', roles: ['R01', 'R02', 'R05'], icono: '◉' },
      { to: '/alertas', etiqueta: 'Alertas y acciones', roles: ['R01', 'R02', 'R03', 'R05', 'R08'], icono: '⚑' },
      { to: '/costos', etiqueta: 'Control de costos', roles: ['R01', 'R02', 'R05'], icono: '$' },
      { to: '/cierre', etiqueta: 'Cierre semanal', roles: ['R02', 'R05'], icono: '⏹' },
      { to: '/informe', etiqueta: 'Informe semanal', roles: ['R01', 'R02', 'R05'], icono: '⎙' },
    ],
  },
  {
    id: 'inteligencia', nombre: 'Inteligencia', icono: '◔', items: [
      { to: '/predictivo', etiqueta: 'Motor predictivo', roles: ['R01', 'R02', 'R05'], icono: '≈' },
      { to: '/benchmark', etiqueta: 'Benchmark y scores', roles: ['R01', 'R05'], icono: '◔' },
      { to: '/auditoria', etiqueta: 'Auditoría mensual', roles: ['R01', 'R05'], icono: '❖' },
    ],
  },
  {
    id: 'planificacion', nombre: 'Planificación', icono: '▤', items: [
      { to: '/programa', etiqueta: 'Carta Gantt', roles: ['R01', 'R02', 'R03', 'R05'], icono: '▤' },
      { to: '/plan-semanal', etiqueta: 'Plan semanal (Last Planner)', roles: ['R01', 'R02', 'R03', 'R04', 'R05'], icono: '▥' },
      { to: '/4d', etiqueta: 'Simulación 4D', roles: ['R01', 'R02', 'R03', 'R05', 'R11'], icono: '◆' },
    ],
  },
  {
    id: 'terreno', nombre: 'Terreno', icono: '✎', items: [
      { to: '/rdo', etiqueta: 'Reporte diario (RDO)', roles: ['R03', 'R04'], icono: '✎' },
      { to: '/terreno', etiqueta: 'Validación y rendimientos', roles: ['R02', 'R03'], icono: '☑' },
      { to: '/calidad', etiqueta: 'Calidad', roles: ['R01', 'R02', 'R03', 'R04'], icono: '✓' },
      { to: '/seguridad', etiqueta: 'Seguridad (SST)', roles: ['R01', 'R02', 'R03', 'R04', 'R08'], icono: '⛑' },
    ],
  },
  {
    id: 'contrato', nombre: 'Contrato y mandante', icono: '§', items: [
      { to: '/estados-pago', etiqueta: 'Estados de pago', roles: ['R01', 'R02', 'R05', 'R09'], icono: '▦' },
      { to: '/ordenes-cambio', etiqueta: 'Órdenes de cambio', roles: ['R01', 'R02', 'R05'], icono: '±' },
      { to: '/contrato', etiqueta: 'Contrato y garantías', roles: ['R01', 'R02', 'R05'], icono: '§' },
      { to: '/riesgos', etiqueta: 'Registro de riesgos', roles: ['R01', 'R02', 'R03', 'R05'], icono: '△' },
      { to: '/postventa', etiqueta: 'Postventa', roles: ['R01', 'R02', 'R05'], icono: '⌂' },
    ],
  },
  {
    id: 'abastecimiento', nombre: 'Abastecimiento', icono: '⊞', items: [
      { to: '/compras', etiqueta: 'Compras', roles: ['R01', 'R02', 'R03', 'R04', 'R05', 'R07', 'R09'], icono: '⊞' },
      { to: '/bodega', etiqueta: 'Bodega de obra', roles: ['R01', 'R02', 'R03', 'R04', 'R05', 'R07'], icono: '▣' },
      { to: '/subcontratos', etiqueta: 'Subcontratos', roles: ['R01', 'R02', 'R03', 'R05', 'R08', 'R09'], icono: '⧉' },
      { to: '/maquinaria', etiqueta: 'Maquinaria', roles: ['R01', 'R02', 'R03', 'R04', 'R05', 'R07'], icono: '⚒' },
    ],
  },
  {
    id: 'finanzas', nombre: 'Finanzas', icono: '≋', items: [
      { to: '/finanzas', etiqueta: 'Finanzas', roles: ['R01', 'R09'], icono: '₿' },
      { to: '/caja', etiqueta: 'Flujo de caja', roles: ['R01', 'R02', 'R05', 'R09'], icono: '≋' },
      { to: '/caja-chica', etiqueta: 'Caja chica y rendiciones', roles: ['R01', 'R02', 'R03', 'R09'], icono: '¤' },
    ],
  },
  {
    id: 'comercial', nombre: 'Comercial', icono: '◎', items: [
      { to: '/comercial', etiqueta: 'Pipeline y propuestas', roles: ['R01', 'R06'], icono: '◎' },
    ],
  },
  {
    id: 'documentos', nombre: 'Documentos', icono: '▭', items: [
      { to: '/documentos', etiqueta: 'Planos, RFI y submittals', roles: ['R01', 'R02', 'R03', 'R05'], icono: '▭' },
      { to: '/libro-obra', etiqueta: 'Libro de Obra', roles: ['R01', 'R02', 'R03', 'R05', 'R11'], icono: '☰' },
    ],
  },
  {
    id: 'portales', nombre: 'Portales', icono: '⌂', items: [
      { to: '/mandante', etiqueta: 'Portal mandante', roles: ['R11', 'R02'], icono: '⌂' },
      { to: '/subcontratista', etiqueta: 'Portal subcontratista', roles: ['R10'], icono: '⌂' },
    ],
  },
  {
    id: 'admin', nombre: 'Administración', icono: '⚙', items: [
      { to: '/importar', etiqueta: 'Importar datos', roles: ['R05'], icono: '⇪' },
      { to: '/nueva-obra', etiqueta: 'Nueva obra', roles: ['R01', 'R05'], icono: '+' },
      { to: '/config', etiqueta: 'Configuración', roles: ['R01', 'R05'], icono: '⚙' },
    ],
  },
]

/** Con pocos ítems no vale la pena agrupar: el menú se muestra plano. */
const MAX_PLANO = 8
const CLAVE_ABIERTOS = 'vpai.menu.abiertos'

function leerAbiertos(): string[] | null {
  try { const v = localStorage.getItem(CLAVE_ABIERTOS); return v ? (JSON.parse(v) as string[]) : null } catch { return null }
}
function guardarAbiertos(ids: string[]) {
  try { localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(ids)) } catch { /* almacenamiento no disponible */ }
}

function ItemMenu({ n, badge }: { n: Item; badge?: number }) {
  return (
    <NavLink to={n.to}
      className={({ isActive }) => cx('group flex items-center gap-2.5 rounded-md border-l-2 px-2.5 py-1.5 text-sm transition-colors', isActive ? 'border-sky-400 bg-white/10 font-medium text-white' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white')}>
      <span className="w-4 shrink-0 text-center text-slate-500 group-hover:text-slate-300">{n.icono}</span>
      <span className="truncate">{n.etiqueta}</span>
      {badge ? <span className="ml-auto rounded-full bg-crit px-1.5 text-[11px] font-semibold text-white">{badge}</span> : null}
    </NavLink>
  )
}

function MenuLateral({ rol, conObras, criticas, onNavegar }: { rol: Rol; conObras: boolean; criticas: number; onNavegar: () => void }) {
  const { pathname } = useLocation()
  const [filtro, setFiltro] = useState('')
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((n) => n.roles.includes(rol) && (conObras || ['/nueva-obra', '/config'].includes(n.to))) })).filter((g) => g.items.length)
  const total = grupos.reduce((s, g) => s + g.items.length, 0)
  const activo = grupos.find((g) => g.items.some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`)))?.id
  const [abiertos, setAbiertos] = useState<string[]>(() => leerAbiertos() ?? ['control'])
  // El área de la pantalla actual siempre queda abierta
  useEffect(() => { if (activo && !abiertos.includes(activo)) setAbiertos((a) => [...a, activo]) }, [activo]) // eslint-disable-line react-hooks/exhaustive-deps
  const alternar = (id: string) => setAbiertos((a) => { const n = a.includes(id) ? a.filter((x) => x !== id) : [...a, id]; guardarAbiertos(n); return n })
  const badge = (n: Item) => (n.to === '/alertas' ? criticas : 0)
  const q = filtro.trim().toLowerCase()

  if (q) {
    const hallados = grupos.flatMap((g) => g.items.filter((n) => n.etiqueta.toLowerCase().includes(q) || g.nombre.toLowerCase().includes(q)))
    return (
      <>
        <Buscador valor={filtro} onCambio={setFiltro} />
        <nav className="space-y-0.5" onClick={onNavegar}>
          {hallados.length ? hallados.map((n) => <ItemMenu key={n.to} n={n} badge={badge(n)} />) : <p className="px-2.5 py-2 text-xs text-slate-500">Sin resultados.</p>}
        </nav>
      </>
    )
  }
  if (total <= MAX_PLANO)
    return <nav className="space-y-0.5" onClick={onNavegar}>{grupos.flatMap((g) => g.items).map((n) => <ItemMenu key={n.to} n={n} badge={badge(n)} />)}</nav>

  return (
    <>
      <Buscador valor={filtro} onCambio={setFiltro} />
      <nav className="space-y-1">
        {grupos.map((g) => {
          const abierto = abiertos.includes(g.id)
          const avisos = g.items.reduce((s, n) => s + badge(n), 0)
          return (
            <div key={g.id}>
              <button onClick={() => alternar(g.id)} aria-expanded={abierto}
                className={cx('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors', g.id === activo ? 'text-sky-300' : 'text-slate-500 hover:text-slate-300')}>
                <span className="flex-1 text-left">{g.nombre}</span>
                {!abierto && avisos > 0 && <span className="rounded-full bg-crit px-1.5 text-[10px] font-semibold normal-case text-white">{avisos}</span>}
                {!abierto && <span className="font-normal normal-case text-slate-600">{g.items.length}</span>}
                <span className={cx('text-[10px] transition-transform', abierto ? 'rotate-90' : '')}>▶</span>
              </button>
              {abierto && <div className="mt-0.5 space-y-0.5" onClick={onNavegar}>{g.items.map((n) => <ItemMenu key={n.to} n={n} badge={badge(n)} />)}</div>}
            </div>
          )
        })}
      </nav>
    </>
  )
}

function Buscador({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="relative mb-2">
      <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo"
        className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 pr-7 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none" />
      {valor && <button onClick={() => onCambio('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label="Limpiar búsqueda">×</button>}
    </div>
  )
}

export function Layout() {
  const ui = useStore((s) => s.ui)
  const obras = useStore((s) => s.obras)
  const setObra = useStore((s) => s.setObra)
  const setRol = useStore((s) => s.setRol)
  const alertas = useStore((s) => s.alertas)
  const { c, sem } = useCalc()
  const [menu, setMenu] = useState(false)
  const abiertas = alertas.filter((a) => a.obraId === ui.obraId && ['activa', 'reconocida', 'en_accion'].includes(a.estado))
  const criticas = abiertas.filter((a) => a.severidad === 'critica' || a.severidad === 'alta').length
  const salir = useSesion((s) => s.salir)
  const externo = ui.rol === 'R11' || ui.rol === 'R10'

  return (
    <div className="flex h-full overflow-hidden">
      <aside className={cx('fixed inset-y-0 left-0 z-40 h-full w-64 shrink-0 flex-col bg-slate-900 text-slate-200 lg:static lg:flex', menu ? 'flex' : 'hidden')}>
        {/* Logo fijo arriba; solo la lista hace scroll; el rol queda fijo abajo */}
        <NavLink to="/" className="mx-3 mt-3 block shrink-0 overflow-hidden rounded-xl bg-[#fafafa] ring-1 ring-white/10" title="VPAI — Control de gestión de obras" onClick={() => setMenu(false)}>
          {/* El logo trae margen propio: se recorta el borde vacío */}
          <div className="flex h-24 items-center justify-center overflow-hidden">
            <img src="./logo-vpai.png" alt="VPAI — Sistemas de control" className="h-36 w-36 object-cover" />
          </div>
        </NavLink>
        <div className="menu-lateral mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <MenuLateral rol={ui.rol} conObras={obras.length > 0} criticas={criticas} onNavegar={() => setMenu(false)} />
        </div>
        <div className="shrink-0 border-t border-white/10 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-200">{ui.usuario.trim().charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-100">{ui.usuario}</span>
              <span className="block truncate">{ROLES[ui.rol]}</span>
            </span>
            {modoNube && <button onClick={salir} className="text-slate-300 underline-offset-2 hover:underline">Salir</button>}
          </div>
          <label className="sr-only" htmlFor="selector-rol">Rol</label>
          <select id="selector-rol" value={ui.rol} onChange={(e) => setRol(e.target.value as Rol)} className="w-full rounded-md border border-white/10 bg-slate-800 px-2 py-1.5 text-sm text-white">
            {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{r} · {ROLES[r]}</option>)}
          </select>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenu(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Menú">☰</button>
          {obras.length > 0 && (
            <select value={ui.obraId} onChange={(e) => setObra(e.target.value)} className={cx(inputCls, 'w-auto max-w-[260px] font-medium')} aria-label="Obra">
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          )}
          {/* El mandante (R11) no ve el semáforo interno, las alertas ni el estado de los datos */}
          {c && !externo && <MiniSemaforo celdas={sem} />}
          <div className="ml-auto flex items-center gap-2">
            {modoNube && <EstadoGuardado />}
            {!externo && c && c.confianza !== 'alta' && (
              <Badge tono="ambar">Datos {c.confianza === 'media' ? 'incompletos' : 'muy incompletos'}</Badge>
            )}
            {!externo && c && c.rdoPendientes > 0 && <Badge tono="azul">{c.rdoPendientes} RDO por validar</Badge>}
            {!externo && (
              <NavLink to="/alertas" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`${abiertas.length} alertas abiertas`}>
                ⚑
                {abiertas.length > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-crit px-1 text-[10px] font-bold text-white">{abiertas.length}</span>}
              </NavLink>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
