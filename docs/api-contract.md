<!--
  PARA EL EQUIPO: contrato entre backend, frontend y workflows. Es la fuente de verdad.
  - Permite trabajar en paralelo: el frontend hace mocks con este formato mientras el backend lo implementa.
  - Cambiarlo = PR que lo diga en la descripción y aviso a quien consuma ese endpoint.
  - Los IDs reales de HappyRobot se descubren en la cuenta; nunca se inventan ni se versionan secretos.
-->

# Contrato de API

Base URL local: `http://localhost:8000` (`VITE_API_URL` en el frontend, ver D6).

Todos los cuerpos son JSON. Los errores usan `{ "error": "mensaje legible" }`:

- `400`: cuerpo, campo o enum inválido.
- `401`: token de workflow ausente o incorrecto.
- `404`: ejecución, tarea, llamada o decisión inexistente.
- `409`: ejecución/versión obsoleta, decisión resuelta o `eventId` en conflicto.
- `500`: error interno no esperado.
- `503`: integración de workflows no configurada.

Los tiempos del escenario son segundos desde medianoche (`12:15 = 44100`) y los importes están en euros. `planVersion` aumenta cuando cambia el plan. Un resultado anterior se conserva como evidencia, pero no muta el estado vigente.

## Salud

### `GET /health`

**Respuesta 200**: `{ "status": "ok" }`.

## Panel de supervisión

El frontend usa estos endpoints con `VITE_DATA_SOURCE=api`. El tipo público es `CrisisState` en `frontend/src/domain/types.ts` y sus ejemplos completos están en `backend/fixtures/madring/states/`.

### `GET /state`

Devuelve el estado completo de la ejecución activa; el frontend hace polling cada dos segundos.

```json
{
  "simulated": false,
  "clock": { "simSeconds": 44100, "speed": 1, "paused": false, "openingAt": 46800, "lunchAt": 48600, "raceAt": 54000 },
  "planVersion": 1,
  "coordinatorStatus": "replanificando",
  "spaces": [{ "id": "pabellonB", "name": "Pabellón B", "kind": "pabellon", "zone": "sur", "capacity": 450, "status": "pendiente", "pos": [40.468, -3.6172] }],
  "commitments": [{ "id": "c-pabB", "title": "…", "area": "espacios", "status": "aceptado_condiciones", "counterpart": "Recinto", "conditions": ["…"], "planVersion": 1, "updatedAt": 44160 }],
  "agents": [{ "id": "espacios", "name": "Espacios", "objective": "…", "reason": "El aforo bloquea el resto del plan", "status": "llamada" }],
  "shuttles": [],
  "deliveries": [],
  "guestGroups": [],
  "gates": [],
  "attendanceExpected": 110000,
  "decisions": [{ "id": "decision-plan-2", "title": "…", "summary": "…", "rationale": "…", "cost": 3200, "conditions": ["…"], "effectApprove": "…", "effectReject": "…", "status": "pendiente", "createdAt": 44280 }],
  "calls": [{ "id": "call-t1", "agent": "espacios", "counterpart": "Recinto", "channel": "llamada", "startedAt": 44100, "endsAfter": 90, "status": "en_curso", "simulated": true, "transcript": [] }],
  "events": [],
  "budget": { "contingency": 5000, "autonomousLimit": 1500, "authorized": 1500, "forecast": 3200, "committed": 0 },
  "constraints": ["Norte y Sur sin conexión interior"],
  "twistsApplied": [],
  "selectedId": null,
  "scriptId": "main",
  "scriptCursor": 0,
  "nextScriptAt": null,
  "waitingForDecision": "decision-plan-2",
  "agentsPaused": false,
  "resolved": false
}
```

En API el backend fuerza `simulated: false`, `scriptId: "main"`, `scriptCursor: 0` y `nextScriptAt: null`; los workflows no consumen ni modifican esos campos. El roster individual queda fuera de `/state`. Cada `call` lleva `simulated: true` cuando la produce el adaptador `sim` (sin `HAPPYROBOT_API_KEY` o sin hook para esa área); el panel la etiqueta «simulada» y solo muestra «vía HappyRobot» si es `false`.

### `POST /interventions`

```json
{ "type": "approve_spend", "payload": { "decisionId": "decision-plan-2" } }
```

- `approve_spend`, `reject_spend`, `reject_split`: requieren `payload.decisionId`.
- `pause`, `resume`: sin payload.
- `set_constraint`: requiere `payload.text`.
- `take_call`: requiere `payload.callId` de una llamada `en_curso`.

Aprobar aumenta `budget.authorized`, pero no confirma recursos ni incrementa `budget.committed`. Mientras haya una decisión pendiente no se despachan acciones nuevas; las ya iniciadas continúan. Pausar evita nuevos despachos sin cancelar acciones iniciadas.

**Respuesta 200**: `{ "ok": true }`.

### `POST /simulation/twists`

```json
{ "twist": "lounge_unavailable" }
```

`twist`: `lounge_unavailable` | `pabellon_b_400` | `shuttle_delay` | `delivery_delay` | `dock_blocked` | `provider_silent` | `reject_spend` | `reject_split` | `guest_need`.

Repetir un giro es idempotente. El backend aplica el efecto inmediato comprobable; el nuevo plan pertenece al coordinador/T16.

**Respuesta 200**: `{ "ok": true }`.

### `POST /simulation/reset`

Crea otra ejecución. Sin cuerpo, o con cuerpo vacío, usa `INITIAL_FIXTURE` (por defecto `calm`: 12:00, Principal confirmado, sin incidente). La anterior queda inactiva y sus callbacks no alteran la nueva.

```json
{ "fixture": "calm" }
```

`fixture` opcional: `calm` | `normal` | `crisis` | `proposal` | `recovered` | `lounge_unavailable` | `pabellon_b_400`. La ejecución arranca siempre con `clock.paused: false`, aunque el fixture sea una instantánea pausada.

```json
{ "ok": true, "runId": "3bd0…", "planVersion": 1 }
```

### `POST /events`

Ingesta libre. El motor la encola y responde de inmediato; el coordinador corre en proceso.

```json
{ "source": "chat", "kind": "free_text", "text": "No se puede entrar por el Acceso Sur", "payload": {}, "actorId": "operador" }
```

- `source`: `chat` | `happyrobot` | `jury` | `human`. El reloj interno usa `clock` y no se envía por HTTP.
- `kind`: texto no vacío (`free_text`, `call_result`, un giro, un tipo de intervención…).
- `text`, `payload` y `actorId` son opcionales.

Una solicitud manual de llamada usa un payload validado y encola una tarea aunque el coordinador esté en modo `rules`:

```json
{
  "source": "human",
  "kind": "call_request",
  "actorId": "responsable",
  "text": "Llamar al recinto para confirmar el Pabellón B",
  "payload": {
    "area": "espacios",
    "counterpart": "Responsable de recinto - MADRING",
    "objective": "Confirmar Pabellón B para 450 invitados",
    "commitmentId": "c-pabB-v2"
  }
}
```

`area`, `counterpart` y `objective` son obligatorios. `commitmentId` es opcional y permite aplicar el resultado al compromiso correspondiente.

**Respuesta 202**: `{ "ok": true, "eventId": "…" }`.

Los giros (`POST /simulation/twists`) y las intervenciones (`POST /interventions`) validan el cuerpo de forma síncrona (400 si es inválido) y responden `200 { ok: true }` en cuanto el evento entra en la cola, igual que `POST /events`; el efecto se ve en `GET /state` cuando el coordinador lo procesa. Además se registran como eventos (`jury` / `human`). Tras un giro, el coordinador replanifica (Helmcode `deepseek-v4-flash` con harness `json` y `COORDINATOR_REASONING_EFFORT=low`: unos 20-40 s por plan; `tools` o `devin` según `.env`). Si `COORDINATOR_MODE=rules` o el LLM falla, queda el efecto determinista.

### `GET /actions`

Tareas abiertas de la ejecución activa (`pending`, `dispatching`, `dispatched`), para depurar la cola en la demo.

```json
{ "tasks": [{ "taskId": "7a31…", "area": "transporte", "kind": "call", "status": "pending", "planVersion": 2, "objective": "Confirmar desvío" }] }
```

## Workflows

Estos endpoints exigen `Authorization: Bearer <HAPPYROBOT_WEBHOOK_TOKEN>`. El secreto solo existe en entorno.

`eventId` identifica globalmente un mensaje y permite reintentos seguros. `runId` y `planVersion` son los entregados por el backend; no se sustituyen por IDs de sesión de HappyRobot.

### `POST /workflow/coordinator/proposals`

Salida estructurada del coordinador sobre una versión concreta:

```json
{
  "eventId": "coord-event-018f…",
  "runId": "3bd0…",
  "planVersion": 1,
  "reading": "El cierre deja 600 invitados sin ubicación.",
  "proposal": {
    "title": "Plan Sur escalonado",
    "summary": "Pabellón B para 450 y Lounge Sur para 150",
    "rationale": "Evita el traslado exterior.",
    "cost": 3200,
    "conditions": ["Lounge operativo a las 13:15"],
    "allocations": [{ "guestId": "guest-001", "spaceId": "pabellonB", "status": "proposed" }],
    "confirmedNorthGuestIds": [],
    "confirmedExternalTransferSeats": 0
  },
  "commitments": [{ "id": "c-pabB-v2", "title": "Reservar Pabellón B", "area": "espacios", "status": "aceptado_condiciones", "counterpart": "Recinto", "conditions": ["Confirmar reserva"] }],
  "actions": [{
    "actionId": "consultar-pabellon-b",
    "area": "espacios",
    "kind": "call",
    "objective": "Confirmar capacidad, hora, acceso y coste",
    "counterpart": "Responsable de recinto",
    "dueAt": 44400,
    "reason": "Sin espacio no se puede cerrar el resto del plan.",
    "dependsOn": [],
    "payload": { "candidateIds": ["pabellonB", "loungeSur"] }
  }],
  "unverified": ["Coste final del Lounge Sur"]
}
```

Reglas:

- `planVersion` es la versión leída; otra ejecución o versión devuelve `409` sin efectos.
- `area`: `espacios` | `catering` | `transporte` | `asistentes`.
- `kind`: `call` | `sms` | `email` | `manual`.
- `dueAt`: entero `0..86399`; `dependsOn` referencia `actionId` del mismo mensaje.
- Compromisos: `propuesto` | `en_consulta` | `aceptado_condiciones`; el coordinador nunca confirma.
- El backend valida aforo, acceso Norte, transporte, gasto y versión antes de persistir.
- El mismo `eventId` y cuerpo devuelve la respuesta original con `duplicate: true`; reutilizarlo con otro contexto devuelve `409`.

```json
{ "ok": true, "duplicate": false, "runId": "3bd0…", "planVersion": 2, "tasks": [{ "actionId": "consultar-pabellon-b", "taskId": "7a31…" }] }
```

### `POST /workflow/results`

Callback común, con el cuerpo exacto del contrato. HappyRobot no postea aquí: usa la
puerta traducida de abajo.

```json
{
  "eventId": "hr-event-018f…",
  "taskId": "7a31…",
  "runId": "3bd0…",
  "planVersion": 2,
  "status": "completed",
  "result": {
    "outcome": "accepted_with_conditions",
    "summary": "Lounge disponible desde las 13:15 por 900 €.",
    "conditions": ["Montaje termina a las 13:15"],
    "evidence": {
      "sessionId": "id-real-de-happyrobot",
      "callId": "call-espacios-1",
      "transcript": [{ "who": "humano", "text": "El montaje termina a las 13:15", "at": 31 }]
    },
    "data": { "spaces": [{ "id": "loungeSur", "availability": "condicionada", "readyAt": 47700, "cost": 900 }] }
  }
}
```

- `status`: `completed` | `failed` | `no_answer`.
- `outcome`: `accepted` | `accepted_with_conditions` | `rejected` | `no_answer` | `failed`.
- `evidence.sessionId` solo contiene un ID real descubierto en la cuenta.
- `data` no es un parche: el backend decide mediante adaptadores qué campos seguros mutan.
- El callback usa el contexto original de la tarea. Una tarea antigua responde `200` con `applied: false` y conserva evidencia. Un `eventId` duplicado no se aplica dos veces.

```json
{ "ok": true, "duplicate": false, "applied": true }
```

Si `applied` es true, el motor encola un evento interno `source: happyrobot`, `kind: call_result` y vuelve a pasar el coordinador.

Campos de `result.data` que el backend aplica al estado:

- `commitmentId`: el compromiso pasa a `aceptado_condiciones` (outcome `accepted*`) o `invalidado` (`rejected`).
- `guestGroups[]` (área `asistentes`, T14): `{ "id": "g-shuttles", "informedCount": 170, "acceptedCount": 120, "needs": "12 accesibilidad · pendiente" }`. Solo con `status: "completed"`. `informedCount` cuenta mensajes **entregados**, no enviados; `acceptedCount` los que han aceptado el cambio. Nunca bajan ni superan `count`. `needs` sustituye el texto del grupo si viene.
- `deliveries[]` (área `catering`, T12): `{ "id": "CAT-02", "status": "confirmada", "dockId": "muelleEste", "arriveAt": 47700, "services": 240, "note": "pendiente: recepción abre el muelle" }`. Solo con `status: "completed"`. `status` admite `confirmada`, `programada` o `bloqueada`; nunca `entregada` ni `invalidada`. `dockId` solo se aplica si el muelle existe y no está `cerrado`/`descartado`; una `confirmada` sobre un muelle cerrado queda en `programada`. Una entrega ya `entregada` no cambia.
- Un resultado `completed` con outcome `accepted` o `accepted_with_conditions` **no** relanza al coordinador: aplica su efecto y el plan sigue. `rejected`, `no_answer` y `failed` sí lo relanzan. Sin esta regla cada plan generaba 4-7 replanificaciones en cascada y la cola bloqueaba giros e intervenciones.
- El adaptador `sim` devuelve `guestGroups` para las tareas `asistentes` (95 % entregado y aceptado) para que el KPI «Informados» se mueva sin HappyRobot, y `deliveries[]` para las tareas `catering` (`confirmada` si el muelle está abierto, `bloqueada` si está cerrado; la entrega nombrada en el objetivo, o todas las no entregadas).

### `POST /workflow/happyrobot/results`

Misma autorización, misma respuesta y mismos efectos que `/workflow/results`, pero acepta el cuerpo nativo del workflow. Es la URL que el backend manda en `callbackUrl`, y el adaptador de T9 (`backend/src/actions/adapters/happyrobot-inbound.ts`) lo traduce al sobre de arriba antes de aplicarlo.

```json
{
  "call_id": "call-7a31…",
  "session_id": "id-real-de-happyrobot",
  "data": {
    "outcome": "aceptado con condiciones",
    "summary": "Lounge disponible desde las 13:15 por 900 €.",
    "conditions": ["Montaje termina a las 13:15"],
    "transcript": [{ "role": "assistant", "content": "¿Tienen libre el Lounge?", "at": 4 }]
  }
}
```

Qué tolera y qué no:

- Los campos valen sueltos o anidados hasta dos niveles en `data`, `output`, `result`, `payload`, `extracted`, `variables`, `evidence`, `call` o `context`. El sobre estricto de `/workflow/results` también se acepta aquí.
- `taskId` vale también como `task_id`; si no viene, se recupera del `callId` (`call-<taskId>`). Sin ninguno de los dos, `400`.
- `runId` y `planVersion` **se ignoran del cuerpo** y se leen de la tarea: una sesión de HappyRobot no sabe en qué ejecución vive. Una tarea de otra ejecución o versión responde `200` con `applied: false`.
- Sin `eventId`, la clave de idempotencia es `hr-<sessionId>`, o `hr-<taskId>` si tampoco hay sesión. Reenviar el mismo webhook devuelve `duplicate: true` sin aplicarlo dos veces.
- `outcome` se normaliza desde texto libre en español o inglés (`aceptado`, `con condiciones`, `rechazado`, `no contesta`, `buzón`, `error`) y también desde `accepted: true|false` o `answered: false`. `status` se deriva del `outcome`. Si no hay nada clasificable, `400`: no se inventa un acuerdo.
- La transcripción admite `{ role | speaker | who }` con `{ content | text | message }`, o un texto plano con `Agente: …` por líneas.

### Salida del backend hacia HappyRobot

Cuando hay `HAPPYROBOT_HOOK_*` para el área, el ejecutor hace `POST` a esa URL con `Authorization: Bearer <HAPPYROBOT_API_KEY>`:

```json
{
  "taskId": "7a31…",
  "runId": "3bd0…",
  "planVersion": 2,
  "area": "transporte",
  "objective": "Confirmar el nuevo punto de parada",
  "counterpart": "Transportes Ibéricos",
  "reason": "El Acceso Sur está cerrado",
  "callId": "call-7a31…",
  "phone_number": "+34600000000",
  "contact": { "id": "test-transport-manager", "role": "transport-manager", "phone": "+34600000000", "email": null },
  "data": { "commitmentId": "c-transporte-v2" },
  "situation": { "simSeconds": 43200, "planVersion": 2, "coordinatorStatus": "replanificando" },
  "contact.phone": "+34600000000",
  "situation.simSeconds": 43200,
  "callbackUrl": "https://demo.example/workflow/happyrobot/results"
}
```

El workflow responde por el `callbackUrl`, no por el cuerpo de este POST. Sin hook, el adaptador `sim` finge el resultado unos segundos de reloj después. Si el hook acepta el POST pero no hay callback en 180 s de reloj, el backend registra un resultado `no_answer` (`eventId: timeout-<taskId>`), la llamada pasa a `sin_respuesta` y el coordinador vuelve a correr.

Los campos anidados van además repetidos en plano (`"contact.phone"`, `"situation.simSeconds"`), porque un workflow que declara sus parámetros con punto puede extraerlos como clave literal en vez de recorrer el objeto. Duplicarlos evita un primer run vacío y no molesta a quien lea la forma anidada.

`contact.phone` y `phone_number` salen del entorno, no del fixture (que es sintético y público): `HAPPYROBOT_TEST_PHONE`, en E.164 (`+34600000000`, sin espacios ni guiones). El formato se valida al arrancar: un número mal formado, o su ausencia habiendo hooks configurados, impide el arranque en vez de fallar en mitad de la demo.
