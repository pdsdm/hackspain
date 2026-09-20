import assert from "node:assert/strict";
import test from "node:test";

import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

function harness(overrides: Record<string, unknown> = {}) {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = {
    ...loadConfig(),
    coordinatorMode: "rules" as const,
    hooks: { espacios: "http://hook.test/espacios" },
    happyrobotApiKey: "key",
    happyrobotTestPhone: "+34600000000",
    ...overrides,
  };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  const run = states.ensureActiveRun();
  const state = structuredClone(run.state);
  state.clock.paused = false;
  states.saveState(run.id, state);
  return { database, states, tasks, executor };
}

function captureFetch(): { bodies: Array<Record<string, unknown>>; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { bodies, restore: () => { globalThis.fetch = original; } };
}

/** Cierra la llamada en curso: la cola solo deja una llamada real a la vez. */
function freeTheLine(states: StateRepository): void {
  const run = states.ensureActiveRun();
  const state = structuredClone(run.state);
  state.calls = [];
  states.saveState(run.id, state);
}

interface CallInput {
  states: StateRepository;
  tasks: TaskRepository;
  executor: ActionExecutor;
  objective: string;
  counterpart?: string;
  area?: string;
  kind?: string;
  key: string;
}

async function dial(input: CallInput): Promise<string> {
  const run = input.states.ensureActiveRun();
  const task = input.tasks.enqueue({
    runId: run.id,
    planVersion: run.state.planVersion,
    area: input.area ?? "espacios",
    kind: input.kind ?? "call",
    payload: { objective: input.objective, counterpart: input.counterpart ?? "Recinto MADRING" },
    idempotencyKey: input.key,
  });
  await input.executor.dispatchNow(task.id);
  return task.id;
}

test("el mismo encargo a la misma contraparte no se marca dos veces", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Fan Zone Sur para 150", key: "p1" });
    assert.equal(fetched.bodies.length, 1);

    freeTheLine(states);
    // Lo que pasó en producción: la contraparte recibió dos llamadas por el mismo encargo y
    // contestó cifras distintas, 120 en una y 150 en la otra.
    const second = await dial({ states, tasks, executor, objective: "Confirmar Lounge Fan Zone Sur para 150", key: "p2" });
    assert.equal(fetched.bodies.length, 1);
    assert.equal(tasks.get(second)?.status, "failed");

    const call = (states.ensureActiveRun().state.calls as Array<Record<string, unknown>>)
      .find((item) => item.id === `call-${second}`);
    assert.equal(call, undefined, "una llamada bloqueada no aparece en el panel");

    const agent = (states.ensureActiveRun().state.agents as Array<Record<string, unknown>>)
      .find((item) => item.id === "espacios");
    assert.match(String(agent?.lastResult), /No se repite la llamada/);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("una pregunta distinta a la misma contraparte sí sale", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", key: "p1" });
    freeTheLine(states);
    // El caso legítimo: se cayó el Lounge, ahora hay que preguntar por Norte C. Bloquear esto
    // dejaría el área muda, que es peor que una llamada de más.
    await dial({ states, tasks, executor, objective: "Consultar Pabellón Norte C", key: "p2" });
    assert.equal(fetched.bodies.length, 2);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("el mismo encargo a otra contraparte sí sale", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", counterpart: "Recinto", key: "p1" });
    freeTheLine(states);
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", counterpart: "Producción", key: "p2" });
    assert.equal(fetched.bodies.length, 2);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("el reintento de una llamada sin respuesta no queda bloqueado", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", key: "plan:espacios" });
    freeTheLine(states);
    // El :retry existe justo para volver a marcar a quien no contestó.
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", key: "plan:espacios:retry" });
    assert.equal(fetched.bodies.length, 2);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("con CALL_COOLDOWN_MS a cero no se bloquea ninguna repetición", async () => {
  const { database, states, tasks, executor } = harness({ callCooldownMs: 0 });
  const fetched = captureFetch();
  try {
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", key: "p1" });
    freeTheLine(states);
    await dial({ states, tasks, executor, objective: "Confirmar Lounge Sur", key: "p2" });
    assert.equal(fetched.bodies.length, 2);
  } finally {
    fetched.restore();
    database.close();
  }
});

test("una acción de email no hace sonar el teléfono", async () => {
  const { database, states, tasks, executor } = harness();
  const fetched = captureFetch();
  try {
    // El hook configurado es un workflow de voz: ignora el kind y siempre marca. En producción
    // una acción de email acabó en una llamada real, con transcripción y todo.
    const task = await dial({
      states, tasks, executor, kind: "email", objective: "Confirmar por escrito el aforo", key: "mail",
    });
    assert.equal(fetched.bodies.length, 0);
    assert.equal(tasks.get(task)?.status, "failed");
    const agent = (states.ensureActiveRun().state.agents as Array<Record<string, unknown>>)
      .find((item) => item.id === "espacios");
    assert.match(String(agent?.lastResult), /Sin canal real para email/);
  } finally {
    fetched.restore();
    database.close();
  }
});
