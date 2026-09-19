# T9: Adaptador HappyRobot y callbacks

## Qué y para qué

El backend ya sabe llamar al hook del área, pero nadie traduce lo que HappyRobot devuelve.
T9 cierra el círculo: teléfono real en la salida y una puerta de entrada que acepta el
payload nativo del workflow y lo convierte al `SpecialistResultEnvelope` del contrato.
Sin esto la llamada real suena pero no cambia el estado, y el coordinador no replanifica.

## Criterios de aceptación

- [ ] `POST /workflow/happyrobot/results` acepta el payload nativo del workflow (campos sueltos o anidados en `data`/`output`/`result`) y responde `{ ok, duplicate, applied }` igual que `/workflow/results`.
- [ ] Si el workflow no devuelve `taskId`, se recupera del `callId` (`call-<taskId>`); `runId` y `planVersion` salen siempre de la tarea, nunca del cuerpo.
- [ ] Sin `eventId`, se deriva del identificador de sesión de HappyRobot, de modo que reenviar el mismo webhook no aplica el resultado dos veces (`duplicate: true`).
- [ ] `outcome` y `status` se normalizan desde texto libre en español o inglés (`aceptado`, `con condiciones`, `rechazado`, `no contesta`, `error`) a los enums del contrato.
- [ ] La transcripción de HappyRobot (`role`/`speaker` + `content`/`text`) se mapea a `{ who: "agente" | "humano", text, at }` y aparece en `calls[].transcript`.
- [ ] Un cuerpo que no permite identificar la tarea devuelve `400` con mensaje legible, y una tarea de otra ejecución o versión devuelve `200` con `applied: false`, sin tocar el estado vigente.
- [ ] El adaptador de salida manda un teléfono real en E.164 tomado del entorno (`HAPPYROBOT_PHONE_<AREA>`, con `HAPPYROBOT_TEST_PHONE` de reserva); un número mal formado se registra y no se envía.
- [ ] Un hook que responde error deja traza con su código de estado en vez de fallar en silencio.
- [ ] `make check` pasa con tests nuevos del traductor y del endpoint.

## Fuera de alcance

- Construir o editar los workflows en la plataforma de HappyRobot (eso es T6).
- Los guiones de conversación por área (T12, T13, T14) y la transcripción en directo (T22).
- Elegir por dónde se lanza la llamada desde el panel (T28) y el modo `api` del frontend (T27).
- Reintentos automáticos del POST de salida: el timeout de 180 s y el `no_answer` ya existen.

## Notas

- Contrato implicado: `docs/api-contract.md` → "Workflows" y "Salida del backend hacia HappyRobot".
- Archivos clave: `backend/src/actions/adapters/happyrobot.ts` (salida), el traductor nuevo en `backend/src/actions/adapters/happyrobot-inbound.ts`, `backend/src/app.ts` (ruta) y `backend/src/config.ts` (teléfonos).
- `/workflow/results` sigue siendo estricto: es la puerta del contrato. La puerta tolerante es solo para HappyRobot.
- La forma exacta del webhook de HappyRobot no está documentada en la cuenta; por eso el traductor acepta variantes en vez de un esquema fijo.
