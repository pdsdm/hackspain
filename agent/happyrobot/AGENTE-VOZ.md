<!--
  PARA EL EQUIPO: esto es lo que hay que configurar DENTRO de HappyRobot (prompt, variables
  y tools del nodo de voz). Cómo se lanza la llamada desde fuera está en SPEC.md, y el
  formato exacto de ida y vuelta en docs/api-contract.md.
-->

# Agente de voz de HappyRobot: prompt, variables y tools

El backend hace `POST` al hook del área y el workflow decide el resto. Este documento es
el contenido del nodo de voz: qué contexto recibe, qué dice y por dónde devuelve lo que
ha conseguido.

Regla que lo gobierna todo: **el agente de voz recoge información y acuerdos
condicionales, no confirma el plan.** Quien decide es el coordinador, después, con lo que
esta llamada le traiga.

## 1. Variables que recibe

Las manda el backend en el cuerpo del `POST` al hook
([`happyrobot.ts`](../../backend/src/actions/adapters/happyrobot.ts)). En el builder
aparecen como variables del trigger; aquí se escriben como `{{variable}}`, sustitúyelo por
la notación que use tu workflow.

| Variable | Qué es | Qué hace el agente con ella |
|---|---|---|
| `contact.phone` | Teléfono en E.164 (`+34600000000`) | A quién llama. Si llega `null`, el workflow decide el destino |
| `contact.role` | `venue-manager`, `catering-manager`, `transport-manager`, `reception-manager` | Con quién cree que habla, para presentarse |
| `counterpart` | Nombre de la contraparte («Responsable de recinto — MADRING») | Cómo se dirige a ella |
| `objective` | El encargo concreto de esta llamada | **Es el objetivo de la conversación.** Va literal al prompt |
| `reason` | Por qué hace falta ahora | Justifica la urgencia si se la piden |
| `area` | `espacios`, `catering`, `transporte`, `asistentes` | Elige el bloque de guion específico (§3) |
| `situation.simSeconds` | Hora del escenario en segundos desde medianoche (`44100` = 12:15) | Calcula cuánto falta para abrir (13:00 = `46800`) |
| `situation.coordinatorStatus` | Estado del coordinador | Contexto, no se dice en voz alta |
| `callId` | `call-<taskId>` | **Se devuelve tal cual** en el resultado |
| `taskId` | Id de la tarea en el backend | **Se devuelve tal cual.** Nunca se menciona en voz alta |
| `callbackUrl` | `https://<host>/workflow/happyrobot/results` | A dónde postea el resultado al colgar |
| `runId`, `planVersion` | Contexto de la ejecución | **No hace falta devolverlos**: el backend los lee de la tarea e ignora lo que venga en el cuerpo |

Ninguna de estas variables lleva secretos. El token del callback
(`HAPPYROBOT_WEBHOOK_TOKEN`) se configura en HappyRobot, no viaja en el payload.

## 2. Prompt base

Vale para las cuatro áreas. El bloque específico del área se añade debajo (§3).

```text
Eres el agente de {{area}} del centro de operaciones de Nexo Events durante una crisis de
hospitalidad en MADRING, el circuito de Fórmula 1 de IFEMA Madrid. Hablas por teléfono, en
español de España, en nombre de la organización del programa de hospitalidad.

TU ENCARGO EN ESTA LLAMADA
{{objective}}

POR QUÉ AHORA
{{reason}}

CON QUIÉN HABLAS
{{counterpart}}. Preséntate por tu nombre de servicio y por la empresa una sola vez, al
principio, y ve al asunto.

SITUACIÓN
Son las {{situation.simSeconds}} en el reloj del evento. La hospitalidad abre a las 13:00.
Hay 600 invitados afectados. MADRING Norte y MADRING Sur no están conectados por dentro:
mover a alguien de una zona a otra exige un traslado por el exterior, nunca ir andando.

LO QUE NO PUEDES HACER
- No confirmas nada. Recoges disponibilidad y condiciones; el coordinador decide después.
  Haber hablado no es un acuerdo.
- El coste es informativo durante la crisis. Recoge la cifra y sus condiciones sin imponer
  un límite ni pedir aprobación económica. No inventes importes ni confundas una oferta con un gasto comprometido.
- No inventas. Un dato que no aparezca en la conversación se queda vacío. No lo deduzcas
  de lo que sabes del recinto.
- No das datos personales de invitados ni detalles del incidente que no hagan falta.

COSTES
Si la contraparte acepta una reserva firme, sin condiciones pendientes, y acuerda explícitamente su precio,
el extractor puede devolver `result.data.committedCost` con el importe de esta tarea. No uses el total
estimado del plan, una cotización ni un importe inventado. La contabilidad no realiza pagos.

CÓMO CONVERSAS
- Una pregunta cada vez. Frases cortas: esto es voz, no un correo.
- Repite en voz alta cada cifra y cada hora que te den, para confirmarla («450 personas,
  disponible a las 13:15, ¿correcto?»).
- Una disponibilidad con condiciones es un sí con condiciones, nunca un no. Recoge la
  condición con las palabras de quien la dice.
- Si te remiten a otra persona, pide nombre y teléfono y cierra la llamada.
- Si piden hablar con una persona, dilo claro, registra lo que tengas y transfiere.
- Si no entiendes algo dos veces seguidas, pide que te lo repita despacio. A la tercera,
  anótalo como no entendido en vez de adivinar.

CÓMO CIERRAS
Antes de colgar, resume en una frase lo que te llevas y lo que queda pendiente, y
confírmalo con la contraparte. Después llama SIEMPRE a la tool registrar_resultado, en
todos los casos: acuerdo, negativa, buzón de voz o llamada cortada. Si no la llamas, el
backend da la llamada por perdida a los tres minutos y replanifica sin tus datos.
Nunca leas en voz alta el JSON, los identificadores ni el nombre de las tools.
```

## 3. Los cuatro agentes

Son cuatro workflows, uno por área, cada uno con su hook. Comparten el prompt base de §2
y las tools de §4; lo que cambia es este bloque, que se pega debajo.

Los cuatro casos de uso salen de [`escenario/escenario.md`](../../escenario/escenario.md)
§6.2–6.5, con sus cifras. Cada uno tiene **una trampa**: el error concreto que distingue
un agente que parece funcionar de uno que sirve. Están marcadas.

| Agente | Hook | Canal | Habla con | Sin esto, no avanza |
|---|---|---|---|---|
| Espacios | `HAPPYROBOT_HOOK_ESPACIOS` | Voz | Responsable de recinto | Todo lo demás: sin sitio no hay plan |
| Catering | `HAPPYROBOT_HOOK_CATERING` | Voz | Responsable de catering | 600 servicios apuntando a un muelle cerrado |
| Transporte | `HAPPYROBOT_HOOK_TRANSPORTE` | Voz | Coordinador de transporte | 180 personas llegando a un acceso que ya no vale |
| Asistentes | `HAPPYROBOT_HOOK_ASISTENTES` | **SMS**, voz solo por excepción | Invitados y recepción | 600 personas con la instrucción antigua |

> **El host del hook no es el que ves en el navegador.** `platform.happyrobot.ai/hooks/<id>`
> es el panel web: responde `307` hacia `/auth/login` y el `fetch` de Node se cae con
> `fetch failed`, sin decir por qué. La URL que acepta el POST es
> `https://workflows.platform.eu.happyrobot.ai/hooks/<id>`. Verificado el sábado 19
> contra `my5asz8ibzd3`: el panel devuelve 307, el de workflows devuelve 200.

### 3.1. Espacios — voz

**Ya está escrito**, no lo reescribas:
[`backend/src/agents/spaces/prompt.ts`](../../backend/src/agents/spaces/prompt.ts)
(`SYSTEM_PROMPT`). Pégalo debajo del prompt base **quitándole la sección «FORMATO DE
SALIDA»**: en voz la salida no es un JSON hablado, es `registrar_resultado`.

**Caso de uso.** Reubicar a 600 invitados para abrir a las 13:00. Candidatos: Pabellón B
(Sur, 450), Lounge de Fan Zone Sur (Sur, 150), Pabellón Norte C (Norte, 600, no antes de
las 13:45).

**Orden fijo de preguntas:** capacidad → zona → hora de montaje → accesos y accesibilidad
→ señal de carrera → coste.

> **La trampa:** «el montaje no termina hasta las 13:15» **no es un no**, es una hora de
> disponibilidad. Un agente que lo apunta como descarte tira el plan Sur entero. Lo mismo
> con la zona contraria: no se descarta, se anota, porque el coordinador puede acordar un
> traslado exterior.

`data`: el objeto `spaces[]` de §4.2.

### 3.2. Catering — voz

**Caso de uso.** Hay 600 servicios preparados y dos entregas contratadas, de 360 y 240, a
un muelle que pertenece al pabellón cerrado. Hay que conseguir que el proveedor reparta el
servicio siguiendo al plan nuevo (por ejemplo 450 en Pabellón B y 150 en Lounge Sur) sin
perder los requisitos alimentarios ya registrados.

**Orden de preguntas:**
1. Si pueden dividir el servicio en el reparto que les propones, y con qué horarios.
2. Si mantienen los requisitos alimentarios de cada grupo en esa división.
3. Por qué muelle o acceso necesitan entrar para cada entrega.
4. Si necesitan que alguien les abra, y a qué hora.
5. Personal que aportan ellos y personal que esperan de nosotros.
6. Sobrecoste de la redistribución.

> **La trampa:** el «sí» del proveedor **casi nunca es el final**. En el escenario contesta
> «sí, pero la segunda entrega necesita el muelle este de Sur y que recepción lo abra». Eso
> no es un acuerdo cerrado: es un acuerdo con dos dependencias, una con el recinto y otra
> con recepción. El agente tiene que sacar **quién** abre y **a qué hora**, o el catering
> se dará por confirmado y la entrega fallará. Y nunca improvises sobre alérgenos o
> ingredientes: si el menú alternativo cambia, eso es una condición, no un detalle.

`data`:

```json
{
  "deliveries": [
    { "id": "entrega-1", "servings": 450, "spaceId": "pabellonB", "dockId": "muelle-sur",
      "eta": "12:50", "status": "condicionada",
      "conditions": ["Recepción debe abrir el muelle este"] }
  ],
  "dietaryPreserved": true,
  "extraCost": 400,
  "needsFromUs": ["Una persona de recepción en el muelle este a las 12:45"]
}
```

### 3.3. Transporte — voz

**Caso de uso.** Cuatro shuttles con 45 pasajeros cada uno, 180 en total, van camino del
acceso Sur con la instrucción antigua. Hay que acordar un punto de llegada compatible con
la ubicación nueva, y si el plan acaba en Norte, una ruta por el exterior.

**Orden de preguntas:**
1. Dónde está ahora cada vehículo y a qué hora llega con la ruta actual.
2. Si pueden **parar** en el punto que propones (no si pueden llegar: si pueden parar).
3. Cuánto tarda el desvío y qué hora de llegada nueva sale.
4. Si el punto admite embarque accesible.
5. Si el plan pasa a Norte: si el conductor acepta la ruta exterior, y cuánto suma.
6. Sobrecoste, si lo hay.

> **La trampa:** «el vehículo puede llegar, pero esa entrada no permite parar un autocar».
> **Llegar y parar no son lo mismo**, y es exactamente el fallo que el escenario pone de
> ejemplo. Si el agente lo apunta como confirmado, mandamos 45 personas a un sitio donde el
> autocar no puede descargar. Cuando pase esto: descarta el punto, dilo como no disponible
> y pide un punto autorizado alternativo. Un cambio a Norte no está hecho hasta que **el
> conductor** lo acepta, no cuando lo acepta la centralita.

`data`:

```json
{
  "shuttles": [
    { "id": "shuttle-2", "stopId": "acceso-este-sur", "accepted": false,
      "reason": "La entrada no admite parada de autocar",
      "etaChange": null, "accessibleBoarding": null }
  ],
  "alternativeStops": ["acceso-sur-principal"],
  "extraCost": 0
}
```

### 3.4. Asistentes — SMS, y voz solo por excepción

**Caso de uso.** 600 invitados con la instrucción antigua, en tres grupos que **no reciben
el mismo mensaje**:

| Grupo | Personas | Situación | Qué se le dice |
|---|---|---|---|
| `g-acceso` | 90 | Ya en el control de acceso Sur | Que permanezcan ahí; el equipo les acompañará cuando el espacio esté listo |
| `g-shuttles` | 180 | En los cuatro shuttles | Que su acceso sigue siendo Sur y que no intenten entrar por Norte |
| `g-propios` | 330 | Llegando por su cuenta | Lo mismo, más la hora de apertura vigente |

Aparte, dentro de `g-propios` hay 12 personas con necesidad de accesibilidad registrada y
38 con necesidad alimentaria (4 están en los dos grupos). A las de accesibilidad **se las
llama**, no se les manda un SMS: hay que confirmar que la alternativa cubre su requisito.

> **La trampa:** **no se comunica una ubicación que no está confirmada.** El escenario es
> explícito: «Te enviaremos el pabellón asignado cuando quede confirmado». Si el agente
> adelanta «vais al Pabellón B» y luego el plan cambia a Norte, hemos desinformado a 600
> personas y el reaviso llega tarde. Se comunica lo que ya es cierto (la zona, la hora, que
> no crucen a Norte) y se promete el resto. Segundo matiz: **mensaje enviado, mensaje
> entregado, cambio aceptado y asistencia completada son cuatro resultados distintos**; no
> devuelvas `accepted` por haber enviado un SMS.

`data`:

```json
{
  "notifications": [
    { "groupId": "g-acceso", "channel": "sms", "sent": 90, "delivered": 88,
      "accepted": 0, "status": "entregado" }
  ],
  "replies": [
    { "guestId": "guest-013", "text": "Necesito acceso con silla de ruedas", "needsFollowUp": true }
  ]
}
```

> Este agente es el único que en el backend sale ya como `sms`: está fijado en
> [`replan.ts:269`](../../backend/src/agents/coordinator/replan.ts#L269). Si solo vas a
> montar un canal de texto, es este.

### 3.5. Si te falta tiempo

La regla de recorte del [plan del sábado](../../docs/plan-sabado.md): **Espacios es el
único que no se recorta.** Es el que bloquea a los demás y el que tiene guion cerrado y
probado. Catering y Transporte pueden quedarse en `sim` etiquetado en pantalla, y el SMS
de Asistentes es lo primero que cae.

## 4. Tools

### 4.1. `registrar_resultado` — obligatoria

Es la única que cierra el círculo. Hace `POST {{callbackUrl}}` con
`Authorization: Bearer <HAPPYROBOT_WEBHOOK_TOKEN>` y `Content-Type: application/json`.

> **Usa `{{callbackUrl}}` tal como llega, no lo escribas a mano.** El backend manda
> `…/workflow/happyrobot/results`; si apuntas a `/workflow/results`, esa puerta exige el
> sobre estricto del contrato (con `status` y `result` anidado) y este cuerpo plano se
> lleva un `400`. Y el Bearer tiene que ser el `HAPPYROBOT_WEBHOOK_TOKEN` real: con el de
> relleno la vuelta es `401` y la tarea muere en `no_answer` a los 180 s.

**Cuándo:** siempre, justo antes de colgar, también si no contestan.

```json
{
  "name": "registrar_resultado",
  "description": "Registra el resultado de la llamada en el centro de operaciones. Llámala siempre antes de colgar, incluso si no han contestado o no has conseguido nada.",
  "parameters": {
    "type": "object",
    "required": ["taskId", "callId", "outcome", "summary"],
    "properties": {
      "taskId":  { "type": "string", "description": "El taskId que te han dado, tal cual" },
      "callId":  { "type": "string", "description": "El callId que te han dado, tal cual" },
      "sessionId": { "type": "string", "description": "Id de esta sesión de HappyRobot" },
      "outcome": {
        "type": "string",
        "enum": ["accepted", "accepted_with_conditions", "rejected", "no_answer", "failed"],
        "description": "accepted: acepta sin condiciones. accepted_with_conditions: acepta pero algo queda pendiente. rejected: dice que no. no_answer: no contesta, buzón o comunica. failed: la llamada se cortó o no se pudo hacer."
      },
      "summary": {
        "type": "string",
        "description": "Una o dos frases con lo esencial, con las cifras y horas que te hayan dado. En español."
      },
      "conditions": {
        "type": "array", "items": { "type": "string" },
        "description": "Lo que falta para poder confirmarlo, con las palabras de la contraparte. Vacío si no hay condiciones."
      },
      "data": {
        "type": "object",
        "description": "Datos estructurados del área. Para espacios, el objeto del apartado 4.2."
      }
    }
  }
}
```

Notas del contrato, que el adaptador de entrada ya cubre
([`happyrobot-inbound.ts`](../../backend/src/actions/adapters/happyrobot-inbound.ts)):

- **`outcome` es el único campo que no se puede fallar.** Si no llega nada clasificable,
  el backend responde `400` y no inventa un acuerdo: la llamada acaba en `no_answer` por
  timeout. El enum de arriba es el seguro; aun así el adaptador acepta texto libre en
  español («aceptado con condiciones», «no contesta», «rechazado»).
- **El `taskId` se puede omitir** si mandas el `callId`: el backend lo deduce de
  `call-<taskId>`. Manda los dos y no dependas de eso.
- **`runId` y `planVersion` no los mandes.** Se leen de la tarea.
- **La transcripción no la construyas a mano.** Si el workflow puede adjuntarla, mándala
  en `transcript` como lista de `{ "role": "assistant" | "user", "content": "…" }`; el
  backend la mapea a la ficha de la llamada. Si no, no pasa nada.
- **Reintentar es seguro.** Sin `eventId`, la clave de idempotencia es la sesión de
  HappyRobot: el mismo webhook dos veces no aplica el resultado dos veces.

### 4.2. `data` para Espacios

El esquema es el de T11 ([`types.ts`](../../backend/src/agents/spaces/types.ts),
`SpacesAnswer`). Un objeto por espacio consultado, **incluidos los que te hayan rechazado**:

```json
{
  "spaces": [
    {
      "id": "pabellonB",
      "availability": "condicionada",
      "capacity": 450,
      "zone": "sur",
      "readyAt": "13:15",
      "access": "Acceso Sur, accesible",
      "raceFeed": "si",
      "cost": 1500,
      "conditions": ["El montaje no termina hasta las 13:15"]
    }
  ],
  "notes": ["Lo que han dicho y no encaja en los campos de arriba"]
}
```

`null` para lo que no se haya dicho, nunca un cero ni un valor aproximado. `availability`:
`disponible` | `condicionada` | `no_disponible` | `sin_respuesta`.

> **Aviso honesto:** hoy el backend guarda `data` entero como evidencia y solo lee de ahí
> `commitmentId`. El extractor de Espacios existe y está probado, pero todavía **no está
> enganchado al callback**. Mandar el esquema correcto desde ya no cuesta nada y evita
> rehacer el workflow cuando se conecte.

### 4.3. `reportar_novedad` — opcional, recomendable

Para lo que la contraparte suelta y no tiene que ver con el objetivo, pero cambia el
mundo: «el Acceso Sur lleva cerrado veinte minutos». Sin esto, ese dato se pierde hasta
que alguien lo lee en el resumen.

Hace `POST <base>/events` (sin token) con:

```json
{ "source": "happyrobot", "kind": "free_text", "actorId": "{{area}}",
  "text": "El Acceso Sur está cerrado desde las 12:10", "payload": { "callId": "{{callId}}" } }
```

Responde `202` al instante y el coordinador lo procesa por su cuenta: **el agente no
espera respuesta y sigue la conversación**. Úsala como mucho una o dos veces por llamada.

### 4.4. Transferencia a humano

La resuelve la plataforma, no el backend. La única regla nuestra: **llama a
`registrar_resultado` con lo que tengas antes de transferir**, o la tarea se queda
colgando hasta el timeout.

### 4.5. Lo que NO le des

- **Una tool que lea `GET /state`.** Son decenas de kilobytes de JSON y el agente de voz
  no decide el plan. Solo le añade latencia y le da material para improvisar.
- **Una tool que escriba en el plan** (aprobar gasto, confirmar un espacio). Eso es del
  coordinador y del responsable humano; que el agente de voz pueda hacerlo rompe la regla
  de que una llamada no confirma nada.

## 5. Comprobación antes de la demo

1. `GET /actions` da un `taskId` de una tarea despachada.
2. La tool dispara contra `{{callbackUrl}}` y responde `{ "ok": true, "applied": true }`.
3. Repetir el mismo webhook responde `"duplicate": true` y no cambia nada.
4. En el panel: la llamada pasa a `terminada`, el agente del área muestra el resumen y el
   coordinador vuelve a correr.
5. Colgar sin llamar a la tool: a los 180 s de reloj la llamada queda en `sin_respuesta`.
   Es el comportamiento correcto, y conviene verlo una vez antes que en directo.

---

## 6. Tool calling o MCP: cuál usar aquí

Las dos cosas resuelven «el modelo ejecuta una acción del mundo real», y por eso se
confunden. La diferencia está en **quién posee el catálogo de herramientas y cuándo se
descubre**.

- **Tool calling (webhook):** las herramientas se declaran en el propio workflow. El
  modelo emite una llamada, la plataforma hace un `POST` y se acabó. Contrato fijo,
  acordado de antemano.
- **MCP:** el agente abre una sesión contra un servidor, **le pregunta qué herramientas
  tiene** y a partir de ahí las usa. El catálogo vive en el servidor y puede cambiar sin
  tocar el agente.

| | Tool calling | MCP |
|---|---|---|
| Descubrimiento | Ninguno: lo que declaraste | El servidor publica el catálogo al conectar |
| Latencia por acción | Un `POST` | Handshake + listado + llamada, sobre sesión viva |
| Quién cambia el contrato | Tú, en el builder, y redespliegas | El servidor, sin tocar el agente |
| Autenticación | Bearer estático en la cabecera | Sesión, normalmente OAuth |
| Cuando falla | Un código HTTP en el log | Puede fallar el transporte, la sesión o la tool |
| Encaja con | 2–5 acciones estables | Decenas de acciones que cambian solas |

**Para este agente de voz: tool calling.** Tres razones concretas, no de principio:

1. **Son dos acciones y no van a cambiar.** `registrar_resultado` y `reportar_novedad`. El
   descubrimiento dinámico de MCP no compra nada cuando el catálogo cabe en una línea.
2. **En voz, la latencia se oye.** Un silencio de dos segundos en mitad de una frase es un
   fallo visible para el jurado. Un `POST` con `Bearer` es lo más corto que hay.
3. **Un modo de fallo menos, y ya lo hemos visto.** En esta sesión el MCP de HappyRobot da
   404 y el de workflows pide autorización. Eso, a las 11:00 del domingo y en directo, es
   exactamente el riesgo que no queremos. El webhook falla de una sola manera y deja un
   código de estado en el log.

**Dónde sí tiene sentido MCP en este proyecto, y de hecho ya se usa:**

- **Construir los workflows**, no ejecutarlos: el `.mcp.json` del repo apunta a
  `mcp.platform.happyrobot.ai/workflows/mcp` para que un agente de código monte y edite
  workflows. Ahí el catálogo es grande, cambia y no hay nadie esperando al teléfono.
- **El coordinador en proceso**, que ya corre con un harness de function calling local
  (`COORDINATOR_HARNESS=tools`, D12). Si algún día sus consultas al mundo se sirven desde
  fuera, ese es el sitio: decenas de tools, sin latencia de voz encima.

La regla corta: **MCP en tiempo de construcción y para el cerebro, tool calling para la
boca.** Si alguien propone lo contrario a menos de 24 horas de la entrega, el argumento no
es de arquitectura, es que la llamada tiene que sonar.
