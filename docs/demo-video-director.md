# Director reproducible de la demo

El director lanza los dos inputs de la demo con el contrato real T46 y espera cambios observables en `/state`. No escribe SQLite ni carga snapshots intermedios.

## Preparación

Arrancar la demo en modo API y, para HappyRobot, con backend público:

```bash
DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up
```

Variables:

```dotenv
HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID=
HAPPYROBOT_DEMO_INPUT_ENVIRONMENT=development
HAPPYROBOT_DEMO_INPUT_HOOK_URL=https://workflows.platform.eu.happyrobot.ai/hooks/development/<slug>
DEMO_API_URL=http://127.0.0.1:8000
DEMO_VIDEO_TIMEOUT_MS=360000
```

El workflow recibe `eventId`, `channel`, `actor`, `incidentId`, `summary`, `sessionId` y `backend_base_url`; reenvía los seis campos admitidos por T46 a `POST /workflow/happyrobot/events` con bearer `HAPPYROBOT_WEBHOOK_TOKEN` guardado como variable oculta. No usa telefonía ni LLM.

## Ensayo API local

Sin credenciales externas, dos terminales desde la raíz del repo:

```bash
cd backend
HAPPYROBOT_WEBHOOK_TOKEN=local-t52-only COORDINATOR_MODE=rules DATABASE_URL=:memory: PORT=8000 node --import tsx src/server.ts
```

```bash
cd backend
HAPPYROBOT_WEBHOOK_TOKEN=local-t52-only DEMO_API_URL=http://127.0.0.1:8000 node --import tsx ../scripts/demo-video.mts --inputs=api --rehearsals=3
```

Cada ensayo crea un run backend nuevo desde `calm`; no reutiliza el estado anterior. El modo `api` inyecta directamente los dos inputs **SIMULADOS** por el contrato T46 y no afirma que haya runs HappyRobot.

## Ensayo HappyRobot

Primero, un owner publica el workflow y configura `HAPPYROBOT_DEMO_INPUT_HOOK_URL` con el hook del entorno: `/hooks/development/<slug>` para desarrollo o `/hooks/<slug>` para producción. Con el backend público levantado por `./scripts/demo.sh up`, ejecutar:

```bash
npm --prefix backend run demo:video -- --inputs=happyrobot --rehearsals=3
```

El alias `external` equivale a `happyrobot`. Este modo exige `HAPPYROBOT_DEMO_INPUT_HOOK_URL` y `PUBLIC_BASE_URL` o `.demo/public-url`; no imprime sus valores. El hook directo es obligatorio en la cuenta EU porque `/api/v2/workflows/{id}/runs` devuelve `Workflow not found` para estos workflows v3.

## Evidencia y criterio de salida

Por defecto se actualiza tras cada checkpoint un informe privado en `.demo/video-rehearsal-<fecha>.json`. Se puede elegir ruta con `--report=ruta.json` u omitir el fichero con `--report=-`.

El director valida M0, el primer ciclo, el bloqueo del muelle y el final usando `/state` y `/actions`: 600/600 al arrancar, versión de plan, procedencia de llamada/SMS y sus actores, Principal y Muelle, CAT-01/CAT-02, cuatro especialistas con `objective`, `reason` y `lastResult`, compromisos condicionados, tareas/llamadas abiertas y `closureSummary`. Un timeout incluye el último resumen observable; una incoherencia termina con código distinto de cero y queda en el informe. Superar el comando prueba los checkpoints API, no prueba una grabación.

## Bloqueo de plataforma

La API key actual puede leer y ejecutar workflows, pero `POST /workflows/` devuelve `403 Cannot create use cases`. Un owner debe ejecutar:

```bash
node --env-file-if-exists=.env --import tsx scripts/setup-happyrobot-demo-inputs.mts --publish
```

Después debe copiar el UUID o slug publicado en `development` a `HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID`. Hasta entonces no se puede ejecutar ni afirmar un ensayo HappyRobot.
