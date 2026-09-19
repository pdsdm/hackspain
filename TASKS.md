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
| T3 | Cerrar contrato backend, frontend y workflows | Zhi | `zhi-t3-contrato` | [T3](docs/specs/T3-contrato.md) | review |
| T4 | Planificar responsabilidades, hitos y exclusión local del manual | Carlos / Codex | `feat/carlos-planificacion` | [T4](docs/specs/T4-planificacion.md) | done |
| T5 | Seed MADRING y fixtures de demo | Carlos | `feat/carlos-seed` | [T5](docs/specs/T5-seed.md) | review |
| T6 | Validar cuenta HappyRobot y primera llamada real | Álvaro | `feat/alvaro-prueba-voz` | [T6](docs/specs/T6-prueba-voz.md) | todo |
| T7 | Estado persistente, reglas y despacho de tareas | Zhi | `feat/t7-estado` | [T7](docs/specs/T7-estado.md) | review |
| T8 | Dashboard y plano Norte/Sur | Carlos | `feat/carlos-dashboard` | [T8](docs/specs/T8-dashboard.md) | review |
| T9 | Adaptador HappyRobot y callbacks | Álvaro | `feat/alvaro-integracion` | [T9](docs/specs/T9-integracion.md) | todo |
| T10 | Workflow coordinador | Ventura | `feat/ventura-coordinador` | [T10](docs/specs/T10-coordinador.md) | review |
| T11 | Agente de Espacios | Ventura | `feat/ventura-espacios` | [T11](docs/specs/T11-espacios.md) | review |
| T12 | Agente de Catering | Pep | `feat/pep-catering` | [T12](docs/specs/T12-catering.md) | todo |
| T13 | Agente de Transporte | Álvaro | `feat/alvaro-transporte` | [T13](docs/specs/T13-transporte.md) | todo |
| T14 | Agente de Asistentes y avisos segmentados | Pep | `feat/pep-asistentes` | [T14](docs/specs/T14-asistentes.md) | todo |
| T15 | Aprobaciones, pausa y control de incidentes | Pep | `feat/pep-control` | [T15](docs/specs/T15-control.md) | todo |
| T16 | Replanificación e invalidación de acuerdos | Ventura | `feat/ventura-adaptacion` | [T16](docs/specs/T16-adaptacion.md) | todo |
| T17 | Integración y pruebas críticas | Zhi | `feat/zhi-integracion-final` | [T17](docs/specs/T17-integracion-final.md) | todo |
| T18 | Entorno de demo y recuperación | Zhi | `feat/zhi-entorno-demo` | [T18](docs/specs/T18-entorno-demo.md) | todo |
| T19 | Pitch, ensayo y vídeo de respaldo | Carlos | `feat/carlos-demo` | [T19](docs/specs/T19-demo.md) | todo |
| T20 | P2: aprendizaje entre ejecuciones | Ventura | `feat/ventura-aprendizaje` | [T20](docs/specs/T20-aprendizaje.md) | todo |
| T21 | Revisión y entrega final | Pep | `feat/pep-entrega` | [T21](docs/specs/T21-entrega.md) | todo |
| T22 | P2: transcripción en directo | Álvaro | `feat/alvaro-transcripcion` | [T22](docs/specs/T22-transcripcion.md) | todo |
| T23 | Rediseño UI del panel: tema claro con estética Zhivel | Pep | `feat/pepe-ui-zhivel` | - | doing |
| T24 | Motor de eventos, mundo y coordinador en proceso | Pep | `feat/pep-motor-eventos` | [T24](docs/specs/T24-motor-eventos.md) | review |
| T25 | Cognition/Devin como inferencia y harness del coordinador | Pep | `feat/pep-cognition-devin` | - | doing |

Plan, prioridades, estimaciones y dependencias: [`docs/plan-ejecucion.md`](docs/plan-ejecucion.md). T4 `done` significa documentación preparada y comprobada localmente, no mergeada ni implementada. T1 pasa a `review` porque el escenario y README existen; queda su revisión humana. Los responsables de las demás tareas deben cambiar su propia fila al comenzar.
