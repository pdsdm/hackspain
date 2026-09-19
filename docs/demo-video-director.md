# Director reproducible de la demo

El director lanza los dos inputs simulados con el contrato real T46 y espera cambios observables en `/state`. No escribe SQLite ni carga snapshots intermedios.

## Preparación

Arrancar la demo en modo API y, para HappyRobot, con backend público:

```bash
DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=sim ./scripts/demo.sh up
```

Variables:

```dotenv
HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID=
HAPPYROBOT_DEMO_INPUT_ENVIRONMENT=development
HAPPYROBOT_DEMO_INPUT_API_BASE=https://platform.eu.happyrobot.ai/api/v2
DEMO_API_URL=http://127.0.0.1:8000
DEMO_VIDEO_TIMEOUT_MS=360000
```

El workflow recibe `eventId`, `channel`, `actor`, `incidentId`, `summary`, `sessionId` y `backend_base_url`; reenvía los seis campos admitidos por T46 a `POST /workflow/happyrobot/events` con bearer `HAPPYROBOT_WEBHOOK_TOKEN` guardado como variable oculta. No usa telefonía ni LLM.

## Ejecución

```bash
cd backend
npm run demo:video -- --inputs=happyrobot
```

El alias `external` equivale a `happyrobot`. Respaldo sin HappyRobot, con el mismo contrato:

```bash
npm run demo:video -- --inputs=api
```

Los actores llevan el prefijo `SIMULACIÓN ·` para no presentar los inputs como llamadas o SMS reales. El script resetea a `calm`, lanza primero `principal_pipe_burst`, espera a que Principal cierre, lanza `dock_blocked` y espera el segundo efecto y el final del coordinador.

## Bloqueo de plataforma

La API key actual puede leer y ejecutar workflows, pero `POST /workflows/` devuelve `403 Cannot create use cases`. Un owner debe crear `Demo Incident Inputs` en la interfaz y publicar la versión en `development`; después se copia su UUID o slug a `HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID`.
