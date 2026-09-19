import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { openDatabase } from "../src/state/database.js";

const TOKEN = "integration-token";

interface JourneyState {
  waitingForDecision: string | null;
  planVersion: number;
  decisions: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
}

interface OpenAction {
  taskId: string;
  status: string;
}

function output(step: number): string {
  if (step === 1) {
    return JSON.stringify({
      reading: "Helmcode propone recuperar 600 plazas en Sur con aprobación humana.",
      planVersion: 1,
      coordinatorStatus: "esperando_decision",
      actions: [{
        id: "call-recinto",
        area: "espacios",
        channel: "llamada",
        counterpart: "Responsable de recinto",
        objective: "Confirmar el Lounge Sur",
        dueAt: 45_000,
        dependsOn: [],
        reason: "La propuesta necesita confirmación del recinto.",
      }],
      commitments: [{
        id: "c-lounge-demo",
        title: "Reservar Lounge Sur",
        area: "espacios",
        status: "en_consulta",
        counterpart: "Recinto",
        conditions: ["Autorización de gasto", "Confirmación por llamada"],
      }],
      assignments: [],
      decision: {
        title: "Autorizar plan Sur",
        summary: "Reservar el Lounge Sur y completar el aforo.",
        cost: 3_200,
        conditions: ["Confirmación del recinto"],
        effectApprove: "Llamar al recinto.",
        effectReject: "Solicitar otra propuesta.",
        rationale: "Es la opción viable más rápida.",
      },
      unverified: ["Disponibilidad final del Lounge Sur"],
      operations: [{ op: "set_place", id: "principal", status: "cerrado", note: "Avería de agua" }],
      queries: [],
      done: true,
    });
  }
  if (step === 3) {
    return JSON.stringify({
      reading: "El giro invalida el Lounge Sur; se consulta la contingencia Norte C.",
      planVersion: 3,
      coordinatorStatus: "replanificando",
      actions: [{
        id: "call-norte",
        area: "espacios",
        channel: "llamada",
        counterpart: "Responsable de recinto",
        objective: "Confirmar la contingencia Norte C",
        dueAt: 45_060,
        dependsOn: [],
        reason: "El Lounge Sur ya no está disponible.",
      }],
      commitments: [{
        id: "c-norte-demo",
        title: "Consultar Pabellón Norte C",
        area: "espacios",
        status: "en_consulta",
        counterpart: "Recinto",
        conditions: ["Confirmar acceso exterior"],
      }],
      assignments: [],
      decision: null,
      unverified: ["Acceso exterior a Norte C"],
      operations: [],
      queries: [],
      done: true,
    });
  }
  return JSON.stringify({
    reading: step === 2 ? "Gasto autorizado; se puede llamar." : "Resultado incorporado sin duplicar decisiones.",
    planVersion: step < 3 ? 2 : 4,
    coordinatorStatus: "replanificando",
    actions: [],
    commitments: [],
    assignments: [],
    decision: null,
    unverified: [],
    operations: [],
    queries: [],
    done: true,
  });
}

async function post(base: string, path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function state(base: string): Promise<JourneyState> {
  return await (await fetch(`${base}/state`)).json() as JourneyState;
}

async function actions(base: string): Promise<OpenAction[]> {
  const body = await (await fetch(`${base}/actions`)).json() as { tasks: OpenAction[] };
  return body.tasks;
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for integrated journey state");
}

function result(task: { id: string; runId: string; planVersion: number }, eventId: string) {
  return {
    eventId,
    taskId: task.id,
    runId: task.runId,
    planVersion: task.planVersion,
    status: "completed",
    result: {
      outcome: "accepted_with_conditions",
      summary: "El recinto acepta con condiciones.",
      conditions: ["Validar acceso"],
      evidence: {
        callId: `call-${task.id}`,
        transcript: [{ who: "humano", text: "Aceptado con condiciones", at: 18 }],
      },
      data: {},
    },
  };
}

test("event, approval, simulated callback and twist complete without duplicate decisions or live calls", async () => {
  const database = openDatabase(":memory:");
  let coordinatorCalls = 0;
  const config: AppConfig = {
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 8000,
    workflowToken: TOKEN,
    happyrobotApiKey: undefined,
    happyrobotTestPhone: undefined,
    initialFixture: "calm",
    clockSpeed: 1,
    coordinatorMode: "rules",
    hooks: {},
    publicBaseUrl: "http://127.0.0.1:8000",
  };
  const app = createApp(database, {
    workflowToken: TOKEN,
    config,
    completeFn: async () => output(++coordinatorCalls),
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    assert.equal((await post(base, "/events", {
      source: "chat",
      kind: "free_text",
      text: "El Pabellón Principal está cerrado; prepara el plan de contingencia.",
    })).status, 202);
    await waitFor(async () => Boolean((await state(base)).waitingForDecision));

    let current = await state(base);
    assert.equal(current.decisions.filter((item: Record<string, unknown>) => item.status === "pendiente").length, 1);
    assert.equal(current.calls.length, 0, "no external action starts before human approval");
    assert.equal((await actions(base))[0]?.status, "pending");

    const decisionId = current.waitingForDecision as string;
    assert.equal((await post(base, "/interventions", {
      type: "approve_spend",
      payload: { decisionId },
    })).status, 200);
    await waitFor(async () => (await state(base)).calls.length === 1);

    const firstOpen = (await actions(base))[0]!;
    const firstTask = app.locals.taskRepository.get(firstOpen.taskId);
    assert(firstTask);
    assert.equal(firstOpen.status, "dispatched");
    assert.equal((await state(base)).calls[0]?.simulated, true);

    const firstResult = result(firstTask, "simulated-callback-1");
    let response = await post(base, "/workflow/results", firstResult, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    await waitFor(async () => (await state(base)).calls[0]?.status === "terminada");
    assert.equal(coordinatorCalls, 2, "an accepted callback must not run the coordinator");

    response = await post(base, "/workflow/results", firstResult, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: true });
    await app.locals.engine.handle({ source: "human", kind: "resume" });
    assert.equal(coordinatorCalls, 2, "a retried callback must not run the coordinator");

    current = await state(base);
    const versionBeforeTwist = current.planVersion as number;
    assert.equal((await post(base, "/simulation/twists", { twist: "lounge_unavailable" })).status, 200);
    await waitFor(async () => {
      const next = await state(base);
      return next.planVersion > versionBeforeTwist && next.calls.length === 2;
    });

    current = await state(base);
    assert.equal(current.commitments.find((item: Record<string, unknown>) => item.id === "c-lounge-demo")?.status, "invalidado");
    assert.equal(current.decisions.filter((item: Record<string, unknown>) => item.status === "pendiente").length, 0);

    const secondOpen = (await actions(base))[0]!;
    const secondTask = app.locals.taskRepository.get(secondOpen.taskId);
    assert(secondTask);
    response = await post(base, "/workflow/results", result(secondTask, "simulated-callback-2"), TOKEN);
    assert.equal(response.status, 200);
    await waitFor(async () => (await actions(base)).length === 0);
    assert.equal(coordinatorCalls, 3);

    current = await state(base);
    assert.equal(current.planVersion > versionBeforeTwist, true);
    assert.equal(current.decisions.length, 1);
    assert.equal(current.calls.filter((item: Record<string, unknown>) => item.status === "en_curso").length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
});
