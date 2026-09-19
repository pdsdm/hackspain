# HappyRobot: cómo se lanza una llamada

## Quién llama a quién

```
Panel (frontend)                Backend                      HappyRobot
  │  POST /events                  │                              │
  │  source: human ───────────────►│                              │
  │                                │ coordinador → dispatch_task  │
  │                                │  POST HAPPYROBOT_HOOK_<AREA> │
  │                                │  Authorization: Bearer ─────►│
  │                                │                              │ llamada real
  │                                │◄──── POST /workflow/results ─┘
  │◄───── GET /state (polling) ────│  (Bearer HAPPYROBOT_WEBHOOK_TOKEN)
```

**El frontend nunca habla con HappyRobot.** No conoce la API key, no conoce las URLs de
los hooks y no decide a quién se llama. Solo manda un evento y lee el estado. Todo lo que
toca a HappyRobot vive en el backend, que es el único con secretos y con el estado de la
ejecución.

## Frontend

El botón **Avisar a…** manda un evento y se acabó:

```http
POST {VITE_API_URL}/events
{ "source": "human", "kind": "call_request", "actorId": "responsable",
  "text": "Llamar al recinto para confirmar el Pabellón B",
  "payload": { "area": "espacios", "counterpart": "Responsable de recinto - MADRING",
               "objective": "Confirmar Pabellón B para 450 invitados a las 13:00" } }
```

Respuesta `202 { "ok": true, "eventId": "…" }`. La llamada aparece luego en `GET /state`
(`calls[]`) y la tarea en `GET /actions`. El botón no espera a la llamada: muestra que el
evento se ha registrado y el panel se actualiza solo con el polling.

Todo esto va por `src/data/apiClient.ts` y `VITE_API_URL`, como el resto del panel.

## Backend

Ya implementado en `origin/main`:

- `backend/src/actions/adapters/happyrobot.ts` hace `POST` al hook del área con
  `Authorization: Bearer $HAPPYROBOT_API_KEY`. El cuerpo exacto está en
  `ejemplo-llamada.json` y en `docs/api-contract.md` → "Salida del backend hacia HappyRobot".
- El contacto sale de `backend/fixtures/madring/seed.json` (`contacts[]`) según el área.
  Los teléfonos están a `null` a propósito: se rellenan por entorno, no en el fixture, y
  van en **E.164** (`+34600000000`, sin espacios ni guiones).
- El workflow **no responde en el cuerpo** de ese POST: contesta por `callbackUrl`
  (`POST /workflow/results`, autorizado con `HAPPYROBOT_WEBHOOK_TOKEN`).
- Sin hook configurado para el área, el adaptador `sim` finge el resultado. Si el hook
  acepta pero no llega callback en 180 s de reloj, se registra `no_answer` y el
  coordinador replanifica.

## Variables de entorno

Todas en el `.env` de la raíz, ninguna con prefijo `VITE_`:

| Variable | Para qué |
|---|---|
| `HAPPYROBOT_API_KEY` | Bearer de salida hacia los hooks |
| `HAPPYROBOT_HOOK_ESPACIOS` / `_CATERING` / `_TRANSPORTE` / `_ASISTENTES` | URL del hook de cada workflow |
| `HAPPYROBOT_WEBHOOK_TOKEN` | Autoriza los `POST /workflow/*` que entran |
| `PUBLIC_BASE_URL` | Base del `callbackUrl` que se manda a HappyRobot |

URL de hook, tal como la da el builder:
`https://workflows.platform.eu.happyrobot.ai/hooks/<id-del-workflow>`

## Deuda de esta rama

El commit `feat: Integracion voice agent` metió el atajo que hay que deshacer al mergear
`origin/main`:

- `frontend/vite.config.ts`: endpoint `/api/happyrobot/call` en el servidor de Vite, con
  la API key leída del `.env`. **Fuera**: solo funcionaba en `npm run dev` y ponía un
  secreto en el proceso del frontend.
- `frontend/src/components/right/AvisarPanel.tsx`: cambiar el `fetch` a `POST /events`
  vía `apiClient`.
- `.env.example`: `HAPPYROBOT_ENDPOINT` y `HAPPYROBOT_TEST_PHONE` se sustituyen por los
  `HAPPYROBOT_HOOK_*` de arriba.

## Criterios de aceptación

- [ ] Pulsar **Avisar a…** deja un evento en el backend y una tarea en `GET /actions`.
- [ ] El backend hace el POST al hook del área con el body del contrato.
- [ ] La API key no aparece en el bundle del frontend ni en ningún `VITE_*`.
- [ ] El callback a `/workflow/results` actualiza `calls[]` y el compromiso del área.
- [ ] Sin hook configurado, la demo sigue funcionando con el adaptador `sim`.
