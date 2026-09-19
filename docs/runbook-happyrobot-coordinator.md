# Runbook: levantar el coordinador HappyRobot en local

Pasos exactos para ver el Reasoning Agent de HappyRobot (`gpt-5.6-luna-low`) decidiendo los planes en el panel. Es distinto al arranque normal porque HappyRobot tiene que **llamar de vuelta** al backend, y para eso el backend necesita una URL pública.

Cómo funciona en una frase: el backend dispara el workflow `Orquestador` en HappyRobot con el estado de la crisis; el agente llama a dos webhooks del backend (`consult_world`, `submit_plan`); el backend valida el plan y lo aplica.

## Requisitos

- Node 22 y `npm install` hecho en `backend/` y `frontend/`.
- `cloudflared` instalado (`brew install cloudflared`).
- Workflow `Orquestador` publicado en **Development** en HappyRobot (ver [comprobaciones en HappyRobot](#comprobaciones-en-happyrobot)).
- Un `.env` en la raíz con las claves reales.

## Tres terminales, en este orden

### Terminal 1: backend

```
cd backend && npm run dev
```

Espera a `Backend listening on http://0.0.0.0:8000`. Deja el terminal abierto.

### Terminal 2: túnel

```
cloudflared tunnel --url http://localhost:8000
```

Copia la URL `https://<algo>.trycloudflare.com` que imprime. Cambia en cada arranque. Deja el terminal abierto: si lo cierras o el portátil duerme, el túnel muere.

Ponla en `.env`:

```
PUBLIC_BASE_URL=https://<algo>.trycloudflare.com
```

Vuelve al terminal 1: `Ctrl+C` y otra vez `npm run dev`. El backend lee `PUBLIC_BASE_URL` al arrancar y no antes.

Comprueba desde fuera:

```
curl https://<algo>.trycloudflare.com/health
```

Debe responder `{"status":"ok"}`.

### Terminal 3: frontend

```
cd frontend && npm run dev
```

Abre `http://localhost:5173`.

## `.env`: valores exactos

Solo las líneas que importan para este modo. El resto se deja como esté.

```
COORDINATOR_MODE=llm
COORDINATOR_HARNESS=happyrobot
HAPPYROBOT_COORDINATOR_APPLY=true
HAPPYROBOT_COORDINATOR_WORKFLOW_ID=1i6zafb6wodb
HAPPYROBOT_COORDINATOR_HOOK_URL=https://workflows.platform.eu.happyrobot.ai/hooks/development/1i6zafb6wodb
HAPPYROBOT_COORDINATOR_ENVIRONMENT=development
PUBLIC_BASE_URL=https://<algo>.trycloudflare.com
INITIAL_FIXTURE=crisis
VITE_DATA_SOURCE=api

HAPPYROBOT_API_KEY=<clave sk_live_…>
HAPPYROBOT_WEBHOOK_TOKEN=<token de 64 hex>
HELMCODE_API_KEY=<clave sk-hke_…>
OPENAI_BASE_URL=https://api.helmcode.com/v1
COORDINATOR_MODEL=deepseek-v4-flash
```

Notas:

- `COORDINATOR_HARNESS=happyrobot` es el interruptor. Sin él, el coordinador es Helmcode y nada de esto se usa.
- `HAPPYROBOT_COORDINATOR_APPLY=true` aplica el plan en el panel. Con `false` o vacío es *shadow*: HappyRobot razona, el backend valida y registra, y después cae a `rules`. En el panel no se ve nada de HappyRobot.
- `HAPPYROBOT_COORDINATOR_HOOK_URL` es obligatorio en la cuenta EU: el endpoint `/workflows/{id}/runs` del API devuelve `Workflow not found`.
- `HELMCODE_API_KEY` no la usa el coordinador. La usan las **contrapartes simuladas** (la voz del responsable en las llamadas simuladas) y el Modo vivo. Sin ella, las llamadas simuladas responden con frases fijas.
- No dejes claves duplicadas: `COORDINATOR_HARNESS` y `COORDINATOR_MODE` una sola vez. Node se queda con la última.
- No hace falta `HAPPYROBOT_COORDINATOR_TOKEN` en `.env`. Esa variable vive en HappyRobot.

### Llamadas simuladas o reales

| Quiero | `HAPPYROBOT_HOOK_ESPACIOS` |
|---|---|
| Ensayar sin llamar a nadie | vacío: `HAPPYROBOT_HOOK_ESPACIOS=` |
| Llamada real al teléfono de prueba | `https://workflows.platform.eu.happyrobot.ai/hooks/my5asz8ibzd3` |

Cambiarlo exige reiniciar el backend.

## Comprobación de arranque

En el terminal 1 debe salir:

```
[coord] listo happyrobot happyrobot gpt-5.6-luna-low org=no verbose=sí
```

Si dice `listo helmcode json deepseek-v4-flash`, `COORDINATOR_HARNESS` no es `happyrobot`.
Si dice `loadLlmConfig falló: … requiere HAPPYROBOT_API_KEY`, la clave está vacía.

## Probar

Escribe en el chat del panel: `Fuga de agua en el Acceso Sur: el lounge Sur queda inutilizable`.

En el terminal 1, en este orden:

```
[events] POST /events chat free_text …
[coord] bucle happyrobot gpt-5.6-luna-low apply tope 180000ms
[coord] happyrobot run <uuid> gpt-5.6-luna-low apply
[coord] happyrobot informe
  estado: accepted · aplicado: sí · latencia: 7-14s
[coord] resultado ok
[actions] dispatch { … adapter: 'sim' }
```

En el panel: cambia el estado de los espacios, aparecen las acciones y las llamadas simuladas responden. Cada `call_result` vuelve a llamar al coordinador; es normal ver varios runs seguidos.

Las líneas `[coord] llm helmcode deepseek-v4-flash … think …` son las contrapartes simuladas, no el coordinador. `COORDINATOR_VERBOSE=0` las silencia.

Prueba sin panel (una sola ejecución, modo shadow, no toca el estado):

```
cd backend && npm run coordinator:happyrobot -- --text="Fuga de agua en el Acceso Sur"
```

## Comprobaciones en HappyRobot

Solo hace falta revisarlas si algo falla. Todo está en el workflow `Orquestador`, versión `mpp8gtbh590v` (o la que esté publicada en Development).

1. **Publicado en Development.** Comprobar por API sin ejecutar nada:
   ```
   curl -s https://platform.eu.happyrobot.ai/api/v2/workflows/1i6zafb6wodb -H "Authorization: Bearer $HAPPYROBOT_API_KEY" | python3 -c "import sys,json;v=json.load(sys.stdin)['latest_version'];print(v['slug'],v['is_live'],v['environment'])"
   ```
   Debe salir `<slug> True development`.
2. **Variables → `HAPPYROBOT_COORDINATOR_TOKEN`.** Su valor en los tres entornos es el de `HAPPYROBOT_WEBHOOK_TOKEN` del `.env`. Si el backend responde `Invalid workflow token`, no coinciden.
3. **Webhooks.** URL `{{backend_base_url}}/workflow/coordinator/happyrobot/consult` y `.../submit`. Leen la URL del trigger; no hay que cambiar nada al cambiar de túnel. Bearer token como chip `{ } HAPPYROBOT_COORDINATOR_TOKEN`, no texto.
4. **Prompt.** Modelo `GPT-5.6 Luna`, `Low reasoning`. Dos chips: `Data System Prompt` y `Data World Snapshot`.

## Volver al coordinador normal (Helmcode)

```
COORDINATOR_HARNESS=json
HAPPYROBOT_COORDINATOR_APPLY=false
```

Reinicia el backend. El túnel deja de ser necesario para el coordinador (sigue haciendo falta para los callbacks de llamadas reales).

## Errores conocidos

| Mensaje | Causa | Arreglo |
|---|---|---|
| `trigger HappyRobot 404: Workflow not found` | Falta `HAPPYROBOT_COORDINATOR_HOOK_URL` | Añadirla y reiniciar |
| `no live development version found` | El workflow no está publicado en Development | Publish → Development |
| `{"error":"Invalid workflow token"}` en HappyRobot | La variable de HappyRobot no vale lo mismo que `HAPPYROBOT_WEBHOOK_TOKEN`, o el campo Bearer es texto plano | Corregir valor; volver a seleccionar con `@` |
| HTTP 530 en HappyRobot | El túnel vive pero el backend no escucha | Arrancar backend |
| `no tunnel here` / `EOF` | El túnel murió | Relanzar `cloudflared`, actualizar `PUBLIC_BASE_URL`, reiniciar backend |
| `ECONNREFUSED 127.0.0.1:8000` | Backend parado | `npm run dev` en `backend/` |
| `stale: true` en todos los webhooks | `PUBLIC_BASE_URL` apunta a otro backend, o el backend se reinició a mitad de run | Revisar URL; repetir el evento |
| `[sim] contraparte complete() no soporta el proveedor happyrobot` | Falta `HELMCODE_API_KEY` | Añadirla o aceptar respuestas fijas |
| El coordinador tarda 180 s y cae a `rules` | HappyRobot no llegó a `submit_plan` | Mirar el run en HappyRobot → Runs |

## Seguridad

Las claves que pasaron por chats o capturas hay que rotarlas: `HAPPYROBOT_API_KEY` (Settings → API Keys), `HAPPYROBOT_WEBHOOK_TOKEN` (y su copia en la variable de HappyRobot), `HELMCODE_API_KEY`. Nunca pegar `.env` completo en un chat.
