import assert from "node:assert/strict";
import test from "node:test";

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
    assert.equal(payload.callbackUrl, "http://localhost:8000/workflow/results");
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
