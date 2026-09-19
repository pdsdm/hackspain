# T48: director reproducible de la demo

## Qué y para qué

Automatizar reset, checkpoints y cues para que una persona maneje el frontend mientras los dos inputs reales llegan por HappyRobot. Incluye un modo API de respaldo etiquetado.

## Criterios de aceptación

- [ ] `npm run demo:video -- --inputs=external|api` o comando equivalente documentado.
- [ ] Resetea a `calm` y espera `/state` estable sin escribir SQLite.
- [ ] `external` espera los dos eventos reales; `api` usa el mismo contrato y los marca simulados.
- [ ] Espera predicados de estado/plan/tareas, no solo tiempos fijos.
- [ ] Imprime cues para seleccionar Principal, Muelle, agentes, compromisos y resultado.
- [ ] Timeout y fallo indican exactamente qué checkpoint no llegó.
- [ ] Puede abortarse y repetirse desde cero sin callbacks antiguos aplicados.

## Fuera de alcance

Grabar, editar vídeo o almacenar secretos.
