import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";

test("GET /health reports that the backend is ready", async () => {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
});

test("GET /state returns the persisted CrisisState contract", async () => {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/state`);
    const state = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(state.planVersion, 1);
    assert.equal(state.coordinatorStatus, "estable");
    const spaces = state.spaces as Array<{ id: string; status: string }>;
    assert.equal(spaces.find((space) => space.id === "principal")?.status, "confirmado");
    assert.notEqual(spaces.find((space) => space.id === "principal")?.status, "cerrado");
    assert.equal(state.simulated, false);
    assert.deepEqual(state.scriptId, "main");
    assert.deepEqual(state.scriptCursor, 0);
    assert.deepEqual(state.nextScriptAt, null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
});
