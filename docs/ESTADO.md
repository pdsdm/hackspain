# Estado del proyecto

> Foto de `origin/main` (`3223b2d`) más el trabajo sin mergear de `feat/pep-sin-simulacion` (T57). Actualizar esta página después de cada merge relevante.

| | |
|---|---|
| **Foto tomada** | 20 de septiembre de 2026, ~05:30 CEST |
| **Base** | `3223b2d` (`origin/main`, PR #108 mergeada) + `feat/pep-sin-simulacion` sin mergear |
| **Trabajo en curso** | T57: elimina todo el comportamiento simulado (adaptador `sim`, Modo vivo, giros automáticos, `inbox_batch`, reset E2E, motor de simulación local del frontend). Decisión D24 |
| **Entrega** | domingo 20 a las 11:00, hora de Madrid |
| **Generado por** | Devin, sesión de implementación de T57 |

## Salud

| Comprobación | Resultado |
|---|---|
| `make check` en `feat/pep-sin-simulacion` | **OK** (lint + test + build backend, lint + build frontend, fixtures:check) |
| Tests backend | **346 pass, 0 fail, 7 skipped** (los 7 skipped son evidencia JEV en vivo, gateada por red) |
| Lint backend | 0 errores, 2 avisos preexistentes (`openaiUsable` sin usar, optional chaining en `closure.test.ts`) |
| Lint frontend | 0 avisos, 0 errores |
| Build frontend | OK; el chunk único sigue por encima de 500 kB (aviso, no error) |
| Fixtures | `npm run fixtures:generate` y `fixtures:check` OK; los 10 JSON ya no llevan `simulated`/`scriptId`/`scriptCursor`/`nextScriptAt` |
| Node usado en esta sesión | según `node --version` del entorno; el repo exige ≥22.13 |
| Producción / Railway | no verificado en esta sesión |

## Qué cambió: T57, sin comportamiento simulado (D24)

Decisión humana del 20/09 04:20: eliminar todo lo que fingía una llamada, una incidencia o
un giro. A partir de esta rama, **todo es real**: solo existen las llamadas reales de
HappyRobot y las entradas reales (`principal_pipe_burst`, `dock_blocked`, texto libre).

Eliminado:

- Backend: `src/actions/adapters/sim.ts`, `sim-world.ts`, `src/domain/incidents.ts`,
  `auto-twists.ts`, `incident-generator.ts`. `ActionExecutor` ya no tiene adaptador `sim`;
  sin hook de HappyRobot configurado para un área (o sin `HAPPYROBOT_API_KEY`), la tarea
  termina `failed` con `"Sin canal real configurado para <área>"`, sin entrada en `calls[]`
  y con el agente en `incidencia`. Ese fallo nunca dispara un replan (guarda `no-channel-`
  en `engine.ts`).
- Backend: `/simulation/twists`, `/simulation/live`, `/simulation/e2e/reset` (y sus
  variables de estado `forceSimActions`, `e2eMode`, `e2eCoordinatorApply`,
  `e2eSuppressResultReplan`, `e2eRealTransportCall`, `e2eInputTokenHash`). `Modo vivo`,
  `SIM_INCIDENTS`, `SIM_SEED` y `SIM_INCIDENTS_MODE` desaparecen de `config.ts`.
  `SimulationClock` ya no genera incidencias ni giros automáticos, solo avanza vehículos,
  entregas y afluencia.
- `inbox_batch`: fuera de `HAPPYROBOT_INCIDENT_IDS`, del prompt del coordinador y de
  `apply-coordinator.ts`. Los únicos `incidentId` de HappyRobot son `principal_pipe_burst`
  y `dock_blocked`.
- `scripts/e2e-demo-real.mts` y `backend/test/demo-e2e-real.test.ts` borrados; `npm run
  demo:e2e-real` ya no existe. `scripts/demo-video.mts` usa siempre `principal_pipe_burst`
  como input 1 y `POST /simulation/reset {"fixture":"calm"}` (sin `realTransportCall`).
- Frontend: `src/domain/reducer.ts`, `script.ts`, `twists.ts` borrados. `useCrisisState.ts`
  ya no tiene `DataSource`/`VITE_DATA_SOURCE`: siempre hace polling a `/state`. Sin
  `ctl.twist`, `ctl.setLive`, `ctl.loadFixture`, `ctl.reference`, `ctl.source`. `TopBar`,
  `App.tsx`, `LlamadaCard`, `CronologiaChat`, `ActiveIncidents` sin chips ni ramas de
  `SIMULACIÓN`/`sim`. `VITE_DATA_SOURCE` fuera de `.env`/`.env.example` (raíz y frontend).

Conservado a propósito (no es simulación, lo usan flujos reales):

- `applyTwistEffect`/`twistsApplied`/`parseTwist`/`TWIST_IDS`: los usa `dock_blocked`
  (entrada real de HappyRobot) y `reject_split` (intervención humana). Solo se retiraron
  el endpoint `/simulation/twists` y el cliente del frontend; el camino interno
  `POST /events {"source":"jury","kind":"<twist>","payload":{"twist":"<twist>"}}` sigue
  vivo y tiene ~12 tests.
- `frontend/src/domain/initialState.ts` (`createInitialState()`): es la fuente de los
  fixtures del backend (`backend/fixtures/madring.ts` la importa en build-time). Solo se le
  quitaron `simulated`, `scriptId`, `scriptCursor`, `nextScriptAt`.
- `frontend/src/domain/fixtures.ts`: loader estático usado como placeholder antes del
  primer `/state` y por 3 tests del backend.
- `random.ts`/`createSimulationSeed`: las ráfagas de afluencia siguen usando `clock.seed`
  (nombre interno; no tiene relación con `VITE_DATA_SOURCE=sim`).

Consecuencia aceptada: sin hooks de HappyRobot configurados, el panel no mostrará ninguna
llamada — cada tarea despachada termina `failed` de inmediato y el plan puede acabar
`atascado`. Es el comportamiento esperado, documentado en D24 y en `docs/api-contract.md`.

## Qué funciona (verificado en esta sesión)

- `make check` completo en verde sobre `feat/pep-sin-simulacion`.
- Backend compila (`tsc`) y sus 353 tests corren (346 pass, 7 skip por red).
- Frontend compila (`tsc -b && vite build`) y pasa lint sin avisos.
- `npm run fixtures:generate` y `fixtures:check` regeneran y validan los 10 JSON sin los
  campos retirados.
- Base operativa previa (no tocada por T57): estado SQLite, cola serial por `planVersion`,
  callbacks idempotentes, cuatro especialistas, cierre honesto por `resolved`/
  `closureSummary`/`atascado`, costes informativos sin aprobación económica, D20 (HappyRobot
  Reasoning Agent como coordinador principal), D21/D23 (sin bucle de replan).

## Qué falta

1. **Verificación manual de extremo a extremo** (pasos 3-5 del plan de T57, no ejecutados
   en esta sesión por requerir un backend en marcha y/o hooks reales de HappyRobot):
   - Backend sin hooks: `POST /events` con texto libre debe terminar en `failed`/`incidencia`
     con `"Sin canal real configurado…"` y sin más de un replan.
   - Backend con los hooks reales del `.env`: una llamada real debe aparecer en
     `LlamadaCard` como «vía HappyRobot», sin ninguna etiqueta `sim`/`SIMULACIÓN`.
   - `npm --prefix backend run demo:video -- --inputs=api --rehearsals=1` contra un backend
     con hooks reales, para confirmar que llega a M0/M2/M3 con `principal_pipe_burst`.
2. **Revisión y merge de `feat/pep-sin-simulacion`** a `main`. Sin esto, `main` sigue
   ofreciendo el camino `sim` a quien lo despliegue.
3. **Actualizar `TASKS.md`** cuando T57 pase de `review` a `done` tras el merge.
4. Todo lo que ya estaba pendiente antes de T57 (rotar el bearer de HappyRobot, verificar
   Railway, aprobar textos y grabar la toma) sigue pendiente y no se ha vuelto a comprobar
   en esta sesión: ver el histórico de este documento en `git log -p docs/ESTADO.md` para
   el detalle previo a T57.

## Bloqueos

| Qué | Depende de | Externo |
|---|---|---|
| Verificación manual con hooks reales de HappyRobot | acceso a `HAPPYROBOT_API_KEY`, `HAPPYROBOT_HOOK_*` y un teléfono de pruebas | Sí |
| Merge de T57 a `main` | revisión humana de la rama `feat/pep-sin-simulacion` | No |
| Estado de Railway/crédito, rotación de bearer, grabación | sin comprobar en esta sesión; ver decisiones D20-D23 y el histórico de este archivo | Parcial |

## Ramas vivas sin mergear

- `feat/pep-sin-simulacion`: T57 completa (backend, frontend, scripts, tests, docs);
  `make check` en verde; pendiente de PR y revisión humana.

No se ha vuelto a auditar el resto de ramas remotas en esta sesión (ver `git branch -r`).

## Decisiones pendientes

1. Aprobar y mergear T57 (D24) a `main`.
2. Todo lo que ya figuraba pendiente antes de T57 (rotación de bearer, aprobación de
   textos T45, quién graba la toma) sigue abierto; no se ha vuelto a preguntar en esta
   sesión.

## Avisos para el siguiente agente

- `main` no tiene todavía T57: si trabajas desde `origin/main` sin traer esta rama, verás
  otra vez el adaptador `sim`, `inbox_batch` y `VITE_DATA_SOURCE`.
- Después de mergear T57: sin hooks de HappyRobot configurados el panel no mostrará
  ninguna llamada. No es un bug — es D24. Configura `HAPPYROBOT_HOOK_<ÁREA>` y
  `HAPPYROBOT_API_KEY` para ver llamadas reales.
- `docs/api-contract.md` documenta el fallo `"Sin canal real configurado para <área>"`.
- Los tests de `applyTwistEffect`/`twistsApplied` siguen vivos: no los borres pensando que
  son simulación; los usa `dock_blocked` (entrada real) y `reject_split` (intervención
  humana).
- `frontend/AGENTS.md` ya no menciona `script.ts`/`twists.ts`/`VITE_DATA_SOURCE` (se
  actualizó como parte de T57, con permiso explícito del humano).
- Antes de este documento, la foto anterior (04:06 CEST) documentaba el estado de
  producción, Railway y el camino de vídeo T45–T52 con mucho más detalle. Ese contenido
  no se ha vuelto a verificar en esta sesión: consúltalo en el historial de git si lo
  necesitas, pero no lo des por vigente sin comprobarlo de nuevo.
