// T58: el responsable escribe el teléfono de cada área en el panel de agentes, sin
// redespliegue. Vive en app_metadata, así que un reset del escenario no se lo lleva.
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/state/database.js";
import { ContactRepository } from "../src/state/contact-repository.js";
import { StateRepository } from "../src/state/state-repository.js";

const HOOK = "https://hook.test/todos";

async function withServer(
  run: (base: string, states: StateRepository, phones: ContactRepository) => Promise<void>,
): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const phones = new ContactRepository(database.connection);
  const config = {
    ...loadConfig({ HAPPYROBOT_TEST_PHONE: "+34600000000", AUTH_REQUIRED: "false" }),
    coordinatorMode: "rules" as const,
    hooks: { espacios: HOOK, catering: HOOK, transporte: HOOK, asistentes: HOOK },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  };
  const server = createApp(database, { workflowToken: "secreto", config }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, states, phones);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function agents(base: string): Promise<Array<{ id: string; phone?: string }>> {
  const state = (await (await fetch(`${base}/state`)).json()) as { agents: Array<{ id: string; phone?: string }> };
  return state.agents;
}

test("cada agente publica su teléfono y el panel lo puede cambiar", async () => {
  await withServer(async (base) => {
    // Por defecto se ve el destino de pruebas del entorno, no un hueco vacío.
    const initial = await agents(base);
    assert.equal(initial.find((agent) => agent.id === "catering")?.phone, "+34600000000");

    const response = await post(base, "/agents/catering/phone", { phone: "+34611222333" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, area: "catering", phone: "+34611222333" });

    const updated = await agents(base);
    assert.equal(updated.find((agent) => agent.id === "catering")?.phone, "+34611222333");
    assert.equal(updated.find((agent) => agent.id === "espacios")?.phone, "+34600000000");
  });
});

test("el teléfono se valida en E.164 y el área tiene que existir", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/agents/catering/phone", { phone: "611 222 333" })).status, 400);
    assert.equal((await post(base, "/agents/recepcion/phone", { phone: "+34611222333" })).status, 400);
    assert.equal((await post(base, "/agents/catering/phone", {})).status, 400);
  });
});

test("un teléfono vacío vuelve al destino del entorno, y un reset no borra el del panel", async () => {
  await withServer(async (base, _states, phones) => {
    await post(base, "/agents/transporte/phone", { phone: "+34611222333" });
    assert.equal((await post(base, "/simulation/reset", {})).status, 200);
    assert.equal(phones.get("transporte"), "+34611222333");
    assert.equal((await agents(base)).find((agent) => agent.id === "transporte")?.phone, "+34611222333");

    const cleared = await post(base, "/agents/transporte/phone", { phone: null });
    assert.deepEqual(await cleared.json(), { ok: true, area: "transporte", phone: "+34600000000" });
    assert.equal(phones.get("transporte"), undefined);
  });
});

test("el onboarding exige los cinco teléfonos y no cuenta el destino por defecto", async () => {
  await withServer(async (base) => {
    const empty = await fetch(`${base}/agents/phones`);
    assert.equal(empty.status, 200);
    const before = (await empty.json()) as { complete: boolean; phones: Record<string, string | null> };
    assert.equal(before.complete, false);
    assert.equal(before.phones.coordinador, null);
    assert.equal(before.phones.espacios, null);

    const missing = await post(base, "/agents/phones", {
      coordinador: "+34600111000",
      espacios: "+34600111222",
      catering: "+34600111333",
      transporte: "+34600111444",
    });
    assert.equal(missing.status, 400);

    const invalid = await post(base, "/agents/phones", {
      coordinador: "+34600111000",
      espacios: "+34600111222",
      catering: "+34600111333",
      transporte: "+34600111444",
      asistentes: "611 222 333",
    });
    assert.equal(invalid.status, 400);

    const saved = await post(base, "/agents/phones", {
      coordinador: "+34600111000",
      espacios: "+34600111222",
      catering: "+34600111333",
      transporte: "+34600111444",
      asistentes: "+34600111555",
    });
    assert.equal(saved.status, 200);
    const body = (await saved.json()) as { complete: boolean; phones: Record<string, string> };
    assert.equal(body.complete, true);
    assert.equal(body.phones.coordinador, "+34600111000");

    const state = (await (await fetch(`${base}/state`)).json()) as {
      coordinatorPhone?: string
      agents: Array<{ id: string; phone?: string }>
    };
    assert.equal(state.coordinatorPhone, "+34600111000");
    assert.equal(state.agents.find((agent) => agent.id === "asistentes")?.phone, "+34600111555");
  });
});

test("la llamada real sale al teléfono del panel, no al del entorno", async () => {
  await withServer(async (base, states) => {
    await post(base, "/agents/espacios/phone", { phone: "+34655444333" });
    const bodies: Array<Record<string, unknown>> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      if (String(input) === HOOK) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response("{}", { status: 200 });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      assert.equal((await post(base, "/simulation/clock", { paused: false })).status, 200);
      const call = await post(base, "/events", {
        source: "human",
        kind: "call_request",
        text: "Llamar al recinto",
        payload: {
          area: "espacios",
          counterpart: "Responsable de recinto",
          objective: "Confirmar Pabellón B para 450 invitados",
        },
      });
      assert.equal(call.status, 202);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(bodies.length, 1);
      assert.equal(bodies[0]!.phone_number, "+34655444333");
      assert.equal(bodies[0]!["contact.phone"], "+34655444333");
      assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
