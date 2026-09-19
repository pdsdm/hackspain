# Guía de pruebas

Esta guía cubre lo que está implementado en `main`: panel simulado, panel contra el backend, endpoints y el contrato previsto con HappyRobot.

## 1. Preparación

Requiere Node.js 22.13 o superior.

```bash
./scripts/setup.sh
cp frontend/.env.example frontend/.env
```

El backend carga el `.env` de la raíz. Vite carga `frontend/.env`; las variables `VITE_*` de la raíz no llegan al frontend automáticamente.

## 2. Panel con simulación local

En `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
VITE_DATA_SOURCE=sim
```

Arranque:

```bash
cd frontend
npm run dev
```

Abrir `http://127.0.0.1:5173`. Este modo no necesita backend y reproduce el guion local de `frontend/src/domain/`.

## 3. Panel contra el backend real

Configuración mínima en el `.env` de la raíz:

```dotenv
INITIAL_FIXTURE=calm
COORDINATOR_MODE=rules
```

Para usar Helmcode en vez del respaldo determinista:

```dotenv
HELMCODE_API_KEY=
OPENAI_BASE_URL=https://api.helmcode.com/v1
COORDINATOR_MODEL=deepseek-v4-flash
COORDINATOR_HARNESS=json
COORDINATOR_MODE=llm
```

`COORDINATOR_MODEL` solo configura la replanificación del backend. El modelo de la conversación de voz se configura en el prompt node de HappyRobot.

En `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
VITE_DATA_SOURCE=api
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

## 4. Prueba rápida de endpoints

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

## 5. Recorrido HappyRobot

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

## 6. Estado y limitaciones conocidas

- Verificado localmente: Vite en modo `api` llega a `/health`, `/state`, `/events` y `/simulation/*`; el backend registra el evento.
- Probado por tests: despacho al hook, timeout sin callback, autenticación e idempotencia de `/workflow/results`.
- Pendiente real: URL de trigger Webhook, API key de HappyRobot, número de prueba y backend público HTTPS.
- Los contactos del seed mantienen `phone: null`; el backend inyecta `HAPPYROBOT_TEST_PHONE` solo al payload externo.
- El Web call de la rama `Prueba-de-plataforma-y-llamada-real` es un respaldo por navegador, no el camino backend → llamada telefónica.

Antes de cerrar cualquier cambio:

```bash
make check
```
