import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ActionExecutor } from "../src/actions/executor.js";
import { SimulationClock } from "../src/domain/clock.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";

test("CrisisState survives restart without dropping future contract fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "hackspain-state-"));
  const path = join(directory, "crisis.db");

  try {
    const firstDatabase = openDatabase(path);
    const firstRepository = new StateRepository(firstDatabase.connection);
    const run = firstRepository.ensureActiveRun();
    const agents = run.state.agents as Array<Record<string, unknown>>;
    agents[0]!.reason = "Prioridad por pérdida total de aforo";
    run.state.decisions.push({
      id: "decision-test",
      rationale: "El coste supera el límite autónomo",
    });
    run.state.futureContractField = { preserved: true };
    run.state.calls = [{
      id: "call-live",
      status: "en_curso",
      transcript: [{ who: "humano", text: "Persisto tras reiniciar", at: 3 }],
    }];
    firstRepository.saveState(run.id, run.state);
    firstDatabase.close();

    const secondDatabase = openDatabase(path);
    const state = new StateRepository(secondDatabase.connection).getPublicState();
    secondDatabase.close();

    assert.equal((state.agents as Array<Record<string, unknown>>)[0]!.reason, "Prioridad por pérdida total de aforo");
    assert.equal(state.decisions[0]!.rationale, "El coste supera el límite autónomo");
    assert.deepEqual(state.futureContractField, { preserved: true });
    assert.deepEqual(state.calls, [{
      id: "call-live",
      status: "en_curso",
      transcript: [{ who: "humano", text: "Persisto tras reiniciar", at: 3 }],
    }]);
    assert.equal(state.scriptId, "main");
    assert.equal(state.scriptCursor, 0);
    assert.equal(state.nextScriptAt, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a Railway deployment creates one clean paused run and preserves it across restarts", () => {
  const database = openDatabase(":memory:");
  try {
    const repository = new StateRepository(database.connection);
    const previous = repository.ensureActiveRun();
    previous.state.events = [{ id: "old-event" }];
    previous.state.calls = [{ id: "old-call" }];
    previous.state.decisions.push({ id: "old-decision" });
    repository.saveState(previous.id, previous.state);

    const first = repository.initializeDeployment("deploy-1");
    assert.notEqual(first.id, previous.id);
    assert.equal(first.state.clock.paused, true);
    assert.deepEqual(first.state.events, []);
    assert.deepEqual(first.state.calls, []);
    assert.deepEqual(first.state.decisions, []);
    assert.equal(first.state.coordinatorStatus, "estable");
    const simSeconds = first.state.clock.simSeconds;
    const executor = { fireDue() {}, pump() {} } as unknown as ActionExecutor;
    new SimulationClock(repository, executor).tick();
    assert.equal(repository.ensureActiveRun().state.clock.simSeconds, simSeconds);

    first.state.events = [{ id: "kept-on-restart" }];
    repository.saveState(first.id, first.state);
    const restarted = repository.initializeDeployment("deploy-1");
    assert.equal(restarted.id, first.id);
    assert.deepEqual(restarted.state.events, [{ id: "kept-on-restart" }]);

    const next = repository.initializeDeployment("deploy-2");
    assert.notEqual(next.id, first.id);
    assert.equal(next.state.clock.paused, true);
    assert.deepEqual(next.state.events, []);
    const active = database.connection
      .prepare("SELECT id FROM demo_runs WHERE active = 1")
      .get() as { id: string };
    assert.equal(active.id, next.id);
  } finally {
    database.close();
  }
});

test("reset creates a new active run and deactivates the previous one", () => {
  const database = openDatabase(":memory:");
  try {
    const repository = new StateRepository(database.connection);
    const first = repository.ensureActiveRun();
    const second = repository.reset();
    const rows = database.connection
      .prepare("SELECT id, active FROM demo_runs ORDER BY created_at, rowid")
      .all()
      .map((row) => ({ id: String(row.id), active: Number(row.active) }));

    assert.notEqual(first.id, second.id);
    assert.deepEqual(rows, [
      { id: first.id, active: 0 },
      { id: second.id, active: 1 },
    ]);
  } finally {
    database.close();
  }
});
