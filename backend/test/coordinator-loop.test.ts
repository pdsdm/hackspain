import assert from "node:assert/strict";
import test from "node:test";

import { runCoordinatorLoop } from "../src/agents/coordinator/loop.js";
import type { CoordinatorOutput } from "../src/agents/coordinator/types.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";

function baseOutput(overrides: Partial<CoordinatorOutput> = {}): CoordinatorOutput {
  return {
    reading: "Hay que revisar el Acceso Sur.",
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
    ...overrides,
  };
}

test("the coordinator loop answers queries, feeds errors back and finishes", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    const scripts = [
      baseOutput({
        done: false,
        queries: [{ type: "affected_by", placeId: "accesoSur" }],
      }),
      baseOutput({
        operations: [{ op: "set_place", id: "accesoSur", status: "confirmado" }],
        done: false,
      }),
      baseOutput({
        operations: [{ op: "log_event", kind: "incidencia", text: "Acceso Sur en revisión", area: "espacios" }],
        done: true,
      }),
    ];
    let round = 0;
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "tubería en Acceso Sur" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: undefined,
        completeFn: async () => JSON.stringify(scripts[round++]!),
      },
    );
    assert.equal(result, "ok");
    assert.equal(round, 3);
    const events = states.ensureActiveRun().state.events as Array<Record<string, unknown>>;
    assert.ok(events.some((event) => String(event.text).includes("Acceso Sur en revisión")));
  } finally {
    database.close();
  }
});

test("a dropped provider connection is retried once instead of losing the replan", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    let calls = 0;
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "cerramos Acceso Sur" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: undefined,
        completeFn: async () => {
          calls += 1;
          if (calls === 1) throw new TypeError("fetch failed");
          return JSON.stringify(
            baseOutput({ operations: [{ op: "set_place", id: "accesoSur", status: "cerrado" }] }),
          );
        },
      },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
    const acceso = states.ensureActiveRun().state.spaces.find((space) => space.id === "accesoSur");
    assert.equal(acceso?.status, "cerrado");
  } finally {
    database.close();
  }
});

test("a provider that keeps failing reports the coordinator as unavailable", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    let calls = 0;
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "cerramos Acceso Sur" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: undefined,
        completeFn: async () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
      },
    );
    assert.equal(result, "unavailable");
    assert.equal(calls, 2);
  } finally {
    database.close();
  }
});

test("a done plan with leftover queries is persisted instead of looping", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    let round = 0;
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "cerramos Acceso Sur" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: undefined,
        completeFn: async () => {
          round += 1;
          return JSON.stringify(
            baseOutput({
              operations: [{ op: "set_place", id: "accesoSur", status: "cerrado" }],
              queries: [{ type: "affected_by", placeId: "accesoSur" }],
              done: true,
            }),
          );
        },
      },
    );
    assert.equal(result, "ok");
    assert.equal(round, 1);
    const acceso = states.ensureActiveRun().state.spaces.find((space) => space.id === "accesoSur");
    assert.equal(acceso?.status, "cerrado");
  } finally {
    database.close();
  }
});

test("the in-process coordinator keeps a validated verification target on its task", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    const output = baseOutput({
      actions: [{
        id: "call-pabellon-b",
        area: "espacios",
        channel: "llamada",
        counterpart: "Responsable de recinto",
        objective: "Confirmar reserva del Pabellón B",
        dueAt: 45_000,
        dependsOn: [],
        reason: "Sin la reserva no hay cobertura confirmada.",
        verificationTarget: {
          commitmentId: "c-pabB",
          resourceType: "space",
          resourceId: "pabellonB",
        },
      }],
      commitments: [{
        id: "c-pabB",
        title: "Reserva de Pabellón B · 450 plazas",
        area: "espacios",
        status: "en_consulta",
        counterpart: "Recinto",
        conditions: ["Confirmar reserva"],
      }],
    });

    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "Confirma el Pabellón B" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: undefined,
        completeFn: async () => JSON.stringify(output),
      },
    );

    assert.equal(result, "ok");
    const task = tasks.listOpen(states.ensureActiveRun().id)[0];
    assert.ok(task);
    assert.deepEqual(
      (task.payload as Record<string, unknown>).verificationTarget,
      {
        commitmentId: "c-pabB",
        resourceType: "space",
        resourceId: "pabellonB",
      },
    );
  } finally {
    database.close();
  }
});

test("the Cognition tool harness consults the world and submits a plan", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(
      states,
      tasks,
      new WorkflowEventRepository(database.connection),
    );
    let calls = 0;
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "tubería en Acceso Sur" },
      {
        world: loadWorld(),
        states,
        tasks,
        workflows,
        config: {
          provider: "cognition",
          apiKey: "cog_test",
          model: "swe-1.7",
          baseUrl: "https://example.invalid/v1",
          harness: "tools",
          jsonObject: false,
          sessionApiUrl: "https://api.devin.ai/v3",
          devinMode: "fast",
        },
        chatFn: async (_config, messages) => {
          calls += 1;
          const last = messages[messages.length - 1];
          if (last?.role !== "tool") {
            return {
              content: null,
              tool_calls: [
                {
                  id: "call-consult",
                  type: "function",
                  function: {
                    name: "consult_world",
                    arguments: JSON.stringify({ type: "affected_by", placeId: "accesoSur" }),
                  },
                },
              ],
            };
          }
          return {
            content: null,
            tool_calls: [
              {
                id: "call-submit",
                type: "function",
                function: {
                  name: "submit_plan",
                  arguments: JSON.stringify(
                    baseOutput({
                      operations: [
                        { op: "log_event", kind: "incidencia", text: "Acceso Sur vía harness", area: "espacios" },
                      ],
                      done: true,
                    }),
                  ),
                },
              },
            ],
          };
        },
      },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
    const events = states.ensureActiveRun().state.events as Array<Record<string, unknown>>;
    assert.ok(events.some((event) => String(event.text).includes("Acceso Sur vía harness")));
  } finally {
    database.close();
  }
});
