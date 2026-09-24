# VPAI — MVP de Control de Gestión de Obras

Sistema de alerta temprana de desviaciones para obras de construcción (Control Tower).
Implementa el alcance **v1.0 MVP** definido en `Bases app construccion/obrai_docs_v1/03_PRODUCT_REQUIREMENTS.md`:
Presupuesto + APU · Carta Gantt con línea base y ruta crítica · Avance físico · HH · Costos reales · EVM · Forecast · Alertas con explicación de causa.

## Cómo ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas del motor de dominio (CPM, EVM, explicación, importadores, demo)
npm run build      # build de producción en dist/ (PWA, funciona offline)
```

La app tiene dos modos según las variables de entorno:

| Modo | Cuándo | Datos |
|---|---|---|
| **Nube** | `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` | Supabase (Postgres + RLS por empresa), con copia local en IndexedDB para trabajar sin señal |
| **Local** | sin esas variables | Solo el navegador; al abrir se genera la demo |

### Configurar Supabase (una vez)

1. **SQL Editor** → ejecutar `supabase/migrations/0001_esquema_inicial.sql` y luego `0002_demo.sql` (ambos idempotentes).
2. **Authentication → Sign In / Providers** → activar *Allow anonymous sign-ins*.
3. Copiar `.env.example` a `.env.local` con la URL y la clave **anon public** del proyecto. La clave `service_role` nunca va en el frontend.

### Ingreso a la demo

No se piden correo ni contraseña: se elige un rol y se presiona **Ingresar**. La app abre una sesión anónima de Supabase y `unirse_demo()` la agrega a la empresa "Constructora Demo SpA"; el RLS por membresía sigue aplicando. La primera vez se generan las dos obras de ejemplo (16 y 6 semanas de historia), que comparten todos los visitantes. Dentro de la app se cambia de rol en el selector de abajo a la izquierda; **Salir** vuelve a la pantalla de ingreso.

## Qué incluye

| Área (doc 03) | Pantalla | Documentación |
|---|---|---|
| Control Tower de cartera | `/cartera` — semáforo obra × 8 dimensiones, ranking por VAC | 07, 14 §5.3 |
| Control Tower de obra | `/obra` — semáforo, avance planificado vs real, Curva S (PV/EV/AC + proyección a EAC), CPI/SPI/CV/SV/EAC/ETC/VAC/TCPI, hitos | 07, 14 §4 |
| Explicación en 3 niveles | `/explicacion/:dim` — ¿por qué? → cascada precio/consumo/rendimiento → Pareto por partida, cuadrilla o proveedor | 13 §8 |
| Alertas y acciones | `/alertas` — 14 reglas del núcleo (RULE-101…609), acciones correctivas con verificación automática de efectividad | 10 §28, 12 |
| Control de costos | `/costos` — Presupuesto → Comprometido → Ejecutado → Proyectado, forecast manual auditado (RN-P11), sin imputar, compromisos | RF-COS |
| Carta Gantt | `/programa` — línea base vs proyectado, ruta crítica (CPM con FC/CC/FF/CF, desfases y hitos contractuales como fecha límite), re-baseline con aprobación de R01 | 10 §23, RF-PLA |
| RDO del capataz | `/rdo` — móvil, avance en cantidades + HH por partida + HH no productivas | 17 §4.1, 20 §6.1 |
| Validación y rendimientos | `/terreno` — el jefe de terreno valida/devuelve; HH/unidad real vs APU por cuadrilla | 10 §5 |
| Cierre semanal | `/cierre` — checklist de completitud, snapshot inmutable, evaluación de reglas | 17 §4.2 |
| Informe semanal | `/informe` — imprimible a PDF | RF-CTL-06 |
| Importar | `/importar` — pegar desde Excel o CSV: itemizado + APU, Carta Gantt, costos contables (con reglas de mapeo cuenta/centro de costo), compromisos | RF-PRE-02, RF-COS-01 |
| Nueva obra | `/nueva-obra` — wizard contrato → itemizado → Gantt → cuadrillas | 21 §3B |

## Arquitectura

```
src/domain/     Motor puro en TypeScript (sin React): lo que en producción correría en Edge Functions
  cpm.ts          Ruta crítica, holguras, proyección con reales y límites de hitos
  evm.ts          EVM por partida/obra, forecast, provisión de subcontratos, HH, confianza de datos
  explicacion.ts  Descomposición determinista de desviaciones (suma = AC − EV) y Paretos
  reglas.ts       Reglas de alerta temprana del MVP
  periodos.ts     Cierre de período: snapshot, ciclo de vida de alertas, efectividad de acciones
  importar.ts     Parsers de Excel/CSV (números y fechas en formato chileno)
  seed.ts         Simulador de obras para la demo
src/store/      Estado (zustand) con caché en IndexedDB por empresa
  sync.ts         Sincronización con Supabase: diff contra la última versión confirmada, lotes, reintentos, realtime
  sesion.ts       Ingreso a la demo (sesión anónima + unirse_demo)
src/lib/        Cliente de Supabase
supabase/       Migraciones SQL (esquema, RLS, funciones, realtime)
src/pages/      Workspaces por rol
src/components/ Design system y gráficos SVG (Curva S, Gantt, cascada, Pareto)
```

## Pendiente para producción (docs 22–29)

- Mover los cálculos (EVM, reglas, cierre de período) a Edge Functions y permisos de escritura por rol en RLS (hoy RLS aísla por empresa; los permisos finos por rol se aplican en la interfaz).
- Cuentas reales por usuario (correo/SSO) con invitaciones y rol por membresía: el esquema 0001 ya lo soporta (miembros, invitaciones, crear_empresa, aceptar_invitaciones).
- Importación de MS Project XML (hoy: Excel/CSV con predecesoras), fotos en el RDO, notificaciones push/WhatsApp.
- Versiones v1.1+ (EEPP, riesgos, documental, compras, subcontratos, maquinaria, calidad, seguridad, finanzas).
