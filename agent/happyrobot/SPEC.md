# HappyRobot: cómo lanzar una llamada

## Qué

El workflow se dispara con un trigger **Web call**: la llamada entra por el navegador, no por
teléfono. Evento del workflow: `Start processing inbound call`.
Variables de ejemplo en `ejemplo-llamada.json`.

## URL de producción

```
https://platform.eu.happyrobot.ai/deployments/my5asz8ibzd3
```

Abrirla ya arranca la llamada con el agente. En `.env` como `HAPPYROBOT_WEBCALL_URL`.

## Pasar variables

El schema del trigger está en **Flat Params**: pares clave-valor planos, sin objetos anidados.

Desde el frontend o el backend, se abre la URL con las variables como query string:

```bash
"$HAPPYROBOT_WEBCALL_URL?area=espacios&task_id=t-espacios-0001&hora_apertura=13:00"
```

Los mismos pares son los del `ejemplo-llamada.json` si el workflow se dispara por webhook
(`POST` con el JSON plano, `x-api-key: $HAPPYROBOT_API_KEY`).

## Desde el panel

Botón **Avisar a…** en la columna de comunicaciones: lista las entidades (recinto, catering,
transporte, recepción, organizador) y al pulsar Llamar abre el webcall en una pestaña con los
flat params en la query. La conversación va por el micro del navegador.

POSTear a la URL del deployment no sirve: devuelve HTML. Para lanzar la llamada por API hace
falta la URL de un trigger **Webhook** del workflow; cuando exista, va en `HAPPYROBOT_ENDPOINT`
y la usa `/api/happyrobot/call` (endpoint del servidor de Vite, que añade la API key del `.env`).

## Criterios de aceptación

- [ ] Se abre la URL, suena el agente y habla en español.
- [ ] Las variables enviadas aparecen en el guion de la llamada.
- [ ] La llamada lleva `task_id` y se puede correlacionar con la tarea que la lanzó.

## Pendiente de confirmar

- Que el webcall acepte los flat params por query string (si no, se pasan al publicar el deployment).
- Si más adelante se llama por teléfono: el número va en E.164 (`+34600000000`, sin espacios ni guiones).
