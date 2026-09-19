import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";

test("dispatch tasks are idempotent and an unknown start is not retried blindly", () => {
  const database = openDatabase(":memory:");
  try {
    const run = new StateRepository(database.connection).ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const input = {
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "start_call",
      payload: { target: "venue-manager" },
      idempotencyKey: `${run.id}:spaces:first-call`,
    };

    const first = tasks.enqueue(input);
    const duplicate = tasks.enqueue({ ...input, payload: { target: "other" } });
    assert.equal(duplicate.id, first.id);
    assert.deepEqual(duplicate.payload, first.payload);

    const claimed = tasks.claimNext();
    assert.equal(claimed?.id, first.id);
    assert.equal(claimed?.attempts, 1);
    tasks.markDispatchOutcome(first.id, "unknown");
    assert.equal(tasks.claimNext(), undefined);
  } finally {
    database.close();
  }
});

test("duplicate and stale results remain evidence without being applied", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const oldRun = states.ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const task = tasks.enqueue({
      runId: oldRun.id,
      planVersion: oldRun.state.planVersion,
      area: "espacios",
      kind: "start_call",
      payload: {},
      idempotencyKey: `${oldRun.id}:call`,
    });

    states.reset();
    const firstResult = tasks.recordResult(task.id, "external-result-1", { accepted: true });
    const duplicate = tasks.recordResult(task.id, "external-result-1", { accepted: false });
    const stored = database.connection
      .prepare("SELECT payload_json, applied FROM task_results WHERE external_event_id = ?")
      .get("external-result-1") as { payload_json: string; applied: number };

    assert.deepEqual(firstResult, { applied: false, duplicate: false });
    assert.deepEqual(duplicate, { applied: false, duplicate: true });
    assert.deepEqual(JSON.parse(stored.payload_json), { accepted: true });
    assert.equal(stored.applied, 0);

    const currentRun = states.ensureActiveRun();
    const oldPlanTask = tasks.enqueue({
      runId: currentRun.id,
      planVersion: currentRun.state.planVersion,
      area: "catering",
      kind: "confirm_delivery",
      payload: {},
      idempotencyKey: "delivery-current-run",
    });
    currentRun.state.planVersion += 1;
    states.saveState(currentRun.id, currentRun.state);
    assert.deepEqual(
      tasks.recordResult(oldPlanTask.id, "external-result-old-plan", { accepted: true }),
      { applied: false, duplicate: false },
    );
  } finally {
    database.close();
  }
});

test("pending tasks from a stale plan or an inactive run are never dispatched", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const oldRun = states.ensureActiveRun();
    tasks.enqueue({
      runId: oldRun.id,
      planVersion: oldRun.state.planVersion,
      area: "espacios",
      kind: "start_call",
      payload: {},
      idempotencyKey: "old-run-call",
    });
    const run = states.reset();
    assert.equal(tasks.claimNext(), undefined);

    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "start_call",
      payload: {},
      idempotencyKey: "old-plan-call",
    });
    run.state.planVersion += 1;
    states.saveState(run.id, run.state);
    assert.equal(tasks.claimNext(), undefined);

    const current = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "start_call",
      payload: {},
      idempotencyKey: "current-plan-call",
    });
    assert.equal(tasks.claimNext()?.id, current.id);
  } finally {
    database.close();
  }
});

test("a current result mutates state once through its explicit adapter", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const run = states.ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "confirm_arrival",
      payload: {},
      idempotencyKey: "arrival",
    });

    const result = tasks.recordResult(
      task.id,
      "arrival-result",
      { note: "Parada autorizada" },
      (state, payload) => {
        state.lastSpecialistResult = payload;
        return state;
      },
    );

    assert.deepEqual(result, { applied: true, duplicate: false });
    assert.deepEqual(states.getPublicState().lastSpecialistResult, {
      note: "Parada autorizada",
    });
    assert.deepEqual(
      tasks.recordResult(task.id, "arrival-result", { note: "Duplicado" }),
      { applied: true, duplicate: true },
    );
  } finally {
    database.close();
  }
});
