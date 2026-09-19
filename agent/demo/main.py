"""
Demo mínima: número de Twilio + OpenAI Realtime (GPT Live Voice)
Python + FastAPI

Este es un prototipo EXPERIMENTAL (ver docs/decisions.md → D5).
No forma parte del backend principal del hackathon.

Flujo por defecto (CALL_MODE=direct):
    Llamada entrante al +1 (610) 535-8843
      → POST /incoming-call  →  TwiML <Connect><Stream>
      → WS  /media-stream    →  puente de audio μ-law con OpenAI Realtime

Flujo de conferencia (CALL_MODE=conference): deja al que llama en una
conferencia a la espera del humano. Ver la nota del README sobre por qué el
agente IA no puede auto-añadirse a la conferencia sin un segundo call leg.
"""

import os
import re
import sys
import json
import asyncio
from typing import Optional

# En Windows la consola suele ser cp1252 y los emojis de los logs revientan
# con UnicodeEncodeError (sobre todo al redirigir la salida a un fichero).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from twilio.twiml.voice_response import VoiceResponse, Dial, Conference, Connect, Stream
from twilio.rest import Client as TwilioClient
from websockets.asyncio.client import connect as ws_connect

# ------------------------------------------------------------------
# Configuración
# ------------------------------------------------------------------
load_dotenv()


def _clean_host(raw: Optional[str]) -> str:
    """PUBLIC_HOST debe ser solo el host. Tolera que venga con esquema o barra final."""
    host = (raw or "localhost:8000").strip()
    for prefix in ("https://", "http://", "wss://", "ws://"):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host.rstrip("/")


TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PUBLIC_HOST = _clean_host(os.getenv("PUBLIC_HOST"))
HUMAN_PHONE_NUMBER = os.getenv("HUMAN_PHONE_NUMBER")
# Token de los endpoints que gastan dinero (crean llamadas). Sin él, cualquiera que
# conozca la URL del túnel puede llamar a tu costa.
DEMO_API_TOKEN = os.getenv("DEMO_API_TOKEN")


def _parse_participants(raw: Optional[str]) -> list[str]:
    """Lista de teléfonos en E.164 separados por coma. Lo que no cumpla, fuera y avisado."""
    numbers: list[str] = []
    for chunk in (raw or "").replace(";", ",").split(","):
        number = chunk.strip().replace(" ", "")
        if not number:
            continue
        if not re.fullmatch(r"\+[1-9]\d{6,14}", number):
            print(f"⚠️  Teléfono descartado, no está en E.164: {number!r}")
            continue
        numbers.append(number)
    return numbers


# Participantes que se meten en la sala con /conference/start.
CONFERENCE_PARTICIPANTS = _parse_participants(
    os.getenv("CONFERENCE_PARTICIPANTS") or HUMAN_PHONE_NUMBER
)
CALL_MODE = os.getenv("CALL_MODE", "direct").strip().lower()
REALTIME_MODEL = os.getenv("REALTIME_MODEL", "gpt-realtime-mini")
REALTIME_VOICE = os.getenv("REALTIME_VOICE", "marin")

if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, OPENAI_API_KEY]):
    print("⚠️  Faltan variables de entorno. Copia .env.example a .env y rellénalo.")

twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"

# Prompt del agente (cámbialo según tu caso de uso)
SYSTEM_PROMPT = (
    "Eres un asistente de voz útil y conciso que atiende por teléfono en español. "
    "Responde de forma natural y breve, en una o dos frases. "
    "Si te piden hablar con una persona, di que avisas a un humano y que no cuelguen."
)

GREETING = (
    "Saluda en español, di que eres el asistente de voz de la demo "
    "y pregunta en qué puedes ayudar."
)

# ------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------
app = FastAPI(title="Twilio + GPT Live Voice Demo", version="0.2.0")


@app.on_event("startup")
async def _startup() -> None:
    print("🚀 Demo iniciada.")
    print(f"   PUBLIC_HOST = {PUBLIC_HOST}")
    print(f"   CALL_MODE   = {CALL_MODE}")
    print(f"   Modelo      = {REALTIME_MODEL}")
    print(f"   Webhook voz → https://{PUBLIC_HOST}/incoming-call")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def generate_conference_name() -> str:
    """Genera un nombre único para la conferencia."""
    import time
    return f"call-{int(time.time())}"


def create_conference_twiml(conference_name: str, greeting: Optional[str] = None) -> str:
    """
    TwiML que mete un leg en la conferencia.

    `end_conference_on_exit=False` en todos: la sala sobrevive a que uno cuelgue, que es
    lo que quieres cuando hay tres personas y una se cae.
    """
    resp = VoiceResponse()
    if greeting:
        resp.say(greeting, language="es-ES")
    dial = Dial()
    conference = Conference(
        conference_name,
        start_conference_on_enter=True,
        end_conference_on_exit=False,
        status_callback=f"https://{PUBLIC_HOST}/conference-events",
        status_callback_event="start end join leave",
    )
    dial.append(conference)
    resp.append(dial)
    return str(resp)


# Salas vivas: nombre → teléfonos que hemos metido. Sin esto, el nombre de la conferencia
# solo existía en un print y no había forma de añadir a nadie después.
ACTIVE_CONFERENCES: dict[str, list[str]] = {}
LATEST_CONFERENCE: Optional[str] = None


def _register_conference(name: str) -> None:
    global LATEST_CONFERENCE
    ACTIVE_CONFERENCES.setdefault(name, [])
    LATEST_CONFERENCE = name


def _resolve_conference(name: Optional[str]) -> Optional[str]:
    return name or LATEST_CONFERENCE


def _authorized(token: Optional[str]) -> bool:
    """Los endpoints que crean llamadas cuestan dinero: sin token, no se abren."""
    return not DEMO_API_TOKEN or token == DEMO_API_TOKEN


def _dial_into_conference(conference_name: str, number: str) -> str:
    """Llama a un número y lo deja dentro de la sala. Devuelve el CallSid."""
    call = twilio_client.calls.create(
        to=number,
        from_=TWILIO_PHONE_NUMBER,
        twiml=create_conference_twiml(
            conference_name,
            greeting="Te unimos a la sala del centro de operaciones.",
        ),
    )
    ACTIVE_CONFERENCES.setdefault(conference_name, []).append(number)
    print(f"☎️  {number} → sala {conference_name} (CallSid {call.sid})")
    return call.sid


def create_ai_leg_twiml() -> str:
    """
    TwiML que conecta el audio del leg al WebSocket de media stream
    (puente bidireccional con OpenAI Realtime).
    """
    resp = VoiceResponse()
    connect = Connect()
    connect.append(Stream(url=f"wss://{PUBLIC_HOST}/media-stream"))
    resp.append(connect)
    return str(resp)


# ------------------------------------------------------------------
# Endpoints REST (webhooks de Twilio)
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "public_host": PUBLIC_HOST,
        "call_mode": CALL_MODE,
        "model": REALTIME_MODEL,
        "twilio_number": TWILIO_PHONE_NUMBER,
    }


@app.api_route("/incoming-call", methods=["GET", "POST"], response_class=PlainTextResponse)
async def incoming_call(request: Request):
    """
    Webhook que Twilio llama cuando entra una llamada al número.
    - CALL_MODE=direct     → conecta al que llama con el agente IA.
    - CALL_MODE=conference → mete al que llama en una conferencia.
    """
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    from_number = form.get("From", "unknown")

    if CALL_MODE == "conference":
        conference_name = generate_conference_name()
        _register_conference(conference_name)
        print(f"📞 Llamada {call_sid} de {from_number} → conferencia {conference_name}")
        twiml = create_conference_twiml(conference_name, greeting="Te paso con la sala de la demo.")
    else:
        print(f"📞 Llamada {call_sid} de {from_number} → agente IA (stream)")
        twiml = create_ai_leg_twiml()

    return PlainTextResponse(content=twiml, media_type="application/xml")


@app.api_route("/ai-leg", methods=["GET", "POST"], response_class=PlainTextResponse)
async def ai_leg(request: Request):
    """TwiML del leg del agente IA (el mismo stream que usa /incoming-call en modo direct)."""
    form = await request.form()
    print(f"🤖 Leg IA para CallSid {form.get('CallSid', 'unknown')}")
    return PlainTextResponse(content=create_ai_leg_twiml(), media_type="application/xml")


@app.post("/conference-events", response_class=PlainTextResponse)
async def conference_events(request: Request):
    """Status callback de Twilio para eventos de la conferencia (logging)."""
    form = await request.form()
    print(f"📡 Conference event: {form.get('StatusCallbackEvent')} | {form.get('ConferenceSid')}")
    return PlainTextResponse(content="OK")


# ------------------------------------------------------------------
# WebSocket: Twilio Media Stream ↔ OpenAI Realtime
# ------------------------------------------------------------------
def realtime_session_config() -> dict:
    """
    Configuración de sesión de la Realtime API (esquema GA).
    audio/pcmu = G.711 μ-law 8 kHz, exactamente lo que manda y espera Twilio,
    así que no hace falta transcodificar en ninguna dirección.
    """
    return {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "instructions": SYSTEM_PROMPT,
            "audio": {
                "input": {
                    "format": {"type": "audio/pcmu"},
                    "turn_detection": {"type": "server_vad"},
                },
                "output": {
                    "format": {"type": "audio/pcmu"},
                    "voice": REALTIME_VOICE,
                },
            },
        },
    }


@app.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    """Puente de audio entre el media stream de Twilio y OpenAI Realtime."""
    await websocket.accept()
    print("🔌 Media stream de Twilio conectado")

    stream_sid: Optional[str] = None

    try:
        openai_ws = await ws_connect(
            f"{OPENAI_REALTIME_URL}?model={REALTIME_MODEL}",
            additional_headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            max_size=None,
        )
    except Exception as e:
        print(f"❌ No se pudo conectar con OpenAI Realtime: {e}")
        await websocket.close()
        return

    async with openai_ws:
        await openai_ws.send(json.dumps(realtime_session_config()))

        async def twilio_to_openai():
            """Audio de Twilio → OpenAI."""
            nonlocal stream_sid
            try:
                while True:
                    msg = json.loads(await websocket.receive_text())
                    event = msg.get("event")

                    if event == "media":
                        await openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": msg["media"]["payload"],
                        }))
                    elif event == "start":
                        stream_sid = msg["start"]["streamSid"]
                        print(f"▶️  Stream iniciado ({stream_sid})")
                    elif event == "stop":
                        print("⏹️  Stream detenido")
                        break
            except WebSocketDisconnect:
                print("🔌 Twilio colgó")
            except Exception as e:
                print(f"❌ Error en twilio_to_openai: {e}")
            finally:
                await openai_ws.close()

        async def openai_to_twilio():
            """Audio y eventos de OpenAI → Twilio."""
            try:
                async for raw in openai_ws:
                    event = json.loads(raw)
                    etype = event.get("type")

                    if etype == "response.output_audio.delta":
                        if stream_sid:
                            await websocket.send_json({
                                "event": "media",
                                "streamSid": stream_sid,
                                "media": {"payload": event["delta"]},
                            })
                    elif etype == "input_audio_buffer.speech_started":
                        # Barge-in: si el usuario interrumpe, vaciamos lo que quede por sonar.
                        print("🎤 Usuario hablando")
                        if stream_sid:
                            await websocket.send_json({"event": "clear", "streamSid": stream_sid})
                        await openai_ws.send(json.dumps({"type": "response.cancel"}))
                    elif etype == "response.output_audio_transcript.done":
                        print(f"🗣️  IA: {event.get('transcript', '')}")
                    elif etype == "session.updated":
                        # Sesión lista: que el agente salude primero.
                        await openai_ws.send(json.dumps({
                            "type": "response.create",
                            "response": {"instructions": GREETING},
                        }))
                    elif etype == "error":
                        print(f"❌ OpenAI error: {json.dumps(event.get('error', event))[:300]}")
            except Exception as e:
                print(f"❌ Error en openai_to_twilio: {e}")

        await asyncio.gather(twilio_to_openai(), openai_to_twilio())

    print("🔌 Conexión con OpenAI Realtime cerrada")


# ------------------------------------------------------------------
# Utilidad: añadir el humano a una conferencia existente (modo conference)
# ------------------------------------------------------------------
@app.post("/add-human-to-conference")
async def add_human_to_conference(conference_name: str, to: Optional[str] = None):
    """Llama al humano y lo mete en una conferencia ya creada."""
    destination = to or HUMAN_PHONE_NUMBER
    if not destination:
        return {"status": "error", "detail": "Falta HUMAN_PHONE_NUMBER o el parámetro 'to'"}
    try:
        participant = twilio_client.conferences(conference_name).participants.create(
            from_=TWILIO_PHONE_NUMBER,
            to=destination,
            label="human",
        )
        return {"status": "ok", "participant_sid": participant.sid}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ------------------------------------------------------------------
# Sala con varias personas
# ------------------------------------------------------------------
@app.post("/conference/start")
async def conference_start(
    to: Optional[str] = None,
    x_demo_token: Optional[str] = Header(default=None),
):
    """
    Abre una sala y llama a todos los participantes para meterlos dentro.

    Sin `to`, usa CONFERENCE_PARTICIPANTS del entorno. Con `to`, acepta una lista
    separada por comas y solo llama a esos.
    """
    if not _authorized(x_demo_token):
        raise HTTPException(status_code=401, detail="Falta o no coincide X-Demo-Token")

    numbers = _parse_participants(to) if to else list(CONFERENCE_PARTICIPANTS)
    if not numbers:
        return {
            "status": "error",
            "detail": "No hay participantes. Rellena CONFERENCE_PARTICIPANTS o pasa ?to=+34…,+34…",
        }

    conference_name = generate_conference_name()
    _register_conference(conference_name)

    dialed, failed = [], []
    for number in numbers:
        try:
            dialed.append({"to": number, "call_sid": _dial_into_conference(conference_name, number)})
        except Exception as error:
            # Un número que falla no debe impedir que la sala se monte con el resto.
            print(f"⚠️  No se pudo llamar a {number}: {error}")
            failed.append({"to": number, "detail": str(error)})

    return {
        "status": "ok" if dialed else "error",
        "conference_name": conference_name,
        "dialed": dialed,
        "failed": failed,
    }


@app.post("/conference/add")
async def conference_add(
    to: str,
    conference_name: Optional[str] = None,
    x_demo_token: Optional[str] = Header(default=None),
):
    """Mete a una o varias personas más en una sala ya abierta (la última, por defecto)."""
    if not _authorized(x_demo_token):
        raise HTTPException(status_code=401, detail="Falta o no coincide X-Demo-Token")

    room = _resolve_conference(conference_name)
    if not room:
        return {"status": "error", "detail": "No hay ninguna sala abierta; usa /conference/start"}

    numbers = _parse_participants(to)
    if not numbers:
        return {"status": "error", "detail": "Ningún teléfono válido en 'to' (E.164: +34600000000)"}

    dialed, failed = [], []
    for number in numbers:
        try:
            dialed.append({"to": number, "call_sid": _dial_into_conference(room, number)})
        except Exception as error:
            print(f"⚠️  No se pudo llamar a {number}: {error}")
            failed.append({"to": number, "detail": str(error)})

    return {"status": "ok" if dialed else "error", "conference_name": room, "dialed": dialed, "failed": failed}


@app.get("/conference/status")
async def conference_status(conference_name: Optional[str] = None):
    """Quién hay en la sala, según Twilio, no según lo que creemos nosotros."""
    room = _resolve_conference(conference_name)
    if not room:
        return {"status": "error", "detail": "No hay ninguna sala abierta"}
    try:
        live = twilio_client.conferences.list(friendly_name=room, status="in-progress", limit=1)
        if not live:
            return {"status": "ok", "conference_name": room, "live": False, "participants": []}
        participants = twilio_client.conferences(live[0].sid).participants.list()
        return {
            "status": "ok",
            "conference_name": room,
            "live": True,
            "participants": [
                {"call_sid": p.call_sid, "muted": p.muted, "hold": p.hold} for p in participants
            ],
        }
    except Exception as error:
        return {"status": "error", "detail": str(error)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
