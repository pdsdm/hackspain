"""
Demo: número de Twilio + OpenAI Realtime (GPT Live Voice) con transferencia a humano
Python + FastAPI

Este es un prototipo EXPERIMENTAL (ver docs/decisions.md → D5).
No forma parte del backend principal del hackathon.

Flujo:
    Llamada entrante  →  POST /incoming-call  →  TwiML <Connect><Stream>
                      →  WS  /media-stream    →  puente μ-law con OpenAI Realtime
                      →  la IA llama a la tool transfer_to_human
                      →  se llama al humano y se le mete en una conferencia
                      →  el leg del cliente se redirige a esa misma conferencia

Los tres acaban en la misma sala. La IA entra como participante usando una TwiML
Application (`To=app:APxxxx`): ese leg lo crea Twilio y ejecuta nuestro /ai-leg, que
devuelve <Connect><Stream>. Así esquivamos la limitación de que un mismo leg no puede
estar en <Dial><Conference> y en el stream a la vez, sin SIP ni media server externo.
"""

import os
import re
import sys
import json
import time
import asyncio
from typing import Optional
from urllib.parse import urlencode

# En Windows la consola suele ser cp1252 y los emojis de los logs revientan
# con UnicodeEncodeError (sobre todo al redirigir la salida a un fichero).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Header, HTTPException
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


def _parse_participants(raw: Optional[str]) -> list[str]:
    """Teléfonos en E.164 separados por coma. Lo que no cumpla, fuera y avisado."""
    numbers: list[str] = []
    for chunk in (raw or "").replace(";", ",").split(","):
        number = chunk.strip().replace(" ", "")
        if not number:
            continue
        if not re.fullmatch(r"\+[1-9]\d{6,14}", number):
            print(f"⚠️  Teléfono descartado, no está en E.164: {number!r}")
            continue
        if number not in numbers:
            numbers.append(number)
    return numbers


# A quién se mete en la sala cuando se pide añadir personas. Si está vacío, cae a
# HUMAN_PHONE_NUMBER para no romper el comportamiento anterior.
CONFERENCE_PARTICIPANTS = _parse_participants(
    os.getenv("CONFERENCE_PARTICIPANTS") or HUMAN_PHONE_NUMBER
)
CALL_MODE = os.getenv("CALL_MODE", "direct").strip().lower()
REALTIME_MODEL = os.getenv("REALTIME_MODEL", "gpt-realtime-mini")
REALTIME_VOICE = os.getenv("REALTIME_VOICE", "marin")
# Token para los endpoints que gastan dinero (crean llamadas). Sin él, cualquiera
# que conozca la URL del túnel puede llamar a tu costa.
DEMO_API_TOKEN = os.getenv("DEMO_API_TOKEN")
# TwiML Application con la que la IA entra en la conferencia. Se crea sola al
# arrancar si falta, y se reapunta si cambia PUBLIC_HOST.
TWILIO_AI_APP_SID = os.getenv("TWILIO_AI_APP_SID")
AI_APP_NAME = "hackspain-ai-agent"

if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, OPENAI_API_KEY]):
    print("⚠️  Faltan variables de entorno. Copia .env.example a .env y rellénalo.")

twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"

# Prompt del agente (cámbialo según tu caso de uso)
SYSTEM_PROMPT = (
    "Eres un asistente de voz útil y conciso que atiende por teléfono en español. "
    "Responde de forma natural y breve, en una o dos frases. "
    "Si la persona pide hablar con un humano, o detectas que el asunto te supera, "
    "usa la herramienta transfer_to_human. Antes de usarla, avisa en una frase de "
    "que vas a pasar la llamada y pide que no cuelgue."
)

GREETING = (
    "Saluda en español, di que eres el asistente de voz de la demo "
    "y pregunta en qué puedes ayudar."
)

TRANSFER_TOOL = {
    "type": "function",
    "name": "transfer_to_human",
    "description": (
        "Pasa la llamada a una persona del equipo. Úsala cuando quien llama pida "
        "hablar con un humano o cuando no puedas resolver su petición."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "motivo": {
                "type": "string",
                "description": "Resumen en una frase de por qué se escala la llamada.",
            }
        },
        "required": ["motivo"],
    },
}

# ------------------------------------------------------------------
# Estado en memoria: conferencias vivas
# ------------------------------------------------------------------
# El nombre de la conferencia ya no se pierde en un print: se guarda indexado por
# el CallSid del cliente, que es lo único que conocemos desde el media stream.
CONFERENCES: dict[str, dict] = {}


def conference_for_call(call_sid: str) -> Optional[dict]:
    for conf in CONFERENCES.values():
        if conf["customer_call_sid"] == call_sid:
            return conf
    return None


def require_token(token: Optional[str]) -> None:
    """Protege los endpoints que crean llamadas."""
    if not DEMO_API_TOKEN:
        return  # sin token configurado, no bloqueamos la demo local
    if token != DEMO_API_TOKEN:
        raise HTTPException(status_code=401, detail="Token inválido")


# ------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------
app = FastAPI(title="Twilio + GPT Live Voice Demo", version="0.3.0")


def ensure_ai_app() -> Optional[str]:
    """
    Deja lista la TwiML App del agente y devuelve su SID.
    Si ya existe (por nombre o por TWILIO_AI_APP_SID) solo corrige su voice_url,
    que cambia cada vez que cambia el túnel.
    """
    global TWILIO_AI_APP_SID
    voice_url = f"https://{PUBLIC_HOST}/ai-leg"
    try:
        app_resource = None
        if TWILIO_AI_APP_SID:
            app_resource = twilio_client.applications(TWILIO_AI_APP_SID).fetch()
        else:
            existing = twilio_client.applications.list(friendly_name=AI_APP_NAME, limit=1)
            app_resource = existing[0] if existing else None

        if app_resource is None:
            app_resource = twilio_client.applications.create(
                friendly_name=AI_APP_NAME, voice_url=voice_url, voice_method="POST"
            )
            print(f"🆕 TwiML App creada: {app_resource.sid}")
        elif app_resource.voice_url != voice_url:
            app_resource = twilio_client.applications(app_resource.sid).update(
                voice_url=voice_url, voice_method="POST"
            )
            print(f"♻️  TwiML App reapuntada a {voice_url}")

        TWILIO_AI_APP_SID = app_resource.sid
        return app_resource.sid
    except Exception as e:
        print(f"❌ No se pudo preparar la TwiML App del agente: {e}")
        return None


@app.on_event("startup")
async def _startup() -> None:
    ensure_ai_app()
    print("🚀 Demo iniciada.")
    print(f"   TwiML App   = {TWILIO_AI_APP_SID or 'NO DISPONIBLE (la IA no entrará en la sala)'}")
    print(f"   PUBLIC_HOST = {PUBLIC_HOST}")
    print(f"   CALL_MODE   = {CALL_MODE}")
    print(f"   Modelo      = {REALTIME_MODEL}")
    print(f"   Token       = {'configurado' if DEMO_API_TOKEN else 'SIN TOKEN (endpoints abiertos)'}")
    print(f"   Webhook voz → https://{PUBLIC_HOST}/incoming-call")


# ------------------------------------------------------------------
# Helpers de TwiML
# ------------------------------------------------------------------
def create_conference_twiml(conference_name: str, start_on_enter: bool, end_on_exit: bool = False) -> str:
    """TwiML para meter un leg en la conferencia."""
    resp = VoiceResponse()
    dial = Dial()
    dial.append(
        Conference(
            conference_name,
            start_conference_on_enter=start_on_enter,
            end_conference_on_exit=end_on_exit,
            status_callback=f"https://{PUBLIC_HOST}/conference-events",
            status_callback_event="start end join leave",
        )
    )
    resp.append(dial)
    return str(resp)


def create_ai_leg_twiml(motivo: str = "", conference: str = "") -> str:
    """
    TwiML que conecta el audio del leg al puente con OpenAI Realtime.
    Los <Parameter> llegan al WebSocket en start.customParameters, que es como el
    agente sabe que entra a una transferencia ya empezada y por qué.
    """
    resp = VoiceResponse()
    connect = Connect()
    stream = Stream(url=f"wss://{PUBLIC_HOST}/media-stream")
    if motivo:
        stream.parameter(name="motivo", value=motivo)
    if conference:
        stream.parameter(name="conference", value=conference)
    connect.append(stream)
    resp.append(connect)
    return str(resp)


# ------------------------------------------------------------------
# Transferencia: humano dentro, cliente dentro, IA fuera
# ------------------------------------------------------------------
def start_transfer(customer_call_sid: str, motivo: str, to: Optional[str] = None) -> dict:
    """
    Monta la sala: agente IA + cliente + todas las personas configuradas.

    Orden deliberado: primero entra la IA (su leg lo crea Twilio al instante y arranca
    la conferencia), luego se redirige al cliente, y por último se llama a los humanos,
    que es lo único que tarda en descolgar. Así el cliente nunca se queda en silencio.
    """
    # `to` manda si viene (una o varias, separadas por coma); si no, los del entorno.
    destinations = _parse_participants(to) if to else list(CONFERENCE_PARTICIPANTS)
    if not destinations:
        raise HTTPException(
            status_code=400,
            detail="No hay a quién llamar: rellena CONFERENCE_PARTICIPANTS o pasa 'to'",
        )

    conference_name = f"conf-{customer_call_sid[-8:]}-{int(time.time())}"
    conf = {
        "name": conference_name,
        "customer_call_sid": customer_call_sid,
        "human_call_sid": None,
        "ai_call_sid": None,
        "participants": [],
        "failed": [],
        "motivo": motivo,
        "status": "montando",
        "created_at": time.time(),
    }
    CONFERENCES[conference_name] = conf

    # 1) La IA entra como participante vía TwiML App: ese leg ejecuta /ai-leg,
    #    que devuelve <Connect><Stream> y lo puentea con OpenAI Realtime.
    app_sid = TWILIO_AI_APP_SID or ensure_ai_app()
    if app_sid:
        query = urlencode({"motivo": motivo, "conference": conference_name})
        ai = twilio_client.conferences(conference_name).participants.create(
            from_=TWILIO_PHONE_NUMBER,
            to=f"app:{app_sid}?{query}",
            label="ai-agent",
            early_media=True,
            start_conference_on_enter=True,
            end_conference_on_exit=False,
        )
        conf["ai_call_sid"] = ai.call_sid
        conf["participants"].append({"label": "ai-agent", "call_sid": ai.call_sid, "to": f"app:{app_sid}"})
    else:
        print("⚠️  Sin TwiML App: la sala se monta sin agente IA")

    # 2) El cliente sale del stream 1-a-1 y entra en la misma sala.
    twilio_client.calls(customer_call_sid).update(
        twiml=create_conference_twiml(conference_name, start_on_enter=True, end_on_exit=True)
    )
    conf["participants"].append({"label": "customer", "call_sid": customer_call_sid, "to": None})

    # 3) Se llama a cada humano, que entra cuando descuelga. Uno que falle no impide
    #    que la sala se monte con el resto: la llamada ya está en curso y el cliente
    #    no puede quedarse colgado porque un número esté apagado.
    for index, destination in enumerate(destinations):
        label = "human" if index == 0 else f"human-{index + 1}"
        try:
            human = twilio_client.conferences(conference_name).participants.create(
                from_=TWILIO_PHONE_NUMBER,
                to=destination,
                label=label,
                start_conference_on_enter=True,
                end_conference_on_exit=False,
            )
        except Exception as error:
            print(f"⚠️  No se pudo llamar a {destination}: {error}")
            conf["failed"].append({"to": destination, "detail": str(error)})
            continue
        if conf["human_call_sid"] is None:
            conf["human_call_sid"] = human.call_sid
        conf["participants"].append({"label": label, "call_sid": human.call_sid, "to": destination})

    conf["status"] = "esperando_humano" if conf["human_call_sid"] else "sin_humanos"

    llamados = ", ".join(p["to"] for p in conf["participants"] if p["to"])
    print(f"🔀 Sala {conference_name}: IA {conf['ai_call_sid']} · humanos → {llamados or 'ninguno'}")
    return conf


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
        "token_required": bool(DEMO_API_TOKEN),
        "active_conferences": len(CONFERENCES),
    }


@app.api_route("/incoming-call", methods=["GET", "POST"], response_class=PlainTextResponse)
async def incoming_call(request: Request):
    """Webhook que Twilio llama cuando entra una llamada al número."""
    form = await request.form()
    call_sid = form.get("CallSid", "unknown")
    from_number = form.get("From", "unknown")
    print(f"📞 Llamada {call_sid} de {from_number} → agente IA (stream)")
    return PlainTextResponse(content=create_ai_leg_twiml(), media_type="application/xml")


@app.api_route("/ai-leg", methods=["GET", "POST"], response_class=PlainTextResponse)
async def ai_leg(request: Request):
    """TwiML del leg del agente IA (mismo stream que /incoming-call)."""
    form = await request.form()
    motivo = request.query_params.get("motivo", "")
    conference = request.query_params.get("conference", "")
    print(f"🤖 Leg IA para CallSid {form.get('CallSid', 'unknown')} · sala {conference or '-'}")
    return PlainTextResponse(
        content=create_ai_leg_twiml(motivo=motivo, conference=conference),
        media_type="application/xml",
    )


@app.post("/conference-events", response_class=PlainTextResponse)
async def conference_events(request: Request):
    """Status callback de Twilio: mantiene el registro al día sin hacer polling."""
    form = await request.form()
    event = form.get("StatusCallbackEvent")
    name = form.get("FriendlyName")
    conf = CONFERENCES.get(name) if name else None
    if conf:
        conf["conference_sid"] = form.get("ConferenceSid")
        if event == "conference-start":
            conf["status"] = "en_curso"
        elif event == "conference-end":
            conf["status"] = "terminada"
    print(f"📡 Conference event: {event} | {name} | {form.get('ConferenceSid')}")
    return PlainTextResponse(content="OK")


@app.get("/conferences")
async def list_conferences():
    """Conferencias registradas por esta instancia (para depurar en vivo)."""
    return {"conferences": list(CONFERENCES.values())}


@app.post("/transfer")
async def transfer(call_sid: str, motivo: str = "solicitado a mano", to: Optional[str] = None,
                   x_demo_token: Optional[str] = Header(default=None)):
    """Dispara la transferencia a mano, sin esperar a que la IA use la tool."""
    require_token(x_demo_token)
    return start_transfer(call_sid, motivo, to)


@app.post("/add-participant")
async def add_participant(conference_name: str, to: Optional[str] = None,
                          label: str = "extra",
                          x_demo_token: Optional[str] = Header(default=None)):
    """
    Añade personas a una conferencia ya creada. Repetible: sala de N personas.
    `to` admite varios números separados por coma; sin `to`, los del entorno.
    """
    require_token(x_demo_token)
    destinations = _parse_participants(to) if to else list(CONFERENCE_PARTICIPANTS)
    if not destinations:
        raise HTTPException(
            status_code=400,
            detail="No hay a quién llamar: rellena CONFERENCE_PARTICIPANTS o pasa 'to'",
        )
    conf = CONFERENCES.get(conference_name)
    added, failed = [], []
    for index, destination in enumerate(destinations):
        this_label = label if len(destinations) == 1 else f"{label}-{index + 1}"
        try:
            participant = twilio_client.conferences(conference_name).participants.create(
                from_=TWILIO_PHONE_NUMBER,
                to=destination,
                label=this_label,
                start_conference_on_enter=True,
                end_conference_on_exit=False,
            )
        except Exception as error:
            print(f"⚠️  No se pudo añadir {destination}: {error}")
            failed.append({"to": destination, "detail": str(error)})
            continue
        entry = {"label": this_label, "call_sid": participant.call_sid, "to": destination}
        added.append(entry)
        if conf:
            conf["participants"].append(entry)
    return {"status": "ok" if added else "error", "added": added, "failed": failed}


@app.post("/remove-participant")
async def remove_participant(conference_name: str, call_sid: str,
                             x_demo_token: Optional[str] = Header(default=None)):
    """Saca a un participante de la conferencia (la baja de la IA irá por aquí)."""
    require_token(x_demo_token)
    twilio_client.conferences(conference_name).participants(call_sid).delete()
    conf = CONFERENCES.get(conference_name)
    if conf:
        conf["participants"] = [p for p in conf["participants"] if p["call_sid"] != call_sid]
    return {"status": "ok", "removed": call_sid}


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
            "tools": [TRANSFER_TOOL],
            "tool_choice": "auto",
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
    call_sid: Optional[str] = None
    context: dict = {}
    started = asyncio.Event()

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
            nonlocal stream_sid, call_sid, context
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
                        call_sid = msg["start"].get("callSid")
                        context = msg["start"].get("customParameters") or {}
                        started.set()
                        sala = context.get("conference")
                        print(f"▶️  Stream iniciado ({stream_sid}) CallSid {call_sid}"
                              + (f" · sala {sala}" if sala else ""))
                    elif event == "stop":
                        print("⏹️  Stream detenido")
                        break
            except WebSocketDisconnect:
                print("🔌 Twilio colgó")
            except Exception as e:
                print(f"❌ Error en twilio_to_openai: {e}")
            finally:
                await openai_ws.close()

        async def handle_transfer(tool_call_id: str, arguments: str):
            """La IA ha pedido pasar la llamada: montamos la conferencia."""
            try:
                motivo = json.loads(arguments or "{}").get("motivo", "sin motivo")
            except json.JSONDecodeError:
                motivo = "sin motivo"

            if not call_sid:
                resultado = {"ok": False, "error": "todavía no conozco el CallSid"}
            else:
                try:
                    # El SDK de Twilio es síncrono: fuera del event loop.
                    conf = await asyncio.to_thread(start_transfer, call_sid, motivo)
                    resultado = {"ok": True, "conferencia": conf["name"]}
                except Exception as e:
                    resultado = {"ok": False, "error": str(e)}

            await openai_ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": tool_call_id,
                    "output": json.dumps(resultado, ensure_ascii=False),
                },
            }))
            # Que confirme en voz alta antes de que el leg se vaya a la sala.
            await openai_ws.send(json.dumps({
                "type": "response.create",
                "response": {"instructions": (
                    "Di en una frase que ya estás pasando la llamada y que no cuelgue."
                    if resultado["ok"] else
                    "Discúlpate en una frase: no has podido pasar la llamada."
                )},
            }))

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
                    elif etype == "response.function_call_arguments.done":
                        if event.get("name") == "transfer_to_human":
                            print(f"🙋 La IA pide humano: {event.get('arguments')}")
                            await handle_transfer(event.get("call_id"), event.get("arguments"))
                    elif etype == "input_audio_buffer.speech_started":
                        # Barge-in: si el usuario interrumpe, vaciamos lo que quede por sonar.
                        print("🎤 Usuario hablando")
                        if stream_sid:
                            await websocket.send_json({"event": "clear", "streamSid": stream_sid})
                        await openai_ws.send(json.dumps({"type": "response.cancel"}))
                    elif etype == "response.output_audio_transcript.done":
                        print(f"🗣️  IA: {event.get('transcript', '')}")
                    elif etype == "session.updated":
                        # Esperamos al evento start para saber si entramos a una
                        # llamada 1-a-1 o a una sala de transferencia ya montada.
                        try:
                            await asyncio.wait_for(started.wait(), timeout=3)
                        except asyncio.TimeoutError:
                            pass
                        motivo = context.get("motivo")
                        instructions = (
                            "Acabas de entrar en una llamada con quien llamó y con una persona "
                            f"del equipo. Preséntate en una frase y resume por qué se ha escalado: {motivo}. "
                            "Después deja hablar a las personas y solo intervén si te preguntan."
                            if motivo else GREETING
                        )
                        await openai_ws.send(json.dumps({
                            "type": "response.create",
                            "response": {"instructions": instructions},
                        }))
                    elif etype == "error":
                        print(f"❌ OpenAI error: {json.dumps(event.get('error', event))[:300]}")
            except Exception as e:
                print(f"❌ Error en openai_to_twilio: {e}")

        await asyncio.gather(twilio_to_openai(), openai_to_twilio())

    print("🔌 Conexión con OpenAI Realtime cerrada")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
