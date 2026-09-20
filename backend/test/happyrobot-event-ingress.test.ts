import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase, type CrisisDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";

const TOKEN = "incident-webhook-token";

function event(eventId: string, incidentId: "principal_pipe_burst" | "dock_blocked" = "principal_pipe_burst") {
  return {
    eventId,
    channel: incidentId === "dock_blocked" ? "sms" : "call",
    actor: incidentId === "principal_pipe_burst" ? "Responsable de recinto" : "Jefe de muelle",
    incidentId,
    summary: incidentId === "principal_pipe_burst" ? "Una tubería rota obliga a cerrar el Pabellón Principal" : "Un camión de TV bloquea el Muelle Este",
    evidence: { sessionId: `session-${eventId}` },
  };
}

async function post(base: string, body: unknown, token = TOKEN): Promise<Response> {
  return fetch(`${base}/workflow/happyrobot/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function withServer(run: (base: string, database: CrisisDatabase, states: StateRepository) => Promise<void>): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const server = createApp(database, { workflowToken: TOKEN }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, database, states);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
}

test("HappyRobot incident ingress requires bearer auth and a strict allowlisted payload", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, event("auth-missing"), "")).status, 401);
    assert.equal((await post(base, event("auth-wrong"), "wrong")).status, 401);

    for (const body of [
      { ...event("missing-evidence"), evidence: {} },
      { ...event("bad-channel"), channel: "email" },
      { ...event("bad-incident"), incidentId: "set_state" },
      { ...event("operations"), operations: [{ op: "replace", path: "/planVersion", value: 99 }] },
      { ...event("patch"), evidence: { sessionId: "session", state: { planVersion: 99 } } },
    ]) {
      assert.equal((await post(base, body)).status, 400);
    }
  });
});

test("principal_pipe_burst invalidates the current plan and keeps provenance in chronology", async () => {
  await withServer(async (base, database, states) => {
    const before = states.ensureActiveRun().state.planVersion;
    const response = await post(base, event("pipe-1"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      duplicate: false,
      eventId: "pipe-1",
      incidentId: "principal_pipe_burst",
      planVersion: before + 1,
    });

    const state = states.ensureActiveRun().state;
    assert.equal(state.planVersion, before + 1);
    assert.equal(state.spaces.find((space) => space.id === "principal")?.status, "cerrado");
    assert.equal(state.commitments.find((commitment) => commitment.id === "c-principal")?.status, "invalidado");
    const timeline = (state.events as Array<Record<string, unknown>>).find((item) => item.provenance && (item.provenance as Record<string, unknown>).eventId === "pipe-1");
    assert.equal(timeline?.channel, "call");
    assert.equal(timeline?.actor, "Responsable de recinto");
    assert.deepEqual(timeline?.provenance, { source: "happyrobot", eventId: "pipe-1", sessionId: "session-pipe-1" });
    assert.equal(database.connection.prepare("SELECT COUNT(*) AS count FROM events WHERE id = ?").get("pipe-1")?.count, 1);
  });
});

test("dock_blocked reuses the deterministic twist effect", async () => {
  await withServer(async (base, _database, states) => {
    const response = await post(base, event("dock-1", "dock_blocked"));
    assert.equal(response.status, 200);
    const state = states.ensureActiveRun().state;
    assert.equal(state.spaces.find((space) => space.id === "muelleEste")?.status, "cerrado");
    assert.ok((state.deliveries as Array<Record<string, unknown>>).filter((delivery) => delivery.status !== "entregada").every((delivery) => delivery.status === "bloqueada"));
    assert.ok((state.twistsApplied as string[]).includes("dock_blocked"));
    const timeline = (state.events as Array<Record<string, unknown>>).find((item) => item.provenance && (item.provenance as Record<string, unknown>).eventId === "dock-1");
    assert.equal(timeline?.channel, "sms");
    assert.equal(timeline?.actor, "Jefe de muelle");
  });
});

test("duplicate eventIds are harmless, while reuse with another payload conflicts", async () => {
  await withServer(async (base, database, states) => {
    const body = event("duplicate-1");
    assert.equal((await post(base, body)).status, 200);
    const version = states.ensureActiveRun().state.planVersion;
    const duplicate = await post(base, body);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true);
    assert.equal(states.ensureActiveRun().state.planVersion, version);
    assert.equal(database.connection.prepare("SELECT COUNT(*) AS count FROM events WHERE id = ?").get("duplicate-1")?.count, 1);
    assert.equal((await post(base, { ...body, summary: "Otro contenido" })).status, 409);
  });
});

test("near-simultaneous incident requests are serialized in arrival order", async () => {
  await withServer(async (base, _database, states) => {
    const [first, second] = await Promise.all([
      post(base, event("ordered-1")),
      post(base, event("ordered-2", "dock_blocked")),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstBody = await first.json() as { planVersion: number };
    const secondBody = await second.json() as { planVersion: number };
    assert.equal(firstBody.planVersion, 2);
    assert.equal(secondBody.planVersion, 2);
    const ingressed = (states.ensureActiveRun().state.events as Array<Record<string, unknown>>)
      .filter((item) => item.provenance)
      .map((item) => (item.provenance as Record<string, unknown>).eventId);
    assert.deepEqual(ingressed, ["ordered-1", "ordered-2"]);
  });
});
