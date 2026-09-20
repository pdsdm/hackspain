# Guía de pruebas

Esta guía cubre lo que está implementado en `main`: panel contra el backend, endpoints y el contrato previsto con HappyRobot.

## 1. Preparación

Requiere Node.js 22.13 o superior.

```bash
./scripts/setup.sh
cp frontend/.env.example frontend/.env
```

El backend carga el `.env` de la raíz. Vite carga `frontend/.env`; las variables `VITE_*` de la raíz no llegan al frontend automáticamente.

## 2. Panel contra el backend real

Configuración mínima en el `.env` de la raíz:

```dotenv
INITIAL_FIXTURE=calm
COORDINATOR_MODE=rules
```

Para la toma con HappyRobot como coordinador principal:

```dotenv
HAPPYROBOT_API_KEY=
HAPPYROBOT_WEBHOOK_TOKEN=
COORDINATOR_MODE=llm
COORDINATOR_HARNESS=happyrobot
HAPPYROBOT_COORDINATOR_WORKFLOW_ID=
HAPPYROBOT_COORDINATOR_HOOK_URL=
HAPPYROBOT_COORDINATOR_APPLY=true
PUBLIC_BASE_URL=
```

El modelo del coordinador se configura dentro del workflow `Orquestador`; el backend valida y aplica cada `submit_plan`.

En `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Arrancar en dos terminales:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

El panel debe mostrar `Backend conectado`. En desarrollo, Vite reenvía las rutas API al backend de `127.0.0.1:8000`.

## 3. Prueba rápida de endpoints

Las llamadas siguientes pasan por Vite y demuestran el recorrido frontend → backend:

```bash
curl -s http://127.0.0.1:5173/health
curl -s http://127.0.0.1:5173/state
curl -s -X POST http://127.0.0.1:5173/simulation/reset \
  -H 'Content-Type: application/json' \
  -d '{"fixture":"calm"}'
curl -s -X POST http://127.0.0.1:5173/events \
  -H 'Content-Type: application/json' \
  -d '{"source":"chat","kind":"free_text","text":"El Pabellón Principal está cerrado por avería de agua"}'
curl -s http://127.0.0.1:5173/actions
curl -s -X POST http://127.0.0.1:5173/simulation/twists \
  -H 'Content-Type: application/json' \
  -d '{"twist":"lounge_unavailable"}'
```

El contrato completo, cuerpos y respuestas están en [`docs/api-contract.md`](api-contract.md). Los logs del backend usan los prefijos `[events]`, `[coord]`, `[actions]` y `[workflow]`.

## 4. Recorrido HappyRobot

### Variables locales

```dotenv
PUBLIC_BASE_URL=https://URL-PUBLICA-DEL-BACKEND
HAPPYROBOT_API_KEY=
HAPPYROBOT_TEST_PHONE=+34600000000
HAPPYROBOT_WEBHOOK_TOKEN=
HAPPYROBOT_HOOK_ESPACIOS=
HAPPYROBOT_HOOK_CATERING=
HAPPYROBOT_HOOK_TRANSPORTE=
HAPPYROBOT_HOOK_ASISTENTES=
```

Solo hace falta configurar el hook de las áreas que se prueben. Con un hook y `HAPPYROBOT_API_KEY`, `HAPPYROBOT_TEST_PHONE` es obligatorio y debe usar E.164. `PUBLIC_BASE_URL` debe ser HTTPS y accesible desde HappyRobot. `HAPPYROBOT_WEBHOOK_TOKEN` es un secreto elegido por el equipo para autenticar los callbacks; no es la API key de HappyRobot.

### Flujo en HappyRobot

1. Crear o duplicar un workflow con trigger **Webhook (API)** y copiar su URL generada al `HAPPYROBOT_HOOK_*` correspondiente. La URL del deployment de **Web call** no sirve para un POST de llamada saliente.
2. Añadir un **Outbound Voice Agent**. El destino debe salir del payload del trigger y estar en E.164; también hace falta un `From number` válido.
3. Después de la llamada, usar **AI Extract** sobre la transcripción para obtener `outcome`, `summary`, `conditions` y los datos seguros que aplicará el backend.
4. Añadir un nodo **Webhook POST** hacia el `callbackUrl` recibido. Enviar `Authorization: Bearer <HAPPYROBOT_WEBHOOK_TOKEN>` y un cuerpo con el formato de `POST /workflow/results` de `docs/api-contract.md`.
5. Conservar del trigger `taskId`, `runId`, `planVersion` y `callId`; son la correlación que evita aplicar callbacks duplicados u obsoletos.

Resultado esperado: el backend registra `[actions]`, HappyRobot realiza la llamada, el callback registra `[workflow]` y el siguiente `GET /state` muestra la llamada terminada, el resultado del agente y el compromiso actualizado.

## 5. Operación repetible de la demo

Requisitos: Node 22 o superior, dependencias instaladas con `./scripts/setup.sh` y un túnel para el modo público. El script no instala herramientas ni escribe secretos.

Antes de nada, comprueba el entorno:

```bash
./scripts/demo.sh doctor
```

Dice qué variables faltan (solo el nombre, nunca el valor), si hay túnel y si la red resuelve `trycloudflare.com`.

**Ojo con la red.** La wifi de la ETSIT (DNS `138.100.x.x`) devuelve SERVFAIL para todo `trycloudflare.com` y bloquea los resolvers externos: los Quick Tunnel de Cloudflare no funcionan ahí por mucho que `cloudflared` esté instalado. Alternativa verificada, sin cuenta ni instalación:

```bash
DEMO_TUNNEL=lhr DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real ./scripts/demo.sh up
```

`lhr` abre el túnel por SSH contra `localhost.run`. La URL cambia en cada arranque, igual que con Cloudflare. La otra salida es compartir datos desde un móvil y usar `cloudflared`.

Prueba local segura, sin LLM ni llamadas reales:

```bash
./scripts/demo.sh up-local
./scripts/demo.sh status
./scripts/demo.sh reset calm
```

Demo con coordinador e inputs HappyRobot y Quick Tunnel:

```bash
DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real ./scripts/demo.sh up
```

El orden es automático: Quick Tunnel → descubrimiento de la URL `trycloudflare.com` → backend con esa URL en `PUBLIC_BASE_URL` → frontend en modo API → comprobación de `/health` local y público. La salida muestra el panel y el callback público. Cada nuevo Quick Tunnel tiene otra URL; el workflow debe usar el `callbackUrl` recibido en el payload, no una URL copiada a mano.

El estado persiste en `backend/data/demo.db`. Los logs y PID quedan en `.demo/`, que Git ignora. Operación y recuperación:

```bash
./scripts/demo.sh restart-backend
./scripts/demo.sh status
./scripts/demo.sh reset calm
./scripts/demo.sh down
```

| Fallo | Recuperación |
|---|---|
| Backend | `restart-backend`; conserva SQLite. Si se interrumpió una acción `sim`, ejecutar `reset calm` antes del ensayo. |
| Quick Tunnel | `down` y repetir `up`; la URL nueva se vuelve a inyectar al backend. Si la red no resuelve `trycloudflare.com`, `DEMO_TUNNEL=lhr`. |
| Coordinador HappyRobot | `down` y arrancar con `DEMO_COORDINATOR_MODE=rules`; el panel y los efectos deterministas siguen operativos como contingencia. |
| Inputs HappyRobot | Usar `--inputs=api` como respaldo; la pantalla conserva la etiqueta de simulación. |
| Estado de ensayo sucio | `reset calm`; crea otra ejecución sin borrar la evidencia anterior de SQLite. |

`HAPPYROBOT_API_KEY`, `HAPPYROBOT_TEST_PHONE`, `HAPPYROBOT_WEBHOOK_TOKEN` y `HAPPYROBOT_HOOK_*` solo se rellenan en el `.env` raíz. No se copian a argumentos ni logs.

## 6. Estado y limitaciones conocidas

- Verificado localmente: Vite llega a `/health`, `/state`, `/events` y `/simulation/*`; el backend registra el evento.
- Probado por tests: despacho al hook, timeout sin callback, autenticación e idempotencia de `/workflow/results`.
- Pendiente real: URL de trigger Webhook, API key de HappyRobot, número de prueba y backend público HTTPS.
- Los contactos del seed mantienen `phone: null`; el backend inyecta `HAPPYROBOT_TEST_PHONE` solo al payload externo.
- El Web call de la rama `Prueba-de-plataforma-y-llamada-real` es un respaldo por navegador, no el camino backend → llamada telefónica.

Antes de cerrar cualquier cambio:

```bash
make check
```
