# T44: HappyRobot Reasoning Agent como coordinador principal

Para levantarlo paso a paso: [`runbook-happyrobot-coordinator.md`](runbook-happyrobot-coordinator.md).

Por D20, este es el coordinador principal de la toma. Se activa con `COORDINATOR_HARNESS=happyrobot`; HappyRobot propone mediante herramientas y el backend valida y aplica.

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

El backend es la autoridad. Guarda una sesión en memoria por ejecución (`correlation_id`) y solo responde a esa sesión. `submit_plan` pasa por `parseOutput` y el dry-run de `applyOperations`. Un plan HappyRobot se persiste solo con `HAPPYROBOT_COORDINATOR_APPLY=true`; con `false`, el piloto queda en shadow y el proveedor textual configurado continúa el ciclo y aplica el plan principal.

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
| `HAPPYROBOT_COORDINATOR_APPLY` | `true` en la toma para aplicar el plan HappyRobot. Vacío o `false` queda reservado al endpoint de diagnóstico shadow y no lanza otra inferencia. |
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

## Gate E2E antes de grabar

1. Dos ciclos aplicados por HappyRobot sobre el mismo run: planVersion 2 y 3 de entrada, 3 y 4 tras persistir.
2. Un único `submit_plan` por ciclo, sin `validationErrors`, con las cuatro áreas visibles.
3. Especialistas `sim` deterministas, cero comunicaciones reales, cero tareas o llamadas abiertas.
4. Final `resolved` o `atascado` con `closureSummary` e idempotencia demostrada por un tercer run duplicado.
5. Tres ensayos completos sin resets ni deployments concurrentes.
