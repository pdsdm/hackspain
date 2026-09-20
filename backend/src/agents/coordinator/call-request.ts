// La tool `emitir_llamada` del coordinador de HappyRobot entra por aquí.
//
// Antes esa tool hacía POST directo al hook del agente de voz. Eso dejaba fuera al backend:
// el teléfono lo copiaba el modelo de un directorio escrito en el prompt, y el resultado
// volvía con un taskId que el backend no conocía, así que `POST /workflow/happyrobot/results`
// lo rechazaba con 404 y el «no» de la contraparte se perdía. Pasando por el backend, el
// número sale del panel, la tarea existe y el resultado encaja.
import { createHash } from "node:crypto";

import type { AreaHook } from "../../config.js";
import type { StateRepository } from "../../state/state-repository.js";
import type { TaskRepository } from "../../state/task-repository.js";

const AREAS: readonly AreaHook[] = ["espacios", "catering", "transporte", "asistentes"];

export interface CallRequestResult {
  ok: boolean;
  stale: boolean;
  error: string | null;
  taskId: string | null;
  callId: string | null;
  status: string | null;
}

export interface CallDispatcher {
  dispatchNow(taskId: string): Promise<string>;
}

export interface CallRequestDeps {
  states: StateRepository;
  tasks: TaskRepository;
  executor: CallDispatcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function readNumber(body: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function fail(error: string, stale = false): CallRequestResult {
  return { ok: false, stale, error, taskId: null, callId: null, status: null };
}

export async function requestCall(rawBody: unknown, deps: CallRequestDeps): Promise<CallRequestResult> {
  if (!isRecord(rawBody)) return fail("cuerpo inválido");

  const area = readString(rawBody, "area");
  if (!area) return fail(`area es obligatoria y debe ser una de: ${AREAS.join(", ")}`);
  if (!AREAS.includes(area as AreaHook)) {
    return fail(`area "${area}" no existe; usa una de: ${AREAS.join(", ")}`);
  }
  const objective = readString(rawBody, "objective");
  if (!objective) return fail("objective es obligatorio: es el encargo literal de la llamada");

  // El plan manda: una llamada de una versión que ya no está en pie no debe salir.
  const run = deps.states.ensureActiveRun();
  const runId = readString(rawBody, "run_id", "runId");
  if (runId !== undefined && runId !== run.id) return fail("run_id obsoleto", true);
  const planVersion = readNumber(rawBody, "plan_version", "planVersion");
  if (planVersion !== undefined && planVersion !== run.state.planVersion) {
    return fail("plan_version obsoleta", true);
  }

  const counterpart = readString(rawBody, "counterpart") ?? "Interlocutor";
  const reason = readString(rawBody, "reason");
  const payload = {
    objective,
    counterpart,
    ...(reason ? { reason } : {}),
    dependsOnKeys: [],
    data: {},
  };

  // Si el plan ya dejó encolada la llamada de esa área, se usa esa tarea: así su clave se
  // completa y las acciones que dependen de ella se desbloquean.
  const planned = deps.tasks
    .listOpen(run.id)
    .find((task) => task.area === area && task.kind === "call" && task.status === "pending");
  const task = planned ?? deps.tasks.enqueue({
    runId: run.id,
    planVersion: run.state.planVersion,
    area,
    kind: "call",
    payload,
    idempotencyKey: `call:${run.state.planVersion}:${area}:${createHash("sha256").update(objective).digest("hex").slice(0, 12)}`,
  });
  if (planned) {
    const current = isRecord(planned.payload) ? planned.payload : {};
    deps.tasks.updatePayload(planned.id, { ...current, ...payload, dependsOnKeys: current.dependsOnKeys ?? [] });
  }

  const status = await deps.executor.dispatchNow(task.id);
  return { ok: true, stale: false, error: null, taskId: task.id, callId: `call-${task.id}`, status };
}
