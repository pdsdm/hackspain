import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { JevEvaluateFn } from "../src/agents/jev.js";
import type { SpecialistResultEnvelope } from "../src/contracts/api.js";
import type { CrisisStateDocument } from "../src/domain/crisis-state.js";
import { verificationSnapshot } from "../src/domain/acceptance-policy.js";
import { transcriptPrivacyHash } from "../src/domain/result-verifier.js";
import { openDatabase } from "../src/state/database.js";
import type { StateRepository } from "../src/state/state-repository.js";
import type { TaskRepository } from "../src/state/task-repository.js";

const TOKEN = "test-workflow-token";
const SCORES = { acceptsTargetExplicitly: 0.99, answerMatchesTarget: 0.98, hasUnresolvedConditions: 0.03 };

type Harness = Awaited<ReturnType<typeof setup>>;

function verificationEvent(h: Harness): string {
  const events = h.states.getPublicState().events as Array<{ text: string }>;
  return events.findLast((event) => event.text.startsWith("JEV"))?.text ?? "";
}

async function setup(options: {
  env?: NodeJS.ProcessEnv;
  prepare?: (state: CrisisStateDocument) => void;
  evaluate?: JevEvaluateFn;
} = {}) {
  const database = openDatabase(":memory:");
  let evaluations = 0;
  let events = 0;
  const app = createApp(database, {
    workflowToken: TOKEN,
    config: loadConfig({ INITIAL_FIXTURE: "proposal", JEV_ENABLED: "true", JEV_APPLY_CONFIRMATIONS: "true", ...options.env }),
    jevEvaluateFn: async (input) => {
      evaluations += 1;
      return options.evaluate ? options.evaluate(input) : SCORES;
    },
  });
  app.locals.engine.handle = async () => { events += 1; };
  const states = app.locals.stateRepository as StateRepository;
  const tasks = app.locals.taskRepository as TaskRepository;
  const run = states.ensureActiveRun();
  run.state.budget.authorized = 3200;
  run.state.waitingForDecision = null;
  run.state.decisions = [];
  run.state.commitments.find((item) => item.id === "c-pabB")!.conditions = ["Confirmación de reserva"];
  options.prepare?.(run.state);
  states.saveState(run.id, run.state);
  const task = tasks.enqueue({
    runId: run.id,
    planVersion: run.state.planVersion,
    area: "espacios",
    kind: "call",
    payload: {
      objective: "Reservar Pabellón B para 450 invitados",
      counterpart: "Responsable de recinto",
      verificationTarget: { commitmentId: "c-pabB", resourceType: "space", resourceId: "pabellonB" },
      verificationSnapshot: verificationSnapshot(run.state),
    },
    idempotencyKey: "verify-pabellon-b",
  });
  assert.equal(tasks.claimNext()?.id, task.id);
  const envelope: SpecialistResultEnvelope = {
    eventId: "hr-result-verified",
    taskId: task.id,
    runId: run.id,
    planVersion: run.state.planVersion,
    status: "completed",
    result: {
      outcome: "accepted",
      summary: "Pabellón B reservado sin condiciones.",
      conditions: [],
      evidence: {
        sessionId: "happyrobot-session-real",
        callId: `call-${task.id}`,
        transcript: [
          { who: "agente", text: "¿Confirma la reserva del Pabellón B para 450 invitados?", at: 4 },
          { who: "humano", text: "Sí, queda reservado el Pabellón B para 450 invitados sin condiciones.", at: 10 },
        ],
      },
      data: {},
    },
  };
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    states, tasks, task, envelope, database,
    evaluations: () => evaluations,
    events: () => events,
    post: async (body = envelope) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/workflow/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
      return await response.json() as { ok: boolean; applied: boolean; duplicate: boolean };
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      database.close();
    },
  };
}

function commitment(h: Harness) {
  return h.states.ensureActiveRun().state.commitments.find((item) => item.id === "c-pabB")!;
}

test("verified acceptance confirms only the bound space and never guest coverage or spend", async () => {
  const h = await setup();
  try {
    const before = h.states.getPublicState();
    await h.post();
    const state = h.states.getPublicState();
    assert.equal(commitment(h).status, "confirmado");
    assert.equal(state.spaces.find((item) => item.id === "pabellonB")?.status, "confirmado");
    assert.deepEqual(state.guestGroups, before.guestGroups);
    assert.deepEqual(state.budget, before.budget);
    assert.equal(h.events(), 1);
  } finally { await h.close(); }
});

for (const [name, prepare] of Object.entries<Record<string, (state: CrisisStateDocument) => void>[string]>({
  budget: (state) => { state.budget.authorized = 1500; },
  decision: (state) => { state.waitingForDecision = "pending-approval"; },
  conditions: (state) => { state.commitments.find((item) => item.id === "c-pabB")!.conditions = ["Montaje pendiente"]; },
})) {
  test(`acceptance cannot bypass pending ${name}`, async () => {
    const h = await setup({ prepare });
    try {
      const before = commitment(h).conditions;
      await h.post();
      assert.equal(commitment(h).status, "aceptado_condiciones");
      assert.deepEqual(commitment(h).conditions, before);
    } finally { await h.close(); }
  });
}

test("invalidated commitments are never resurrected", async () => {
  const h = await setup({ prepare: (state) => { state.commitments.find((item) => item.id === "c-pabB")!.status = "invalidado"; } });
  try {
    await h.post();
    assert.equal(commitment(h).status, "invalidado");
  } finally { await h.close(); }
});

test("shadow evaluation is the default even when JEV is enabled", async () => {
  const h = await setup({ env: { JEV_APPLY_CONFIRMATIONS: "" } });
  try {
    await h.post();
    assert.equal(h.evaluations(), 1);
    assert.equal(commitment(h).status, "aceptado_condiciones");
  } finally { await h.close(); }
});

test("HTTP callbacks honor only server-configured transcript reviews and remain in shadow mode", async () => {
  const transcript = [
    { who: "agente" as const, text: "¿Podemos formalizar lo que acabamos de repasar?", at: 1 },
    { who: "humano" as const, text: "Adelante, podéis darlo por cerrado sin trámites pendientes.", at: 2 },
  ];
  const h = await setup({ env: { JEV_APPLY_CONFIRMATIONS: "", JEV_REVIEWED_TRANSCRIPT_HASHES: transcriptPrivacyHash(transcript) } });
  try {
    h.envelope.result.evidence.transcript = transcript;
    await h.post();
    assert.equal(h.evaluations(), 1);
    assert.equal(commitment(h).status, "aceptado_condiciones");
    assert(verificationEvent(h).includes("solo evaluacion"));
  } finally { await h.close(); }
});

test("a disabled verifier leaves no JEV event or confirmation", async () => {
  const h = await setup({ env: { JEV_ENABLED: "false" } });
  try {
    await h.post();
    assert.equal(h.evaluations(), 0);
    assert.equal(commitment(h).status, "aceptado_condiciones");
    assert.equal(verificationEvent(h), "");
  } finally { await h.close(); }
});

for (const [name, evaluate, reason] of [
  ["unavailable", async () => { throw new Error("private provider error must not be displayed"); }, "verificacion no disponible"],
  ["insufficient", async () => ({ ...SCORES, hasUnresolvedConditions: 0.9 }), "evidencia insuficiente"],
] as const) {
  test(`callback returns 200 and explains ${name} verification`, async () => {
    const h = await setup({ evaluate });
    try {
      await h.post();
      assert.equal(commitment(h).status, "aceptado_condiciones");
      assert(verificationEvent(h).includes(reason));
      assert(!verificationEvent(h).includes("private"));
    } finally { await h.close(); }
  });
}

test("concurrent duplicate callbacks apply and notify only once", async () => {
  const h = await setup();
  try {
    const results = await Promise.all([h.post(), h.post(), h.post({ ...h.envelope, eventId: "another-result-id" })]);
    assert.equal(results.filter((result) => result.applied && !result.duplicate).length, 1);
    assert.equal(h.events(), 1);
    assert.equal(commitment(h).status, "confirmado");
  } finally { await h.close(); }
});

test("duplicate results do not evaluate or trigger the coordinator again", async () => {
  const h = await setup();
  try {
    await h.post();
    assert.deepEqual(await h.post(), { ok: true, applied: true, duplicate: true });
    assert.equal(h.evaluations(), 1);
    assert.equal(h.events(), 1);
    await h.post({ ...h.envelope, eventId: "retry-with-new-id" });
    assert.equal(h.events(), 1);
    assert.equal(h.evaluations(), 1);
  } finally { await h.close(); }
});

for (const change of ["reset", "plan", "invalidate", "cancel", "capacity", "budget", "conditions", "access", "dependencies"] as const) {
  test(`revalidates ${change} after awaiting JEV`, async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const h = await setup({ evaluate: async () => { entered(); await resume; return SCORES; } });
    try {
      const pending = h.post();
      await started;
      const run = h.states.ensureActiveRun();
      if (change === "reset") h.states.reset();
      else if (change === "cancel") h.tasks.cancel(h.task.id, "Cancelled while evaluating");
      else {
        if (change === "plan") run.state.planVersion += 1;
        if (change === "invalidate") run.state.commitments.find((item) => item.id === "c-pabB")!.status = "invalidado";
        if (change === "capacity") run.state.spaces.find((item) => item.id === "pabellonB")!.capacity = 400;
        if (change === "budget") run.state.budget.authorized = 1500;
        if (change === "conditions") run.state.commitments.find((item) => item.id === "c-pabB")!.conditions = ["Montaje pendiente"];
        if (change === "access") run.state.spaces.find((item) => item.id === "accesoSur")!.status = "cerrado";
        if (change === "dependencies") h.database.connection.prepare("UPDATE dispatch_tasks SET payload_json = json_set(payload_json, '$.dependsOnKeys', json(?)) WHERE id = ?").run('["missing-dependency"]', h.task.id);
        h.states.saveState(run.id, run.state);
      }
      release();
      const result = await pending;
      assert.notEqual(commitment(h).status, "confirmado");
      if (change === "invalidate") assert.equal(commitment(h).status, "invalidado");
      if (["reset", "plan", "cancel"].includes(change)) {
        assert.equal(result.applied, false);
        assert.equal(h.events(), 0);
      }
    } finally { release(); await h.close(); }
  });
}
