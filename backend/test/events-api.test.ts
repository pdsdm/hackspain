import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";

async function withServer(run: (base: string) => Promise<void>) {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
}

test("POST /events accepts a chat event and rejects a bad body", async () => {
  await withServer(async (base) => {
    const ok = await fetch(`${base}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chat", kind: "free_text", text: "Acceso Sur cerrado" }),
    });
    assert.equal(ok.status, 202);
    const body = (await ok.json()) as { ok: boolean; eventId: string };
    assert.equal(body.ok, true);
    assert.ok(body.eventId);

    const bad = await fetch(`${base}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "nope", kind: "x" }),
    });
    assert.equal(bad.status, 400);

    const badCall = await fetch(`${base}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "human",
        kind: "call_request",
        payload: { area: "unknown", counterpart: "Recinto", objective: "Llamar" },
      }),
    });
    assert.equal(badCall.status, 400);
  });
});

test("GET /actions lists the open queue and reset accepts a fixture", async () => {
  await withServer(async (base) => {
    const actions = await fetch(`${base}/actions`);
    assert.equal(actions.status, 200);
    const listed = (await actions.json()) as { tasks: unknown[] };
    assert.ok(Array.isArray(listed.tasks));

    const reset = await fetch(`${base}/simulation/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture: "calm" }),
    });
    assert.equal(reset.status, 200);
    const state = await (await fetch(`${base}/state`)).json() as { clock: { simSeconds: number }; coordinatorStatus: string };
    assert.equal(state.clock.simSeconds, 43200);
    assert.equal(state.coordinatorStatus, "estable");
  });
});
