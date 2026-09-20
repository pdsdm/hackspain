<!--
  PARA EL EQUIPO: tablero único de tareas, lo leen humanos y agentes.
  - Una fila por tarea. Si la tarea tiene más de un paso no trivial, crea su spec en docs/specs/ y enlázala.
  - Estados: todo | doing | review | done | bloqueada
  - Para evitar conflictos de merge: cada uno edita SOLO su fila, y las tareas nuevas se añaden al final.
  - Los agentes leen este archivo al empezar y actualizan su fila al terminar.
-->

# Tareas

| ID | Tarea | Responsable | Rama | Spec | Estado |
|---|---|---|---|---|---|
| T1 | Revisar contexto MADRING ya incorporado y coherencia con D4 | equipo | - | [`escenario/escenario.md`](escenario/escenario.md) | review |
| T2 | Cerrar stack, scaffold, comandos y checks | Zhi | `feat/zhi-backend-foundation` (PR #4, mergeada) | [T2](docs/specs/T2-backend-foundation.md) | done |
| T3 | Cerrar contrato backend, frontend y workflows | Zhi | `zhi-t3-contrato` (PR #13, mergeada) | [T3](docs/specs/T3-contrato.md) | done |
| T4 | Panel de supervisión (frontend) con simulación local | Pepe | `feat/pepe-frontend-panel` (PR #11, mergeada) | [T4](docs/specs/T4-frontend-panel.md) | done |
| T5 | Seed MADRING y fixtures de demo | Carlos | `feat/carlos-seed` (PR #7, mergeada) | [T5](docs/specs/T5-seed.md) | done |
| T6 | Validar cuenta HappyRobot y primera llamada real | Álvaro (apoyo: Zhi) | `Prueba-de-plataforma-y-llamada-real` (sin mergear), `fix/zhi-real-call-robustez` (PR #40) | [T6](docs/specs/T6-prueba-voz.md) | doing |
| T7 | Estado persistente, reglas y despacho de tareas | Zhi | `feat/t7-estado` (PR #8, mergeada) | [T7](docs/specs/T7-estado.md) | done |
| T8 | Dashboard y plano Norte/Sur | Carlos | `feat/carlos-dashboard` (PR #9, mergeada); retoque visual local en `fix/carlos-demo-ui`; panel de agentes en `feat/carlos-panel-agentes` (revisión local) | [T8](docs/specs/T8-dashboard.md) | done |
| T9 | Adaptador HappyRobot y callbacks | Álvaro (apoyo: Zhi) | `feat/alvaro-integracion` (PR #26, mergeada), `fix/zhi-real-call-robustez` (PR #40) | [T9](docs/specs/T9-integracion.md) | review |
| T10 | Workflow coordinador | Ventura | `feat/ventura-coordinador` (PR #14, mergeada) | [T10](docs/specs/T10-coordinador.md) | done |
| T11 | Agente de Espacios | Ventura | `feat/ventura-espacios` (PR #10, mergeada) | [T11](docs/specs/T11-espacios.md) | done |
| T12 | Agente de Catering | Ventura (relevo de Pep) | `feat/ventura-demo-specialists` | [T12](docs/specs/T12-catering.md) | review |
| T13 | Agente de Transporte | Álvaro | `feat/alvaro-transporte` | [T13](docs/specs/T13-transporte.md) | todo |
| T14 | Agente de Asistentes y avisos segmentados | Ventura (relevo de Pep) | `feat/ventura-demo-specialists` | [T14](docs/specs/T14-asistentes.md) | doing |
| T15 | Aprobaciones, pausa y control de incidentes | Pep | `feat/pep-control` | [T15](docs/specs/T15-control.md) | review |
| T16 | Replanificación e invalidación de acuerdos | Ventura | `feat/ventura-adaptacion` | [T16](docs/specs/T16-adaptacion.md) | review |
| T17 | Integración y pruebas críticas | Zhi | `feat/zhi-demo-gaps` | [T17](docs/specs/T17-integracion-final.md) | doing |
| T18 | Entorno de demo y recuperación | Zhi | `fix/zhi-demo-readiness` | [T18](docs/specs/T18-entorno-demo.md) | doing |
| T19 | Pitch, ensayo y vídeo de respaldo | Carlos | `feat/carlos-demo` | [T19](docs/specs/T19-demo.md) | todo |
| T20 | P2: aprendizaje entre ejecuciones | Ventura | `feat/ventura-aprendizaje` | [T20](docs/specs/T20-aprendizaje.md) | todo |
| T21 | Revisión y entrega final | Pep | `feat/pep-entrega` | [T21](docs/specs/T21-entrega.md) | todo |
| T22 | P2: transcripción en directo | Devin | `feat/devin-transcripcion` | [T22](docs/specs/T22-transcripcion.md) | review |
| T23 | Rediseño UI del panel: tema claro con estética Zhivel | Pep | `feat/pepe-ui-zhivel`, `fix/pepe-dashboard-layout` (mergeadas) | - | done |
| T24 | Motor de eventos, mundo y coordinador en proceso | Pep | `feat/pep-motor-eventos` (PR #15, mergeada) | [T24](docs/specs/T24-motor-eventos.md) | done |
| T25 | Robustez del motor: cola que no se envenena, reloj vivo tras reset, timeout de callbacks | Zhi | `fix/zhi-engine-robustez` (PR #16, mergeada) | - | done |
| T26 | Cognition/Devin como inferencia y harness del coordinador | Pep | `feat/pep-cognition-devin` (PR #17, mergeada) | - | done |
| T27 | Panel contra el backend real de punta a punta (`VITE_DATA_SOURCE=api`) | Pep (apoyo: Zhi) | `feat/pep-panel-api` (PR #28, mergeada) | - | done |
| T28 | Unificar por dónde se lanza la llamada: backend vs servidor de Vite | Álvaro (con Zhi y Pep) | `feat/alvaro-integracion` (PR #26, mergeada) | - | done |
| T29 | Mundo ampliado: paddock, parkings, más accesos, muelle Norte | Pep | `feat/pep-mundo` (PR #38, mergeada) | [T29](docs/specs/T29-mundo-ampliado.md) | done |
| T30 | Afluencia con picos y saturación de accesos en el backend | Pep | `feat/pep-afluencia` (PR #39, mergeada) | [T30](docs/specs/T30-afluencia-picos.md) | done |
| T31 | Actores móviles: taxis, VIP y repartidores de última hora | Pep | `feat/pep-actores` (PR #43, mergeada) | [T31](docs/specs/T31-actores-moviles.md) | done |
| T32 | Incidencias en vivo: agente mundo con LLM + catálogo de respaldo («Modo vivo») | Pep | PRs #30, #42, #45 (mergeadas) | [T32](docs/specs/T32-incidencias-vivo.md) | done |
| T33 | El coordinador no se relanza tras un `call_result` aceptado (evita replanificaciones en cascada) | Pep | `feat/pep-engine-callresult` | - | review |
| T34 | Sala de conferencia con varios participantes en el agente demo de voz | Álvaro | `feat/alvaro-integracion` | - | review |
| T35 | JEV verifica la evidencia del callback antes de confirmar (`evidence-v2`, efectos desactivados) | Ventura | `feat/ventura-jev-confirmacion` | [Contrato T35](docs/api-contract.md#verificación-opcional-jev-t35) | review |
| T37 | Rutas dinámicas: origen libre (geocode) + spawn_vehicle + OSRM | Pep | `feat/pep-rutas-dinamicas` | - | doing |
| T38 | Costes informativos: eliminar bloqueos presupuestarios durante la crisis | Ventura + Devin | `feat/ventura-costes-informativos` | [Política y contrato T38](docs/api-contract.md#costes-informativos-t38) | review |
| T39 | Mapa a pantalla completa con paneles flotantes, cronología tipo chat y velocidad cíclica | Pep | `feat/pep-mapa-fullscreen`, `feat/pep-chat-anclado` (PR #56) | - | review |
| T40 | Persistir el estado de la crisis en Supabase (espejo Postgres) | Pep | `feat/pep-supabase` | - | descartada: el despliegue va en Railway |
| T41 | Piloto JEV → playbook acotado, corpus sintético y comparación con coordinador | Ventura + Devin | `feat/ventura-jev-routing-pilot` (PR #57) | [T41](docs/specs/T41-jev-routing-pilot.md) | review |
| T42 | Arranque limpio y pausado en cada despliegue | Zhi + Devin | `fix/zhi-clean-deploy-state` (PR #64, mergeada) | [T42](docs/specs/T42-arranque-limpio.md) | done |
| T43 | Cierre de la crisis: acuerdos avanzan, plan termina, intervención inmediata y túnel para la red del hackathon | Ventura + Devin | `fix/ventura-cierre-demo` (PR #62, mergeada) | [Contrato](docs/api-contract.md#cierre-de-la-crisis-resolved-closuresummary-coordinatorstatus-atascado) | done |
| T44 | Piloto HappyRobot Reasoning Agent como coordinador | Astra | `feat/astra-happyrobot-coordinator` (PR #81, mergeada) | [T44](docs/specs/T44-happyrobot-coordinator.md) | review |
| T45 | Congelar escenario y storyboard técnico de la demo | Ventura (revisión: Carlos) | `docs/ventura-video-scenario` | [T45](docs/specs/T45-video-scenario.md) | review |
| T46 | Entrada autenticada de incidentes desde HappyRobot | Zhi | `feat/zhi-happyrobot-event-ingress` | [T46](docs/specs/T46-happyrobot-event-ingress.md) | done |
| T47 | Workflow HappyRobot determinista para inputs simulados de llamada y SMS | Ventura | `feat/ventura-happyrobot-incident-inputs` | [T47](docs/specs/T47-happyrobot-incident-inputs.md) | bloqueada |
| T48 | Director reproducible del recorrido de vídeo | Ventura (revisión: Zhi + Carlos) | `feat/ventura-demo-director` | [T48](docs/specs/T48-demo-director.md) | doing |
| T49 | Incidencias activas y procedencia de inputs en el frontend | Ventura (revisión: Carlos) | `feat/ventura-demo-incidents-ui` (PR #75) | [T49](docs/specs/T49-demo-incidents-ui.md) | done |
| T50 | Coordinación de staff mediante el agente de Asistentes | Ventura | `feat/ventura-demo-staff-coordination` | [T50](docs/specs/T50-staff-coordination.md) | review |
| T51 | Outputs de Espacios, Catering, Transporte y Asistentes listos para vídeo | Ventura (Catering + Asistentes) + Álvaro (Transporte) | `feat/ventura-demo-specialists`, `feat/alvaro-demo-transport` | [T51](docs/specs/T51-demo-specialists.md) | doing |
| T52 | Integración, ensayo y grabación final | Zhi + Carlos + equipo | `feat/zhi-demo-recording-readiness`, `feat/t52-triage-live-transport`, `fix/t52-e2e-plan-invariants` | [T52](docs/specs/T52-demo-recording.md) | doing |
| T53 | Pulido UI: mapa a pantalla completa, vidrio más opaco, pines sin recorte y cronología en raíl | Pep | `feat/pep-ui-polish` | - | review |
| T54 | Más actores con orígenes repartidos por Madrid y rutas que evitan el circuito | Pep | `feat/pep-mas-actores` | [D8](docs/decisions.md) | review |
| T55 | Corregir el bucle de replanificación en producción: sin replan por `no_answer`, una llamada real en curso, logs legibles | Pep | `fix/pep-replan-loop` | [D21](docs/decisions.md) | done |
| T56 | Cierre de la demo: dependencias con `:retry`, sin replan por condiciones, cierre con condiciones informativas, logs sin `answer` | Pep | `fix/pep-deps-retry` | [D23](docs/decisions.md) | done |
| T57 | Quitar toda la simulación: sin adaptador `sim`, sin modo vivo ni giros, sin `inbox_batch`, sin reset E2E, frontend siempre API | Pep | `feat/pep-sin-simulacion` | [D24](docs/decisions.md) | review |
| T58 | El coordinador no aceptaba un «no»: memoria de llamadas en el snapshot, `no_disponible` aplicado, hook por área, plazos en tiempo real y teléfono editable en el panel | Pep | `feat/pep-no-y-telefono-ui` | [D25](docs/decisions.md), [D26](docs/decisions.md) | review |
| T59 | Un único dueño de las llamadas: `emitir_llamada` pasa por el backend, el plan deja de marcar por su cuenta y el resultado deja de perderse con 404 | Pep | `feat/pep-no-y-telefono-ui` | [D27](docs/decisions.md), [Guía de workflow](agent/happyrobot/CAMBIOS-WORKFLOW.md) | done |
| T60 | Tres fallas vistas en una llamada real: la transcripción se inyectaba en la conversación, cada replan repetía la llamada y un email marcaba un teléfono | Pep | `fix/pep-llamada-que-se-sabotea` | [D28](docs/decisions.md) | review |

**Plan de la demo con dos inputs reales HappyRobot: [`docs/plan-demo-happyrobot.md`](docs/plan-demo-happyrobot.md).**
**Plan de ejecución del sábado, con carriles, dependencias y horas: [`docs/plan-sabado.md`](docs/plan-sabado.md).**
**Plan del mundo dinámico (T29–T32, aditivo, se recorta antes que nada de lo anterior): [`docs/plan-mundo-dinamico.md`](docs/plan-mundo-dinamico.md).**
Prioridad hoy, por riesgo: **T6 → T27 → T16**. Lo demás se recorta antes que esos tres.

T1 sigue en `review`: el escenario y README existen; queda su revisión humana. Los responsables de las demás tareas deben cambiar su propia fila al comenzar.
