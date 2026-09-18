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
| T1 | Volcar el doc de contexto de la idea en `docs/` y rellenar la sección "Escenario" del README | equipo | - | [`escenario/escenario.md`](escenario/escenario.md) | doing |
| T2 | Decidir stack y rellenar `backend/AGENTS.md`, `frontend/AGENTS.md` y el Makefile | | | - | todo |
| T3 | Primera versión de `docs/api-contract.md` | | | - | todo |
| T4 | Panel de supervisión (frontend) con simulación en el navegador | Pepe | `feat/pepe-frontend-panel` | [`docs/specs/T4-frontend-panel.md`](docs/specs/T4-frontend-panel.md) | review |
