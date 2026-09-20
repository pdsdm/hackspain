// T58: un «no» de una contraparte tiene que llegar al coordinador. Antes se perdía: el
// evento call_result viajaba sin texto y el snapshot no llevaba ningún resultado de llamada,
// así que el razonador replanificaba a ciegas y repetía la misma llamada.
import assert from "node:assert/strict";
import test from "node:test";

import { buildUserPrompt } from "../src/agents/coordinator/prompt.js";
import { liveCoordinatorInput } from "../src/agents/coordinator/scenario.js";
import type { SpecialistResultEnvelope } from "../src/contracts/api.js";
import { WorkflowService, callResultText } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

function deps() {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  return { database, states, tasks, workflows };
}

function envelope(input: {
  taskId: string;
  runId: string;
  planVersion: number;
  outcome: SpecialistResultEnvelope["result"]["outcome"];
  summary: string;
  conditions?: string[];
  data?: Record<string, unknown>;
}): SpecialistResultEnvelope {
  return {
    eventId: `event-${input.taskId}`,
    taskId: input.taskId,
    runId: input.runId,
    planVersion: input.planVersion,
    status: "completed",
    result: {
      outcome: input.outcome,
      summary: input.summary,
      conditions: input.conditions ?? [],
      evidence: { callId: `call-${input.taskId}`, transcript: [{ who: "humano", text: "No puedo", at: 3 }] },
      data: input.data ?? {},
    },
  };
}

function dispatch(bundle: ReturnType<typeof deps>, area: string, counterpart: string) {
  const run = bundle.states.ensureActiveRun();
  const task = bundle.tasks.enqueue({
    runId: run.id,
    planVersion: run.state.planVersion,
    area,
    kind: "call",
    payload: { objective: "Confirmar Pabellón B para 450", counterpart, data: { candidateIds: ["pabellonB"] } },
    idempotencyKey: `call-${area}`,
  });
  const state = structuredClone(run.state);
  state.calls = [
    ...(Array.isArray(state.calls) ? state.calls : []),
    { id: `call-${task.id}`, agent: area, counterpart, channel: "llamada", status: "en_curso", transcript: [] },
  ];
  bundle.states.saveState(run.id, state);
  bundle.tasks.markDispatchOutcome(task.id, "dispatched");
  return { run, task };
}

test("el texto del evento call_result lleva el resultado y sus condiciones", () => {
  const text = callResultText(envelope({
    taskId: "t1",
    runId: "r1",
    planVersion: 1,
    outcome: "rejected",
    summary: "El recinto no cede el Pabellón B.",
    conditions: ["Nada antes de las 14:00"],
  }));
  assert.match(text, /rejected/);
  assert.match(text, /El recinto no cede el Pabellón B\./);
  assert.match(text, /Condiciones: Nada antes de las 14:00\./);
});

test("un rechazo queda en la llamada, entra en el snapshot y se ve en el prompt", () => {
  const bundle = deps();
  try {
    const { run, task } = dispatch(bundle, "espacios", "Responsable de recinto");
    bundle.workflows.recordSpecialistResult(envelope({
      taskId: task.id,
      runId: run.id,
      planVersion: run.state.planVersion,
      outcome: "rejected",
      summary: "El recinto no cede el Pabellón B a esa hora.",
      conditions: ["Nada antes de las 14:00"],
    }));

    const state = bundle.states.ensureActiveRun().state;
    const call = (state.calls as Array<Record<string, unknown>>)[0]!;
    assert.equal(call.outcome, "rejected");
    assert.equal(call.status, "terminada");

    const input = liveCoordinatorInput(state);
    assert.equal(input.callResults?.length, 1);
    assert.deepEqual(input.callResults?.[0], {
      area: "espacios",
      counterpart: "Responsable de recinto",
      channel: "llamada",
      outcome: "rejected",
      summary: "El recinto no cede el Pabellón B a esa hora.",
      conditions: ["Nada antes de las 14:00"],
    });

    const prompt = buildUserPrompt(input);
    assert.match(prompt, /RESULTADOS DE LLAMADAS/);
    assert.match(prompt, /REJECTED: El recinto no cede el Pabellón B a esa hora/);
    assert.match(prompt, /No repitas una petición ya contestada/);
  } finally {
    bundle.database.close();
  }
});

test("sin ninguna llamada contestada el prompt lo dice en vez de callar", () => {
  const bundle = deps();
  try {
    const prompt = buildUserPrompt(liveCoordinatorInput(bundle.states.ensureActiveRun().state));
    assert.match(prompt, /RESULTADOS DE LLAMADAS/);
    assert.match(prompt, /Todavía no hay ninguna respuesta/);
  } finally {
    bundle.database.close();
  }
});

test("un espacio «no disponible» pasa a descartado y cuenta como cambio material", () => {
  const bundle = deps();
  try {
    const { run, task } = dispatch(bundle, "espacios", "Responsable de recinto");
    const recorded = bundle.workflows.recordSpecialistResult(envelope({
      taskId: task.id,
      runId: run.id,
      planVersion: run.state.planVersion,
      outcome: "rejected",
      summary: "Pabellón B está fuera de servicio todo el día.",
      data: { spaces: [{ id: "pabellonB", availability: "no_disponible" }] },
    }));

    const space = bundle.states
      .ensureActiveRun()
      .state.spaces.find((item) => item.id === "pabellonB");
    assert.equal(space?.status, "descartado");
    assert.equal(space?.note, "Pabellón B está fuera de servicio todo el día.");
    // Un cambio material vuelve a llamar al coordinador con un resumen de por qué.
    assert.equal(recorded.materialChange, true);
    assert.match(String(recorded.materialSummary), /pabellonB: no disponible/);
  } finally {
    bundle.database.close();
  }
});

test("un aforo nuevo sigue aplicándose solo cuando la contraparte acepta", () => {
  const bundle = deps();
  try {
    const { run, task } = dispatch(bundle, "espacios", "Responsable de recinto");
    bundle.workflows.recordSpecialistResult(envelope({
      taskId: task.id,
      runId: run.id,
      planVersion: run.state.planVersion,
      outcome: "accepted_with_conditions",
      summary: "Cabe, pero solo 400 y a partir de las 13:15.",
      conditions: ["Montaje hasta 13:15"],
      data: { spaces: [{ id: "pabellonB", capacity: 400, readyAt: "13:15" }] },
    }));
    const space = bundle.states
      .ensureActiveRun()
      .state.spaces.find((item) => item.id === "pabellonB");
    assert.equal(space?.capacity, 400);
    assert.equal(space?.readyAt, 47700);
    assert.notEqual(space?.status, "descartado");
  } finally {
    bundle.database.close();
  }
});
