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

1. **SQL Editor** → ejecutar `supabase/migrations/0001_esquema_inicial.sql`, luego `0002_demo.sql`, `0003_modelos_ifc.sql` (bucket de Storage para los modelos BIM) `0004_estados_pago.sql` (estados de pago) y `0005_v11_oficina_tecnica.sql` (tablas de la v1.1 y bucket de documentos). Todos son idempotentes.
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
| Estados de pago | `/estados-pago` — ciclo completo de 10 §9 (borrador → revisión interna → presentado ⇄ observado con versiones → aprobado → facturado → pago parcial/pagado, anulación), cubicación con generadores, reajuste por índice, descuentos y multas, IVA; KFI-01/02/10 y RULE-403 | v1.1 · 10 §9, 08 |
| Órdenes de cambio | `/ordenes-cambio` — aumento, obra extraordinaria, deductivo y plazo; valorización, aprobación interna (Gerencia sobre el 5 % del contrato) y del mandante; al aprobarse ajusta cantidades vigentes, venta, presupuesto y plazo; las partidas extraordinarias no cuentan ni se cobran hasta la aprobación del mandante; alerta RULE-105 (trabajo en riesgo de no pago) | v1.1 · 10 §10, 12 |
| Portal mandante | `/mandante` (rol R11) — avance en % y curva S, EP por aprobar con Aprobar/Observar, historial; sin costos, márgenes ni alertas internas | v1.1 · 07, 19 §5 |
| Flujo de caja | `/caja` — caja disponible (capital de trabajo + cobros − pagos) real y proyectada por obra y cartera, mínimo a 60 días en el semáforo (KFI-06), estados de pago al mandante (generar desde el avance validado → aprobar → facturar → pagar, con retención y anticipo), alertas RULE-603 y RULE-402 | 07, 12, 13, 14 §4.3 |
| Control de costos | `/costos` — Presupuesto → Comprometido → Ejecutado → Proyectado, forecast manual auditado (RN-P11), sin imputar, compromisos | RF-COS |
| Carta Gantt | `/programa` — línea base vs proyectado, ruta crítica (CPM con FC/CC/FF/CF, desfases y hitos contractuales como fecha límite), re-baseline con aprobación de R01 | 10 §23, RF-PLA |
| Simulación 4D | `/4d` — modelo 3D paramétrico (pisos y planta) o **BIM (IFC)** enlazado a la Carta Gantt; línea de tiempo con reproducción, plan (línea base) vs real (RDO validados) y proyección CPM después de hoy, colores por desviación. Los elementos IFC se asignan solos a capa (por clase) y piso (por nivel); modelo de ejemplo en `public/demo` | — |
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
  modelo4d.ts     Modelo 4D: inferencia desde el programa, avance por capa/piso y línea de tiempo
  ordenesCambio.ts Órdenes de cambio: etapas, umbral RN-P04, efectos de la aprobación y vigencia de partidas
  estadosPago.ts  Ciclo del EP: etapas, permisos por rol, cubicación, reajuste, indicadores y RULE-403
  caja.ts         Flujo de caja: estados de pago, cobros, pagos, proyección y mínimo a 60 días
  bim.ts          IFC → capas y pisos (clase IFC, niveles), orden constructivo de los elementos
  explicacion.ts  Descomposición determinista de desviaciones (suma = AC − EV) y Paretos
  reglas.ts       Reglas de alerta temprana del MVP
  periodos.ts     Cierre de período: snapshot, ciclo de vida de alertas, efectividad de acciones
  importar.ts     Parsers de Excel/CSV (números y fechas en formato chileno)
  seed.ts         Simulador de obras para la demo
src/store/      Estado (zustand) con caché en IndexedDB por empresa
  sync.ts         Sincronización con Supabase: diff contra la última versión confirmada, lotes, reintentos, realtime
  sesion.ts       Ingreso a la demo (sesión anónima + unirse_demo)
src/lib/        Cliente de Supabase
src/ifc/        Lectura de IFC con web-ifc en un web worker, caché y archivos en Supabase Storage
scripts/        ifc-demo.mjs: genera el modelo BIM de ejemplo (public/demo)
supabase/       Migraciones SQL (esquema, RLS, funciones, realtime)
src/pages/      Workspaces por rol
src/components/ Design system y gráficos SVG (Curva S, Gantt, cascada, Pareto)
```

## Despliegue

Cada cambio en `main` se publica solo en Vercel (https://erp-construccion-eight.vercel.app) con el workflow `.github/workflows/deploy-vercel.yml`: corre los tests, construye con las variables de producción del proyecto en Vercel y despliega con la CLI. Necesita el secret `VERCEL_TOKEN` (token del team vpai, ver https://vercel.com/account/settings/tokens) y las variables `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` del repositorio. También se puede lanzar a mano desde Actions → Deploy Vercel → Run workflow.

## Pendiente para producción (docs 22–29)

- Mover los cálculos (EVM, reglas, cierre de período) a Edge Functions y permisos de escritura por rol en RLS (hoy RLS aísla por empresa; los permisos finos por rol se aplican en la interfaz).
- Cuentas reales por usuario (correo/SSO) con invitaciones y rol por membresía: el esquema 0001 ya lo soporta (miembros, invitaciones, crear_empresa, aceptar_invitaciones).
- Importación de MS Project XML (hoy: Excel/CSV con predecesoras), fotos en el RDO, notificaciones push/WhatsApp.
- Versiones v1.1+ (EEPP, riesgos, documental, compras, subcontratos, maquinaria, calidad, seguridad, finanzas).
