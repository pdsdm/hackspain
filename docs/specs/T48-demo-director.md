# T48: director reproducible de la demo

## Qué y para qué

Automatizar reset, checkpoints y cues para que una persona maneje el frontend mientras los dos inputs reales llegan por HappyRobot. Incluye un modo API de respaldo etiquetado.

## Criterios de aceptación

- [x] `npm run demo:video -- --inputs=happyrobot|external|api` está documentado.
- [x] Resetea a `calm` y espera `/state` estable sin escribir SQLite.
- [x] `happyrobot` dispara dos runs del workflow; `api` usa el mismo contrato de respaldo.
- [x] Espera predicados de estado/plan/tareas, no solo tiempos fijos.
- [x] Imprime cues para seleccionar Principal, Muelle, agentes, compromisos y resultado.
- [x] Timeout y fallo indican exactamente qué checkpoint no llegó.
- [x] Usa IDs únicos y puede abortarse y repetirse sin aplicar callbacks anteriores.
- [ ] Un owner crea y publica `Demo Incident Inputs`; la API key actual no tiene permiso de creación.

## Fuera de alcance

Grabar, editar vídeo o almacenar secretos.
