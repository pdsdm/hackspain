import assert from "node:assert/strict";
import test from "node:test";
import { useAcceptingSeed } from "./sim-support.js";

import { translateHappyRobotResult } from "../src/actions/adapters/happyrobot-inbound.js";
import { dispatchHappyRobot } from "../src/actions/adapters/happyrobot.js";
import { e2eReply } from "../src/actions/adapters/sim-world.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

function harness() {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  return { database, states, tasks, executor };
}

test("sim adapter opens a call and applies a canned result", async () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "sim-call",
    });
    useAcceptingSeed(states, task);
    executor.pump();
    const opened = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(opened[0]?.status, "en_curso");
    await new Promise((resolve) => setImmediate(resolve));
    executor.fireDue(Number(run.state.clock.simSeconds) + 60);
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "terminada");
    assert.equal(tasks.get(task.id)?.status, "completed");
  } finally {
    database.close();
  }
});

test("an isolated E2E run forces sim even when real hooks are configured", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "https://hook.test/transporte" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("external dispatch must stay disabled");
  };
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.forceSimActions = true;
    state.e2eMode = "production-isolated";
    states.saveState(run.id, state);
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "e2e-sim-call",
    });
    executor.pump();
    await new Promise((resolve) => setImmediate(resolve));
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.simulated, true);
    assert.equal(externalCalls, 0);
    const now = Number(run.state.clock.simSeconds);
    executor.fireDue(now + 2);
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    executor.fireDue(now + 3);
    assert.equal(tasks.get(task.id)?.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("E2E live mode dispatches exactly the first Transport action through HappyRobot", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const executor = new ActionExecutor(states, tasks, workflows, {
    ...loadConfig(),
    coordinatorMode: "rules",
    hooks: { transporte: "https://hook.test/transporte" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  });
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return new Response("{}", { status: 200 });
  };
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.forceSimActions = true;
    state.e2eMode = "production-isolated";
    state.e2eRealTransportCall = true;
    states.saveState(run.id, state);
    for (const index of [1, 2]) {
      tasks.enqueue({
        runId: run.id,
        planVersion: run.state.planVersion,
        area: "transporte",
        kind: "call",
        payload: { objective: `Confirmar shuttle ${index}`, counterpart: "Transportes" },
        idempotencyKey: `e2e-real-transport-${index}`,
      });
    }
    executor.pump();
    await new Promise((resolve) => setImmediate(resolve));
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(externalCalls, 1);
    assert.equal(calls.filter((call) => call.simulated === false).length, 1);
    assert.equal(calls.filter((call) => call.simulated === true).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("E2E specialist replies are deterministic, positive and area-specific", () => {
  const outcomes = Object.fromEntries(["espacios", "catering", "transporte", "asistentes"].map((area) => {
    const reply = e2eReply({
      id: `task-${area}`,
      runId: "run",
      planVersion: 1,
      area,
      kind: "call",
      payload: { objective: `Objetivo ${area}`, counterpart: `Contraparte ${area}` },
      idempotencyKey: `e2e-${area}`,
      status: "dispatching",
      attempts: 1,
    });
    assert.ok(["accepted", "accepted_with_conditions"].includes(reply.outcome));
    assert.equal(reply.transcript.length, 2);
    assert.match(reply.summary, /Simulado:/);
    return [area, reply.outcome];
  }));
  assert.deepEqual(outcomes, {
    espacios: "accepted_with_conditions",
    catering: "accepted_with_conditions",
    transporte: "accepted",
    asistentes: "accepted",
  });
});

test("un resultado fuera de contexto se descarta y no tumba el proceso", async () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "sim-call-obsoleta",
    });
    useAcceptingSeed(states, task);
    executor.pump();
    await new Promise((resolve) => setImmediate(resolve));
    // El plan avanza mientras la llamada está en vuelo: el resultado programado ya no
    // corresponde a la versión de la tarea. Antes esta excepción salía en el tick del reloj
    // y se llevaba el backend por delante.
    const current = states.ensureActiveRun();
    const moved = structuredClone(current.state);
    moved.planVersion += 1;
    states.saveState(current.id, moved);
    tasks.carryToPlan(task.id, moved.planVersion);
    assert.doesNotThrow(() => executor.fireDue(Number(moved.clock.simSeconds) + 60));
    assert.equal(tasks.get(task.id)?.status, "dispatched");
  } finally {
    database.close();
  }
});

test("paused agents are not dispatched", () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.agentsPaused = true;
    states.saveState(run.id, state);
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "paused",
    });
    executor.pump();
    assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 0);
  } finally {
    database.close();
  }
});

test("cancelled tasks are never dispatched", () => {
  const { database, states, tasks, executor } = harness();
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "x", counterpart: "y" },
      idempotencyKey: "cancel-me",
    });
    tasks.cancel(task.id, "obsolete");
    executor.pump();
    assert.equal((states.ensureActiveRun().state.calls as unknown[]).length, 0);
  } finally {
    database.close();
  }
});

test("a dispatched task without callback times out as no_answer", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "http://hook.test/transporte" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  let dispatched: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    dispatched = { url: String(input), init: init ?? {} };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "hook-call",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    assert.ok(dispatched);
    assert.equal(dispatched.url, "http://hook.test/transporte");
    assert.equal(new Headers(dispatched.init.headers).get("Authorization"), "Bearer key");
    const payload = JSON.parse(String(dispatched.init.body)) as Record<string, unknown>;
    assert.equal(payload.taskId, task.id);
    assert.equal(payload.runId, run.id);
    assert.equal(payload.planVersion, run.state.planVersion);
    assert.equal(payload.phone_number, "+34600000000");
    assert.equal((payload.contact as Record<string, unknown>).phone, "+34600000000");
    assert.deepEqual(payload.data, {});
    // Los mismos valores en plano, por si el workflow extrae "contact.phone" como clave.
    assert.equal(payload["contact.phone"], "+34600000000");
    assert.equal(payload["situation.simSeconds"], run.state.clock.simSeconds);
    // El workflow contesta por la puerta traducida (T9), no por la estricta del contrato.
    assert.equal(payload.callbackUrl, "http://localhost:8000/workflow/happyrobot/results");
    assert.equal(payload.transcriptCallbackUrl, "http://localhost:8000/workflow/happyrobot/transcript");
    const now = Number(run.state.clock.simSeconds);
    executor.fireDue(now + 60);
    assert.equal(tasks.get(task.id)?.status, "dispatched");
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS + 1);
    assert.equal(tasks.get(task.id)?.status, "failed");
    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "sin_respuesta");
    const agent = (states.ensureActiveRun().state.agents as Array<Record<string, unknown>>).find((a) => a.id === "transporte");
    assert.equal(agent?.status, "incidencia");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("only one real call is in flight at a time; the next waits for the callback", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { transporte: "http://hook.test/transporte", espacios: "http://hook.test/espacios" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const first = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Pabellón B", counterpart: "Recinto" },
      idempotencyKey: "call-1",
    });
    const second = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "transporte",
      kind: "call",
      payload: { objective: "Confirmar desvío", counterpart: "Transportes" },
      idempotencyKey: "call-2",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const statuses = () => [first, second].map((task) => tasks.get(task.id)?.status);
    assert.deepEqual([...statuses()].sort(), ["dispatched", "pending"]);
    const waiting = statuses()[0] === "pending" ? first : second;
    const active = waiting === first ? second : first;
    assert.equal(tasks.get(waiting.id)?.attempts, 0);
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(tasks.get(waiting.id)?.status, "pending");
    assert.equal(urls.length, 1);
    const now = Number(run.state.clock.simSeconds);
    executor.fireDue(now + ActionExecutor.DISPATCH_TIMEOUT_SECONDS + 1);
    assert.equal(tasks.get(active.id)?.status, "failed");
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(tasks.get(waiting.id)?.status, "dispatched");
    assert.deepEqual([...urls].sort(), ["http://hook.test/espacios", "http://hook.test/transporte"]);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("HappyRobot receives an explicit call, sms or email channel", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const run = states.ensureActiveRun();
  const originalFetch = globalThis.fetch;
  const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    for (const kind of ["call", "sms", "email"] as const) {
      await dispatchHappyRobot({
        hookUrl: "http://hook.test/asistentes",
        apiKey: "key",
        task: {
          id: `task-${kind}`,
          runId: run.id,
          planVersion: run.state.planVersion,
          area: "asistentes",
          kind,
          payload: { objective: "Avisar del destino vigente", counterpart: "Invitado de prueba" },
          idempotencyKey: `channel-${kind}`,
          status: "dispatching",
          attempts: 1,
        },
        runId: run.id,
        planVersion: run.state.planVersion,
        callId: `call-task-${kind}`,
        publicBaseUrl: "http://localhost:8000",
        testPhone: "+34600000000",
        state: run.state,
      });
    }
    assert.deepEqual(sent.map((payload) => [payload.kind, payload.channel]), [
      ["call", "call"],
      ["sms", "sms"],
      ["email", "email"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("a native HappyRobot callback closes the open call with its transcript", async () => {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { espacios: "http://hook.test/espacios" },
    happyrobotTestPhone: "+34600000000",
    happyrobotApiKey: "key",
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const originalFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Pabellón B", counterpart: "Recinto" },
      idempotencyKey: "native-callback",
    });
    executor.pump();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // El backend manda el teléfono del entorno y el callback de la puerta de HappyRobot.
    assert.equal((sent.contact as Record<string, unknown>).phone, "+34600000000");
    assert.match(String(sent.callbackUrl), /\/workflow\/happyrobot\/results$/);

    const envelope = translateHappyRobotResult(
      {
        call_id: `call-${task.id}`,
        outcome: "accepted",
        summary: "Pabellón B reservado",
        transcript: [{ speaker: "human", text: "Lo tienes a las 13:00", at: 20 }],
      },
      tasks,
    );
    const recorded = workflows.recordSpecialistResult(envelope);
    assert.equal(recorded.applied, true);

    const calls = states.ensureActiveRun().state.calls as Array<Record<string, unknown>>;
    assert.equal(calls[0]?.status, "terminada");
    assert.deepEqual(calls[0]?.transcript, [{ who: "humano", text: "Lo tienes a las 13:00", at: 20 }]);
    assert.equal(tasks.get(task.id)?.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
