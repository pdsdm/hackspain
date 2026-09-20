# Workflow HappyRobot — inputs de demo

`Demo Incident Inputs` es una pasarela determinista: un trigger API recibe el mensaje ya escrito y un Webhook POST lo reenvía al endpoint autenticado T46. No usa telefonía ni LLM; cada ejecución queda registrada como run real de HappyRobot.

## Instalación por un owner

La API key del portátil puede leer y ejecutar workflows, pero devuelve `403 Cannot create use cases`. Un owner debe ejecutar:

```bash
node --env-file-if-exists=.env --import tsx scripts/setup-happyrobot-demo-inputs.mts
```

Con el backend público y listo para recibir una prueba:

```bash
node --env-file-if-exists=.env --import tsx scripts/setup-happyrobot-demo-inputs.mts --publish
```

El instalador es idempotente: si encuentra un workflow con ese nombre, informa de su ID y no lo modifica. Crea una variable oculta `HAPPYROBOT_DEMO_WEBHOOK_TOKEN`, un trigger `Predefined Request` y un POST bearer a `{{backend_base_url}}/workflow/happyrobot/events`.

Después se copia el valor impreso a:

```dotenv
HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID=
```

## Payload del director

Campos del trigger: `eventId`, `channel`, `actor`, `incidentId`, `summary`, `sessionId`, `backend_base_url`.

El primer run usa `channel=call` e `incidentId=principal_pipe_burst`; el segundo usa `channel=sms` e `incidentId=dock_blocked`. `actor` lleva el nombre de quien informa (por ejemplo «Responsable de recinto»), sin prefijos.
