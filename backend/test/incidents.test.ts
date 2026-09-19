import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";

import { createApp } from "../src/app.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { TWIST_IDS } from "../src/contracts/api.js";
import { SimulationClock } from "../src/domain/clock.js";
import { ControlService } from "../src/domain/control-service.js";
import { Engine } from "../src/domain/engine.js";
import { INCIDENTS, LIVE_INTERVAL_SECONDS, incidentSequence } from "../src/domain/incidents.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

function world(completeFn?: () => Promise<string>) {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const control = new ControlService(states);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const engine = new Engine(
    states,
    control,
    new EventRepository(database.connection),
    tasks,
    { states, tasks, workflows },
    { mode: completeFn ? "llm" : "rules", world: loadWorld(), ...(completeFn ? { completeFn } : {}) },
  );
  const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
  const executor = new ActionExecutor(states, tasks, workflows, config);
  engine.attachExecutor(executor);
  const clock = new SimulationClock(states, executor, 60);
  clock.attachEngine(engine);
  const run = states.ensureActiveRun();
  const state = structuredClone(run.state);
  state.clock.speed = 60;
  states.saveState(run.id, state);
  return { database, states, control, clock, engine };
}

test("the catalogue has at least 10 incidents, none repeats a twist, and a seed gives one sequence", () => {
  assert(INCIDENTS.length >= 10);
  const ids = new Set(INCIDENTS.map((incident) => incident.id));
  assert.equal(ids.size, INCIDENTS.length);
  for (const twist of TWIST_IDS) assert(!ids.has(twist));
  assert.deepEqual(incidentSequence(7), incidentSequence(7));
  assert.notDeepEqual(incidentSequence(7), incidentSequence(8));
  assert.equal(new Set(incidentSequence(7)).size, INCIDENTS.length);
});

test("live mode fires at most one incident per interval, never while replanning, and stays off by default", async () => {
  const { database, states, control, clock } = world();
  try {
    clock.tick();
    await settle();
    assert.equal(states.ensureActiveRun().state.incidentsApplied, undefined);

    control.setLive(true, 7);
    assert.equal(states.ensureActiveRun().state.clock.live, true);
    clock.tick();
    await settle();
    let state = states.ensureActiveRun().state;
    const fired = state.incidentsApplied as string[];
    assert.deepEqual(fired, [incidentSequence(7)[0]]);
    assert.equal((state.events as Array<{ kind: string; text: string }>).at(-1)?.kind, "incidencia");

    clock.tick();
    await settle();
    assert.equal((states.ensureActiveRun().state.incidentsApplied as string[]).length, 1);

    const ticksPerInterval = LIVE_INTERVAL_SECONDS / 60;
    const run = states.ensureActiveRun();
    const busy = structuredClone(run.state);
    busy.coordinatorStatus = "replanificando";
    states.saveState(run.id, busy);
    for (let index = 0; index < ticksPerInterval + 1; index += 1) clock.tick();
    await settle();
    assert.equal((states.ensureActiveRun().state.incidentsApplied as string[]).length, 1);

    const free = structuredClone(states.ensureActiveRun().state);
    free.coordinatorStatus = "estable";
    states.saveState(run.id, free);
    clock.tick();
    await settle();
    state = states.ensureActiveRun().state;
    assert.deepEqual(state.incidentsApplied, incidentSequence(7).slice(0, 2));

    control.setLive(false);
    for (let index = 0; index < ticksPerInterval + 1; index += 1) clock.tick();
    await settle();
    assert.equal((states.ensureActiveRun().state.incidentsApplied as string[]).length, 2);
  } finally {
    clock.stop();
    database.close();
  }
});

test("every incident applies to the calm fixture and changes something", () => {
  const { database, states, control } = world();
  try {
    const before = JSON.stringify(states.ensureActiveRun().state);
    for (const incident of INCIDENTS) {
      control.applyIncident(incident.id);
      const state = states.ensureActiveRun().state;
      assert.equal((state.events as Array<{ text: string }>).at(-1)?.text, incident.text);
    }
    assert.notEqual(JSON.stringify(states.ensureActiveRun().state), before);
    const shuttle = (states.ensureActiveRun().state.shuttles as Array<Record<string, unknown>>).find((item) => item.id === "BUS-03")!;
    assert.equal(shuttle.status, "retrasado");
    assert.equal(shuttle.delayMin, 15);
  } finally {
    database.close();
  }
});

test("with an LLM the world agent invents the incident, applies its operations and the coordinator answers", async () => {
  const systems: string[] = [];
  const completeFn = async (_config: unknown, system: string) => {
    systems.push(system);
    if (system.startsWith("Eres el mundo")) {
      return JSON.stringify({ text: "Un camión de TV bloquea el Parking Sur: TX-01 no puede entrar", area: "transporte", operations: [{ op: "redirect_vehicle", id: "TX-01", destinationId: "accesoSur2", status: "retenido", note: "Bloqueado en Parking Sur" }, { op: "set_place", id: "parkingSur", status: "confirmado" }] });
    }
    return JSON.stringify({ reading: "x", planVersion: 99, coordinatorStatus: "estable", actions: [], commitments: [], assignments: [], decision: null, unverified: [] });
  };
  const { database, states, control, clock, engine } = world(completeFn);
  try {
    control.setLive(true, 3);
    clock.tick();
    await engine.handle({ source: "human", kind: "resume" });
    assert.equal(systems.length, 2);
    assert.ok(systems[0]!.startsWith("Eres el mundo"));
    const state = states.ensureActiveRun().state;
    assert.deepEqual(state.incidentsApplied, ["gen-0"]);
    assert.deepEqual(state.incidentTexts, ["Un camión de TV bloquea el Parking Sur: TX-01 no puede entrar"]);
    const taxi = (state.vehicles as Array<Record<string, unknown>>).find((item) => item.id === "TX-01")!;
    assert.equal(taxi.status, "retenido");
    assert.equal(taxi.destinationId, "accesoSur2");
    const parking = (state.spaces as Array<Record<string, unknown>>).find((item) => item.id === "parkingSur")!;
    assert.notEqual(parking.status, "confirmado");
    assert.ok((state.events as Array<{ kind: string; text: string }>).some((event) => event.kind === "incidencia" && event.text.includes("camión de TV")));
  } finally {
    clock.stop();
    database.close();
  }
});

test("with an LLM in catalog mode, or when the world agent fails, the catalogue incident is used", async () => {
  let calls = 0;
  const completeFn = async () => {
    calls += 1;
    return JSON.stringify({ reading: "x", planVersion: 99, coordinatorStatus: "estable", actions: [], commitments: [], assignments: [], decision: null, unverified: [] });
  };
  const catalog = world(completeFn);
  try {
    catalog.control.setLive(true, 3, "catalog");
    catalog.clock.tick();
    await catalog.engine.handle({ source: "human", kind: "resume" });
    assert.equal(calls, 1);
    assert.deepEqual(catalog.states.ensureActiveRun().state.incidentsApplied, [incidentSequence(3)[0]]);
  } finally {
    catalog.clock.stop();
    catalog.database.close();
  }
  calls = 0;
  const broken = world(completeFn);
  try {
    broken.control.setLive(true, 3);
    broken.clock.tick();
    await broken.engine.handle({ source: "human", kind: "resume" });
    assert.equal(calls, 2);
    assert.deepEqual(broken.states.ensureActiveRun().state.incidentsApplied, [incidentSequence(3)[0]]);
  } finally {
    broken.clock.stop();
    broken.database.close();
  }
});

test("POST /simulation/live toggles clock.live", async () => {

  const database2 = openDatabase(":memory:");
  const app = createApp(database2, { workflowToken: undefined });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (body: unknown) => fetch(`${base}/simulation/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let response = await post({ enabled: true, seed: 42 });
    assert.deepEqual(await response.json(), { ok: true, live: true, seed: 42, mode: "open" });
    response = await post({ enabled: true, seed: 42, mode: "catalog" });
    assert.deepEqual(await response.json(), { ok: true, live: true, seed: 42, mode: "catalog" });
    let state = await (await fetch(`${base}/state`)).json() as { clock: Record<string, unknown> };
    assert.equal(state.clock.live, true);
    assert.equal(state.clock.liveSeed, 42);
    response = await post({ enabled: false });
    assert.equal(response.status, 200);
    state = await (await fetch(`${base}/state`)).json() as { clock: Record<string, unknown> };
    assert.equal(state.clock.live, false);
    assert.equal((await post({ enabled: "yes" })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database2.close();
  }
});
