import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
    firstRepository.saveState(run.id, run.state);
    firstDatabase.close();

    const secondDatabase = openDatabase(path);
    const state = new StateRepository(secondDatabase.connection).getPublicState();
    secondDatabase.close();

    assert.equal((state.agents as Array<Record<string, unknown>>)[0]!.reason, "Prioridad por pérdida total de aforo");
    assert.equal(state.decisions[0]!.rationale, "El coste supera el límite autónomo");
    assert.deepEqual(state.futureContractField, { preserved: true });
    assert.equal(state.scriptId, "main");
    assert.equal(state.scriptCursor, 0);
    assert.equal(state.nextScriptAt, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
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
