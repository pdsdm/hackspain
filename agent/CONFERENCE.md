Twilio Conference + agente de voz con GPT Live (Realtime)

Guía práctica para montar una llamada con tres participantes:

Cliente ───────────────┐
                       │
Humano ────────────────┼──> Twilio Conference
                       │
GPT Live Voice Agent ──┘

La idea es que Twilio sea el mezclador de audio y que el agente de voz sea otro participante de la conferencia. El audio del leg del agente se conecta mediante un Bidirectional Media Stream a un servidor WebSocket, y ese servidor conecta el audio con OpenAI Realtime / GPT Live.

Esta arquitectura es especialmente útil para una transferencia "warm transfer": la IA puede seguir presente mientras entra el humano y, cuando el humano ya ha tomado el control, puedes sacar la IA de la conferencia.

1. Arquitectura

                           ┌──────────────────────────┐
                           │      TU BACKEND          │
                           │                          │
                           │  REST + WebSocket        │
                           └────────────┬─────────────┘
                                        │
                         audio bidireccional
                                        │
                                        ▼
Cliente ────────┐              ┌──────────────────────┐
                │              │ OpenAI Realtime     │
                │              │ / GPT Live          │
                │              │                     │
                │              │ STT + LLM + TTS     │
                │              └──────────────────────┘
                │                         ▲
                │                         │
                ▼                         │
        ┌─────────────────────────────────────────┐
        │              TWILIO CONFERENCE           │
        │                                          │
        │  Cliente     Humano      AI Agent        │
        └───────┬─────────┬───────────┬────────────┘
                │         │           │
                │         │           └── Twilio Call Leg
                │         │               <Connect><Stream>
                │         │
                │         └── PSTN / SIP / Client
                │
                └── PSTN / Twilio

Twilio crea una conferencia cuando un participante entra mediante <Dial><Conference> o cuando se añade un participante a través de la API de participantes. Una conferencia puede gestionar hasta 250 participantes. citeturn0search1turn0search2

2. Componentes

Necesitas:

Una cuenta de Twilio.

Un número de teléfono de Twilio.

Un servidor Node.js público con HTTPS/WSS.

Una API key de OpenAI.

El modelo/sesión de voz de OpenAI Realtime.

El SDK de Twilio para Node.js.

fastify o express.

WebSockets.

Instalación:

npm init -y

npm install fastify @fastify/formbody @fastify/websocket twilio ws dotenv

3. Variables de entorno

Crea .env:

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+34XXXXXXXXX

OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

PUBLIC_HOST=your-domain.com

HUMAN_PHONE_NUMBER=+34XXXXXXXXX

No expongas TWILIO_AUTH_TOKEN ni OPENAI_API_KEY al navegador.

OpenAI documenta el uso de WebSockets para conectar un servidor con una sesión de voz Live/Realtime; la conexión principal transporta audio y eventos JSON en ambas direcciones. citeturn0search5

4. Crear la conferencia

Twilio no requiere que primero crees una conferencia vacía mediante un endpoint independiente.

Una forma sencilla es hacer que el primer participante entre con:

<Response>
  <Dial>
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="false">
      room-123
    </Conference>
  </Dial>
</Response>

Cuando el primer participante entra, Twilio crea la instancia de Conference.

El nombre:

room-123

funciona como friendlyName.

La conferencia se puede controlar después mediante la API REST de Twilio.

5. Entrada del cliente

Supongamos que el número de Twilio recibe una llamada.

Endpoint:

POST /incoming-call

Código:

fastify.post("/incoming-call", async (request, reply) => {
  const conferenceName = `call-${Date.now()}`;

  const twiml = `
    <Response>
      <Dial>
        <Conference
          startConferenceOnEnter="true"
          endConferenceOnExit="false"
          statusCallback="https://${process.env.PUBLIC_HOST}/conference-events"
          statusCallbackEvent="start end join leave">
          ${conferenceName}
        </Conference>
      </Dial>
    </Response>
  `;

  reply.type("text/xml").send(twiml);
});

Guarda conferenceName asociado al CallSid del cliente en tu base de datos.

Por ejemplo:

customerCallSid
CAxxxxxxxx
       │
       └── conferenceName
           call-1728392938

6. Añadir al agente GPT Live como participante

Aquí está la parte importante.

El agente no tiene por qué ser el mismo call leg que recibió inicialmente al cliente.

Puedes crear un nuevo call leg de Twilio que entre en la misma conferencia:

const participant =
  await twilioClient.conferences(conferenceName)
    .participants
    .create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.TWILIO_PHONE_NUMBER,
      label: "ai-agent"
    });

Sin embargo, para el agente necesitamos que ese nuevo call leg reciba TwiML que conecte su audio a nuestro WebSocket.

Por eso, en producción es preferible usar un endpoint TwiML específico para el AI leg.

Ejemplo conceptual:

await twilioClient.conferences(conferenceName)
  .participants
  .create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.AI_TWILIO_NUMBER,
    label: "ai-agent"
  });

El número AI_TWILIO_NUMBER debe tener configurado:

POST /ai-leg

7. TwiML del AI leg

Cuando Twilio establece el call leg del agente:

POST /ai-leg

respondes:

<Response>
  <Connect>
    <Stream url="wss://your-domain.com/ai-media-stream">
      <Parameter name="role" value="ai-agent"/>
    </Stream>
  </Connect>
</Response>

La diferencia importante es que este leg ya pertenece a la conferencia.

La secuencia queda:

Twilio Conference
       │
       │ audio
       ▼
AI Call Leg
       │
       │ <Connect><Stream>
       ▼
wss://your-domain.com/ai-media-stream
       │
       ▼
OpenAI Realtime

Twilio soporta Media Streams bidireccionales en los que tu WebSocket recibe audio de la llamada y puede devolver audio para reproducirlo en esa llamada. citeturn0search9

Twilio también documenta específicamente la integración de agentes de voz con OpenAI Realtime mediante <Connect><Stream>. citeturn0search10

8. Servidor WebSocket

Ejemplo base:

fastify.register(websocket);

fastify.get("/ai-media-stream", { websocket: true }, async (socket, request) => {

  console.log("Twilio Media Stream conectado");

  // 1. Conectar con OpenAI Realtime
  // 2. Recibir eventos de Twilio
  // 3. Enviar audio de Twilio a OpenAI
  // 4. Recibir audio de OpenAI
  // 5. Enviar audio de OpenAI de vuelta a Twilio

});

La arquitectura del WebSocket es:

Twilio
  │
  │ media payload
  ▼
Node.js WebSocket
  │
  │ audio
  ▼
OpenAI Realtime
  │
  │ audio.delta
  ▼
Node.js WebSocket
  │
  │ media payload
  ▼
Twilio

9. Formato de audio

El audio telefónico de Twilio normalmente utiliza:

G.711 μ-law
8000 Hz
mono
base64

Por eso el servidor tiene que respetar el formato de audio esperado por la sesión de OpenAI Realtime.

No conviene hacer conversiones innecesarias.

La regla práctica es:

Twilio media
   ↓
μ-law / 8 kHz
   ↓
OpenAI Realtime input audio
   ↓
Realtime output audio
   ↓
μ-law / 8 kHz
   ↓
Twilio media

Si tu configuración de Realtime utiliza otro formato, realiza la conversión explícitamente.

10. Conectar con OpenAI Realtime

El servidor debe abrir una conexión WebSocket autenticada con OpenAI.

Conceptualmente:

const ws = new WebSocket(
  "wss://api.openai.com/v1/live/sessions",
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  }
);

La API de Live/Realtime utiliza eventos JSON para controlar la sesión y eventos de audio para transmitir el flujo de voz. Consulta la referencia actual de la API antes de fijar nombres de eventos o modelos en producción.

11. Configuración inicial del agente

Al establecer la conexión con OpenAI, configura:

instructions
voice
input audio format
output audio format
turn detection
tools

Un ejemplo conceptual de instrucciones:

Eres un agente telefónico.

Habla en español.

Tu objetivo es ayudar al cliente y recopilar la información
necesaria.

Si el cliente solicita hablar con una persona humana,
utiliza la herramienta transfer_to_human.

Durante una transferencia:
1. Informa al cliente de que vas a incorporar a una persona.
2. Mantente en la conferencia mientras entra el humano.
3. Cuando el humano confirme que está listo, deja de intervenir.

12. Tool para transferir al humano

La IA puede tener una herramienta:

{
  "type": "function",
  "name": "transfer_to_human",
  "description": "Añade un agente humano a la conferencia actual.",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": []
  }
}

Cuando GPT Live ejecuta:

transfer_to_human()

tu backend hace:

GPT Live
   │
   ▼
tool call
   │
   ▼
Node.js
   │
   ▼
Twilio Participants API
   │
   ▼
Human Call Leg
   │
   ▼
Conference

13. Añadir al humano

Twilio permite añadir un participante a una conferencia activa utilizando:

POST
/Accounts/{AccountSid}/Conferences/{ConferenceSid}/Participants

La API puede crear una llamada saliente y añadirla a la conferencia. También permite configurar label, muted, startConferenceOnEnter, endConferenceOnExit, callbacks y otras propiedades. citeturn0search0

Ejemplo Node.js:

async function addHumanToConference(conferenceSid) {

  const participant =
    await twilioClient.conferences(conferenceSid)
      .participants
      .create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.HUMAN_PHONE_NUMBER,
        label: "human-agent",
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        beep: "onEnter"
      });

  return participant;
}

14. Estado durante la transferencia

Antes de llamar al humano:

CLIENT
   │
   ├──────────────┐
   │              │
   ▼              ▼
 AI              Conference

Después:

                    ┌───────────────┐
                    │  Conference   │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
           Cliente          AI          Humano

En este momento tienes una transferencia "warm".

El humano puede escuchar al cliente y a la IA.

15. Sacar la IA cuando entra el humano

Una vez que el humano confirma que puede hacerse cargo:

async function removeAiFromConference(conferenceSid, aiCallSid) {

  await twilioClient
    .conferences(conferenceSid)
    .participants(aiCallSid)
    .remove();
}

El resultado:

Antes:

Cliente ─────┐
             ├── Conference ── AI
Humano ──────┘


Después:

Cliente ─────┐
             ├── Conference
Humano ──────┘

AI ── X

La API de participantes permite eliminar participantes activos de una conferencia. citeturn0search0

16. Cómo detectar que el humano ha contestado

No dependas únicamente de un timeout.

Puedes guardar:

{
  conferenceSid,
  customerCallSid,
  aiCallSid,
  humanCallSid,
  transferStatus: "calling"
}

Y actualizar:

calling
   ↓
ringing
   ↓
connected
   ↓
ready

Twilio proporciona estados de participante como:

queued
connecting
ringing
connected
complete
failed

y permite recibir eventos de estado de la conferencia mediante conferenceStatusCallback. citeturn0search0turn0search1

17. Callback de conferencia

Configura:

statusCallback="https://your-domain.com/conference-events"
statusCallbackEvent="start end join leave mute hold speaker"

Endpoint:

fastify.post("/conference-events", async (request, reply) => {

  console.log("Conference event:", request.body);

  reply.send("OK");
});

Esto te permite mantener sincronizado el estado:

DB
 │
 ├── conferenceSid
 ├── customerCallSid
 ├── aiCallSid
 ├── humanCallSid
 ├── transferStatus
 └── activeParticipants

Twilio recomienda utilizar el statusCallback de la conferencia para monitorizar cambios de estado y participantes, en lugar de hacer polling continuo. citeturn0search1

18. Ejemplo completo del flujo

1. Cliente llama al número Twilio
             │
             ▼
2. /incoming-call
             │
             ▼
3. Cliente entra en Conference
             │
             ▼
4. Backend crea AI Call Leg
             │
             ▼
5. AI Call Leg entra en Conference
             │
             ▼
6. <Connect><Stream>
             │
             ▼
7. Twilio Media Stream
             │
             ▼
8. OpenAI Realtime
             │
             ▼
9. Cliente habla con GPT
             │
             │
             │ "Quiero hablar con una persona"
             ▼
10. GPT ejecuta transfer_to_human
             │
             ▼
11. Backend llama a Twilio Participants API
             │
             ▼
12. Humano recibe llamada
             │
             ▼
13. Humano entra en Conference
             │
             ▼
14. Cliente + IA + Humano
             │
             ▼
15. Humano confirma que está listo
             │
             ▼
16. Backend elimina AI Call Leg
             │
             ▼
17. Cliente + Humano

19. Consideración importante: quién crea la conferencia

Hay dos estrategias.

Estrategia A — Cliente crea la conferencia

Cliente
   ↓
/incoming-call
   ↓
Conference

Después añades:

AI
Human

Es la estrategia más sencilla para transferencias.

Estrategia B — Crear la conferencia desde backend

Puedes utilizar la API de participantes con un FriendlyName. Twilio puede crear una conferencia activa al añadir el participante si todavía no existe una conferencia activa con ese nombre. citeturn0search0

Esto es útil cuando tu backend controla toda la sesión.

20. Recomendación para producción

Usaría esta estructura:

src/
├── server.js
├── routes/
│   ├── incomingCall.js
│   ├── aiLeg.js
│   └── conferenceEvents.js
├── voice/
│   ├── realtime.js
│   ├── mediaStream.js
│   └── tools.js
├── twilio/
│   ├── conference.js
│   └── participants.js
└── state/
    └── calls.js

Y separaría responsabilidades:

Twilio
  │
  ├── conference.js
  │       └── crear / añadir / eliminar participantes
  │
  └── participants.js
          └── estado de cada call leg


OpenAI
  │
  ├── realtime.js
  │       └── sesión GPT Live
  │
  └── tools.js
          └── transfer_to_human


Media
  │
  └── mediaStream.js
          └── Twilio ⇄ OpenAI

21. Seguridad

No expongas nunca:

OPENAI_API_KEY
TWILIO_AUTH_TOKEN

El navegador no debería conectarse directamente a Twilio con estas credenciales.

Utiliza:

HTTPS
WSS
environment variables
signature validation

Valida además las peticiones webhook de Twilio.

Para producción:

Internet
   │
   ▼
HTTPS/WSS
   │
   ▼
Reverse Proxy
   │
   ▼
Node.js
   │
   ├── Twilio
   │
   └── OpenAI

22. Latencia

En una llamada telefónica hay varios saltos:

Cliente
 ↓
PSTN
 ↓
Twilio
 ↓
Media Stream
 ↓
Internet
 ↓
OpenAI
 ↓
Internet
 ↓
Twilio
 ↓
PSTN
 ↓
Cliente

Por eso hay que cuidar:

región del servidor;

WebSocket persistente;

buffers pequeños;

detección de turnos;

interrupciones;

cancelación de audio cuando el usuario comienza a hablar.

OpenAI señala específicamente que las llamadas telefónicas pueden introducir más latencia que una conversación basada en WebRTC y que hay que ajustar el manejo de interrupciones. citeturn0search8

23. Manejo de interrupciones

Un agente telefónico debería soportar:

AI: "Perfecto, entonces voy a..."
Cliente: "No, espera..."

En ese momento:

detectar speech_started
        ↓
cancelar respuesta GPT
        ↓
limpiar audio pendiente
        ↓
escuchar al cliente

No dejes que el audio generado anteriormente continúe durante varios segundos.

24. Arquitectura final recomendada

                       ┌─────────────────────┐
                       │      OpenAI         │
                       │  Realtime / GPT     │
                       └─────────▲───────────┘
                                 │
                         WebSocket│audio/events
                                 │
                       ┌─────────┴───────────┐
                       │     Node.js         │
                       │                     │
                       │ Media Stream        │
                       │ Conference logic    │
                       │ Transfer tools      │
                       └─────────▲───────────┘
                                 │
                         Twilio Media Stream
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   TWILIO CONFERENCE    │
                    │                        │
                    │ ┌──────┐ ┌──────┐     │
                    │ │Client│ │  AI  │     │
                    │ └──────┘ └──────┘     │
                    │          ┌──────┐      │
                    │          │Human │      │
                    │          └──────┘      │
                    └────────────────────────┘

Esta arquitectura mantiene a Twilio como responsable de la telefonía y conferencia, mientras que Node.js controla la lógica y OpenAI se ocupa de la conversación de voz.

25. Referencias oficiales

Twilio Conference: https://www.twilio.com/docs/voice/conference

Twilio Conference API: https://www.twilio.com/docs/voice/api/conference-resource

Twilio Conference Participants: https://www.twilio.com/docs/voice/api/conference-participant-resource

Twilio <Conference>: https://www.twilio.com/docs/voice/twiml/conference

Twilio Media Streams: https://www.twilio.com/docs/voice/media-streams

OpenAI Live/Realtime WebSockets: https://developers.openai.com/api/docs/guides/voice-websockets

OpenAI Agents + Twilio: https://openai.github.io/openai-agents-js/extensions/twilio/

Twilio documenta explícitamente la creación de conferencias mediante <Dial><Conference> y el control posterior de participantes mediante la API. citeturn0search2