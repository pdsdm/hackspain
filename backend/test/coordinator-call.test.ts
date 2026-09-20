import assert from "node:assert/strict";
import test from "node:test";

import { translateHappyRobotResult } from "../src/actions/adapters/happyrobot-inbound.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { requestCall } from "../src/agents/coordinator/call-request.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { ContactRepository } from "../src/state/contact-repository.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

function harness(callsOnDemand = true) {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const contacts = new ContactRepository(database.connection);
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { espacios: "http://hook.test/espacios" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
    callsOnDemand,
  };
  const executor = new ActionExecutor(states, tasks, workflows, config, contacts);
  const run = states.ensureActiveRun();
  const state = structuredClone(run.state);
  state.clock.paused = false;
  states.saveState(run.id, state);
  return { database, states, tasks, workflows, contacts, executor };
}

function plannedCall(states: StateRepository, tasks: TaskRepository) {
  const run = states.ensureActiveRun();
  return tasks.enqueue({
    runId: run.id,
    planVersion: run.state.planVersion,
    area: "espacios",
    kind: "call",
    payload: { objective: "Preguntar por Pabellón B", counterpart: "Recinto", dependsOnKeys: [] },
    idempotencyKey: "plan:espacios",
  });
}

function captureFetch(): { bodies: Array<Record<string, unknown>>; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { bodies, restore: () => { globalThis.fetch = original; } };
}

test("con llamadas a petición, el tick no marca la llamada del plan", () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    const task = plannedCall(states, tasks);
    executor.pump();
    // Antes salía aquí, y volvía a salir cuando el coordinador usaba emitir_llamada: el mismo
    // encargo marcaba dos veces al mismo número.
    assert.equal(fetched.bodies.length, 0);
    assert.equal(tasks.get(task.id)?.status, "pending");
    assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 0);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("sin llamadas a petición, el tick sigue marcando como siempre", async () => {
  const { database, states, tasks, executor } = harness(false);
  const fetched = captureFetch();
  try {
    const task = plannedCall(states, tasks);
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(tasks.get(task.id)?.status, "dispatched");
  } finally {
    fetched.restore();
    database.close();
  }
});

test("emitir_llamada reutiliza la tarea del plan, marca al teléfono del panel y su resultado encaja", async () => {
  const { database, states, tasks, workflows, contacts, executor } = harness();
  const fetched = captureFetch();
  try {
    const planned = plannedCall(states, tasks);
    contacts.set("espacios", "+34611222333");

    const result = await requestCall(
      {
        run_id: states.ensureActiveRun().id,
        plan_version: states.ensureActiveRun().state.planVersion,
        area: "espacios",
        objective: "Preguntar si Pabellón B admite 450 antes de las 13:00",
        counterpart: "Recinto MADRING",
        reason: "El Lounge Sur se ha caído",
      },
      { states, tasks, executor },
    );

    assert.equal(result.ok, true);
    assert.equal(result.stale, false);
    assert.equal(result.status, "dispatched");
    // La tarea es la del plan, no una segunda: así solo sale una llamada y las acciones que
    // dependen de ella se desbloquean cuando se complete.
    assert.equal(result.taskId, planned.id);
    assert.equal(tasks.listOpen(states.ensureActiveRun().id).length, 1);

    assert.equal(fetched.bodies.length, 1);
    const body = fetched.bodies[0]!;
    assert.equal(body.phone_number, "+34611222333");
    assert.equal(body.objective, "Preguntar si Pabellón B admite 450 antes de las 13:00");
    assert.equal(body.counterpart, "Recinto MADRING");
    assert.equal(body.callId, result.callId);

    // Lo que rompía antes: el callback llegaba con un taskId que el backend no conocía y se
    // descartaba con 404, así que el «no» nunca entraba.
    const envelope = translateHappyRobotResult(
      {
        taskId: result.taskId,
        callId: result.callId,
        outcome: "rejected",
        summary: "El recinto no cede Pabellón B antes de las 14:00.",
        conditions: ["Solo a partir de las 14:00"],
        data: { spaces: [{ id: "pabellonB", availability: "no_disponible" }] },
      },
      tasks,
    );
    const recorded = workflows.recordSpecialistResult(envelope);
    assert.equal(recorded.applied, true);
    const space = (states.ensureActiveRun().state.spaces as Array<Record<string, unknown>>)
      .find((item) => item.id === "pabellonB");
    assert.equal(space?.status, "descartado");
  } finally {
    fetched.restore();
    database.close();
  }
});

test("emitir_llamada crea la tarea cuando el plan no dejó ninguna", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    const result = await requestCall(
      { area: "espacios", objective: "Preguntar por Pabellón Norte C", counterpart: "Recinto" },
      { states, tasks, executor },
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, "dispatched");
    assert.equal(fetched.bodies.length, 1);
    assert.equal(tasks.get(result.taskId!)?.area, "espacios");
  } finally {
    fetched.restore();
    database.close();
  }
});

test("una plan_version obsoleta devuelve stale y no marca a nadie", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    plannedCall(states, tasks);
    const result = await requestCall(
      {
        run_id: states.ensureActiveRun().id,
        plan_version: states.ensureActiveRun().state.planVersion + 1,
        area: "espacios",
        objective: "Preguntar por Pabellón B",
      },
      { states, tasks, executor },
    );
    assert.equal(result.ok, false);
    assert.equal(result.stale, true);
    assert.equal(fetched.bodies.length, 0);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("un area inexistente o un objective vacío no marcan y explican el motivo", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    const badArea = await requestCall(
      { area: "seguridad", objective: "Cerrar el acceso" },
      { states, tasks, executor },
    );
    assert.equal(badArea.ok, false);
    assert.equal(badArea.stale, false);
    assert.match(String(badArea.error), /espacios/);

    const noObjective = await requestCall({ area: "espacios" }, { states, tasks, executor });
    assert.equal(noObjective.ok, false);
    assert.match(String(noObjective.error), /objective/);

    assert.equal(fetched.bodies.length, 0);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("con una llamada en curso, la siguiente queda en cola y no marca dos veces", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    const first = await requestCall(
      { area: "espacios", objective: "Preguntar por Pabellón B" },
      { states, tasks, executor },
    );
    assert.equal(first.status, "dispatched");
    const second = await requestCall(
      { area: "espacios", objective: "Preguntar por Pabellón Norte C" },
      { states, tasks, executor },
    );
    assert.equal(second.ok, true);
    assert.equal(second.status, "busy");
    assert.equal(fetched.bodies.length, 1);

    // La que quedó en cola ya está pedida, así que el tick la marca en cuanto se libera la
    // línea. Sin esto se quedaba retenida para siempre y el coordinador nunca lo sabía.
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.calls = [];
    states.saveState(run.id, state);
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fetched.bodies.length, 2);
    assert.equal(tasks.get(second.taskId!)?.status, "dispatched");
  } finally {
    fetched.restore();
    database.close();
  }
});
