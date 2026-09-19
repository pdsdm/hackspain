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
| T6 | Validar cuenta HappyRobot y primera llamada real | Álvaro | `Prueba-de-plataforma-y-llamada-real` (sin mergear) | [T6](docs/specs/T6-prueba-voz.md) | doing |
| T7 | Estado persistente, reglas y despacho de tareas | Zhi | `feat/t7-estado` (PR #8, mergeada) | [T7](docs/specs/T7-estado.md) | done |
| T8 | Dashboard y plano Norte/Sur | Carlos | `feat/carlos-dashboard` (PR #9, mergeada) | [T8](docs/specs/T8-dashboard.md) | done |
| T9 | Adaptador HappyRobot y callbacks | Álvaro | `feat/alvaro-integracion` | [T9](docs/specs/T9-integracion.md) | doing |
| T10 | Workflow coordinador | Ventura | `feat/ventura-coordinador` (PR #14, mergeada) | [T10](docs/specs/T10-coordinador.md) | done |
| T11 | Agente de Espacios | Ventura | `feat/ventura-espacios` (PR #10, mergeada) | [T11](docs/specs/T11-espacios.md) | done |
| T12 | Agente de Catering | Pep | `feat/pep-catering` | [T12](docs/specs/T12-catering.md) | todo |
| T13 | Agente de Transporte | Álvaro | `feat/alvaro-transporte` | [T13](docs/specs/T13-transporte.md) | todo |
| T14 | Agente de Asistentes y avisos segmentados | Pep | `feat/pep-asistentes` | [T14](docs/specs/T14-asistentes.md) | todo |
| T15 | Aprobaciones, pausa y control de incidentes | Pep | `feat/pep-control` | [T15](docs/specs/T15-control.md) | todo |
| T16 | Replanificación e invalidación de acuerdos | Ventura | `feat/ventura-adaptacion` | [T16](docs/specs/T16-adaptacion.md) | review |
| T17 | Integración y pruebas críticas | Zhi | `feat/zhi-integracion-final` | [T17](docs/specs/T17-integracion-final.md) | doing |
| T18 | Entorno de demo y recuperación | Zhi | `feat/zhi-entorno-demo` | [T18](docs/specs/T18-entorno-demo.md) | todo |
| T19 | Pitch, ensayo y vídeo de respaldo | Carlos | `feat/carlos-demo` | [T19](docs/specs/T19-demo.md) | todo |
| T20 | P2: aprendizaje entre ejecuciones | Ventura | `feat/ventura-aprendizaje` | [T20](docs/specs/T20-aprendizaje.md) | todo |
| T21 | Revisión y entrega final | Pep | `feat/pep-entrega` | [T21](docs/specs/T21-entrega.md) | todo |
| T22 | P2: transcripción en directo | Álvaro | `feat/alvaro-transcripcion` | [T22](docs/specs/T22-transcripcion.md) | todo |
| T23 | Rediseño UI del panel: tema claro con estética Zhivel | Pep | `feat/pepe-ui-zhivel`, `fix/pepe-dashboard-layout` (mergeadas) | - | done |
| T24 | Motor de eventos, mundo y coordinador en proceso | Pep | `feat/pep-motor-eventos` (PR #15, mergeada) | [T24](docs/specs/T24-motor-eventos.md) | done |
| T25 | Robustez del motor: cola que no se envenena, reloj vivo tras reset, timeout de callbacks | Zhi | `fix/zhi-engine-robustez` (PR #16, mergeada) | - | done |
| T26 | Cognition/Devin como inferencia y harness del coordinador | Pep | `feat/pep-cognition-devin` (PR #17, mergeada) | - | done |
| T27 | Panel contra el backend real de punta a punta (`VITE_DATA_SOURCE=api`) | Pep (apoyo: Zhi) | `feat/pep-panel-api` | - | todo |
| T28 | Unificar por dónde se lanza la llamada: backend vs servidor de Vite | Álvaro (con Zhi y Pep) | - | - | todo |

**Plan de ejecución del sábado, con carriles, dependencias y horas: [`docs/plan-sabado.md`](docs/plan-sabado.md).**
Prioridad hoy, por riesgo: **T6 → T27 → T16**. Lo demás se recorta antes que esos tres.

T1 sigue en `review`: el escenario y README existen; queda su revisión humana. Los responsables de las demás tareas deben cambiar su propia fila al comenzar.
