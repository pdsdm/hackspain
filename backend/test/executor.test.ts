import assert from "node:assert/strict";
import test from "node:test";

import { translateHappyRobotResult } from "../src/actions/adapters/happyrobot-inbound.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

function harness() {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  return { database, states, tasks, executor };
}

test("sim adapter opens a call and applies a canned result", async () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "sim-call",
    });
    executor.pump();
    const opened = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(opened[0]?.status, "en_curso");
    executor.fireDue(Number(run.state.clock.simSeconds) + 60);
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "terminada");
    assert.equal(tasks.get(task.id)?.status, "completed");
  } finally {
    database.close();
  }
});

test("paused agents are not dispatched", () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.agentsPaused = true;
    states.saveState(run.id, state);
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "paused",
    });
    executor.pump();
    assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 0);
  } finally {
    database.close();
  }
});

test("cancelled tasks are never dispatched", () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "cancel-me",
    });
    tasks.cancel(task.id, "obsolete");
    executor.pump();
    assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 0);
  } finally {
    database.close();
  }
});

test("a dispatched task without callback times out as no_answer", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "http://hook.test/transporte" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  let dispatched: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    dispatched = { url: String(input), init: init ?? {} };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "hook-call",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    assert.ok(dispatched);
    assert.equal(dispatched.url, "http://hook.test/transporte");
    assert.equal(new Headers(dispatched.init.headers).get("Authorization"), "Bearer key");
    const payload = JSON.parse(String(dispatched.init.body)) as Record<string, unknown>;
    assert.equal(payload.taskId, task.id);
    assert.equal(payload.runId, run.id);
    assert.equal(payload.planVersion, run.state.planVersion);
    assert.equal(payload.phone_number, "+34600000000");
    assert.equal((payload.contact as Record<string, unknown>).phone, "+34600000000");
    assert.deepEqual(payload.data, {});
    // Los mismos valores en plano, por si el workflow extrae "contact.phone" como clave.
    assert.equal(payload["contact.phone"], "+34600000000");
    assert.equal(payload["situation.simSeconds"], run.state.clock.simSeconds);
    // El workflow contesta por la puerta traducida (T9), no por la estricta del contrato.
    assert.equal(payload.callbackUrl, "http://localhost:8000/workflow/happyrobot/results");
    const now = Number(run.state.clock.simSeconds);
    executor.fireDue(now + 60);
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS + 1);
    assert.equal(tasks.get(task.id)?.status, "failed");
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "sin_respuesta");
    const agent = (states.ensureActiveRun().state.agents as Array<Record<string, unknown>>).find((a) => a.id === "transporte");
    assert.equal(agent?.status, "incidencia");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("a native HappyRobot callback closes the open call with its transcript", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { espacios: "http://hook.test/espacios" },
    happyrobotTestPhone: "+34600000000",
    happyrobotApiKey: "key",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Pabellón B", counterpart: "Recinto" },
      idempotencyKey: "native-callback",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // El backend manda el teléfono del entorno y el callback de la puerta de HappyRobot.
    assert.equal((sent.contact as Record<string, unknown>).phone, "+34600000000");
    assert.match(String(sent.callbackUrl), /\/workflow\/happyrobot\/results$/);

    const envelope = translateHappyRobotResult(
      {
        call_id: `call-${task.id}`,
        outcome: "accepted",
        summary: "Pabellón B reservado",
        transcript: [{ speaker: "human", text: "Lo tienes a las 13:00", at: 20 }],
      },
      tasks,
    );
    const recorded = workflows.recordSpecialistResult(envelope);
    assert.equal(recorded.applied, true);

    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "terminada");
    assert.deepEqual(calls[0]?.transcript, [{ who: "humano", text: "Lo tienes a las 13:00", at: 20 }]);
    assert.equal(tasks.get(task.id)?.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("HappyRobot no_answer timeout follows wall time when the clock is sped up", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "http://hook.test/transporte" },
    happyrobotApiKey: "key",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const sped = structuredClone(run.state);
    sped.clock.speed = 20;
    states.saveState(run.id, sped);
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "fast-clock",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const now = Number(sped.clock.simSeconds);
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS + 1);
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS * 20 + 1);
    assert.equal(tasks.get(task.id)?.status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("a second HappyRobot call stays queued while another is ringing", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { espacios: "http://hook.test/espacios", catering: "http://hook.test/catering" },
    happyrobotApiKey: "key",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "a", counterpart: "A" },
      idempotencyKey: "hr-1",
    });
    const second = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "call",
      payload: { objective: "b", counterpart: "B" },
      idempotencyKey: "hr-2",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls.filter((call) => call.status === "en_curso").length, 1);
    assert.equal(tasks.get(second.id)?.status, "pending");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("taking a call cancels the HappyRobot no_answer timeout", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "http://hook.test/transporte" },
    happyrobotApiKey: "key",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "hold-timeout",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    executor.holdDispatchTimeout(`call-${task.id}`);
    const now = Number(run.state.clock.simSeconds);
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS + 1);
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    assert.equal((states.ensureActiveRun().state.calls as Array<Record<string, unknown>>)[0]?.status, "en_curso");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
