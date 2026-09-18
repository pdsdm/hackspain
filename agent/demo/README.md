# Demo: Agente de voz GPT Live por teléfono (Twilio + OpenAI Realtime)

Prototipo experimental (ver decisión D5 en `docs/decisions.md`).

Llamas al **+1 (610) 535-8843** y te contesta un agente de voz GPT Live en español.

## Arquitectura

Modo por defecto (`CALL_MODE=direct`), que es el que está verificado funcionando:

```
Quien llama ──PSTN──> Twilio (+1 610 535-8843)
                        │  POST /incoming-call  → <Connect><Stream>
                        ▼
                  WS /media-stream  ──audio μ-law 8 kHz──>  OpenAI Realtime
                        ▲                                    (STT + LLM + TTS)
                        └──────────────audio μ-law───────────┘
```

Twilio envía y espera **G.711 μ-law a 8 kHz en base64**, y la sesión de OpenAI se
configura con `audio/pcmu` en entrada y salida, así que no hay transcodificación.

## Requisitos

- Python 3.11+ (probado con 3.12)
- Cuenta Twilio con número de voz (+16105358843)
- API key de OpenAI con acceso a la Realtime API
- URL pública HTTPS/WSS (ngrok, Cloudflare Tunnel, etc.)

## Ejecutar (Windows)

```powershell
cd agent\demo

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env   # y rellena credenciales
uvicorn main:app --reload --port 8000
```

En Linux/macOS: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.

**Nota**: si ves `ModuleNotFoundError: No module named 'twilio'`, estás ejecutando
fuera del venv. Actívalo siempre antes de lanzar uvicorn.

Con ngrok (para que Twilio pueda llegar a tus webhooks):

```bash
ngrok http 8000
```

Copia el host que te da ngrok en `PUBLIC_HOST`. **Sin esquema**: vale
`xxxx.ngrok-free.dev`, no `https://xxxx.ngrok-free.dev` (el código tolera ambos,
pero el valor limpio es el host a secas).

## Configurar el número de Twilio

1. https://console.twilio.com/us1/develop/phone-numbers
2. Número **+1 (610) 535-8843** → pestaña **Voice**
3. **A Call Comes In** → Webhook → `https://TU-HOST/incoming-call`, método `POST`
4. Guardar.

La URL del webhook cambia cada vez que reinicias ngrok con dominio aleatorio: si
cambia, hay que actualizarla **en la consola de Twilio y en `PUBLIC_HOST`**.

## Variables de entorno

Ver `.env.example`. Obligatorias: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `OPENAI_API_KEY`, `PUBLIC_HOST`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `CALL_MODE` | `direct` | `direct` = te atiende la IA; `conference` = sala de conferencia |
| `REALTIME_MODEL` | `gpt-realtime-mini` | Modelo Realtime (también `gpt-realtime`) |
| `REALTIME_VOICE` | `marin` | Voz del agente |
| `HUMAN_PHONE_NUMBER` | — | Humano al que llamar en modo conferencia |

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Comprobación rápida de configuración cargada |
| GET/POST | `/incoming-call` | Webhook de voz de Twilio |
| GET/POST | `/ai-leg` | TwiML del leg del agente IA (mismo stream) |
| WS | `/media-stream` | Puente de audio bidireccional con OpenAI Realtime |
| POST | `/conference-events` | Status callbacks de la conferencia |
| POST | `/add-human-to-conference` | Mete al humano en una conferencia existente |

## Cómo comprobar que funciona

```bash
# 1. La app está viva y con la config correcta
curl http://127.0.0.1:8000/health

# 2. El webhook devuelve TwiML válido (debe salir <Connect><Stream ...>)
curl -X POST http://127.0.0.1:8000/incoming-call -d "CallSid=CAtest&From=%2B34600000000"

# 3. Lo mismo a través del túnel público
curl -X POST https://TU-HOST/incoming-call -d "CallSid=CAtest&From=%2B34600000000"

# 4. Llamada real: marca el +1 610 535-8843 desde un móvil y el agente saluda.
#    En la consola de Twilio (Monitor → Logs → Calls) la llamada debe quedar
#    "completed" con duración > 0. Si sale "busy" con duración 0, el webhook
#    está caído o PUBLIC_HOST no coincide con el túnel.
```

Estado verificado el 2026-09-19: llamada entrante real al DID → `/incoming-call`
200 → `/media-stream` 101 → la IA saluda. Coste de esa prueba: $0,022.

## Modo conferencia (sin terminar)

`CALL_MODE=conference` mete a quien llama en una sala y `/add-human-to-conference`
añade al humano. **El agente IA no entra en la conferencia**: `<Connect><Stream>`
y `<Dial><Conference>` no pueden convivir en el mismo call leg, así que meter la
IA exige un segundo leg (por ejemplo, un segundo número o un endpoint SIP que
entre en la sala). Sin eso, la conferencia es solo cliente + humano.

## Limitaciones conocidas (demo)

- No hay reconexión si se cae el WebSocket de OpenAI.
- No se valida la firma de los webhooks de Twilio: cualquiera que conozca la URL
  puede dispararlos. Sin autenticación ni rate limiting.
- No se persisten transcripciones: solo salen por consola.
- Prompt genérico en `SYSTEM_PROMPT`; no conoce el escenario MADRING.
- Sin warm transfer real (ver modo conferencia).
- Saldo de la cuenta Twilio limitado: vigilarlo antes de la demo.

## Próximos pasos (si se aprueba)

- Integrar con HappyRobot como canal alternativo.
- Warm transfer: entra el humano, sale la IA.
- Persistencia de transcripciones y decisiones.
