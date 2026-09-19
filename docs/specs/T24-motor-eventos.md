# T24: motor de eventos con coordinador inteligente

## Qué y para qué

El backend arranca en un estado usable (por defecto `crisis`; en demo, `calm` a las 12:00) y reacciona a cualquier entrada con un coordinador **en proceso**. El coordinador no usa SDK ni tool calling: pide JSON con operaciones y consultas, el backend las valida contra el mundo y las reglas T7, y HappyRobot solo habla con personas. El panel con `VITE_DATA_SOURCE=api` deja de ser una simulación guionizada detrás de `GET /state`.

## Modelo

- **Actores**: catálogo estático en `backend/fixtures/madring/seed.json`. Su estado vivo es su proyección en `CrisisState`.
- **Mundo** (`backend/fixtures/madring/world.json`): geografía generada desde `frontend/src/domain/initialState.ts` (POS, rutas, polígonos) y `seed.transfers`. Lugares, enlaces y zonas. El frontend sigue dibujando con OSRM (D8); el backend usa polilíneas del mundo.
- **Eventos**: `POST /events` `{ source, kind, text?, payload?, actorId? }`. Fuentes: `happyrobot`, `chat`, `jury`, `human`, `clock`. Tabla `events` y `state.events[]`.
- **Acciones**: `dispatch_tasks` (T7). El ejecutor las lanza con el adaptador `happyrobot` o `sim`. Cambios internos (rutas, aforos, puertas) son operaciones del coordinador, no pasan por la cola.

## Ciclo

`evento → bucle JSON (llm.ts) → operaciones + cola → adaptador → resultado → coordinador …`

Hasta 3 rondas por evento, 60 s de tope. Cada ronda: `complete()` → `parseOutput` → responder `queries` desde `world.ts` → dry-apply `operations` → si `done` y sin errores, persistir una vez. `POST /workflow/coordinator/proposals` sigue abierto para un coordinador externo.

Operaciones: `set_place`, `set_gate`, `reroute_shuttle`, `redirect_delivery`, `set_group`, `cancel_action`, `set_agent`, `log_event`, `add_constraint`. Consultas: `affected_by`, `alternatives_for`, `route`. Cerrar un lugar no mueve a nadie: hay que reencaminar/reasignar a cada afectado. Norte exige traslado exterior. `set_place` no puede poner `confirmado` (solo un resultado de llamada).

Las partes T10 (asignaciones, compromisos, acciones, decisión) se aplican reutilizando `WorkflowService.applyCoordinatorProposal` con un sobre sintético, para un solo camino de aforo, gasto y cola.

## Criterios de aceptación

- [ ] Con `INITIAL_FIXTURE=calm`, `GET /state` arranca a las 12:00, `coordinatorStatus: "estable"`, 600 plazas en Principal, shuttles y entregas en ruta. El reloj avanza.
- [ ] `POST /events` con texto libre produce, en menos de 60 s, cambios de mapa y cola visibles (`GET /actions`).
- [ ] "Se ha llenado el parking Sur" altera una puerta y desvía un shuttle o encola transporte.
- [ ] Un giro posterior incrementa `planVersion`, cancela tareas inválidas y no despacha planes viejos (T7).
- [ ] Shuttle o invitados a Norte sin acceso confirmado: la operación se rechaza y el modelo corrige en la ronda siguiente.
- [ ] Gasto por encima de 1.500 € crea `decision` pendiente (T7).
- [ ] `POST /workflow/results` aplicado dispara un evento `call_result` y cierra `calls[]`.
- [ ] `POST /interventions` y `POST /simulation/twists` cumplen el contrato y se registran como eventos. El giro aplica el efecto T3 al instante; el replan es del coordinador. Con `COORDINATOR_MODE=rules` solo el efecto determinista.
- [ ] Si el LLM falla o supera 60 s, los giros conocidos quedan con el efecto determinista y un evento `fallo` "coordinador no disponible".
- [ ] Sin `HAPPYROBOT_API_KEY` ni hooks, el adaptador `sim` cierra las llamadas en 20–40 s de reloj.
- [ ] El frontend en `api` muestra chat, giros y reset contra el backend.
- [ ] Tests sin red: mundo, operaciones, bucle inyectado, motor, ejecutor, API. `make check` pasa.

## Fuera de alcance

- Prompts de voz T11–T14, números reales T9, aprendizaje T20.
- Editar `seed.json` o `world.json` en caliente.
- OSRM en el backend.

## Notas

- Contrato: `POST /events`, `GET /actions`, `fixture` opcional en reset, payload de salida hacia el hook de HappyRobot. `POST /workflow/results` no cambia. `CrisisState` no cambia.
- Sin dependencias nuevas (D11). Variables: `INITIAL_FIXTURE`, `CLOCK_SPEED`, `COORDINATOR_MODE`, `HAPPYROBOT_HOOK_*`, `PUBLIC_BASE_URL`.
- Archivos: `src/world/world.ts`, `src/domain/{engine,clock,apply-coordinator}.ts`, `src/agents/coordinator/{loop,operations}.ts`, `src/actions/{executor,adapters/*}.ts`, `src/state/event-repository.ts`.
