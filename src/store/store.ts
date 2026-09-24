import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { calcularCPM } from '../domain/cpm'
import { COLECCIONES, datosVacios, programaDe, type Datos } from '../domain/datos'
import { calcularObra } from '../domain/evm'
import { hoy } from '../domain/fechas'
import { uid } from '../domain/formato'
import { cerrarPeriodo, periodosDe } from '../domain/periodos'
import { generarDemo } from '../domain/seed'
import { modoNube } from '../lib/supabase'
import type {
  AccionCorrectiva, Actividad, AjusteForecast, Compromiso, Config, CostoReal, Cuadrilla, Dia, EstadoAccion,
  Obra, Partida, Programa, RDO, ReglaMapeo, Rol, TipoRecurso,
} from '../domain/types'

export interface UI {
  rol: Rol
  obraId: string
  usuario: string
}

export const USUARIOS: Record<Rol, string> = {
  R01: 'Gerencia',
  R02: 'Carolina Vega',
  R03: 'Juan Soto',
  R04: 'Luis Pérez',
  R05: 'Andrés Muñoz',
}

export interface Acciones {
  setRol: (r: Rol) => void
  setObra: (id: string) => void
  reiniciarDemo: () => void
  /** Reemplaza todos los datos (carga desde el servidor o cambios de otros usuarios). */
  cargarDatos: (d: Partial<Datos>) => void
  setSesion: (rol: Rol, usuario: string) => void
  guardarRDO: (r: RDO) => void
  validarRDO: (id: string) => void
  rechazarRDO: (id: string, motivo: string) => void
  agregarCostos: (items: CostoReal[]) => void
  asignarCosto: (id: string, partidaId: string | null, tipo: CostoReal['tipo'], regla?: Omit<ReglaMapeo, 'id'>) => void
  agregarCompromisos: (items: Compromiso[]) => void
  ajustarForecast: (a: Omit<AjusteForecast, 'id' | 'estado' | 'fecha' | 'autor'>) => AjusteForecast['estado']
  resolverAjuste: (id: string, aprobado: boolean) => void
  actualizarActividad: (actId: string, cambios: Partial<Pick<Actividad, 'inicioReal' | 'finReal' | 'avanceManual'>>) => void
  solicitarRebaseline: (motivo: string) => void
  resolverRebaseline: (programaId: string, aprobado: boolean) => void
  cerrarPeriodo: (fecha: Dia) => { nuevas: number; resueltas: number }
  reconocerAlerta: (id: string) => void
  descartarAlerta: (id: string, motivo: string) => void
  agregarAccion: (alertaId: string, a: Omit<AccionCorrectiva, 'id' | 'estado'>) => void
  cambiarEstadoAccion: (alertaId: string, accionId: string, estado: EstadoAccion) => void
  actualizarConfig: (c: Partial<Omit<Config, 'umbrales'>> & { umbrales?: Partial<Config['umbrales']> }) => void
  crearObra: (o: Obra, partidas: Partida[], actividades: Actividad[], cuadrillas: Cuadrilla[]) => void
  reemplazarPartidas: (obraId: string, partidas: Partida[]) => void
  cargarPrograma: (obraId: string, actividades: Actividad[]) => void
}

export type Estado = Datos & { ui: UI } & Acciones

const idbStorage: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: async (k, v) => set(k, v),
  removeItem: async (k) => del(k),
}

function datosIniciales(): Datos & { ui: UI } {
  // En modo nube se parte vacío: los datos llegan desde Supabase (o desde la caché local de la empresa)
  if (modoNube) return { ...datosVacios(), ui: { rol: 'R01', obraId: '', usuario: '' } }
  const d = generarDemo(hoy())
  return { ...d, ui: { rol: 'R02', obraId: d.obras[0].id, usuario: USUARIOS.R02 } }
}

/** Obra seleccionada válida para el conjunto de obras dado. */
function obraValida(obras: Obra[], id: string) {
  return obras.some((o) => o.id === id) ? id : (obras[0]?.id ?? '')
}

export const useStore = create<Estado>()(
  persist(
    (setS, getS) => {
      const mutar = (f: (s: Estado) => Partial<Estado>) => setS((s) => f(s))
      const obraActual = () => getS().obras.find((o) => o.id === getS().ui.obraId)!

      return {
        ...datosIniciales(),

        setRol: (rol) => mutar((s) => ({ ui: { ...s.ui, rol, usuario: USUARIOS[rol] } })),
        setObra: (obraId) => mutar((s) => ({ ui: { ...s.ui, obraId } })),
        setSesion: (rol, usuario) => mutar((s) => ({ ui: { ...s.ui, rol, usuario } })),
        reiniciarDemo: () =>
          mutar((s) => {
            const d = generarDemo(hoy())
            return { ...d, config: modoNube ? { ...d.config, empresa: s.config.empresa, rut: s.config.rut } : d.config, ui: modoNube ? { ...s.ui, obraId: d.obras[0].id } : { rol: 'R02', obraId: d.obras[0].id, usuario: USUARIOS.R02 } }
          }),
        cargarDatos: (d) => mutar((s) => { const obras = d.obras ?? s.obras; return { ...d, ui: { ...s.ui, obraId: obraValida(obras, s.ui.obraId) } } }),

        guardarRDO: (r) =>
          mutar((s) => ({ rdos: s.rdos.some((x) => x.id === r.id) ? s.rdos.map((x) => (x.id === r.id ? r : x)) : [...s.rdos, r] })),
        validarRDO: (id) =>
          mutar((s) => ({ rdos: s.rdos.map((x) => (x.id === id ? { ...x, estado: 'validado', validadoPor: s.ui.usuario } : x)) })),
        rechazarRDO: (id, motivo) =>
          mutar((s) => ({ rdos: s.rdos.map((x) => (x.id === id ? { ...x, estado: 'rechazado', motivoRechazo: motivo } : x)) })),

        agregarCostos: (items) => mutar((s) => ({ costos: [...s.costos, ...items] })),
        asignarCosto: (id, partidaId, tipo, regla) =>
          mutar((s) => ({
            costos: s.costos.map((c) => (c.id === id ? { ...c, partidaId, tipo } : c)),
            reglasMapeo: regla ? [...s.reglasMapeo, { ...regla, id: uid('rg') }] : s.reglasMapeo,
          })),
        agregarCompromisos: (items) => mutar((s) => ({ compromisos: [...s.compromisos, ...items] })),

        ajustarForecast: (a) => {
          // RN-P11: un ajuste que reduce el EAC de la obra en más de 5% del BAC requiere R01
          const s = getS()
          const c = calcularObra(s, a.obraId, hoy())
          const cp = c.partidas.find((x) => x.p.id === a.partidaId)!
          const reduccion = cp.etc - a.etc
          const estado: AjusteForecast['estado'] = reduccion > 0.05 * c.bac && s.ui.rol !== 'R01' ? 'pendiente_r01' : 'aprobado'
          mutar((st) => ({ ajustes: [...st.ajustes, { ...a, id: uid('aj'), estado, fecha: hoy(), autor: st.ui.usuario }] }))
          return estado
        },
        resolverAjuste: (id, aprobado) =>
          mutar((s) => ({ ajustes: s.ajustes.map((x) => (x.id === id ? { ...x, estado: aprobado ? 'aprobado' : 'rechazado' } : x)) })),

        actualizarActividad: (actId, cambios) =>
          mutar((s) => {
            const prog = programaDe(s, s.ui.obraId, 'actualizado')
            if (!prog) return {}
            return {
              programas: s.programas.map((p) =>
                p.id === prog.id ? { ...p, actividades: p.actividades.map((a) => (a.id === actId ? { ...a, ...cambios } : a)) } : p,
              ),
            }
          }),

        solicitarRebaseline: (motivo) =>
          mutar((s) => {
            const o = obraActual()
            const act = programaDe(s, o.id, 'actualizado')
            const lb = programaDe(s, o.id, 'lineaBase')
            if (!act || !lb) return {}
            const c = calcularObra(s, o.id, hoy())
            const r = calcularCPM(act.actividades, o.fechaInicio, { usarReales: true, hoy: hoy(), avance: c.avanceAct })
            const nuevas = act.actividades.map((a) => ({ ...a, inicio: r.get(a.id)!.es, fin: r.get(a.id)!.ef }))
            const nuevo: Programa = {
              id: uid('prog'), obraId: o.id, tipo: 'lineaBase', version: lb.version + 1, estado: 'en_aprobacion',
              motivo, creadoPor: s.ui.usuario, fecha: hoy(), actividades: nuevas,
            }
            return { programas: [...s.programas.filter((p) => !(p.obraId === o.id && p.tipo === 'lineaBase' && p.estado === 'en_aprobacion')), nuevo] }
          }),
        resolverRebaseline: (programaId, aprobado) =>
          mutar((s) => {
            const nuevo = s.programas.find((p) => p.id === programaId)
            if (!nuevo) return {}
            if (!aprobado) return { programas: s.programas.filter((p) => p.id !== programaId) }
            return {
              programas: s.programas.map((p) =>
                p.id === programaId ? { ...p, estado: 'vigente', fecha: hoy() }
                  : p.obraId === nuevo.obraId && p.tipo === 'lineaBase' && p.estado === 'vigente' ? { ...p, estado: 'reemplazado' }
                    : p,
              ),
            }
          }),

        cerrarPeriodo: (fecha) => {
          const s = getS()
          const r = cerrarPeriodo(s, s.ui.obraId, fecha, s.ui.usuario, hoy())
          setS({ periodos: [...s.periodos, r.periodo], alertas: r.alertas })
          return { nuevas: r.nuevas, resueltas: r.resueltas }
        },

        reconocerAlerta: (id) =>
          mutar((s) => ({ alertas: s.alertas.map((a) => (a.id === id && a.estado === 'activa' ? { ...a, estado: 'reconocida' } : a)) })),
        descartarAlerta: (id, motivo) =>
          mutar((s) => ({ alertas: s.alertas.map((a) => (a.id === id ? { ...a, estado: 'descartada', motivoDescarte: motivo } : a)) })),
        agregarAccion: (alertaId, acc) =>
          mutar((s) => ({
            alertas: s.alertas.map((a) =>
              a.id === alertaId ? { ...a, estado: 'en_accion', acciones: [...a.acciones, { ...acc, id: uid('acc'), estado: 'pendiente' }] } : a,
            ),
          })),
        cambiarEstadoAccion: (alertaId, accionId, estado) =>
          mutar((s) => {
            const n = periodosDe(s, s.ui.obraId).at(-1)?.numero ?? 0
            return {
              alertas: s.alertas.map((a) =>
                a.id === alertaId
                  ? { ...a, acciones: a.acciones.map((x) => (x.id === accionId ? { ...x, estado, completadaEnPeriodo: estado === 'completada' ? n : x.completadaEnPeriodo } : x)) }
                  : a,
              ),
            }
          }),

        actualizarConfig: (c) =>
          mutar((s) => ({ config: { ...s.config, ...c, umbrales: { ...s.config.umbrales, ...(c.umbrales ?? {}) } } })),

        crearObra: (o, partidas, actividades, cuadrillas) =>
          mutar((s) => {
            const progs: Programa[] = actividades.length
              ? (['contractual', 'lineaBase', 'actualizado'] as const).map((tipo) => ({
                  id: uid('prog'), obraId: o.id, tipo, version: 1, estado: 'vigente' as const,
                  creadoPor: s.ui.usuario, fecha: hoy(), actividades, motivo: tipo === 'lineaBase' ? 'Línea base inicial' : undefined,
                }))
              : []
            return {
              obras: [...s.obras, o], partidas: [...s.partidas, ...partidas], programas: [...s.programas, ...progs],
              cuadrillas: [...s.cuadrillas, ...cuadrillas], ui: { ...s.ui, obraId: o.id },
            }
          }),
        reemplazarPartidas: (obraId, partidas) =>
          mutar((s) => ({ partidas: [...s.partidas.filter((p) => p.obraId !== obraId), ...partidas] })),
        cargarPrograma: (obraId, actividades) =>
          mutar((s) => {
            const tiene = s.programas.some((p) => p.obraId === obraId)
            if (!tiene) {
              const progs = (['contractual', 'lineaBase', 'actualizado'] as const).map((tipo) => ({
                id: uid('prog'), obraId, tipo, version: 1, estado: 'vigente' as const, creadoPor: s.ui.usuario, fecha: hoy(), actividades,
              }))
              return { programas: [...s.programas, ...progs] }
            }
            // Ya existe: se propone como nueva línea base (requiere aprobación, 10 §23)
            const lb = programaDe(s, obraId, 'lineaBase')
            return {
              programas: [
                ...s.programas.filter((p) => !(p.obraId === obraId && p.tipo === 'lineaBase' && p.estado === 'en_aprobacion')),
                { id: uid('prog'), obraId, tipo: 'lineaBase', version: (lb?.version ?? 0) + 1, estado: 'en_aprobacion', motivo: 'Programa importado', creadoPor: s.ui.usuario, fecha: hoy(), actividades },
              ],
            }
          }),
      }
    },
    {
      name: 'obrai-datos',
      // Si cambia el modelo de datos de la demo, se regenera (sin backend aún, 03 §6)
      version: 2,
      migrate: () => datosIniciales() as unknown as Estado,
      // En modo nube la caché se hidrata por empresa, después de iniciar sesión (sync.ts)
      skipHydration: modoNube,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => {
        const d: Record<string, unknown> = { config: s.config, ui: s.ui }
        for (const k of COLECCIONES) d[k] = s[k]
        return d as unknown as Estado
      },
    },
  ),
)

/** Subconjunto de datos (sin acciones) para el motor de dominio. */
export function useDatos(): Datos {
  const s = useStore()
  return s
}

export type { TipoRecurso }
