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
