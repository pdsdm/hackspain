# T22: Transcripción en directo

## Qué y para qué

Durante una llamada real de HappyRobot, el panel debe enseñar las intervenciones del agente y de la persona con pocos segundos de retraso. Al terminar, conserva el diálogo completo para la demo y la auditoría.

El backend actual dispara un webhook `HAPPYROBOT_HOOK_*`. Ese endpoint no documenta que su respuesta incluya `run_id` o `session_id`; solo `POST /workflows/:id/runs` garantiza `run_id`. Por tanto T22 no intenta adivinar una sesión ni afirma que el streaming sea automático: el workflow recibe una URL de callback parcial y debe enviar snapshots acumulativos mientras la voz sigue activa.

## Criterios de aceptación

- [x] La salida a HappyRobot incluye `transcriptCallbackUrl` además del `callbackUrl` final.
- [x] `POST /workflow/happyrobot/transcript` usa el bearer de `HAPPYROBOT_WEBHOOK_TOKEN`, identifica la tarea por `taskId` o `callId` y nunca acepta el `runId` interno del cuerpo como autoridad.
- [x] Cada snapshot admite los formatos de transcript ya tolerados por T9, ordena por `at` y fusiona las líneas sin duplicarlas.
- [x] Cada actualización se guarda en el `state_json` de SQLite; sobrevive al reinicio y aparece en `GET /state` durante la llamada.
- [x] El callback final fusiona el transcript completo con lo recibido en vivo, cierra la llamada y no duplica líneas.
- [x] El dashboard, que consulta `GET /state` cada dos segundos, muestra las últimas intervenciones durante la llamada y el transcript completo de la última llamada al terminar.
- [x] Hay pruebas focalizadas de autenticación, orden, reenvío idempotente, fusión final y persistencia.
- [ ] Validación con una llamada real después de configurar el workflow desplegado.

## Cambio necesario en HappyRobot

En cada workflow saliente, el trigger ya recibe `callId`, `taskId`, `transcriptCallbackUrl` y `callbackUrl`:

1. Durante el nodo de voz, configurar una herramienta o webhook que haga `POST` a `transcriptCallbackUrl` después de cada nueva intervención, o como máximo cada pocos segundos.
2. Usar `Authorization: Bearer <HAPPYROBOT_WEBHOOK_TOKEN>` y `Content-Type: application/json`.
3. Enviar siempre el transcript acumulado desde el inicio de la llamada, no solo la última línea. Incluir `call_id`, `session_id` real cuando esté disponible y las líneas con `role`/`speaker`, `content`/`text` y `at` en segundos.
4. Mantener el `POST` final a `callbackUrl` con outcome, resumen, datos estructurados y transcript completo.

Ejemplo parcial:

```json
{
  "call_id": "call-7a31…",
  "session_id": "id-real-de-happyrobot",
  "transcript": [
    { "id": "msg-1", "role": "assistant", "content": "¿Tienen libre el Lounge?", "at": 2 },
    { "id": "msg-2", "role": "user", "content": "Sí, desde las 13:15.", "at": 6 }
  ]
}
```

Si el nodo de voz desplegado solo expone `session_id` y transcript al terminar, este callback no puede convertirlo en tiempo real. En ese caso queda como cambio externo pendiente: o el nodo debe emitir durante la conversación, o la integración debe migrar del hook a `triggerRun`, guardar su `run_id`, resolver `session_id` con `GET /runs/:id/sessions` y consumir `GET /sessions/:id/stream`.

## Fuera de alcance

- Editar o publicar workflows en la cuenta de HappyRobot.
- Añadir el SDK de HappyRobot o otra dependencia.
- Exponer la API key o IDs internos de HappyRobot al frontend.
