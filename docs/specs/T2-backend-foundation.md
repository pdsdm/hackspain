# T2: stack y arranque del backend

## Qué y para qué

Fijar un backend mínimo y persistente que desbloquee el estado compartido y la integración con HappyRobot.

## Criterios de aceptación

- [x] Node.js + TypeScript + Express arranca en el puerto configurado.
- [x] SQLite crea y reutiliza una base local.
- [x] `GET /health` responde `200` con `{ "status": "ok" }`.
- [x] `make check` ejecuta lint, tests y build reales de backend y frontend.

## Fuera de alcance

- Estado de la crisis, dispatcher, callbacks y despliegue público (T7/T18).

## Notas

- Contrato implicado: `GET /health` en `docs/api-contract.md`.
