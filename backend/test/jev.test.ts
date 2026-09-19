import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";

import { createJevEvaluator, type JevAcceptanceInput } from "../src/agents/jev.js";
import type { SpecialistResultEnvelope } from "../src/contracts/api.js";
import { loadConfig } from "../src/config.js";
import { decideAcceptance, DEMO_TARGET, verificationSnapshot } from "../src/domain/acceptance-policy.js";
import { parseCrisisState } from "../src/domain/crisis-state.js";
import { verifyCallAcceptance, isDemoTranscript } from "../src/domain/result-verifier.js";
import type { DispatchTask } from "../src/state/task-repository.js";

const SCORES = { acceptsTargetExplicitly: 0.99, answerMatchesTarget: 0.98, hasUnresolvedConditions: 0.03 };

function fixture() {
  const state = parseCrisisState(JSON.parse(readFileSync(new URL("../fixtures/madring/states/proposal.json", import.meta.url), "utf8")));
  state.budget.authorized = 3200;
  state.waitingForDecision = null;
  state.decisions = [];
  state.commitments.find((item) => item.id === "c-pabB")!.conditions = ["Confirmación de reserva"];
  const task: DispatchTask = {
    id: "task-spaces", runId: "run-1", planVersion: 2, area: "espacios", kind: "call",
    payload: {
      objective: "Reservar Pabellón B. Llamar a Ana García en ana@example.test",
      counterpart: "Ana García +34 612 345 678",
      verificationTarget: DEMO_TARGET,
      verificationSnapshot: verificationSnapshot(state),
    },
    idempotencyKey: "call-spaces", status: "dispatched", attempts: 1,
  };
  const envelope: SpecialistResultEnvelope = {
    eventId: "hr-result-1", taskId: task.id, runId: task.runId, planVersion: 2, status: "completed",
    result: {
      outcome: "accepted", summary: "Reservado", conditions: [],
      evidence: {
        sessionId: "happyrobot-session", callId: `call-${task.id}`,
        transcript: [
          { who: "agente", text: "¿Confirma la reserva del Pabellón B para 450 invitados?", at: 3 },
          { who: "humano", text: "Sí, queda reservada.", at: 8 },
        ],
      },
      data: {},
    },
  };
  return { state, task, envelope };
}

function responseBody() {
  return {
    model: "jev-1.13.0",
    answers: {
      accepts_target_explicitly: { type: "noul", noul: 0.99 },
      answer_matches_target: { type: "noul", noul: 0.98 },
      has_unresolved_conditions: { type: "noul", noul: 0.03 },
    },
  };
}

const INPUT: JevAcceptanceInput = {
  objective: "Confirmar reserva", expectedRole: "Responsable de recinto", target: DEMO_TARGET,
  terms: { spaceName: "Pabellón B", capacity: 450, readyAt: null, planCost: 3200 },
  transcript: [{ who: "humano", text: "Sí, confirmo la reserva del Pabellón B.", at: 8 }],
};

test("privacy approvals and effects are opt-in configuration", () => {
  const defaults = loadConfig({});
  assert.equal(defaults.jevEnabled, false);
  assert.equal(defaults.jevApplyConfirmations, false);
  assert.deepEqual(defaults.jevReviewedTranscriptHashes, []);
  const hash = "a".repeat(64);
  assert.deepEqual(loadConfig({ JEV_REVIEWED_TRANSCRIPT_HASHES: `${hash.toUpperCase()}, ${hash}` }).jevReviewedTranscriptHashes, [hash]);
  assert.throws(() => loadConfig({ JEV_REVIEWED_TRANSCRIPT_HASHES: "*" }), /SHA-256/);
});

test("all scores must be finite probabilities and meet the conservative thresholds", () => {
  assert.equal(decideAcceptance({ acceptsTargetExplicitly: 0.95, answerMatchesTarget: 0.95, hasUnresolvedConditions: 0.1 }), "confirm_target");
  for (const [key, badValues] of Object.entries({
    acceptsTargetExplicitly: [0.949, NaN, Infinity, 1.1],
    answerMatchesTarget: [0.949, NaN, Infinity, 1.1],
    hasUnresolvedConditions: [0.101, NaN, -1, Infinity],
  })) {
    for (const value of badValues) assert.equal(decideAcceptance({ ...SCORES, [key]: value }), "keep_conditional");
  }
});

test("JEV uses one bounded request and includes speaker, terms and conservative instructions", async () => {
  let body: Record<string, unknown> | undefined;
  let calls = 0;
  const evaluator = createJevEvaluator({ apiKey: "test-key", model: "jev-1.13.0", timeoutMs: 1500 }, async (_url, init) => {
    calls += 1;
    assert(init?.signal);
    body = JSON.parse(String(init.body));
    return Response.json(responseBody());
  });
  assert.deepEqual(await evaluator(INPUT), SCORES);
  assert.equal(calls, 1);
  assert.equal(body?.model, "jev-1.13.0");
  assert.deepEqual(body?.state, INPUT);
  assert.match(JSON.stringify(body), /retractación/);
  assert.match(JSON.stringify(body), /humano/);
});

test("questions refer to supplied terms instead of copying benchmark values", async () => {
  let questions = "";
  const input = { ...INPUT, terms: { ...INPUT.terms, capacity: 375, planCost: 2750, readyAt: 47100 } };
  const evaluator = createJevEvaluator({ apiKey: "test-key", model: "jev-1.13.0", timeoutMs: 1500 }, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.state.terms, input.terms);
    questions = JSON.stringify(body.questions);
    return Response.json(responseBody());
  });
  await evaluator(input);
  assert(!/450|3200|Pabellón B/.test(questions));
  for (const field of ["spaceName", "capacity", "readyAt", "planCost"]) assert(questions.includes(field));
});

test("a locally reviewed full transcript can be evaluated without changing its wording", async () => {
  const { task, envelope, state } = fixture();
  const transcript = [
    { who: "agente" as const, text: "¿Dejamos formalizada la reserva en los términos que acabamos de repasar?", at: 1 },
    { who: "humano" as const, text: "Adelante, podéis darla por cerrada. No queda ningún trámite pendiente.", at: 2 },
  ];
  envelope.result.evidence.transcript = transcript;
  const hash = createHash("sha256").update(JSON.stringify(transcript.map(({ who, text }) => ({ who, text })))).digest("hex");
  let calls = 0;
  const result = await verifyCallAcceptance(task, envelope, async (input) => {
    calls += 1;
    assert.deepEqual(input.transcript, transcript);
    return SCORES;
  }, state, false, [hash]);
  assert.equal(calls, 1);
  assert.equal(result.reason, "solo_evaluacion");
  assert.equal(result.decision, "keep_conditional");
});

test("callback-supplied privacy approval is not trusted", async () => {
  const { task, envelope, state } = fixture();
  envelope.result.evidence.transcript = [{ who: "humano", text: "Soy Ana García, confirmo.", at: 1 }];
  envelope.result.data.privacyReviewed = true;
  let calls = 0;
  await verifyCallAcceptance(task, envelope, async () => { calls += 1; return SCORES; }, state, true);
  assert.equal(calls, 0);
});

test("a changed negation or speaker invalidates the local privacy review", async () => {
  const { task, envelope, state } = fixture();
  const text = "Adelante, podéis formalizar la reserva.";
  const hash = createHash("sha256").update(JSON.stringify([{ who: "humano", text }])).digest("hex");
  for (const transcript of [
    [{ who: "humano" as const, text: `No. ${text}`, at: 1 }],
    [{ who: "agente" as const, text, at: 1 }, { who: "humano" as const, text: "Sí.", at: 2 }],
  ]) {
    envelope.result.evidence.transcript = transcript;
    let calls = 0;
    const result = await verifyCallAcceptance(task, envelope, async () => { calls += 1; return SCORES; }, state, true, [hash]);
    assert.equal(calls, 0);
    assert.equal(result.reason, "privacidad_revision_necesaria");
  }
});

test("verifier sends no free-form objective, identity, session or full state", async () => {
  const { task, envelope, state } = fixture();
  const result = await verifyCallAcceptance(task, envelope, async (input) => {
    const encoded = JSON.stringify(input);
    for (const forbidden of ["Ana", "García", "example.test", "612", "session", "guestGroups", "budget", "run-1"]) {
      assert(!encoded.includes(forbidden), forbidden);
    }
    assert.equal(input.terms.spaceName, "Pabellón B");
    assert.equal(input.transcript[1]?.who, "humano");
    return SCORES;
  }, state, true);
  assert.equal(result.decision, "confirm_target");
});

for (const text of ["Soy Ana García", "Correo ana@example.test", "Teléfono +34 612 345 678", "DNI 12345678Z", "Invitado con diabetes", "Vivo en Calle Mayor 17", "Mi número es 450 12 50 1500"]) {
  test(`privacy filter withholds unreviewed text: ${text}`, async () => {
    const { task, envelope, state } = fixture();
    envelope.result.evidence.transcript!.push({ who: "humano", text, at: 10 });
    let calls = 0;
    const result = await verifyCallAcceptance(task, envelope, async () => { calls += 1; return SCORES; }, state, true);
    assert.equal(calls, 0);
    assert.equal(result.reason, "privacidad_revision_necesaria");
  });
}

for (const reason of ["no_target", "north", "other_commitment", "no_transcript", "only_agent", "wrong_call", "conditional", "failed", "pending", "disabled"] as const) {
  test(`ineligible callback never evaluates: ${reason}`, async () => {
    const { task, envelope, state } = fixture();
    if (reason === "no_target") task.payload = {};
    if (reason === "north") task.payload = { verificationTarget: { ...DEMO_TARGET, resourceId: "norteC" } };
    if (reason === "other_commitment") task.payload = { verificationTarget: { ...DEMO_TARGET, commitmentId: "c-norte" } };
    if (reason === "no_transcript") envelope.result.evidence.transcript = [];
    if (reason === "only_agent") envelope.result.evidence.transcript = [{ who: "agente", text: "Sí, confirmado.", at: 1 }];
    if (reason === "wrong_call") envelope.result.evidence.callId = "other-call";
    if (reason === "conditional") envelope.result.conditions = ["Montaje pendiente"];
    if (reason === "failed") envelope.status = "failed";
    if (reason === "pending") task.status = "pending";
    let calls = 0;
    const result = await verifyCallAcceptance(task, envelope, reason === "disabled" ? undefined : async () => { calls += 1; return SCORES; }, state, true);
    assert.equal(calls, 0);
    assert.equal(result.decision, "keep_conditional");
  });
}

for (const status of [401, 422, 429, 529]) {
  test(`HTTP ${status} is conservative without retry`, async () => {
    const { task, envelope, state } = fixture();
    let calls = 0;
    const evaluator = createJevEvaluator({ apiKey: "test-key", model: "jev-1.13.0", timeoutMs: 1500 }, async () => {
      calls += 1;
      return new Response("error with private data", { status });
    });
    const result = await verifyCallAcceptance(task, envelope, evaluator, state, true);
    assert.equal(result.reason, "verificacion_no_disponible");
    assert.equal(calls, 1);
  });
}

for (const body of ["not json", "null", "{}", '{"answers":[]}', JSON.stringify({ answers: { accepts_target_explicitly: { noul: 2 } } })]) {
  test(`invalid JEV response is conservative: ${body}`, async () => {
    const { task, envelope, state } = fixture();
    const evaluator = createJevEvaluator({ apiKey: "test-key", model: "jev-1.13.0", timeoutMs: 1500 }, async () => new Response(body));
    const result = await verifyCallAcceptance(task, envelope, evaluator, state, true);
    assert.equal(result.reason, "verificacion_no_disponible");
  });
}

test("even a stuck injected evaluator falls back within the callback deadline", async () => {
  const { task, envelope, state } = fixture();
  const start = performance.now();
  const result = await verifyCallAcceptance(task, envelope, () => new Promise(() => {}), state, true);
  assert.equal(result.reason, "verificacion_no_disponible");
  assert(performance.now() - start < 2200);
});

test("privacy vocabulary preserves Spanish negation, conditions and retraction", () => {
  for (const text of ["Sí, pero falta el permiso.", "No confirmo la reserva.", "Retiro la confirmación.", "El Norte C, no el Pabellón B.", "No sé, la transcripción no es clara."]) {
    assert(isDemoTranscript(text), text);
  }
});
