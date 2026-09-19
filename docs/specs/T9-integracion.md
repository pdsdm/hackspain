# T9: Adaptador HappyRobot y callbacks

## Qué y para qué

El backend ya sabe llamar al hook del área, pero nadie traduce lo que HappyRobot devuelve.
T9 cierra el círculo: teléfono real en la salida y una puerta de entrada que acepta el
payload nativo del workflow y lo convierte al `SpecialistResultEnvelope` del contrato.
Sin esto la llamada real suena pero no cambia el estado, y el coordinador no replanifica.

## Criterios de aceptación

- [x] `POST /workflow/happyrobot/results` acepta el payload nativo del workflow (campos sueltos o anidados en `data`/`output`/`result`) y responde `{ ok, duplicate, applied }` igual que `/workflow/results`.
- [x] Si el workflow no devuelve `taskId`, se recupera del `callId` (`call-<taskId>`); `runId` y `planVersion` salen siempre de la tarea, nunca del cuerpo.
- [x] Sin `eventId`, se deriva del identificador de sesión de HappyRobot, de modo que reenviar el mismo webhook no aplica el resultado dos veces (`duplicate: true`).
- [x] `outcome` y `status` se normalizan desde texto libre en español o inglés (`aceptado`, `con condiciones`, `rechazado`, `no contesta`, `error`) a los enums del contrato.
- [x] La transcripción de HappyRobot (`role`/`speaker` + `content`/`text`) se mapea a `{ who: "agente" | "humano", text, at }` y aparece en `calls[].transcript`.
- [x] Un cuerpo que no permite identificar la tarea devuelve `400` con mensaje legible, y una tarea de otra ejecución o versión devuelve `200` con `applied: false`, sin tocar el estado vigente.
- [x] El adaptador de salida manda un teléfono real en E.164 tomado del entorno (`HAPPYROBOT_TEST_PHONE`); un número mal formado impide el arranque en vez de fallar en la llamada.
- [x] Un hook que responde error deja traza con su código de estado en vez de fallar en silencio.
- [x] `make check` pasa con tests nuevos del traductor y del endpoint.

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

## Verificado en directo (sábado 19, 13:10)

El backend hizo el `POST` al workflow `my5asz8ibzd3` y HappyRobot respondió `200`; la tarea
quedó `dispatched` y la llamada `en_curso` con `simulated: false`. Antes, el circuito
completo (giro → tarea → callback nativo → estado) se probó contra la puerta traducida:
`applied: true`, reenvío `duplicate: true`, sin token `401`.

Lo que costó encontrarlo, para que no se repita:

- **El host del hook.** `https://platform.happyrobot.ai/hooks/<id>` es el panel web:
  devuelve `307` a `/auth/login` y el `fetch` de Node muere con `fetch failed`. El bueno es
  `https://workflows.platform.eu.happyrobot.ai/hooks/<id>`.
- **`PUBLIC_BASE_URL` tiene que ser pública y viva.** Los túneles de `trycloudflare`
  caducan; con uno muerto o con `localhost`, el callback no vuelve y todo acaba en
  `no_answer` a los 180 s.
- **El `callbackUrl` es `/workflow/happyrobot/results`, no `/workflow/results`.** El cuerpo
  plano que manda el workflow (con `outcome` y `summary` arriba, sin `status` ni `result`)
  la puerta estricta lo rechaza con `400`.

## Pendiente, y no es de este lado

El nodo de HappyRobot tiene que mandar el `HAPPYROBOT_WEBHOOK_TOKEN` real en el callback;
mientras mande el de relleno, la vuelta se lleva un `401`. Que el callback no traiga
`runId`, `planVersion` ni un `eventId` propio **no importa**: el traductor los deriva de la
tarea a partir del `callId`.
