# Cómo crear «Demo Incident Inputs» a mano en HappyRobot

Guía para quien tenga permisos de owner en la cuenta de HappyRobot. El instalador
(`backend/ → npm run happyrobot:demo-inputs`) hace esto mismo por API, pero con una key sin
permiso de creación devuelve `403 Cannot create use cases`, y entonces toca montarlo en la UI.

El workflow es una **pasarela determinista**: recibe un incidente por API y lo reenvía al
backend. No usa telefonía, ni LLM, ni tools. Dos nodos y nada más.

```
Trigger «Predefined request»  ──▶  Action «Webhook POST»  ──▶  POST /workflow/happyrobot/events
```

## 1. El workflow

| Campo | Valor |
|---|---|
| Nombre | `Demo Incident Inputs` (exacto: el instalador es idempotente por nombre) |
| Icono | `bolt` |
| Entorno a publicar | `development` para pruebas y `production` para la toma final |

## 2. Variable del workflow

Una sola, y **oculta**. Es el bearer con el que el backend autentica la entrada.

| Clave | `HAPPYROBOT_DEMO_WEBHOOK_TOKEN` |
|---|---|
| Valor en `development` | el `HAPPYROBOT_WEBHOOK_TOKEN` del `.env` del equipo |
| Valor en `production` | el mismo token, rotado antes de publicar la toma final |
| Valor en `staging` | **vacío** |
| Visibilidad | oculta en la UI (`is_hidden_in_ui`) |

No escribas el token en el nodo ni en ninguna descripción: el criterio de aceptación de T47
exige que viva solo aquí.

## 3. Nodo 1 — Trigger «Predefined request»

Nombre: `Demo incident request`. Declara **siete** parámetros:

| Parámetro | Ejemplo | Para qué |
|---|---|---|
| `eventId` | `demo-event-1` | Clave de idempotencia. Dos runs con el mismo valor producen una sola línea |
| `channel` | `call` | Solo `call` o `sms` |
| `actor` | `SIMULACIÓN · Centralita MADRING` | Quién informa. **Tiene que empezar por `SIMULACIÓN ·`** |
| `incidentId` | `inbox_batch` | `inbox_batch`, respaldo `principal_pipe_burst` o `dock_blocked` |
| `summary` | `Lote de 10 mensajes...` | El lote con marcas `+0 ms`…`+3600 ms` que recibe el coordinador |
| `sessionId` | `demo-session-1` | Va dentro de `evidence` |
| `backend_base_url` | `https://<túnel>.lhr.life` | Base del backend, **sin barra final** |

`backend_base_url` es un parámetro y no una URL fija a propósito: los túneles caducan y
cambian de dirección en cada arranque, así que quien dispara el run decide el destino.

## 4. Nodo 2 — Action «Webhook POST»

Nombre: `POST incidente al centro de operaciones`. Hijo del trigger.

- **URL**: la variable `backend_base_url` del trigger, concatenada con `/workflow/happyrobot/events`
- **Método**: `POST` · **Content-Type**: `application/json`
- **Auth**: `bearer`, con la variable `HAPPYROBOT_DEMO_WEBHOOK_TOKEN`
- **Sin headers ni params extra**

Cuerpo, tomando cada valor del trigger:

```json
{
  "eventId":    "{{eventId}}",
  "channel":    "{{channel}}",
  "actor":      "{{actor}}",
  "incidentId": "{{incidentId}}",
  "summary":    "{{summary}}",
  "evidence": { "sessionId": "{{sessionId}}" }
}
```

**Estos seis campos, ni uno más.** El backend valida con `exactFields`: un campo extra
—o un `evidence` con algo que no sea `sessionId`— devuelve `400` y el run se pierde.

## 5. Los dos mensajes de la demo

| | Incidente 1 | Incidente 2 |
|---|---|---|
| `incidentId` | `inbox_batch` | `dock_blocked` |
| `channel` | `call` | `sms` |
| `actor` | `SIMULACIÓN · Centralita MADRING` | `SIMULACIÓN · Jefe de muelle` |
| `summary` | Diez mensajes en 3,6 s; nueve ruido y una rotura del Principal | Un camión de TV bloquea el Muelle Este |
| Efecto | El agente selecciona la rotura, consulta el mundo y aplica el primer plan | Bloquea el Muelle Este Sur |

## 6. Comprobar que funciona

Con el backend accesible por el túnel, lanza el workflow dos veces, una por incidente. El
nodo de salida debe recibir:

```json
{ "ok": true, "duplicate": false, "eventId": "...", "incidentId": "...", "planVersion": 2 }
```

Y en el panel: dos líneas de incidencia, cada una con su canal y su actor. Repetir un run con
el mismo `eventId` responde `duplicate: true` y **no** añade una segunda línea — ese es el
criterio de aceptación de T47.

Respuestas de error del backend: `401` token incorrecto · `503` backend sin
`HAPPYROBOT_WEBHOOK_TOKEN` · `400` cuerpo con campos de más, `incidentId` fuera de los dos
permitidos, o `channel` que no sea `call`/`sms`.

## 7. Trampas conocidas

**El host del hook no es el del navegador.** `platform.happyrobot.ai/hooks/<id>` es el panel:
responde `307` hacia `/auth/login` y el `fetch` de Node se cae con `fetch failed` sin explicar
nada. El que acepta el POST es `https://workflows.platform.eu.happyrobot.ai/hooks/<id>`.

**Sin versión publicada en `development`, el endpoint de ese entorno no ejecuta nada.**

**El túnel caduca.** Si `backend_base_url` apunta a un túnel muerto, el run sale verde por el
lado de HappyRobot y el backend nunca se entera. Verifica `GET <base>/health` antes de grabar.

## 8. Cuando exista

Apunta el id en el `.env` del equipo y avísalo:

```
HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID=<id del workflow>
```

Con una key de owner, el instalador lo hace todo solo y ahorra este documento:

```bash
cd backend
npm run happyrobot:demo-inputs             # crea
npm run happyrobot:demo-inputs -- --publish  # crea y publica en development (exige PUBLIC_BASE_URL real)
```
