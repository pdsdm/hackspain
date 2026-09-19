import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";

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
): Promise<void> {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const server = createApp(database, { workflowToken: workflowToken ?? undefined }).listen(0, "127.0.0.1");
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
      id: "c-pabellon-b-v2",
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
        payload: { candidateIds: ["pabellonB"] },
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

    const state = states.getPublicState();
    assert.equal(state.planVersion, 2);
    assert(state.commitments.some((commitment) => commitment.id === "c-pabellon-b-v2"));
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
    const result = specialistBody(firstTask.taskId, run.id, proposal.planVersion);

    let response = await post(base, "/workflow/results", result, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: true, duplicate: false });
    assert.equal(response.status, 200);
    assert.equal(tasks.claimNext()?.id, secondTask.taskId);

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
    response = await post(base, "/workflow/results", stale, TOKEN);
    assert.deepEqual(await response.json(), { ok: true, applied: false, duplicate: false });
  });
});
