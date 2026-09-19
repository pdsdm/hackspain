// Traduce el webhook nativo de HappyRobot al SpecialistResultEnvelope del contrato.
//
// La forma exacta del cuerpo la decide quien monta el workflow en la plataforma, así que
// aquí no se asume un esquema: se buscan los campos por varios nombres y en varios niveles.
// La puerta estricta sigue siendo POST /workflow/results; esta es la tolerante.
import {
  ContractError,
  isRecord,
  parseSpecialistResult,
  type SpecialistOutcome,
  type SpecialistResultEnvelope,
  type TranscriptLine,
} from "../../contracts/api.js";
import type { DispatchTask } from "../../state/task-repository.js";

export interface TaskLookup {
  get(taskId: string): DispatchTask | undefined;
}

type Scopes = Array<Record<string, unknown>>;

const CONTAINER_KEYS = [
  "data",
  "output",
  "outputs",
  "result",
  "results",
  "payload",
  "extracted",
  "variables",
  "evidence",
  "call",
  "context",
];

/**
 * El cuerpo, más los sobres donde HappyRobot suele anidar la salida del workflow. Dos
 * niveles bastan y cubren de paso el sobre estricto del contrato (`result.evidence`).
 */
function scopesOf(body: Record<string, unknown>): Scopes {
  const scopes: Scopes = [body];
  let frontier = 0;
  for (let depth = 0; depth < 2; depth += 1) {
    const end = scopes.length;
    for (let index = frontier; index < end; index += 1) {
      for (const key of CONTAINER_KEYS) {
        const value = (scopes[index] as Record<string, unknown>)[key];
        if (isRecord(value) && !scopes.includes(value)) scopes.push(value);
      }
    }
    frontier = end;
  }
  return scopes;
}

function firstString(scopes: Scopes, keys: string[]): string | undefined {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return undefined;
}

function firstBoolean(scopes: Scopes, keys: string[]): boolean | undefined {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === "boolean") return value;
    }
  }
  return undefined;
}

function firstArray(scopes: Scopes, keys: string[]): unknown[] | undefined {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (Array.isArray(value)) return value;
    }
  }
  return undefined;
}

function firstRecord(scopes: Scopes, keys: string[]): Record<string, unknown> | undefined {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      if (isRecord(value)) return value;
    }
  }
  return undefined;
}

/** Minúsculas y sin tildes: el workflow puede contestar en español o en inglés. */
function plain(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matches(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

// Respuestas de una sola palabra: "ok" o "no" como subcadena aparecerían dentro de
// demasiadas otras ("booked", "unknown"), así que solo valen si son el valor entero.
const EXACT_OUTCOMES: Record<string, SpecialistOutcome> = {
  ok: "accepted",
  yes: "accepted",
  si: "accepted",
  true: "accepted",
  no: "rejected",
  false: "rejected",
};

export function normalizeOutcome(value: string): SpecialistOutcome | undefined {
  const text = plain(value).trim();
  const exact = EXACT_OUTCOMES[text];
  if (exact) return exact;
  if (matches(text, ["condicion", "condition"])) return "accepted_with_conditions";
  if (matches(text, ["recha", "reject", "declin", "denie", "no acepta", "negativ"])) return "rejected";
  if (
    matches(text, [
      "no_answer",
      "no answer",
      "no contesta",
      "sin respuesta",
      "no responde",
      "voicemail",
      "buzon",
      "unanswered",
      "no_response",
      "missed",
      "busy",
      "comunica",
    ])
  ) {
    return "no_answer";
  }
  if (matches(text, ["fail", "fallo", "error", "abort"])) return "failed";
  if (
    matches(text, [
      "accept",
      "acept",
      "success",
      "exito",
      "confirmad",
      "confirmed",
      "agreed",
      "acuerdo",
      "completed",
    ])
  ) {
    return "accepted";
  }
  return undefined;
}

function statusFor(outcome: SpecialistOutcome): "completed" | "failed" | "no_answer" {
  if (outcome === "no_answer") return "no_answer";
  if (outcome === "failed") return "failed";
  return "completed";
}

function readOutcome(scopes: Scopes): SpecialistOutcome {
  const raw = firstString(scopes, [
    "outcome",
    "resultado",
    "disposition",
    "classification",
    "call_outcome",
    "callOutcome",
    "verdict",
  ]);
  const fromText = raw ? normalizeOutcome(raw) : undefined;
  if (fromText) return fromText;

  const flag = firstBoolean(scopes, ["accepted", "aceptado", "success", "successful"]);
  if (flag === true) return "accepted";
  if (flag === false) return "rejected";
  if (firstBoolean(scopes, ["answered", "contestada"]) === false) return "no_answer";

  // El status por sí solo solo resuelve los casos en los que no hubo conversación:
  // "completed" no dice si la contraparte aceptó.
  const status = firstString(scopes, ["status", "estado", "call_status", "callStatus"]);
  const fromStatus = status ? normalizeOutcome(status) : undefined;
  if (fromStatus === "no_answer" || fromStatus === "failed") return fromStatus;

  throw new ContractError(
    "No se reconoce el resultado de la llamada: falta outcome (accepted, accepted_with_conditions, rejected, no_answer o failed)",
  );
}

function readConditions(scopes: Scopes): string[] {
  const keys = ["conditions", "condiciones", "constraints"];
  const list = firstArray(scopes, keys);
  if (list) {
    return list
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .map((item) => item.trim());
  }
  const text = firstString(scopes, keys);
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

const AGENT_SPEAKERS = ["agent", "agente", "assistant", "ai", "bot", "robot", "system"];

function speakerToWho(value: string | undefined): "agente" | "humano" {
  return value !== undefined && matches(plain(value), AGENT_SPEAKERS) ? "agente" : "humano";
}

function lineFromRecord(item: Record<string, unknown>, index: number): TranscriptLine | undefined {
  const scopes: Scopes = [item];
  const text = firstString(scopes, ["text", "content", "message", "utterance", "transcript", "value"]);
  if (text === undefined) return undefined;
  const at = ["at", "seconds", "start", "startSeconds", "offset", "timestamp", "time"]
    .map((key) => item[key])
    .find((value) => typeof value === "number" && Number.isFinite(value));
  return {
    who: speakerToWho(firstString(scopes, ["who", "role", "speaker", "from", "source", "participant"])),
    text,
    at: typeof at === "number" ? Math.max(0, Math.round(at)) : index * 5,
  };
}

/** Una transcripción de texto plano, con "Agente: hola" por líneas. */
function linesFromText(raw: string): TranscriptLine[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line, index) => {
      const match = /^([\p{L} ]{1,20}):\s+(.+)$/u.exec(line);
      if (match === null) return { who: "humano", text: line, at: index * 5 };
      return { who: speakerToWho(match[1]), text: match[2] as string, at: index * 5 };
    });
}

function readTranscript(scopes: Scopes): TranscriptLine[] {
  const keys = ["transcript", "transcripts", "messages", "conversation", "turns", "dialog", "dialogue"];
  const list = firstArray(scopes, keys);
  if (list) {
    return list
      .map((item, index) => {
        if (isRecord(item)) return lineFromRecord(item, index);
        if (typeof item === "string" && item.trim() !== "") {
          return { who: "humano" as const, text: item.trim(), at: index * 5 };
        }
        return undefined;
      })
      .filter((line): line is TranscriptLine => line !== undefined);
  }
  const text = firstString(scopes, keys);
  return text === undefined ? [] : linesFromText(text);
}

/** El callId que manda el backend es `call-<taskId>`, así que sirve para recuperar la tarea. */
function taskIdFromCallId(callId: string | undefined): string | undefined {
  const prefix = "call-";
  return callId?.startsWith(prefix) === true ? callId.slice(prefix.length) : undefined;
}

export interface HappyRobotTranscriptUpdate {
  taskId: string;
  callId: string;
  sessionId?: string;
  happyrobotRunId?: string;
  transcript: TranscriptLine[];
}

export function translateHappyRobotTranscript(
  body: unknown,
  tasks: TaskLookup,
): HappyRobotTranscriptUpdate {
  if (!isRecord(body)) throw new ContractError("body must be an object");
  const scopes = scopesOf(body);
  const callId = firstString(scopes, ["callId", "call_id"]);
  const taskId = firstString(scopes, ["taskId", "task_id"]) ?? taskIdFromCallId(callId);
  if (taskId === undefined) {
    throw new ContractError(
      "No se puede identificar la tarea: falta taskId y callId no tiene la forma call-<taskId>",
    );
  }
  const task = tasks.get(taskId);
  if (!task) throw new ContractError(`Task not found: ${taskId}`, 404);
  const expectedCallId = `call-${task.id}`;
  if (callId !== undefined && callId !== expectedCallId) {
    throw new ContractError("callId does not belong to taskId");
  }
  const sessionId = firstString(scopes, ["sessionId", "session_id", "conversationId", "conversation_id"]);
  const happyrobotRunId = firstString(scopes, ["happyrobotRunId", "happyrobot_run_id", "workflowRunId", "workflow_run_id", "run_id"]);
  const transcript = readTranscript(scopes);
  if (transcript.length === 0 && sessionId === undefined && happyrobotRunId === undefined) {
    throw new ContractError("El callback parcial necesita transcript, session_id o happyrobot_run_id");
  }
  return {
    taskId: task.id,
    callId: expectedCallId,
    ...(sessionId ? { sessionId } : {}),
    ...(happyrobotRunId ? { happyrobotRunId } : {}),
    transcript,
  };
}

export function translateHappyRobotResult(body: unknown, tasks: TaskLookup): SpecialistResultEnvelope {
  if (!isRecord(body)) throw new ContractError("body must be an object");
  const scopes = scopesOf(body);

  const callId = firstString(scopes, ["callId", "call_id"]);
  const taskId = firstString(scopes, ["taskId", "task_id"]) ?? taskIdFromCallId(callId);
  if (taskId === undefined) {
    throw new ContractError(
      "No se puede identificar la tarea: falta taskId y callId no tiene la forma call-<taskId>",
    );
  }
  const task = tasks.get(taskId);
  if (!task) throw new ContractError(`Task not found: ${taskId}`, 404);

  const sessionId = firstString(scopes, [
    "sessionId",
    "session_id",
    "conversationId",
    "conversation_id",
    "callSid",
    "call_sid",
  ]);
  const outcome = readOutcome(scopes);
  const transcript = readTranscript(scopes);
  const summary = firstString(scopes, [
    "summary",
    "resumen",
    "notes",
    "note",
    "outcome_summary",
    "message",
    "description",
  ]);

  return parseSpecialistResult({
    // Sin eventId propio, la sesión de HappyRobot hace de clave de idempotencia: reenviar
    // el mismo webhook no aplica el resultado dos veces.
    eventId: firstString(scopes, ["eventId", "event_id"]) ?? `hr-${sessionId ?? taskId}`,
    taskId: task.id,
    // El contexto lo pone el backend, no el workflow: una sesión de HappyRobot no sabe en
    // qué ejecución ni en qué versión del plan vive la tarea.
    runId: task.runId,
    planVersion: task.planVersion,
    status: statusFor(outcome),
    result: {
      outcome,
      summary: summary ?? `Llamada de HappyRobot sin resumen (${outcome})`,
      conditions: readConditions(scopes),
      evidence: {
        ...(sessionId !== undefined ? { sessionId } : {}),
        callId: callId ?? `call-${task.id}`,
        ...(transcript.length > 0 ? { transcript } : {}),
      },
      data: firstRecord(scopes, ["structured", "extracted", "data"]) ?? {},
    },
  });
}
