import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOutcome, translateHappyRobotResult } from "../src/actions/adapters/happyrobot-inbound.js";
import { ContractError } from "../src/contracts/api.js";
import type { DispatchTask } from "../src/state/task-repository.js";

const TASK: DispatchTask = {
  id: "7a31c0de",
  runId: "3bd0a1f2",
  planVersion: 2,
  area: "espacios",
  kind: "call",
  payload: { objective: "Confirmar el Pabellón B", counterpart: "Responsable de recinto" },
  idempotencyKey: "coord-1:consultar-pabellon-b",
  status: "dispatched",
  attempts: 1,
};

const tasks = { get: (id: string) => (id === TASK.id ? TASK : undefined) };

test("traduce el payload plano del workflow", () => {
  const envelope = translateHappyRobotResult(
    {
      task_id: TASK.id,
      call_id: "call-7a31c0de",
      session_id: "hr-session-9",
      outcome: "accepted with conditions",
      summary: "Lounge disponible desde las 13:15 por 900 €.",
      conditions: ["Montaje termina a las 13:15"],
    },
    tasks,
  );

  assert.equal(envelope.taskId, TASK.id);
  assert.equal(envelope.runId, TASK.runId);
  assert.equal(envelope.planVersion, TASK.planVersion);
  assert.equal(envelope.status, "completed");
  assert.equal(envelope.result.outcome, "accepted_with_conditions");
  assert.deepEqual(envelope.result.conditions, ["Montaje termina a las 13:15"]);
  assert.equal(envelope.result.evidence.sessionId, "hr-session-9");
  assert.equal(envelope.result.evidence.callId, "call-7a31c0de");
  assert.equal(envelope.eventId, "hr-hr-session-9");
});

test("recupera la tarea desde el callId cuando el workflow no devuelve taskId", () => {
  const envelope = translateHappyRobotResult(
    { data: { callId: `call-${TASK.id}`, resultado: "aceptado", resumen: "Reserva confirmada" } },
    tasks,
  );
  assert.equal(envelope.taskId, TASK.id);
  assert.equal(envelope.result.outcome, "accepted");
  assert.equal(envelope.result.summary, "Reserva confirmada");
});

test("el contexto sale de la tarea, no del cuerpo", () => {
  const envelope = translateHappyRobotResult(
    { taskId: TASK.id, runId: "otra-ejecucion", planVersion: 99, outcome: "accepted", summary: "ok" },
    tasks,
  );
  assert.equal(envelope.runId, TASK.runId);
  assert.equal(envelope.planVersion, TASK.planVersion);
});

test("sin eventId ni sesión, el eventId se deriva de la tarea y es estable", () => {
  const body = { taskId: TASK.id, outcome: "rejected", summary: "No hay hueco" };
  const first = translateHappyRobotResult(body, tasks);
  const second = translateHappyRobotResult(body, tasks);
  assert.equal(first.eventId, `hr-${TASK.id}`);
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.status, "completed");
  assert.equal(first.result.outcome, "rejected");
});

test("mapea la transcripción de HappyRobot a las líneas del contrato", () => {
  const envelope = translateHappyRobotResult(
    {
      taskId: TASK.id,
      outcome: "accepted",
      summary: "Confirmado",
      messages: [
        { role: "assistant", content: "Llamo por el Pabellón B", start: 3 },
        { role: "user", content: "Lo tenemos libre a las 13:00" },
      ],
    },
    tasks,
  );
  assert.deepEqual(envelope.result.evidence.transcript, [
    { who: "agente", text: "Llamo por el Pabellón B", at: 3 },
    { who: "humano", text: "Lo tenemos libre a las 13:00", at: 5 },
  ]);
});

test("acepta una transcripción en texto plano con el hablante por delante", () => {
  const envelope = translateHappyRobotResult(
    {
      taskId: TASK.id,
      outcome: "accepted",
      summary: "Confirmado",
      transcript: "Agente: buenas tardes\nCliente: dígame",
    },
    tasks,
  );
  assert.deepEqual(envelope.result.evidence.transcript, [
    { who: "agente", text: "buenas tardes", at: 0 },
    { who: "humano", text: "dígame", at: 5 },
  ]);
});

test("una llamada sin respuesta se deduce del estado de la llamada", () => {
  const envelope = translateHappyRobotResult(
    { taskId: TASK.id, call_status: "no answer", summary: "Buzón de voz" },
    tasks,
  );
  assert.equal(envelope.status, "no_answer");
  assert.equal(envelope.result.outcome, "no_answer");
});

test("también acepta el sobre estricto del contrato", () => {
  const envelope = translateHappyRobotResult(
    {
      eventId: "hr-event-1",
      taskId: TASK.id,
      runId: TASK.runId,
      planVersion: TASK.planVersion,
      status: "completed",
      result: {
        outcome: "accepted_with_conditions",
        summary: "Lounge disponible a las 13:15",
        conditions: ["Montaje termina a las 13:15"],
        evidence: {
          callId: "call-espacios-1",
          transcript: [{ who: "humano", text: "El montaje termina a las 13:15", at: 31 }],
        },
        data: { commitmentId: "c-pabB" },
      },
    },
    tasks,
  );
  assert.equal(envelope.eventId, "hr-event-1");
  assert.equal(envelope.result.evidence.callId, "call-espacios-1");
  assert.equal(envelope.result.evidence.transcript?.length, 1);
  assert.equal(envelope.result.data.commitmentId, "c-pabB");
});

test("un cuerpo sin tarea identificable es 400", () => {
  assert.throws(
    () => translateHappyRobotResult({ outcome: "accepted", summary: "x" }, tasks),
    (error: unknown) => error instanceof ContractError && error.status === 400,
  );
});

test("una tarea desconocida es 404", () => {
  assert.throws(
    () => translateHappyRobotResult({ taskId: "no-existe", outcome: "accepted" }, tasks),
    (error: unknown) => error instanceof ContractError && error.status === 404,
  );
});

test("un resultado que no se puede clasificar es 400 en vez de un acuerdo inventado", () => {
  assert.throws(
    () => translateHappyRobotResult({ taskId: TASK.id, summary: "Hemos hablado" }, tasks),
    (error: unknown) => error instanceof ContractError && error.status === 400,
  );
  assert.throws(
    () => translateHappyRobotResult({ taskId: TASK.id, status: "completed", summary: "x" }, tasks),
    (error: unknown) => error instanceof ContractError && error.status === 400,
  );
});

test("normaliza el resultado en español y en inglés", () => {
  assert.equal(normalizeOutcome("Aceptado con condiciones"), "accepted_with_conditions");
  assert.equal(normalizeOutcome("RECHAZADO"), "rejected");
  assert.equal(normalizeOutcome("no contesta"), "no_answer");
  assert.equal(normalizeOutcome("voicemail"), "no_answer");
  assert.equal(normalizeOutcome("failed"), "failed");
  assert.equal(normalizeOutcome("sí"), "accepted");
  assert.equal(normalizeOutcome("booked"), undefined);
});
