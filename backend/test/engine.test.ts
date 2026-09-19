import assert from "node:assert/strict";
import test from "node:test";

import { ControlService } from "../src/domain/control-service.js";
import { Engine } from "../src/domain/engine.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";

function engine(database = openDatabase(":memory:"), completeFn?: () => Promise<string>) {
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const events = new EventRepository(database.connection);
  const control = new ControlService(states);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const instance = new Engine(
    states,
    control,
    events,
    tasks,
    { states, tasks, workflows },
    {
      mode: completeFn ? "llm" : "rules",
      world: loadWorld(),
      ...(completeFn ? { completeFn } : {}),
    },
  );
  return { database, states, tasks, instance, workflows };
}

test("rules mode applies a jury twist without calling the LLM", async () => {
  const { database, states, instance } = engine();
  try {
    await instance.handle({ source: "jury", kind: "lounge_unavailable", payload: { twist: "lounge_unavailable" } });
    const lounge = states.ensureActiveRun().state.spaces.find((space) => space.id === "loungeSur");
    assert.equal(lounge?.status, "descartado");
  } finally {
    database.close();
  }
});

test("human call_request enqueues one deterministic call without an LLM", async () => {
  const { database, states, tasks, instance } = engine();
  try {
    const run = states.ensureActiveRun();
    await instance.handle({
      id: "manual-call-1",
      source: "human",
      kind: "call_request",
      text: "Llamar al recinto",
      payload: {
        area: "espacios",
        counterpart: "Responsable de recinto - MADRING",
        objective: "Confirmar Pabellón B para 450 invitados",
      },
    });
    const queued = tasks.listOpen(run.id);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.area, "espacios");
    assert.equal(queued[0]?.kind, "call");
    assert.deepEqual(queued[0]?.payload, {
      objective: "Confirmar Pabellón B para 450 invitados",
      counterpart: "Responsable de recinto - MADRING",
      reason: "Solicitud manual del responsable",
      data: {},
    });
  } finally {
    database.close();
  }
});

test("human approve invokes the coordinator when a complete function is injected", async () => {
  let called = 0;
  const { database, states, instance } = engine(openDatabase(":memory:"), async () => {
    called += 1;
    return JSON.stringify({
      reading: "Gasto autorizado, seguir en Sur.",
      planVersion: 2,
      coordinatorStatus: "replanificando",
      actions: [],
      commitments: [],
      assignments: [],
      decision: null,
      unverified: [],
      operations: [{ op: "log_event", kind: "accion", text: "Tras la aprobación" }],
      queries: [],
      done: true,
    });
  });
  try {
    const proposal = states.reset("proposal");
    const decision = proposal.state.decisions.find((item) => item.status === "pendiente") as { id: string };
    await instance.handle({
      source: "human",
      kind: "approve_plan",
      payload: { decisionId: decision.id },
    });
    assert.equal(called, 1);
  } finally {
    database.close();
  }
});

test("events are processed one after another", async () => {
  const order: string[] = [];
  const { database, instance } = engine(openDatabase(":memory:"), async (_c, _s, user) => {
    order.push(user.includes("primero") ? "a" : "b");
    return JSON.stringify({
      reading: "ok",
      planVersion: 1,
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
  });
  try {
    const first = instance.handle({ source: "chat", kind: "free_text", text: "primero" });
    const second = instance.handle({ source: "chat", kind: "free_text", text: "segundo" });
    await Promise.all([first, second]);
    assert.deepEqual(order, ["a", "b"]);
  } finally {
    database.close();
  }
});

test("a rejected event does not poison the queue for the next one", async () => {
  const { database, states, instance } = engine();
  try {
    await assert.rejects(
      instance.handle({ source: "human", kind: "approve_plan", payload: { decisionId: "nope" } }),
      /Decision not found/,
    );
    await instance.handle({ source: "jury", kind: "shuttle_delay", payload: { twist: "shuttle_delay" } });
    assert.deepEqual(states.ensureActiveRun().state.twistsApplied, ["shuttle_delay"]);
    await instance.handle({ source: "human", kind: "pause" });
    assert.equal(states.ensureActiveRun().state.agentsPaused, true);
  } finally {
    database.close();
  }
});

test("every run starts with a live clock, even from a paused fixture", () => {
  const { database, states } = engine();
  try {
    for (const fixture of ["crisis", "proposal", "lounge_unavailable"] as const) {
      const run = states.reset(fixture);
      assert.equal(run.state.clock.paused, false, fixture);
    }
  } finally {
    database.close();
  }
});

test("stored events record whether the coordinator ran as llm, rules or none", async () => {
  const { database, instance } = engine(openDatabase(":memory:"), async () =>
    JSON.stringify({
      reading: "ok", planVersion: 1, coordinatorStatus: "replanificando", actions: [], commitments: [],
      assignments: [], decision: null, unverified: [], operations: [], queries: [], done: true,
    }),
  );
  try {
    await instance.handle({ id: "evt-llm", source: "chat", kind: "free_text", text: "hola" });
    await instance.handle({ id: "evt-pause", source: "human", kind: "pause" });
    const rows = database.connection.prepare("SELECT id, mode FROM events ORDER BY created_at, id").all() as Array<{ id: string; mode: string }>;
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.id, row.mode])), { "evt-llm": "llm", "evt-pause": "none" });
  } finally {
    database.close();
  }
});

test("an accepted call_result only calls the coordinator for a material state change", async () => {
  let calls = 0;
  let prompt = "";
  const completeFn = async (...args: unknown[]) => {
    calls += 1;
    prompt = String(args[2] ?? "");
    return JSON.stringify({ reading: "x", planVersion: 99, coordinatorStatus: "replanificando", actions: [], commitments: [], assignments: [], decision: null, unverified: [] });
  };
  const { database, states, instance } = engine(undefined, completeFn);
  try {
    const run = states.ensureActiveRun();
    const base = { taskId: "t1", runId: run.id, planVersion: run.state.planVersion, result: { summary: "ok", conditions: [], evidence: {}, data: {} } };
    await instance.handle({ source: "happyrobot", kind: "call_result", payload: { ...base, status: "completed", result: { ...base.result, outcome: "accepted_with_conditions" } } });
    assert.equal(calls, 0);
    await instance.handle({
      source: "happyrobot",
      kind: "call_result",
      payload: {
        ...base,
        status: "completed",
        materialChange: true,
        materialSummary: "Pabellón B: capacidad 400; utilizable a las 13:15",
        result: { ...base.result, outcome: "accepted_with_conditions" },
      },
    });
    assert.equal(calls, 1);
    assert.match(prompt, /capacidad 400; utilizable a las 13:15/);
    await instance.handle({ source: "happyrobot", kind: "call_result", payload: { ...base, status: "completed", result: { ...base.result, outcome: "rejected" } } });
    assert.equal(calls, 2);
    const next = structuredClone(states.ensureActiveRun().state);
    next.planVersion += 1;
    states.saveState(run.id, next);
    await instance.handle({ source: "happyrobot", kind: "call_result", payload: { ...base, status: "no_answer", result: { ...base.result, outcome: "no_answer" } } });
    assert.equal(calls, 2);
    await instance.handle({ source: "happyrobot", kind: "call_result", payload: { ...base, planVersion: next.planVersion, status: "no_answer", result: { ...base.result, outcome: "no_answer" } } });
    assert.equal(calls, 3);
  } finally {
    database.close();
  }
});

test("the coordinator status shows replanificando while the LLM works and the busy flag stays private", async () => {
  let statusDuringCall = "";
  let publicDuringCall: Record<string, unknown> = {};
  let statesRef: StateRepository | undefined;
  const { database, states, instance } = engine(openDatabase(":memory:"), async () => {
    statusDuringCall = String(statesRef?.ensureActiveRun().state.coordinatorStatus);
    publicDuringCall = statesRef?.getPublicState() ?? {};
    throw new Error("llm caído");
  });
  statesRef = states;
  try {
    await instance.handle({ source: "chat", kind: "free_text", text: "Pabellon principal se cierra" });
    assert.equal(statusDuringCall, "replanificando");
    assert.equal(publicDuringCall.coordinatorBusy, undefined);
    assert.equal(states.ensureActiveRun().state.coordinatorBusy, undefined);
  } finally {
    database.close();
  }
});

test("a coordinator run interrupted by a restart leaves a fallo event on boot", () => {
  const { database, states, instance } = engine();
  try {
    const run = states.ensureActiveRun();
    states.saveState(run.id, {
      ...structuredClone(run.state),
      coordinatorBusy: { eventId: "e1", text: "Pabellon principal se cierra" },
    });
    assert.equal(instance.recoverInterruptedCoordinator(), true);
    const state = states.ensureActiveRun().state;
    assert.equal(state.coordinatorBusy, undefined);
    const events = state.events as Array<{ kind: string; text: string }>;
    const last = events.at(-1);
    assert.equal(last?.kind, "fallo");
    assert.match(last?.text ?? "", /interrumpido.*Pabellon principal se cierra/);
    assert.equal(instance.recoverInterruptedCoordinator(), false);
  } finally {
    database.close();
  }
});
