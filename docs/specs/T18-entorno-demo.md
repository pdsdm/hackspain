# T18 — Entorno de demo y recuperación

## Objetivo

Poder arrancar y recuperar la demo en el portátil de forma repetible, con frontend en modo API, SQLite persistente y un Quick Tunnel que publique el callback HTTPS.

## Criterios de aceptación

- `./scripts/demo.sh up-local` arranca backend y frontend con `/health`, `VITE_DATA_SOURCE=api` y `backend/data/demo.db` persistente.
- `./scripts/demo.sh up` obtiene la URL de Cloudflare Quick Tunnel, la inyecta como `PUBLIC_BASE_URL`, comprueba `/health` local y público y muestra la URL de `/workflow/results`.
- `status`, `reset`, `restart-backend` y `down` permiten comprobar, limpiar y recuperar la demo sin borrar SQLite.
- El modo seguro por defecto es `rules` + `sim`; `DEMO_COORDINATOR_MODE=llm DEMO_CALL_MODE=real` activa Helmcode y HappyRobot con secretos solo en `.env`.
- La guía incluye el orden de arranque, variables, logs y recuperación ante caída de backend, túnel, LLM o HappyRobot.
- Antes de cerrar T18 se valida que HappyRobot alcanza el callback público con token, que un reinicio conserva el recorrido y que se completa un ensayo; depende de T6/T17 real.

## Fuera de alcance

- Despliegue permanente en cloud.
- Abrir T30–T32 antes de completar y ensayar el recorrido principal.
