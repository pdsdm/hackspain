# T44: Piloto HappyRobot Reasoning Agent como coordinador

## Qué y para qué

Ejecuta el coordinador con la arquitectura nativa de HappyRobot (workflow V3, Reasoning Agent con `gpt-5.6-luna-low` y dos herramientas `consult_world` / `submit_plan` que llaman al backend por webhook). Convive con el coordinador actual (Helmcode + `deepseek-v4-flash`) y permite comparar salidas sin tocar la demo.

## Criterios de aceptación

- [ ] El proveedor por defecto no cambia. `HAPPYROBOT_API_KEY` sola no activa el piloto.
- [ ] `COORDINATOR_HARNESS=happyrobot` activa el camino nuevo. `HAPPYROBOT_COORDINATOR_APPLY=true` es obligatorio para persistir un plan; por defecto es shadow.
- [ ] `POST /workflow/coordinator/happyrobot/consult` y `.../submit` usan `parseConsultArgs`, `answerQuery`, `parseOutput` y el dry-run de `applyOperations`. Rechazan `runId`/`planVersion` obsoletos y sesiones no activas.
- [ ] `submit_plan` devuelve errores estructurados (`accepted`, `retry`, `errors[]`) para que el agente corrija.
- [ ] Modo shadow: el plan HappyRobot se registra sin mutar `CrisisState`, encolar tareas ni disparar comunicaciones; si el harness opera el motor, el proveedor textual continúa como coordinador principal.
- [ ] `POST /coordinator/happyrobot/shadow` devuelve proveedor, modelo, run ID de HappyRobot, latencia, output y errores de validación. No imprime secretos ni thinking.
- [ ] Tests unitarios con `fetch` mockeado: trigger aceptado, run completado, run fallido, timeout, output mal formado, `runId`/`planVersion` obsoletos, feedback de `submit_plan`.
- [ ] `make check` pasa sin llamar a proveedores externos.

## Fuera de alcance

- Declarar HappyRobot mejor que Helmcode o activarlo en la demo.
- E2E repetido o benchmark: lo hará otro agente con `npm run coordinator:happyrobot`.
- Crear el workflow por API: se configura a mano según `docs/happyrobot-coordinator.md`.

## Notas

- Archivos: `backend/src/agents/coordinator/happyrobot.ts`, `llm.ts`, `loop.ts`, `app.ts`, `docs/api-contract.md`.
- El trigger recibe `correlation_id`, `run_id`, `plan_version`, `event`, `system_prompt`, `system_prompt_version`, `world_snapshot` y `backend_base_url`. El modelo no genera ninguno de esos valores.
