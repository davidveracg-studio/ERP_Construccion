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

1. **SQL Editor** → ejecutar `supabase/migrations/0001_esquema_inicial.sql`, luego `0002_demo.sql`, `0003_modelos_ifc.sql` (bucket de Storage para los modelos BIM) `0004_estados_pago.sql` (estados de pago) y `0005_v11_oficina_tecnica.sql` (tablas de la v1.1 y bucket de documentos) y `0006_v12_abastecimiento.sql` (tablas de la v1.2 y roles R07/R09/R10/R11) y `0007_v13_calidad_seguridad_finanzas.sql` (tablas de la v1.3 y rol R08) y `0008_v2_comercial_postventa.sql` (tablas de la v2 y rol R06). Todos son idempotentes.
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
| Contrato y garantías | `/contrato` — monto y plazo vigentes con órdenes de cambio; obligaciones con multa (RULE-904); garantías vigente → por vencer → vencida, renovada, devuelta o cobrada (RULE-404); recepción provisoria con observaciones, subsanación y V°B° del mandante, y definitiva (la obra pasa a en garantía y cerrada); exposición a multas con tope | v1.1 · 10 §16 y §20, 12 |
| Registro de riesgos | `/riesgos` — matriz probabilidad × impacto (5×5), exposición en dinero y días, responsable, plan de mitigación con acciones y fechas, reevaluaciones e historial; ciclo identificado → en análisis → abierto ⇄ en mitigación → materializado → cerrado (con impacto real); KRI-01…06 (exposición contra la contingencia disponible y la holgura al término); alertas RULE-610 (crítico sin plan), RULE-611 (revisión vencida) y riesgo materializado | v1.1 · 08, 10 §25, 12, 14 |
| Planos, RFI y submittals | `/documentos` — planos, EETT y memorias con control de revisiones (una vigente, las demás superadas), archivo adjunto en el bucket `documentos-obra` y confirmación de terreno (RULE-905); RFI borrador → emitido → respondido ⇄ repregunta → cerrado (vincula OC o riesgo; RULE-903, alta si toca la ruta crítica); submittals con aprobación del mandante y revisión siguiente al rechazarse; KDO-01…03 | v1.1 · 08, 10 §26–27, 12, 14 |
| Libro de Obra | `/libro-obra` — folios numerados, fechados, firmados e inmutables; el ITO (R11) firma como mandante, R02/R03 como contratista; instrucciones y observaciones del ITO esperan respuesta en 3 días hábiles o el plazo indicado (RULE-902) | v1.1 · 08, 19 RN-P03 |
| Plan semanal (Last Planner) | `/plan-semanal` — tareas por cuadrilla y partida con meta semanal; restricciones (material, plano, RFI, submittal, equipo…) que impiden comprometer, y las de RFI/submittal se liberan solas al responderse o aprobarse; propuesta → comprometida → en ejecución → cumplida / no cumplida (causa obligatoria) y replanificación; lo logrado sale de los RDO; PPC semanal (KPL-04), Pareto de causas, RULE-113 (PPC bajo meta) y RULE-114 (restricción sin liberar a 48 h) | v1.1 · 08, 10 §8, 14 |
| Compras y abastecimiento | `/compras` — solicitudes de material desde terreno (R03/R04) → orden de compra imputada a partida (R07) con aprobación por monto (R02 hasta 150 UF, Gerencia sobre eso o fuera de presupuesto) → recepciones parciales o totales con guía, que generan el costo real; el saldo por recibir suma al comprometido de la partida; proveedores con bloqueo (RULE-302), cotizaciones mínimas (RULE-303), catálogo de materiales; KAB-01/02/03/06/09/12, semáforo **Compras** (OTIF), RULE-305/306 | v1.2 · 08, 10 §12–13, 12, 14 |
| Bodega de obra | `/bodega` — stock por material valorizado a costo promedio; movimientos inmutables (entrada por recepción de OC, salida a partida, traspaso entre obras, merma, ajuste); salida sin stock bloqueada (RULE-203); despacho de solicitudes desde bodega; control por partida presupuestado / según avance / comprado / recibido / consumido (KAB-11, RULE-202); cobertura del material de las tareas del plan semanal de los próximos 7 días contra stock + OC en curso (RULE-201, KAB-13); material inmovilizado (KAB-05) | v1.2 · 08, 12, 14 |
| Subcontratos | `/subcontratos` — subcontratistas; subcontrato con partidas, PU y retención (borrador → en acreditación → vigente ⇄ suspendido → terminado → cerrado / resuelto; sobre 500 UF firma Gerencia); el saldo es compromiso por partida; adicionales, descuentos y multas; EP del período con lo validado no cobrado (presentar → validar por terreno con **RULE-703** → aprobar → pagar); al aprobarse el EP es costo real; retención acumulada y devuelta al cierre (RULE-704); KSU-03…08 | v1.2 · 08, 10 §14–15, 12, 14 |
| Cumplimiento laboral | En el detalle de cada subcontrato: F30 con vigencia, F30-1 de cada mes y trabajadores con contrato, información de riesgos (DS 44) y EPP; cargado → validado / rechazado, por vencer y vencido (10 §19); **RULE-702** (no se acredita sin F30 vigente y trabajadores acreditados) y **RULE-701** (un EP aprobado sin el F30-1 del mes del corte o del anterior queda bloqueado para el pago y se libera al validarse); KSU-01/02 | v1.2 · 08, 10 §19, 12, 14 |
| Portal subcontratista | `/subcontratista` (rol R10) — sus subcontratos en todas las obras, lo validado por cobrar, preparar y presentar sus EP, estado y motivo de bloqueo, carga de documentos y registro de trabajadores; sin costos ni precios de venta de la constructora | v1.2 · 07, 19 §5 |
| Maquinaria | `/maquinaria` — equipos propios, arrendados o de subcontratista con tarifa por hora, día o mes; parte diario (horas disponibles, trabajadas por partida, improductivas con causa, mantención, combustible y horómetro) que valida terreno y, validado, es costo real de equipo por partida; utilización, improductivas, costo hora real vs presupuestado, consumo, disponibilidad mecánica, mantenciones y rendimiento (KMQ-01…07); RULE-205 (baja utilización de equipos de costo fijo) y RULE-206 (improductivas) | v1.2 · 08, 10 §29, 12, 14 |
| Caja chica y rendiciones | `/caja-chica` — fondo fijo por obra (lo abre y cierra Finanzas, R09); rendición con comprobante e imputación a partida o GG; revisión por ítem (el administrador hasta 10 UF, sobre eso Finanzas o Gerencia, RN-P04); **RULE-401** si se presenta con gastos sin respaldo, sin imputar, sobre el tope o sobre el fondo; Finanzas repone el fondo por lo aprobado, que pasa a costo real. Con el rol **R09 Finanzas** también pagan los EP de subcontratistas y se cierran las OC con factura (RN-P06) | v1.2 · 08, 10 §17, 12, 19 |
| Calidad | `/calidad` — protocolos por partida con checklist (los de **liberación** bloquean el avance de la partida en el RDO hasta aprobarse; los **obligatorios** condicionan la recepción provisoria, **RULE-103**); el capataz inicia, el jefe de terreno aprueba con el checklist completo o rechaza con observaciones, y el ITO da su V°B° desde el portal del mandante. Un rechazo abre una **NCR** y programa la reinspección (**RULE-104**); las HH de corrección se registran en el RDO como **retrabajo**. Indicadores KCA-01/02/03/07/08/09, **RULE-111** (rework rate) y **RULE-112** (NCR vencida); la dimensión Calidad del semáforo y del Health Score queda activa | v1.3 · 08, 10 §11 y §22, 12, 14 |
| Seguridad (SST) | `/seguridad` — charla diaria por cuadrilla (**RULE-801**: sin ella el RDO no se envía), **ART** firmado para las tareas críticas (altura, excavación, izaje, caliente, confinado, eléctrico; **RULE-803** bloquea el avance sin ART), observaciones preventivas, inspecciones de Prevención, incidentes con clasificación, investigación, medidas correctivas (**RULE-804** si vencen) y protocolo legal (**RULE-802**: DIAT; suspensión y avisos a la Inspección del Trabajo y la SEREMI si es grave o fatal). Indicadores KSE-01…12 (IF, IG, accidentabilidad, días sin accidentes, cumplimiento de charlas y ART); la dimensión Seguridad del semáforo y del Health Score (15 %, con tope de 59 ante un accidente grave). Nuevo rol **R08 Prevención de Riesgos**, que además acredita y puede suspender subcontratos por seguridad | v1.3 · 08, 10 §18, 12, 14, 19 |
| Finanzas | `/finanzas` (inicio de R09) — caja consolidada; cobranza de EP con **factura electrónica (DTE)** de folio correlativo e IVA al facturar (integración con el SII simulada: Finanzas registra la aceptación o el rechazo, que deja el EP por facturar) y **nota de crédito** que anula la factura de un EP sin cobros; **CxC** por antigüedad (KFI-12), EP vencidos con el escalamiento de **RULE-402** (Finanzas → administrador a los 15 días → Gerencia a los 30), días de cobro (KFI-03); **CxP** por vencimiento (KFI-13) y **pagos programados** con el semáforo de cumplimiento laboral (los EP sin F30-1 quedan retenidos, RULE-701); pagos a proveedores registrados, que el flujo de caja usa como fecha real de pago. La factura y el cobro de los EP pasan a Finanzas | v1.3 · 07, 08, 10 §21, 14 |
| Comercial | `/comercial` (inicio de R06) — pipeline de **leads** (nuevo → en estudio → propuesta enviada → ganado / perdido / descartado, con motivo obligatorio), clientes, visitas técnicas y **propuestas** con itemizado y **APU desde el catálogo de rendimientos reales** de las obras (HH/u y costo unitario real vs presupuestado); precio = (costo directo + GG) / (1 − margen). Gerencia da el V°B° antes de enviar (**RULE-005** margen bajo el mínimo y **RULE-004** cliente bloqueado o moroso exigen justificación); la **adjudicación crea la obra** en planificación con el itemizado como presupuesto. Alertas **RULE-001** (licitación por cerrar sin estudio), **RULE-003** (propuesta sin respuesta) y **RULE-604** (baja adjudicación); indicadores KCM-01…06. Nuevo rol **R06 Estudios / Comercial** | v2 · 08, 10 §2–4, 12, 14 |
| Postventa | `/postventa` — solicitudes de las obras recibidas clasificadas según el **art. 18 LGUC** (estructura 10 años, instalaciones y elementos constructivos 5, terminaciones 3) con su vigencia desde la recepción; **RULE-503**: se asignan al subcontratista de la partida (la ve y la da por resuelta en su portal) o a la constructora, con plazos de visita (3 días) y solución (30). El mandante las ingresa desde su portal. Indicadores KCA-06, días a la visita y a la solución, costo de postventa y lo asumido por subcontratistas | v2 · 10 §7, 11, 12, 14 |
| Benchmark y auditoría | `/benchmark` — segmento de la empresa (tamaño, línea, mandante, región, volumen), posición y percentiles BEN-001…008 contra una **referencia sectorial de demostración (datos simulados**; en producción, el agregado anónimo de la red con n ≥ 10), rendimientos de referencia P25/P50/P75 (BEN-007), **Score Salud Empresa** (14 §5.2), **riesgo empresarial** (§13), madurez del control de gestión (OBR-001) y calidad de datos (OBR-004), scores de mandantes, administradores (solo Gerencia), subcontratistas y proveedores. `/auditoria` — **auditoría mensual** (§14) de cada mes cerrado guardada como foto inmutable: scores, obras, fortalezas y debilidades, desviaciones explicadas, riesgos, recomendaciones automáticas y proyección; imprimible | v2 · 13, 14 §5–§14 |
| Motor predictivo | `/predictivo` — modelos estadísticos reproducibles, sin IA generativa: **EAC por tres métodos** (presupuesto, CPI, CPI·SPI) y por **tendencia** (regresión del CPI semanal), con rango frente al EAC por partida; **término con estacionalidad climática** (días de lluvia por mes) y **simulación Monte Carlo del plazo** sobre el CPM (P10/P50/P80/P90, probabilidad de cumplir el contrato, índice de criticidad); **curvas de aprendizaje** (Wright) de las actividades repetitivas; **anomalías** de rendimiento en los RDO; **escenarios**: agregar trabajadores a una actividad (término, hitos, costo y ahorro) y tomar una propuesta (backlog, concentración y dotación) | v2 · 13, 14 §18 |
| Portal mandante | `/mandante` (rol R11) — avance en % y curva S, EP y OC por aprobar, RFI y submittals por responder, Libro de Obra, historial; sin costos, márgenes ni alertas internas | v1.1 · 07, 19 §5 |
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
  contrato.ts     Obligaciones y multas, garantías, recepción provisoria/definitiva y estado de la obra
  riesgos.ts      Registro de riesgos: matriz, exposición, transiciones por rol e indicadores KRI
  documental.ts   Planos y revisiones, RFI, submittals, Libro de Obra e indicadores KDO
  lastPlanner.ts  Plan semanal, restricciones, PPC (KPL-04) y causas de no cumplimiento
  compras.ts      Solicitudes, órdenes de compra, recepciones, compromiso por OC, OTIF e indicadores KAB
  bodega.ts       Stock a costo promedio, movimientos, control por partida y cobertura del plan semanal
  subcontratos.ts Subcontratos, EP de subcontrato (RULE-703), retenciones e indicadores KSU
  cumplimiento.ts Documentación laboral, acreditación (RULE-702) y bloqueo de pago por F30-1 (RULE-701)
  maquinaria.ts   Equipos, partes diarios, costo por partida e indicadores KMQ
  cajaChica.ts    Caja chica, rendiciones, tope por ítem y RULE-401
  calidad.ts      Protocolos, liberaciones, NCR, retrabajo e indicadores KCA (RULE-103/104/111/112)
  seguridad.ts    Charlas, ART, incidentes, protocolo legal, medidas e indicadores KSE (RULE-801..804)
  finanzas.ts     DTE, cuentas por cobrar y por pagar, pagos programados (KFI-03/05/09/11/12/13)
  comercial.ts    Leads, propuestas, precio, catálogo de rendimientos reales e indicadores KCM
  postventa.ts    Garantía art. 18 LGUC, solicitudes, asignación al subcontratista y KCA-06 (RULE-503)
  benchmark.ts    Segmento, percentiles BEN, Score Empresa, riesgo empresarial, scores e índices OBR
  auditoria.ts    Informe ejecutivo mensual con recomendaciones automáticas (14 §14)
  predictivo.ts   EAC por métodos y tendencia, Monte Carlo del plazo, clima, curvas de aprendizaje, anomalías y escenarios
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
- Versiones v1.2+ (compras, subcontratos, maquinaria, calidad, seguridad, finanzas).
