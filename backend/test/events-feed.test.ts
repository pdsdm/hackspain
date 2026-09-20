import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";

async function withServer(run: (base: string, states: StateRepository) => Promise<void>): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const server = createApp(database, { workflowToken: "t" }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, states);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    database.close();
  }
}

function seed(states: StateRepository) {
  const run = states.ensureActiveRun();
  const state = structuredClone(run.state);
  state.events = [
    { id: "e1", time: 43200, kind: "info", text: "uno", area: "catering" },
    { id: "e2", time: 43260, kind: "incidencia", text: "dos", area: "espacios" },
    { id: "e3", time: 43320, kind: "info", text: "tres", area: "espacios" },
  ];
  states.saveState(run.id, state);
  return states.ensureActiveRun().state.events as Array<Record<string, unknown>>;
}

test("GET /events devuelve la cronología reciente sin el estado entero", async () => {
  await withServer(async (base, states) => {
    seed(states);
    const response = await fetch(`${base}/events`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { events: Array<Record<string, unknown>>; total: number; planVersion: number };
    assert.equal(body.events.length, 3);
    assert.equal(body.total, 3);
    assert.equal(typeof body.planVersion, "number");
    assert.equal(body.events[0]?.text, "uno");
    // El payload no arrastra espacios, rutas ni vehículos.
    assert.equal((body as Record<string, unknown>).spaces, undefined);
  });
});

test("limit devuelve solo los más recientes", async () => {
  await withServer(async (base, states) => {
    seed(states);
    const body = (await (await fetch(`${base}/events?limit=2`)).json()) as { events: Array<Record<string, unknown>> };
    assert.deepEqual(body.events.map((e) => e.id), ["e2", "e3"]);
  });
});

test("kind y area filtran", async () => {
  await withServer(async (base, states) => {
    seed(states);
    const byKind = (await (await fetch(`${base}/events?kind=incidencia`)).json()) as { events: Array<Record<string, unknown>> };
    assert.deepEqual(byKind.events.map((e) => e.id), ["e2"]);
    const byArea = (await (await fetch(`${base}/events?area=espacios`)).json()) as { events: Array<Record<string, unknown>> };
    assert.deepEqual(byArea.events.map((e) => e.id), ["e2", "e3"]);
  });
});

test("since devuelve solo lo posterior, para sondeo incremental", async () => {
  await withServer(async (base, states) => {
    const stamped = seed(states);
    const cut = Number(stamped[1]?.realAt);
    assert.ok(Number.isFinite(cut), "el repositorio debe sellar realAt");
    const body = (await (await fetch(`${base}/events?since=${cut}`)).json()) as { events: Array<Record<string, unknown>> };
    // Los tres se sellan en el mismo saveState, así que ninguno es posterior al corte.
    assert.equal(body.events.length, 0);
  });
});

test("parámetros inválidos responden 400", async () => {
  await withServer(async (base, states) => {
    seed(states);
    assert.equal((await fetch(`${base}/events?limit=0.5`)).status, 400);
    assert.equal((await fetch(`${base}/events?limit=9999`)).status, 400);
    assert.equal((await fetch(`${base}/events?since=-1`)).status, 400);
  });
});
