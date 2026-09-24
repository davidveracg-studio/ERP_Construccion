// Ingreso a la demo: se elige un rol y se entra a la empresa de demostración compartida.
// Sin correo ni contraseña: se usa una sesión anónima de Supabase (queda guardada en el
// navegador) y la función unirse_demo() la agrega como miembro de la empresa demo, así el
// RLS por membresía sigue aplicando.
import { create } from 'zustand'
import { ROLES, type Rol } from '../domain/types'
import { supabase } from '../lib/supabase'
import { useStore, USUARIOS } from './store'
import { detenerSync, iniciarSync, vaciarStore } from './sync'

const CLAVE_ROL = 'vpai-rol'

type Estado = 'seleccion' | 'abriendo' | 'listo' | 'error'

interface Sesion {
  estado: Estado
  error?: string
  ultimoRol: Rol
  ingresar: (rol: Rol) => Promise<void>
  salir: () => void
}

function leerRol(): Rol {
  try {
    const r = localStorage.getItem(CLAVE_ROL)
    if (r && r in ROLES) return r as Rol
  } catch { /* sin storage */ }
  return 'R01'
}

function mensaje(e: unknown) {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  if (/anonymous sign-ins are disabled/i.test(m)) return 'Falta habilitar "Allow anonymous sign-ins" en Supabase → Authentication → Sign In / Providers.'
  if (/unirse_demo|schema cache|PGRST202/i.test(m)) return 'Falta ejecutar supabase/migrations/0002_demo.sql en el SQL Editor de Supabase.'
  if (/failed to fetch|network/i.test(m)) return 'Sin conexión con el servidor.'
  return m
}

export const useSesion = create<Sesion>()((setS) => ({
  estado: 'seleccion',
  ultimoRol: leerRol(),

  ingresar: async (rol) => {
    setS({ estado: 'abriendo', error: undefined, ultimoRol: rol })
    try { localStorage.setItem(CLAVE_ROL, rol) } catch { /* sin storage */ }
    try {
      const sb = supabase!
      let { data: { session } } = await sb.auth.getSession()
      if (!session) {
        const r = await sb.auth.signInAnonymously()
        if (r.error) throw r.error
        session = r.data.session
      }
      const { data: empresaId, error } = await sb.rpc('unirse_demo')
      if (error) throw error
      await iniciarSync(empresaId as string, session!.user.id)
      useStore.getState().setSesion(rol, USUARIOS[rol])
      // Primera vez (o tras vaciar la base): se generan las obras de ejemplo para todos
      if (useStore.getState().obras.length === 0) useStore.getState().reiniciarDemo()
      setS({ estado: 'listo' })
    } catch (e) {
      detenerSync()
      setS({ estado: 'error', error: mensaje(e) })
    }
  },

  salir: () => {
    detenerSync()
    vaciarStore()
    setS({ estado: 'seleccion' })
  },
}))
