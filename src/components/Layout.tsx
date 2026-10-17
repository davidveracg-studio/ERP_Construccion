import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
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



const NAV: Item[] = [
  { to: '/cartera', etiqueta: 'Control Tower cartera', roles: ['R01', 'R05'], icono: '◧' },
  { to: '/obra', etiqueta: 'Control Tower obra', roles: ['R01', 'R02', 'R05'], icono: '◉' },
  { to: '/alertas', etiqueta: 'Alertas y acciones', roles: ['R01', 'R02', 'R03', 'R05'], icono: '⚑' },
  { to: '/costos', etiqueta: 'Control de costos', roles: ['R01', 'R02', 'R05'], icono: '$' },
  { to: '/caja', etiqueta: 'Flujo de caja', roles: ['R01', 'R02', 'R05'], icono: '≋' },
  { to: '/estados-pago', etiqueta: 'Estados de pago', roles: ['R01', 'R02', 'R05'], icono: '▦' },
  { to: '/ordenes-cambio', etiqueta: 'Órdenes de cambio', roles: ['R01', 'R02', 'R05'], icono: '±' },
  { to: '/mandante', etiqueta: 'Portal mandante', roles: ['R11', 'R02'], icono: '⌂' },
  { to: '/programa', etiqueta: 'Carta Gantt', roles: ['R01', 'R02', 'R03', 'R05'], icono: '▤' },
  { to: '/4d', etiqueta: 'Simulación 4D', roles: ['R01', 'R02', 'R03', 'R05', 'R11'], icono: '◆' },
  { to: '/terreno', etiqueta: 'Validación y rendimientos', roles: ['R02', 'R03'], icono: '✓' },
  { to: '/rdo', etiqueta: 'Reporte diario (RDO)', roles: ['R03', 'R04'], icono: '✎' },
  { to: '/cierre', etiqueta: 'Cierre semanal', roles: ['R02', 'R05'], icono: '⏹' },
  { to: '/informe', etiqueta: 'Informe semanal', roles: ['R01', 'R02', 'R05'], icono: '⎙' },
  { to: '/importar', etiqueta: 'Importar datos', roles: ['R05'], icono: '⇪' },
  { to: '/nueva-obra', etiqueta: 'Nueva obra', roles: ['R01', 'R05'], icono: '+' },
  { to: '/config', etiqueta: 'Configuración', roles: ['R01', 'R05'], icono: '⚙' },
]

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
  const externo = ui.rol === 'R11'
  const items = NAV.filter((n) => n.roles.includes(ui.rol) && (obras.length > 0 || ['/nueva-obra', '/config'].includes(n.to)))

  return (
    <div className="flex h-full">
      <aside className={cx('fixed inset-y-0 left-0 z-40 w-64 shrink-0 flex-col bg-slate-900 text-slate-200 lg:static lg:flex', menu ? 'flex' : 'hidden')}>
        <NavLink to="/" className="mx-3 mb-3 mt-4 block overflow-hidden rounded-xl bg-[#fafafa]" title="VPAI — Control de gestión de obras">
          {/* El logo trae margen propio: se recorta el borde vacío superior e inferior */}
          <img src="./logo-vpai.png" alt="VPAI — Sistemas de control" className="mx-auto -my-3 h-44 w-44 object-cover" />
        </NavLink>
        <nav className="flex-1 space-y-0.5 px-3" onClick={() => setMenu(false)}>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-slate-800 font-medium text-white' : 'text-slate-300 hover:bg-slate-800/60')}>
              <span className="w-4 text-center text-slate-400">{n.icono}</span>
              {n.etiqueta}
              {n.to === '/alertas' && criticas > 0 && <span className="ml-auto rounded-full bg-crit px-1.5 text-xs text-white">{criticas}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
          <label className="mb-1 block">Rol</label>
          <select value={ui.rol} onChange={(e) => setRol(e.target.value as Rol)} className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white">
            {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{r} · {ROLES[r]}</option>)}
          </select>
          <div className="mt-2 flex items-center justify-between">
            <span>Usuario: <span className="text-slate-200">{ui.usuario}</span></span>
            {modoNube && <button onClick={salir} className="text-slate-300 underline-offset-2 hover:underline">Salir</button>}
          </div>
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
