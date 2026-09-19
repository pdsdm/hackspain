import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";

import type { ActionExecutor } from "../src/actions/executor.js";
import { SimulationClock } from "../src/domain/clock.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";

test("the clock only auto-finishes simulated calls", () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    const now = Number(state.clock.simSeconds);
    state.calls = [
      {
        id: "call-real",
        agent: "espacios",
        counterpart: "Recinto",
        channel: "llamada",
        startedAt: now - 100,
        endsAfter: 90,
        status: "en_curso",
        simulated: false,
        transcript: [],
      },
      {
        id: "call-sim",
        agent: "catering",
        counterpart: "Catering",
        channel: "llamada",
        startedAt: now - 100,
        endsAfter: 90,
        status: "en_curso",
        simulated: true,
        transcript: [],
      },
    ];
    states.saveState(run.id, state);
    const executor = { fireDue() {}, pump() {} } as unknown as ActionExecutor;

    new SimulationClock(states, executor).tick();

    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls.find((call) => call.id === "call-real")?.status, "en_curso");
    assert.equal(calls.find((call) => call.id === "call-sim")?.status, "terminada");
  } finally {
    database.close();
  }
});

test("the database waits for a short concurrent write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hackspain-sqlite-"));
  const path = join(directory, "crisis.db");
  const database = openDatabase(path);
  const states = new StateRepository(database.connection);
  const run = states.ensureActiveRun();
  const events = new EventRepository(database.connection);
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const { DatabaseSync } = require("node:sqlite");
      const database = new DatabaseSync(workerData);
      database.exec("PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
      parentPort.postMessage("locked");
      setTimeout(() => {
        database.exec("COMMIT;");
        database.close();
      }, 100);
    `,
    { eval: true, workerData: path },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });
    assert.doesNotThrow(() => events.append({
      runId: run.id,
      source: "human",
      kind: "call_request",
      text: "Reintento tras timeout",
      payload: {},
      actorId: "responsable",
      simSeconds: Number(run.state.clock.simSeconds),
      mode: "none",
    }));
    await new Promise<void>((resolve, reject) => {
      worker.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Worker exited with ${code}`)));
      worker.once("error", reject);
    });
  } finally {
    void worker.terminate();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
