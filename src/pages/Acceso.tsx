// Pantalla de ingreso a la demo (modo nube): selector de rol y botón Ingresar
import { useState, type ReactNode } from 'react'
import { Boton, Campo, inputCls } from '../components/ui'
import { ROLES, type Rol } from '../domain/types'
import { useSesion } from '../store/sesion'
import { USUARIOS } from '../store/store'

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#fafafa] p-4">
      <div className="w-full max-w-sm">
        <img src="./logo-vpai.png" alt="VPAI — Sistemas de control" className="mx-auto -mb-4 h-56 w-56" />
        <p className="mb-4 text-center text-sm text-slate-500">Control de gestión de obras · Demo</p>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  )
}

export function IngresoDemo() {
  const { ultimoRol, ingresar, estado, error } = useSesion()
  const [rol, setRol] = useState<Rol>(ultimoRol)
  return (
    <Marco>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); ingresar(rol) }}>
        <h1 className="text-lg font-semibold text-slate-900">Ingresar a la demo</h1>
        <Campo etiqueta="Rol" ayuda={`Ingresarás como ${USUARIOS[rol]}. Puedes cambiar de rol dentro de la app.`}>
          <select className={inputCls} value={rol} onChange={(e) => setRol(e.target.value as Rol)} autoFocus>
            {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{r} · {ROLES[r]}</option>)}
          </select>
        </Campo>
        {estado === 'error' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Boton type="submit" disabled={estado === 'abriendo'} className="w-full justify-center">
          {estado === 'abriendo' ? 'Ingresando…' : 'Ingresar'}
        </Boton>
        <p className="text-xs text-slate-500">Es una demostración: los datos son ficticios, los comparten todos los que ingresan y se renuevan cada día.</p>
      </form>
    </Marco>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#fafafa] text-slate-500">
      <img src="./logo-vpai.png" alt="VPAI — Sistemas de control" className="h-72 w-72 animate-pulse" />
      <span className="text-sm">{texto}</span>
    </div>
  )
}
