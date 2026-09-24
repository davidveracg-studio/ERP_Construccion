import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cliente de Supabase, o null si no hay variables de entorno (modo local de demostración). */
export const supabase: SupabaseClient | null = url && clave ? createClient(url, clave, {
  // PKCE: los enlaces de confirmación vuelven con ?code= y no chocan con el HashRouter (#/ruta)
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
}) : null

export const modoNube = supabase !== null
