// Primera entrada de una empresa sin obras (21 §3B)
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton, Card, Titulo } from '../components/ui'
import { useStore } from '../store/store'

export default function Bienvenida() {
  const empresa = useStore((s) => s.config.empresa)
  const reiniciarDemo = useStore((s) => s.reiniciarDemo)
  const nav = useNavigate()
  const [cargando, setCargando] = useState(false)
  return (
    <div className="max-w-3xl space-y-4">
      <Titulo sub={empresa}>Bienvenido a VPAI</Titulo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card titulo="Crear la primera obra">
          <p className="text-sm text-slate-600">Contrato, itemizado con APU, Carta Gantt y cuadrillas. Puedes pegar el itemizado y el programa desde Excel.</p>
          <Boton className="mt-4" onClick={() => nav('/nueva-obra')}>Crear obra</Boton>
        </Card>
        <Card titulo="Explorar con datos de demostración">
          <p className="text-sm text-slate-600">
            Carga dos obras simuladas (Edificio Los Aromos y Remodelación Clínica Elqui) con 16 semanas de historia. Se guardan en la base de datos de tu empresa y las ve todo el equipo.
          </p>
          <Boton variante="secundario" className="mt-4" disabled={cargando}
            onClick={() => { setCargando(true); setTimeout(() => { reiniciarDemo(); nav('/') }, 30) }}>
            {cargando ? 'Generando…' : 'Cargar demo'}
          </Boton>
        </Card>
      </div>
    </div>
  )
}
