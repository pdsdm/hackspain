# Piloto T44: HappyRobot Reasoning Agent como coordinador

Experimento paralelo. El coordinador por defecto (Helmcode + `deepseek-v4-flash`) no cambia. Este camino solo se activa con `COORDINATOR_HARNESS=happyrobot`.

## Arquitectura

```
backend                                HappyRobot (workflow "Orquestador", V3)
POST /workflows/{id}/runs  ───────────▶ Incoming hook (trigger API)
  payload: correlation_id, run_id,       └── Reasoning Agent · gpt-5.6-luna-low
  plan_version, event, system_prompt,        ├── consult_world → Webhook POST {backend}/workflow/coordinator/happyrobot/consult
  system_prompt_version, world_snapshot,     └── submit_plan   → Webhook POST {backend}/workflow/coordinator/happyrobot/submit
  backend_base_url
GET /runs/{run_id}  (sondeo cada 5 s)  ◀── estado del run
```

El backend es la autoridad. Guarda una sesión en memoria por ejecución (`correlation_id`) y solo responde a esa sesión. `submit_plan` pasa por `parseOutput` y el dry-run de `applyOperations`. Un plan se persiste solo con `HAPPYROBOT_COORDINATOR_APPLY=true`.

Archivos: `backend/src/agents/coordinator/happyrobot.ts` (adaptador y sesiones), `llm.ts` (proveedor `happyrobot`), `loop.ts` (harness), `app.ts` (endpoints), `run-happyrobot.ts` (prueba manual).

## Variables

| Variable | Valor |
|---|---|
| `COORDINATOR_HARNESS` | `happyrobot` para usarlo desde el motor. No hace falta para el shadow por endpoint. |
| `COORDINATOR_MODE` | `llm` (se infiere si `COORDINATOR_HARNESS=happyrobot` y hay workflow). |
| `HAPPYROBOT_API_KEY` | La misma clave de las llamadas. |
| `HAPPYROBOT_COORDINATOR_WORKFLOW_ID` | UUID o slug del workflow Orquestador. |
| `HAPPYROBOT_COORDINATOR_HOOK_URL` | Opcional. Hook directo, p. ej. `https://workflows.platform.eu.happyrobot.ai/hooks/development/<slug>`. Si está, el trigger va ahí en vez de `/workflows/{id}/runs`; el hook no devuelve `run_id`, así que no se sondea el estado del run. En EU el endpoint del API devolvía `Workflow not found`. |
| `HAPPYROBOT_COORDINATOR_ENVIRONMENT` | `development`. |
| `HAPPYROBOT_COORDINATOR_APPLY` | Vacío o `false`. `true` solo cuando se decida aplicar planes. |
| `HAPPYROBOT_COORDINATOR_TIMEOUT_MS` | Opcional. Por defecto 180000. |
| `HAPPYROBOT_COORDINATOR_API_BASE` | Opcional. Por defecto `https://platform.eu.happyrobot.ai/api/v2`. |
| `PUBLIC_BASE_URL` | URL pública del backend (túnel). Los webhooks la usan. |
| `HAPPYROBOT_WEBHOOK_TOKEN` | Bearer de los webhooks y del endpoint shadow. |

El modelo se elige dentro del workflow. El informe muestra siempre `gpt-5.6-luna-low`; `COORDINATOR_MODEL` no le afecta.

## Configurar el workflow (manual)

Workflow `Orquestador`, versión V3 no publicada. Pasos que faltan:

1. **Esquema del trigger.** Envía un POST al hook con el slug de la versión: `https://workflows.platform.eu.happyrobot.ai/hooks/<workflow-slug>/<version-slug>`. Registra el payload y genera el esquema sin ejecutar el workflow. Sin cabecera `Authorization`: el registro guarda las cabeceras. JSON mínimo:
   ```json
   { "correlation_id": "x", "run_id": "x", "plan_version": 1, "event": { "source": "chat", "kind": "free_text", "text": "x" }, "system_prompt": "x", "system_prompt_version": "x", "world_snapshot": "x", "backend_base_url": "https://x" }
   ```
2. **Prompt del agente.** Sustituye `<!-- INYECTAR AQUI -->` por las variables `system_prompt` y `world_snapshot` del trigger. Modelo `gpt-5.6-luna-low`.
3. **Webhooks.** URL: `{{backend_base_url}}/workflow/coordinator/happyrobot/consult` y `.../submit`. Método POST, JSON. Auth bearer con la variable `HAPPYROBOT_COORDINATOR_TOKEN` del workflow (Workflow settings → Variables). Su valor en los tres entornos es el de `HAPPYROBOT_WEBHOOK_TOKEN`. En el campo Bearer se selecciona con `@`; si aparece como texto plano, el backend recibe el nombre y responde `Invalid workflow token`.
4. **Body de `consult_world`:** `correlation_id`, `run_id`, `plan_version` desde el trigger (fijos). `query` desde el parámetro de la herramienta: objeto con `type`, `placeId`, `minCapacity`, `vehicleId`, `fromId`, `destinationId`.
5. **Body de `submit_plan`:** los tres fijos más `plan` desde el parámetro de la herramienta (objeto `CoordinatorOutput` completo).
6. **Tool Call Result.** Exponer solo: `consult_world` → `ok`, `stale`, `error`, `answer`. `submit_plan` → `accepted`, `retry`, `stale`, `errors`, `plan_version`. Generar el esquema requiere el backend público en marcha.
7. **Publicar** en `development`. El hook de ejecución solo enruta a versiones publicadas: `hooks/<workflow-slug>` (production) o `hooks/development/<workflow-slug>`.

Estado al 19/09/2026 22:50: fork `mpp8gtbh590v` publicado en `development`. Única ejecución live hecha con `HAPPYROBOT_COORDINATOR_HOOK_URL=https://workflows.platform.eu.happyrobot.ai/hooks/development/1i6zafb6wodb` y fixture `crisis`: run `3caee838-57ab-47ff-9476-d145016824fc`, latencia 7,6 s, 1 `consult_world`, 1 `submit_plan`, plan aceptado a la primera sin errores de validación, `aplicado: no`. El plan cerró `loungeSur` con una acción de espacios y sin reubicaciones. Una sola muestra: no valida el proveedor.

## Prueba manual única (shadow)

Requisitos: backend en marcha con `PUBLIC_BASE_URL` público y `INITIAL_FIXTURE=crisis`, variables de la tabla, workflow publicado en `development`.

```
cd backend
npm run coordinator:happyrobot -- --text="Fuga de agua en el Acceso Sur: el lounge Sur queda inutilizable"
```

Imprime proveedor, modelo, run ID de HappyRobot, latencia, consultas, envíos, errores de validación y el output. No muta el estado, no encola tareas, no dispara llamadas, SMS ni email. No imprime secretos ni thinking.

Equivalente por HTTP: `POST $API_URL/coordinator/happyrobot/shadow` con bearer `HAPPYROBOT_WEBHOOK_TOKEN` y `{ "text": "…" }`.

## Pendiente para el agente pequeño (E2E)

1. Una ejecución shadow con fixture `crisis`. Comprobar `status: accepted`, `happyrobotRunId`, `latencyMs` y `output`.
2. Si `submissions > 1`, revisar `validationErrors` para ajustar el prompt del agente en HappyRobot.
3. Solo después, benchmark repetido y comparación con `npm run coordinator -- --fixture=crisis`.
4. No activar `HAPPYROBOT_COORDINATOR_APPLY=true` sin decisión del equipo.
