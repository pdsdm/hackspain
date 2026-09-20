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

test("a result eventId cannot be reused for another task", () => {
  const database = openDatabase(":memory:");
  try {
    const run = new StateRepository(database.connection).ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const input = { runId: run.id, planVersion: run.state.planVersion, area: "espacios", kind: "call", payload: {} };
    const first = tasks.enqueue({ ...input, idempotencyKey: "first" });
    const second = tasks.enqueue({ ...input, idempotencyKey: "second" });
    tasks.recordResult(first.id, "same-id", {});
    assert.throws(() => tasks.recordResult(second.id, "same-id", {}), /another task/);
    assert.equal(tasks.get(second.id)?.status, "pending");
  } finally { database.close(); }
});

for (const outcome of ["accepted", "accepted_with_conditions", "rejected"]) {
  test(`verification dependencies require an applied unconditional acceptance: ${outcome}`, () => {
    const database = openDatabase(":memory:");
    try {
      const run = new StateRepository(database.connection).ensureActiveRun();
      const tasks = new TaskRepository(database.connection);
      const input = { runId: run.id, planVersion: run.state.planVersion, area: "espacios", kind: "call" };
      const required = tasks.enqueue({ ...input, payload: {}, idempotencyKey: "required" });
      const task = tasks.enqueue({ ...input, payload: { dependsOnKeys: ["required"] }, idempotencyKey: "dependent" });
      assert.equal(tasks.dependenciesSatisfied(task.id), false);
      tasks.recordResult(required.id, "result", { status: "completed", result: { outcome, conditions: [] } }, (state) => state);
      assert.equal(tasks.dependenciesSatisfied(task.id), outcome === "accepted");
    } finally { database.close(); }
  });
}

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

test("a completed :retry satisfies the dependency of the original key", () => {
  const database = openDatabase(":memory:");
  try {
    const run = new StateRepository(database.connection).ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const input = { runId: run.id, planVersion: run.state.planVersion, area: "asistentes", kind: "call" };
    const required = tasks.enqueue({ ...input, payload: {}, idempotencyKey: "plan:a5" });
    const dependent = tasks.enqueue({ ...input, area: "catering", payload: { dependsOnKeys: ["plan:a5"] }, idempotencyKey: "plan:a3" });
    assert.equal(tasks.claimNext()?.id, required.id);
    tasks.markDispatchOutcome(required.id, "dispatched");
    tasks.recordResult(required.id, "r1", { status: "no_answer", result: { outcome: "no_answer", conditions: [] } }, (state) => state, "failed");
    assert.equal(tasks.claimNext(), undefined);

    const retry = tasks.enqueue({ ...input, payload: {}, idempotencyKey: "plan:a5:retry" });
    assert.equal(tasks.claimNext()?.id, retry.id);
    tasks.markDispatchOutcome(retry.id, "dispatched");
    assert.deepEqual(tasks.cancelBlocked(run.id), []);
    tasks.recordResult(retry.id, "r2", { status: "completed", result: { outcome: "accepted", conditions: [] } }, (state) => state);
    assert.equal(tasks.claimNext()?.id, dependent.id);
    assert.equal(tasks.dependenciesSatisfied(dependent.id), true);
  } finally { database.close(); }
});

test("a dependent task is cancelled when its dependency and the retry both fail", () => {
  const database = openDatabase(":memory:");
  try {
    const run = new StateRepository(database.connection).ensureActiveRun();
    const tasks = new TaskRepository(database.connection);
    const input = { runId: run.id, planVersion: run.state.planVersion, area: "asistentes", kind: "call" };
    const required = tasks.enqueue({ ...input, payload: {}, idempotencyKey: "plan:a5" });
    const retry = tasks.enqueue({ ...input, payload: {}, idempotencyKey: "plan:a5:retry" });
    const dependent = tasks.enqueue({ ...input, area: "catering", payload: { dependsOnKeys: ["plan:a5"] }, idempotencyKey: "plan:a3" });
    for (let index = 0; index < 2; index += 1) {
      const claimed = tasks.claimNext();
      assert.ok(claimed && [required.id, retry.id].includes(claimed.id));
      tasks.markDispatchOutcome(claimed.id, "dispatched");
      tasks.recordResult(claimed.id, `r-${claimed.id}`, { status: "no_answer", result: { outcome: "no_answer", conditions: [] } }, (state) => state, "failed");
    }
    const free = tasks.enqueue({ ...input, area: "transporte", payload: {}, idempotencyKey: "plan:a4" });
    const cancelled = tasks.cancelBlocked(run.id);
    assert.deepEqual(cancelled.map((task) => task.id), [dependent.id]);
    assert.equal(cancelled[0]?.status, "cancelled");
    assert.equal(tasks.get(dependent.id)?.status, "cancelled");
    assert.equal(tasks.get(free.id)?.status, "pending");
    assert.deepEqual(tasks.listOpen(run.id).map((task) => task.id), [free.id]);
  } finally { database.close(); }
});
