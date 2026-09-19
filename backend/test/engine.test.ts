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
      kind: "approve_spend",
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
      instance.handle({ source: "human", kind: "approve_spend", payload: { decisionId: "nope" } }),
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
