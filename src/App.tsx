import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { hoy } from './domain/fechas'
import { demoDesactualizada } from './domain/seed'
import { modoNube } from './lib/supabase'
import { Cargando, IngresoDemo } from './pages/Acceso'
import Alertas, { AlertaDetalle } from './pages/Alertas'
import Bienvenida from './pages/Bienvenida'
import Caja from './pages/Caja'
import Cartera from './pages/Cartera'
import Cierre from './pages/Cierre'
import Configuracion from './pages/Configuracion'
import Costos from './pages/Costos'
import EstadosPago, { DetalleEP } from './pages/EstadosPago'
import Explicacion from './pages/Explicacion'
import Importar from './pages/Importar'
import Informe from './pages/Informe'
import NuevaObra from './pages/NuevaObra'
import ObraTower from './pages/ObraTower'
import PartidaDetalle from './pages/PartidaDetalle'
import PortalMandante from './pages/PortalMandante'
import Programa from './pages/Programa'
import RDOPage from './pages/RDO'
import Terreno from './pages/Terreno'
import { useSesion } from './store/sesion'
import { useStore } from './store/store'

// three.js pesa: la simulación 4D se carga solo al abrirla
const Obra4D = lazy(() => import('./pages/Obra4D'))

const INICIO = { R01: '/cartera', R02: '/obra', R03: '/terreno', R04: '/rdo', R05: '/costos', R11: '/mandante' } as const

function Inicio() {
  const rol = useStore((s) => s.ui.rol)
  return <Navigate to={INICIO[rol]} replace />
}

function Rutas() {
  const sinObras = useStore((s) => s.obras.length === 0)
  // El mandante/ITO (externo) solo ve su portal: nunca costos, márgenes ni alertas internas (19 §5)
  const mandante = useStore((s) => s.ui.rol === 'R11')
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {sinObras ? (
            <>
              {/* Empresa nueva: solo lo que no requiere una obra */}
              <Route index element={<Bienvenida />} />
              <Route path="nueva-obra" element={<NuevaObra />} />
              <Route path="config" element={<Configuracion />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : mandante ? (
            <>
              <Route index element={<Inicio />} />
              <Route path="mandante" element={<PortalMandante />} />
              <Route path="estados-pago/:id" element={<DetalleEP />} />
              <Route path="4d" element={<Suspense fallback={<Cargando />}><Obra4D /></Suspense>} />
              <Route path="*" element={<Navigate to="/mandante" replace />} />
            </>
          ) : (
            <>
              <Route index element={<Inicio />} />
              <Route path="cartera" element={<Cartera />} />
              <Route path="obra" element={<ObraTower />} />
              <Route path="explicacion/:dim" element={<Explicacion />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="alertas/:id" element={<AlertaDetalle />} />
              <Route path="costos" element={<Costos />} />
              <Route path="caja" element={<Caja />} />
              <Route path="estados-pago" element={<EstadosPago />} />
              <Route path="estados-pago/:id" element={<DetalleEP />} />
              <Route path="mandante" element={<PortalMandante />} />
              <Route path="partida/:id" element={<PartidaDetalle />} />
              <Route path="programa" element={<Programa />} />
              <Route path="4d" element={<Suspense fallback={<Cargando />}><Obra4D /></Suspense>} />
              <Route path="terreno" element={<Terreno />} />
              <Route path="rdo" element={<RDOPage />} />
              <Route path="cierre" element={<Cierre />} />
              <Route path="informe" element={<Informe />} />
              <Route path="importar" element={<Importar />} />
              <Route path="nueva-obra" element={<NuevaObra />} />
              <Route path="config" element={<Configuracion />} />
              <Route path="*" element={<Inicio />} />
            </>
          )}
        </Route>
      </Routes>
    </HashRouter>
  )
}

/** Modo nube: se elige un rol y se entra a la empresa demo compartida en Supabase. */
function AppNube() {
  const listo = useSesion((s) => s.estado === 'listo')
  return listo ? <Rutas /> : <IngresoDemo />
}

/** Modo local (sin variables de Supabase): demo en el navegador. */
function AppLocal() {
  const [listo, setListo] = useState(useStore.persist.hasHydrated())
  useEffect(() => {
    // La demo se renueva cada día para mostrar datos al día (solo si los datos son de la demo)
    const renovar = () => { const s = useStore.getState(); if (s.config.demoGenerada != null && demoDesactualizada(s.config, hoy())) s.reiniciarDemo() }
    if (useStore.persist.hasHydrated()) renovar()
    return useStore.persist.onFinishHydration(() => { renovar(); setListo(true) })
  }, [])
  return listo ? <Rutas /> : <Cargando />
}

export default function App() {
  return modoNube ? <AppNube /> : <AppLocal />
}
