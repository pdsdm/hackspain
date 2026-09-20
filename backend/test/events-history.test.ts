import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";

interface Row { id: string; runId: string; source: string; kind: string; text?: string; createdAt: string }

async function withServer(
  run: (base: string, states: StateRepository, events: EventRepository) => Promise<void>,
): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const events = new EventRepository(database.connection);
  const server = createApp(database, { workflowToken: "t" }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, states, events);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    database.close();
  }
}

function seed(events: EventRepository, runId: string, n: number, source = "chat") {
  for (let i = 0; i < n; i += 1) {
    events.append({
      runId,
      source: source as "chat",
      kind: "free_text",
      text: `evento ${i}`,
      payload: {},
      actorId: undefined,
      simSeconds: 43200 + i,
      mode: "none",
    });
  }
}

test("GET /events/history devuelve el histórico en orden cronológico", async () => {
  await withServer(async (base, states, events) => {
    const run = states.ensureActiveRun();
    seed(events, run.id, 3);
    const body = (await (await fetch(`${base}/events/history`)).json()) as { events: Row[]; count: number; activeRunId: string };
    assert.equal(body.count, 3);
    assert.deepEqual(body.events.map((e) => e.text), ["evento 0", "evento 1", "evento 2"]);
    assert.equal(body.activeRunId, run.id);
    assert.equal(typeof body.events[0]?.createdAt, "string");
  });
});

test("el histórico sobrevive a un reset, al contrario que la cronología", async () => {
  await withServer(async (base, states, events) => {
    const first = states.ensureActiveRun();
    seed(events, first.id, 2);

    const reset = await fetch(`${base}/simulation/reset`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(reset.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const second = states.ensureActiveRun();
    assert.notEqual(second.id, first.id, "el reset crea una ejecución nueva");

    // La cronología del panel arranca vacía…
    const feed = (await (await fetch(`${base}/events?limit=50`)).json()) as { events: unknown[] };
    assert.equal(feed.events.length, 0);

    // …pero la auditoría conserva los de la ejecución anterior.
    const history = (await (await fetch(`${base}/events/history`)).json()) as { events: Row[] };
    assert.equal(history.events.length, 2);
    assert.equal(history.events[0]?.runId, first.id);
  });
});

test("runId, source y kind filtran", async () => {
  await withServer(async (base, states, events) => {
    const first = states.ensureActiveRun();
    seed(events, first.id, 2, "chat");
    seed(events, first.id, 1, "jury");
    const second = states.reset();
    seed(events, second.id, 4, "chat");

    const bySource = (await (await fetch(`${base}/events/history?source=jury`)).json()) as { events: Row[] };
    assert.equal(bySource.events.length, 1);

    const byRun = (await (await fetch(`${base}/events/history?runId=${second.id}`)).json()) as { events: Row[] };
    assert.equal(byRun.events.length, 4);

    const byKind = (await (await fetch(`${base}/events/history?kind=inexistente`)).json()) as { events: Row[] };
    assert.equal(byKind.events.length, 0);
  });
});

test("limit devuelve los más recientes, no los primeros", async () => {
  await withServer(async (base, states, events) => {
    const run = states.ensureActiveRun();
    seed(events, run.id, 5);
    const body = (await (await fetch(`${base}/events/history?limit=2`)).json()) as { events: Row[] };
    assert.deepEqual(body.events.map((e) => e.text), ["evento 3", "evento 4"]);
  });
});

test("limit inválido responde 400", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/events/history?limit=0.5`)).status, 400);
    assert.equal((await fetch(`${base}/events/history?limit=99999`)).status, 400);
  });
});
