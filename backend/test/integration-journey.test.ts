import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { COUNTERPART_SYSTEM_PROMPT } from "../src/actions/adapters/sim-world.js";
import { openDatabase } from "../src/state/database.js";

const TOKEN = "integration-token";

interface JourneyState {
  waitingForDecision: string | null;
  planVersion: number;
  budget: { forecast: number | null; committed: number };
  decisions: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
}

function output(step: number): string {
  const first = step === 1;
  return JSON.stringify({
    reading: first ? "Recuperar Sur sin esperar aprobación económica." : "Consultar Norte C tras perder Lounge Sur.",
    planVersion: first ? 1 : 3,
    estimatedCost: first ? 6000 : 7000,
    coordinatorStatus: "replanificando",
    actions: [{
      id: first ? "call-recinto" : "call-norte", area: "espacios", channel: "llamada",
      counterpart: "Responsable de recinto", objective: first ? "Confirmar Lounge Sur" : "Consultar Norte C",
      dueAt: 45060, dependsOn: [], reason: "La alternativa necesita confirmación del recinto.",
    }],
    commitments: [{
      id: first ? "c-lounge-demo" : "c-norte-demo", title: first ? "Reservar Lounge Sur" : "Consultar Pabellón Norte C",
      area: "espacios", status: "en_consulta", counterpart: "Recinto", conditions: ["Confirmación por llamada"],
    }],
    assignments: [], decision: null, unverified: ["Disponibilidad final"],
    operations: first ? [{ op: "set_place", id: "principal", status: "cerrado", note: "Avería de agua" }] : [],
    queries: [], done: true,
  });
}

async function post(base: string, path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function state(base: string): Promise<JourneyState> {
  return await (await fetch(`${base}/state`)).json() as JourneyState;
}

async function actions(base: string): Promise<Array<{ taskId: string; status: string }>> {
  return (await (await fetch(`${base}/actions`)).json()).tasks;
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for integrated journey state");
}

function result(task: { id: string; runId: string; planVersion: number }, eventId: string, cost: number) {
  return {
    eventId, taskId: task.id, runId: task.runId, planVersion: task.planVersion, status: "completed",
    result: {
      outcome: "accepted", summary: "El recinto acepta la reserva y su coste.", conditions: [],
      evidence: { callId: `call-${task.id}`, transcript: [{ who: "humano", text: `Confirmo la reserva por ${cost} euros.`, at: 18 }] },
      data: { committedCost: cost },
    },
  };
}

test("costly event, simulated callbacks and replan finish without financial approval or duplicate spending", async () => {
  const database = openDatabase(":memory:");
  let coordinatorCalls = 0;
  const app = createApp(database, {
    workflowToken: TOKEN,
    config: loadConfig({ DATABASE_URL: ":memory:", INITIAL_FIXTURE: "calm", COORDINATOR_MODE: "rules" }),
    completeFn: async (_config, system) => system === COUNTERPART_SYSTEM_PROMPT
      ? JSON.stringify({ outcome: "accepted", summary: "Simulado", conditions: [], transcript: [{ who: "humano", text: "Acepto" }] })
      : output(++coordinatorCalls),
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await post(base, "/events", {
      source: "chat", kind: "free_text", text: "El Pabellón Principal está cerrado; prepara el plan de recuperación.",
    })).status, 202);
    await waitFor(async () => (await state(base)).calls.length === 1);
    let current = await state(base);
    assert.equal(current.waitingForDecision, null);
    assert.equal(current.decisions.length, 0);
    assert.equal(current.budget.forecast, 6000);
    assert.equal(current.budget.committed, 0);
    const firstOpen = (await actions(base))[0]!;
    const firstTask = app.locals.taskRepository.get(firstOpen.taskId);
    assert(firstTask);
    assert.equal(firstOpen.status, "dispatched");
    assert.equal(current.calls[0]?.simulated, true);
    const firstResult = result(firstTask, "simulated-callback-1", 3200);
    let response = await post(base, "/workflow/results", firstResult, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    await waitFor(async () => (await state(base)).calls[0]?.status === "terminada");
    assert.equal((await state(base)).budget.committed, 3200);
    assert.equal(coordinatorCalls, 1);
    response = await post(base, "/workflow/results", firstResult, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: true });
    response = await post(base, "/workflow/results", { ...firstResult, eventId: "same-task-another-id" }, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: false, duplicate: false });
    assert.equal((await state(base)).budget.committed, 3200);
    const version = (await state(base)).planVersion;
    assert.equal((await post(base, "/simulation/twists", { twist: "lounge_unavailable" })).status, 200);
    await waitFor(async () => (await state(base)).calls.length === 2);
    current = await state(base);
    assert(current.planVersion > version);
    assert.equal(current.budget.forecast, 7000);
    assert.equal(current.budget.committed, 3200);
    assert.equal(current.commitments.find((item) => item.id === "c-lounge-demo")?.status, "invalidado");
    const secondTask = app.locals.taskRepository.get((await actions(base))[0]!.taskId);
    response = await post(base, "/workflow/results", result(secondTask, "simulated-callback-2", 4000), TOKEN);
    assert.equal(response.status, 200);
    await waitFor(async () => (await actions(base)).length === 0);
    current = await state(base);
    assert.equal(current.budget.committed, 7200);
    assert.equal(current.decisions.length, 0);
    assert.equal(current.calls.filter((item) => item.status === "en_curso").length, 0);
    assert.equal(coordinatorCalls, 2);
    assert.equal((await post(base, "/interventions", { type: "approve_spend", payload: { decisionId: "old" } })).status, 409);
    assert.equal((await post(base, "/simulation/twists", { twist: "reject_spend" })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
});
