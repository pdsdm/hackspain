import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { CompleteFn } from "../src/agents/coordinator/loop.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

const TOKEN = "test-workflow-token";

async function post(
  base: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function withServer(
  run: (
    base: string,
    states: StateRepository,
    tasks: TaskRepository,
  ) => Promise<void>,
  workflowToken: string | undefined | null = TOKEN,
  completeFn?: CompleteFn,
): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const server = createApp(database, {
    workflowToken: workflowToken ?? undefined,
    ...(completeFn ? { completeFn } : {}),
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, states, tasks);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
}

function coordinatorBody(runId: string, planVersion: number) {
  return {
    eventId: "coordinator-event-1",
    runId,
    planVersion,
    reading: "Espacios bloquea la recuperación de la hospitalidad.",
    proposal: {
      title: "Consultar plan Sur",
      summary: "Validar Pabellón B antes de mover catering",
      rationale: "Mantiene a los invitados en la zona Sur",
      cost: 0,
      conditions: ["Confirmar disponibilidad"],
      allocations: [{ guestId: "guest-001", spaceId: "pabellonB", status: "proposed" }],
      confirmedNorthGuestIds: [],
      confirmedExternalTransferSeats: 0,
    },
    commitments: [{
      id: "c-pabB",
      title: "Consultar Pabellón B",
      area: "espacios",
      status: "en_consulta",
      counterpart: "Recinto",
      conditions: ["Confirmar reserva"],
    }],
    actions: [
      {
        actionId: "call-spaces",
        area: "espacios",
        kind: "call",
        objective: "Confirmar Pabellón B",
        counterpart: "Responsable de recinto",
        dueAt: 44400,
        reason: "Sin aforo no se puede cerrar el plan.",
        dependsOn: [],
        payload: {
          candidateIds: ["pabellonB"],
          verificationTarget: {
            commitmentId: "c-pabB",
            resourceType: "space",
            resourceId: "pabellonB",
          },
        },
      },
      {
        actionId: "email-catering",
        area: "catering",
        kind: "email",
        objective: "Preparar redirección de catering",
        counterpart: "Proveedor de catering",
        dueAt: 44520,
        reason: "La entrega depende del espacio elegido.",
        dependsOn: ["call-spaces"],
        payload: {},
      },
    ],
    unverified: ["Coste de reserva"],
  };
}

function specialistBody(taskId: string, runId: string, planVersion: number) {
  return {
    eventId: "specialist-event-1",
    taskId,
    runId,
    planVersion,
    status: "completed",
    result: {
      outcome: "accepted_with_conditions",
      summary: "Pabellón B disponible sujeto a confirmación de reserva.",
      conditions: ["Confirmar reserva"],
      evidence: {
        sessionId: "happyrobot-session-real",
        callId: "call-spaces-1",
        transcript: [{ who: "humano", text: "Está disponible", at: 12 }],
      },
      data: { spaces: [{ id: "pabellonB", availability: "condicionada" }] },
    },
  };
}

test("panel mutations validate, persist and reset the active run", async () => {
  await withServer(async (base, states) => {
    const firstRun = states.ensureActiveRun();
    let response = await post(base, "/interventions", { type: "pause" });
    assert.equal(response.status, 200);
    assert.equal(states.getPublicState().agentsPaused, true);

    response = await post(base, "/interventions", { type: "set_constraint", payload: {} });
    assert.equal(response.status, 400);

    response = await post(base, "/simulation/twists", { twist: "lounge_unavailable" });
    assert.equal(response.status, 200);
    const version = states.ensureActiveRun().state.planVersion;
    assert.equal(version, firstRun.state.planVersion + 1);

    response = await post(base, "/simulation/twists", { twist: "lounge_unavailable" });
    assert.equal(response.status, 200);
    assert.equal(states.ensureActiveRun().state.planVersion, version);

    response = await post(base, "/simulation/reset", {});
    const reset = (await response.json()) as { ok: boolean; runId: string; planVersion: number };
    assert.equal(response.status, 200);
    assert.equal(reset.ok, true);
    assert.notEqual(reset.runId, firstRun.id);
    assert.equal(reset.planVersion, 1);
  });
});

test("workflow endpoints require configured bearer authentication", async () => {
  await withServer(async (base, states) => {
    const run = states.ensureActiveRun();
    const body = coordinatorBody(run.id, run.state.planVersion);
    assert.equal((await post(base, "/workflow/coordinator/proposals", body)).status, 401);
    assert.equal(
      (await post(base, "/workflow/coordinator/proposals", body, "wrong-token")).status,
      401,
    );
  });

  await withServer(async (base, states) => {
    const run = states.ensureActiveRun();
    assert.equal(
      (await post(
        base,
        "/workflow/coordinator/proposals",
        coordinatorBody(run.id, run.state.planVersion),
        TOKEN,
      )).status,
      503,
    );
  }, null);
});

test("coordinator proposals are versioned, idempotent and enqueue dependencies", async () => {
  await withServer(async (base, states, tasks) => {
    const run = states.ensureActiveRun();
    const body = coordinatorBody(run.id, run.state.planVersion);
    let response = await post(base, "/workflow/coordinator/proposals", body, TOKEN);
    const first = (await response.json()) as {
      duplicate: boolean;
      planVersion: number;
      tasks: Array<{ actionId: string; taskId: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(first.duplicate, false);
    assert.equal(first.planVersion, 2);
    assert.equal(first.tasks.length, 2);
    const firstPayload = tasks.get(first.tasks[0]!.taskId)?.payload as Record<string, unknown>;
    assert.deepEqual(firstPayload.verificationTarget, {
      commitmentId: "c-pabB",
      resourceType: "space",
      resourceId: "pabellonB",
    });

    const state = states.getPublicState();
    assert.equal(state.planVersion, 2);
    assert(state.commitments.some((commitment) => commitment.id === "c-pabB"));
    const spacesAgent = (state.agents as Array<Record<string, unknown>>).find(
      (agent) => agent.id === "espacios",
    );
    assert.equal(spacesAgent?.reason, "Sin aforo no se puede cerrar el plan.");

    response = await post(base, "/workflow/coordinator/proposals", body, TOKEN);
    const duplicate = (await response.json()) as typeof first;
    assert.equal(response.status, 200);
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.tasks, first.tasks);
    assert.equal(states.ensureActiveRun().state.planVersion, 2);

    const conflict = structuredClone(body);
    conflict.reading = "Mismo ID con otro cuerpo";
    assert.equal(
      (await post(base, "/workflow/coordinator/proposals", conflict, TOKEN)).status,
      409,
    );

    const stale = structuredClone(body);
    stale.eventId = "coordinator-event-stale";
    assert.equal(
      (await post(base, "/workflow/coordinator/proposals", stale, TOKEN)).status,
      409,
    );

    assert.equal((await post(base, "/interventions", { type: "pause" })).status, 200);
    assert.equal(tasks.claimNext(), undefined);
    assert.equal((await post(base, "/interventions", { type: "resume" })).status, 200);
    assert.equal(tasks.claimNext()?.id, first.tasks[0]!.taskId);
    assert.equal(tasks.claimNext(), undefined);
  });
});

test("specialist results apply once and stale callbacks remain evidence", async () => {
  await withServer(async (base, states, tasks) => {
    const run = states.ensureActiveRun();
    const proposalResponse = await post(
      base,
      "/workflow/coordinator/proposals",
      coordinatorBody(run.id, run.state.planVersion),
      TOKEN,
    );
    const proposal = (await proposalResponse.json()) as {
      planVersion: number;
      tasks: Array<{ actionId: string; taskId: string }>;
    };
    const firstTask = proposal.tasks[0]!;
    const secondTask = proposal.tasks[1]!;
    const replanning = structuredClone(states.ensureActiveRun().state);
    replanning.coordinatorStatus = "replanificando";
    states.saveState(run.id, replanning);
    const result = specialistBody(firstTask.taskId, run.id, proposal.planVersion);

    let response = await post(base, "/workflow/results", result, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    assert.equal(response.status, 200);
    assert.equal(states.getPublicState().coordinatorStatus, "replanificando");
    assert.equal(tasks.claimNext()?.id, secondTask.taskId);
    const secondResult = specialistBody(secondTask.taskId, run.id, proposal.planVersion);
    secondResult.eventId = "specialist-event-2";
    response = await post(base, "/workflow/results", secondResult, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    assert.equal(states.getPublicState().coordinatorStatus, "atascado");
    assert.equal(states.getPublicState().resolved, false);

    response = await post(base, "/workflow/results", result, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: true });
    const spacesAgent = (states.getPublicState().agents as Array<Record<string, unknown>>).find(
      (agent) => agent.id === "espacios",
    );
    assert.equal(
      spacesAgent?.lastResult,
      "Pabellón B disponible sujeto a confirmación de reserva.",
    );

    const oldRunId = run.id;
    states.reset();
    const stale = specialistBody(secondTask.taskId, oldRunId, proposal.planVersion);
    stale.eventId = "specialist-event-stale";
    stale.result.data = { spaces: [{ id: "pabellonB", capacity: 1 }] };
    response = await post(base, "/workflow/results", stale, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: false, duplicate: false });
    assert.equal(states.ensureActiveRun().state.spaces.find((space) => space.id === "pabellonB")?.capacity, 450);
  });
});

test("rejected and no-answer results never apply claimed space facts", async () => {
  for (const resultCase of [
    { status: "completed" as const, outcome: "rejected" as const },
    { status: "no_answer" as const, outcome: "no_answer" as const },
  ]) {
    await withServer(async (base, states) => {
      const run = states.ensureActiveRun();
      const proposalResponse = await post(base, "/workflow/coordinator/proposals", coordinatorBody(run.id, run.state.planVersion), TOKEN);
      const proposal = (await proposalResponse.json()) as { planVersion: number; tasks: Array<{ taskId: string }> };
      const result = specialistBody(proposal.tasks[0]!.taskId, run.id, proposal.planVersion);
      result.eventId = `result-${resultCase.outcome}`;
      result.status = resultCase.status;
      result.result.outcome = resultCase.outcome;
      result.result.conditions = [];
      result.result.data = { spaces: [{ id: "pabellonB", capacity: 1, readyAt: "23:59" }] };
      const response = await post(base, "/workflow/results", result, TOKEN);
      assert.equal(response.status, 200);
      const space = states.ensureActiveRun().state.spaces.find((item) => item.id === "pabellonB");
      assert.equal(space?.capacity, 450);
      assert.equal(space?.readyAt, undefined);
    });
  }
});

test("a material accepted result reaches the coordinator after the new facts are persisted once", async () => {
  let statesRef: StateRepository | undefined;
  let calls = 0;
  let observedCapacity = 0;
  let observedConditions: unknown[] = [];
  let release: () => void = () => {};
  const observed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completeFn: CompleteFn = async () => {
    calls += 1;
    const state = statesRef!.ensureActiveRun().state;
    observedCapacity = Number(state.spaces.find((space) => space.id === "pabellonB")?.capacity ?? 0);
    observedConditions = state.commitments.find((commitment) => commitment.id === "c-pabB")?.conditions as unknown[];
    release();
    return JSON.stringify({
      reading: "Hechos de Espacios incorporados",
      planVersion: state.planVersion,
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
  };
  await withServer(async (base, states) => {
    statesRef = states;
    const run = states.ensureActiveRun();
    const body = coordinatorBody(run.id, run.state.planVersion);
    body.actions = body.actions.slice(0, 1);
    const proposalResponse = await post(base, "/workflow/coordinator/proposals", body, TOKEN);
    const proposal = (await proposalResponse.json()) as { planVersion: number; tasks: Array<{ taskId: string }> };
    const result = specialistBody(proposal.tasks[0]!.taskId, run.id, proposal.planVersion);
    result.result.summary = "Pabellón B limitado a 400 plazas y listo a las 13:15";
    result.result.conditions = ["Montaje no termina hasta las 13:15"];
    result.result.data = { spaces: [{ id: "pabellonB", capacity: 400, readyAt: "13:15" }] };
    let response = await post(base, "/workflow/results", result, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    await Promise.race([observed, new Promise((_, reject) => setTimeout(() => reject(new Error("coordinator not called")), 1_000))]);
    assert.equal(calls, 1);
    assert.equal(observedCapacity, 400);
    assert.deepEqual(observedConditions, ["Confirmar reserva", "Montaje no termina hasta las 13:15"]);

    response = await post(base, "/workflow/results", result, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
  }, TOKEN, completeFn);
});

test("an accepted result does not mark the coordinator stable while another cycle is running", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.coordinatorStatus = "replanificando";
    state.coordinatorBusy = { eventId: "next-cycle", text: "incidencia siguiente" };
    states.saveState(run.id, state);
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: {},
      idempotencyKey: "previous-plan-call",
    });
    workflows.recordSpecialistResult(specialistBody(task.id, run.id, run.state.planVersion));
    assert.equal(states.ensureActiveRun().state.coordinatorStatus, "replanificando");
  } finally {
    database.close();
  }
});

test("the HappyRobot door translates a native payload and applies it", async () => {
  await withServer(async (base, states) => {
    const run = states.ensureActiveRun();
    const proposalResponse = await post(
      base,
      "/workflow/coordinator/proposals",
      coordinatorBody(run.id, run.state.planVersion),
      TOKEN,
    );
    const proposal = (await proposalResponse.json()) as {
      planVersion: number;
      tasks: Array<{ actionId: string; taskId: string }>;
    };
    const taskId = proposal.tasks[0]!.taskId;

    // Cuerpo tal como lo manda el workflow: sin runId, sin planVersion y anidado.
    const native = {
      call_id: `call-${taskId}`,
      session_id: "happyrobot-session-real",
      data: {
        outcome: "aceptado con condiciones",
        summary: "Pabellón B disponible a las 13:00 por 1.500 €.",
        conditions: ["Confirmar reserva antes de las 12:45"],
        transcript: [{ role: "assistant", content: "¿Tienen libre el Pabellón B?", at: 4 }],
      },
    };

    let response = await post(base, "/workflow/happyrobot/results", native, TOKEN);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });

    const state = states.getPublicState();
    const agent = (state.agents as Array<Record<string, unknown>>).find((item) => item.id === "espacios");
    assert.equal(agent?.lastResult, "Pabellón B disponible a las 13:00 por 1.500 €.");

    // Reenviar el mismo webhook no lo aplica dos veces.
    response = await post(base, "/workflow/happyrobot/results", native, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: true });

    // Sin token sigue siendo 401, y un cuerpo sin tarea identificable es 400.
    assert.equal((await post(base, "/workflow/happyrobot/results", native)).status, 401);
    assert.equal(
      (await post(base, "/workflow/happyrobot/results", { outcome: "accepted" }, TOKEN)).status,
      400,
    );

    // Un callback que llega tras un reset queda como evidencia, sin tocar la ejecución nueva.
    states.reset();
    response = await post(
      base,
      "/workflow/happyrobot/results",
      { task_id: proposal.tasks[1]!.taskId, session_id: "sesion-tardia", outcome: "accepted", summary: "Tarde" },
      TOKEN,
    );
    assert.deepEqual(await response.json(), { ok: true, applied: false, duplicate: false });
  });
});

test("partial HappyRobot transcripts are authenticated, chronological and idempotent", async () => {
  await withServer(async (base, states, tasks) => {
    const run = states.ensureActiveRun();
    const task = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Pabellón B", counterpart: "Recinto" },
      idempotencyKey: "live-transcript",
    });
    const state = structuredClone(run.state);
    state.calls = [{
      id: `call-${task.id}`,
      agent: "espacios",
      counterpart: "Recinto",
      channel: "llamada",
      startedAt: state.clock.simSeconds,
      endsAfter: 90,
      status: "en_curso",
      simulated: false,
      transcript: [],
    }];
    states.saveState(run.id, state);

    const first = {
      call_id: `call-${task.id}`,
      session_id: "session-live-1",
      transcript: [
        { id: "message-2", role: "user", content: "Sí, lo tenemos libre.", at: 4 },
        { id: "message-1", role: "assistant", content: "¿Está disponible el Pabellón B?", at: 1 },
      ],
    };
    assert.equal((await post(base, "/workflow/happyrobot/transcript", first)).status, 401);
    let response = await post(base, "/workflow/happyrobot/transcript", first, TOKEN);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, duplicate: false, added: 2, total: 2 });

    response = await post(base, "/workflow/happyrobot/transcript", first, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, duplicate: true, added: 0, total: 2 });

    response = await post(base, "/workflow/happyrobot/transcript", {
      ...first,
      transcript: [
        ...first.transcript,
        { id: "message-3", role: "assistant", content: "Perfecto, queda reservado.", at: 7 },
      ],
    }, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, duplicate: false, added: 1, total: 3 });

    const liveCall = (states.getPublicState().calls as Array<Record<string, unknown>>)[0];
    assert.deepEqual(liveCall?.transcript, [
      { who: "agente", text: "¿Está disponible el Pabellón B?", at: 1 },
      { who: "humano", text: "Sí, lo tenemos libre.", at: 4 },
      { who: "agente", text: "Perfecto, queda reservado.", at: 7 },
    ]);

    response = await post(base, "/workflow/happyrobot/results", {
      call_id: `call-${task.id}`,
      session_id: "session-live-1",
      outcome: "accepted",
      summary: "Pabellón B reservado",
      transcript: [
        { role: "assistant", content: "¿Está disponible el Pabellón B?", at: 1 },
        { role: "user", content: "Sí, lo tenemos libre.", at: 4 },
        { role: "assistant", content: "Perfecto, queda reservado.", at: 7 },
      ],
    }, TOKEN);
    assert.equal(response.status, 200);
    const finalCall = (states.getPublicState().calls as Array<Record<string, unknown>>)[0];
    assert.equal(finalCall?.status, "terminada");
    assert(Array.isArray(finalCall?.transcript));
    assert.equal(finalCall.transcript.length, 3);
  });
});
