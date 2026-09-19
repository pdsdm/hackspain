import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JevHttpError } from "../src/agents/jev.js";
import {
  parseRoutingScores, qualifiesForLounge, routingTextHash, createRoutingEvaluator,
  ROUTING_MODEL, ROUTING_THRESHOLDS, type RoutingEvaluation, type RoutingScores,
} from "../src/agents/jev-routing.js";
import {
  applyPilotInMemory, buildLoungePilot, loungeGuard, pilotFingerprint, readPilotContext, routePilotEvent,
  type PilotContext,
} from "../src/domain/routing-pilot.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";

const ACCEPT: RoutingScores = { choice: "lounge_unavailable", probability: 0.99, confidence: 0.98, assertedNow: 0.99, additionalChange: 0.01 };
const REJECT: RoutingScores = { choice: "other", probability: 0.02, confidence: 0.97, assertedNow: 0.1, additionalChange: 0.01 };
const evaluation = (scores: RoutingScores = ACCEPT): RoutingEvaluation => ({ scores, model: ROUTING_MODEL, inputTokens: 100, outputTokens: 20 });

function harness() {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  states.reset("recovered");
  const read = () => readPilotContext(database);
  return { database, states, tasks: new TaskRepository(database.connection), read };
}

function mutate(context: PilotContext, apply: (state: PilotContext["state"]) => void): PilotContext {
  const next = structuredClone(context);
  apply(next.state);
  return next;
}

test("routing parser requires an exact typed distribution", () => {
  const scores = parseRoutingScores({
    incident: { type: "choice", choice: "lounge_unavailable", confidence: 0.98, probabilities: { lounge_unavailable: 0.99, other: 0.01 } },
    asserted_now: { type: "noul", noul: 0.99 }, additional_change: { type: "noul", noul: 0.01 },
  });
  assert.deepEqual(scores, ACCEPT);
  for (const bad of [
    {},
    { incident: { type: "choice", choice: "lounge_unavailable", confidence: 2, probabilities: { lounge_unavailable: 0.99, other: 0.01 } }, asserted_now: { type: "noul", noul: 0.99 }, additional_change: { type: "noul", noul: 0.01 } },
    { incident: { type: "choice", choice: "lounge_unavailable", confidence: 0.98, probabilities: { lounge_unavailable: 0.7, other: 0.7 } }, asserted_now: { type: "noul", noul: 0.99 }, additional_change: { type: "noul", noul: 0.01 } },
  ]) assert.throws(() => parseRoutingScores(bad));
});

test("routing thresholds are conservative on every semantic axis", () => {
  assert.equal(qualifiesForLounge(ACCEPT), true);
  assert.equal(qualifiesForLounge({ ...ACCEPT, probability: ROUTING_THRESHOLDS.probability - 0.001 }), false);
  assert.equal(qualifiesForLounge({ ...ACCEPT, confidence: ROUTING_THRESHOLDS.confidence - 0.001 }), false);
  assert.equal(qualifiesForLounge({ ...ACCEPT, assertedNow: ROUTING_THRESHOLDS.asserted - 0.001 }), false);
  assert.equal(qualifiesForLounge({ ...ACCEPT, additionalChange: ROUTING_THRESHOLDS.extraChanges + 0.001 }), false);
  assert.equal(qualifiesForLounge(REJECT), false);
});

test("live evaluator sends only reviewed synthetic text and validates the response", async (t) => {
  const text = "El Lounge Sur queda retirado para hoy.";
  const fetchFn = t.mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, ROUTING_MODEL);
    assert.equal(body.state.report, text);
    assert(!JSON.stringify(body.state).includes("phone"));
    return Response.json({ model: ROUTING_MODEL, answers: {
      incident: { type: "choice", choice: "lounge_unavailable", confidence: 0.98, probabilities: { lounge_unavailable: 0.99, other: 0.01 } },
      asserted_now: { type: "noul", noul: 0.99 }, additional_change: { type: "noul", noul: 0.01 },
    }, usage: { input_tokens: 100, output_tokens: 20 } });
  }) as typeof fetch;
  const evaluate = createRoutingEvaluator({ apiKey: "test", model: ROUTING_MODEL, timeoutMs: 1500 }, new Set([routingTextHash(text)]), fetchFn);
  assert.deepEqual(await evaluate(text, new AbortController().signal), evaluation());
  await assert.rejects(evaluate("Otro texto", new AbortController().signal), /routing_text_not_reviewed/);
  assert.throws(() => createRoutingEvaluator({ apiKey: "test", model: "jev-latest", timeoutMs: 1500 }, new Set(), fetchFn), /pinned/);
});

test("the recovered fixture is eligible and yields a validated lounge playbook", () => {
  const h = harness();
  try {
    const context = h.read();
    assert.equal(loungeGuard(context), null);
    const built = buildLoungePilot(context);
    assert(built);
    assert.equal(built.state.spaces.find((space) => space.id === "loungeSur")?.status, "descartado");
    assert.equal(built.output.actions.some((action) => action.id === "a-norte"), true);
    assert.equal(built.output.decision, null);
  } finally { h.database.close(); }
});

for (const [reason, transform] of [
  ["agents_paused", (c: PilotContext) => mutate(c, (s) => { s.agentsPaused = true; })],
  ["operational_decision_pending", (c: PilotContext) => mutate(c, (s) => { s.waitingForDecision = "d"; s.decisions.push({ id: "d", status: "pendiente" }); })],
  ["coordinator_not_stable", (c: PilotContext) => mutate(c, (s) => { s.coordinatorStatus = "replanificando"; })],
  ["tasks_in_flight", (c: PilotContext) => ({ ...structuredClone(c), openTaskIds: ["task"] })],
  ["other_incident", (c: PilotContext) => mutate(c, (s) => { s.twistsApplied = ["shuttle_delay"]; })],
  ["unknown_constraint", (c: PilotContext) => mutate(c, (s) => { s.constraints = [...s.constraints, "No usar Norte"]; })],
  ["south_plan_changed", (c: PilotContext) => mutate(c, (s) => { s.spaces.find((x) => x.id === "pabellonB")!.capacity = 400; })],
  ["north_not_consultable", (c: PilotContext) => mutate(c, (s) => { s.spaces.find((x) => x.id === "norteC")!.status = "cerrado"; })],
  ["south_access_closed", (c: PilotContext) => mutate(c, (s) => { s.spaces.find((x) => x.id === "accesoSur")!.status = "cerrado"; })],
  ["guest_distribution_changed", (c: PilotContext) => mutate(c, (s) => { s.guestGroups[0]!.confirmedCount = 80; })],
  ["agreements_changed", (c: PilotContext) => mutate(c, (s) => { s.commitments.find((x) => x.id === "c-lounge")!.conditions = ["Pendiente"]; })],
  ["other_operational_failure", (c: PilotContext) => mutate(c, (s) => { s.deliveries[0]!.status = "bloqueada"; })],
] as const) {
  test(`guard rejects ${reason} before any semantic call`, async () => {
    const h = harness();
    try {
      let calls = 0;
      const base = transform(h.read());
      assert.equal(loungeGuard(base), reason);
      const decision = await routePilotEvent({ id: reason, kind: "free_text", text: "Lounge perdido" }, () => base, async () => { calls++; return evaluation(); });
      assert.equal(decision.route, "llm"); assert.equal(decision.reason, reason); assert.equal(calls, 0);
    } finally { h.database.close(); }
  });
}

test("structured event bypasses JEV and duplicate is a no-op", async () => {
  const h = harness();
  try {
    let calls = 0;
    const first = await routePilotEvent({ id: "structured", kind: "lounge_unavailable" }, h.read, async () => { calls++; return evaluation(); });
    assert.equal(first.route, "playbook"); assert.equal(first.via, "direct"); assert.equal(calls, 0);
    assert.deepEqual(applyPilotInMemory(h.database, first), { applied: true, reason: "queued_without_dispatch" });
    const second = await routePilotEvent({ id: "duplicate", kind: "lounge_unavailable" }, h.read);
    assert.equal(second.route, "noop"); assert.equal(second.reason, "already_applied");
  } finally { h.database.close(); }
});

test("high-confidence text selects and applies a playbook without dispatching actions", async () => {
  const h = harness();
  try {
    const before = h.read();
    const decision = await routePilotEvent({ id: "free", kind: "free_text", text: "El Lounge Sur queda retirado para hoy" }, h.read, async () => evaluation());
    assert.equal(decision.route, "playbook"); assert.equal(decision.via, "jev");
    assert.deepEqual(applyPilotInMemory(h.database, decision), { applied: true, reason: "queued_without_dispatch" });
    const after = h.read();
    assert.equal(after.state.planVersion, before.state.planVersion + 1);
    assert.equal(after.state.spaces.find((space) => space.id === "loungeSur")?.status, "descartado");
    assert.equal(h.tasks.listOpen(after.runId).some((task) => task.idempotencyKey.startsWith(`replan-${after.state.planVersion}`)), true);
    assert.equal(h.tasks.claimNext()?.status, "dispatching");
    assert.equal((after.state.calls as unknown[]).length, 0);
    const event = h.database.connection.prepare("SELECT mode, kind, payload_json FROM events WHERE id LIKE 'pilot:%'").get() as { mode: string; kind: string; payload_json: string };
    assert.equal(event.mode, "rules"); assert.equal(event.kind, "pilot_playbook"); assert.equal(JSON.parse(event.payload_json).playbook, "lounge-loss-v1");
  } finally { h.database.close(); }
});

test("semantic negatives and provider failures fall back without mutation", async () => {
  for (const [name, evaluator, reason] of [
    ["negative", async () => evaluation(REJECT), "semantic_gate"],
    ["auth", async () => { throw new JevHttpError(401); }, "provider_auth"],
    ["unreviewed", async () => { throw new Error("routing_text_not_reviewed"); }, "privacy_not_reviewed"],
    ["invalid", async () => { throw new Error("bad"); }, "evaluation_failed"],
  ] as const) {
    const h = harness();
    try {
      const before = pilotFingerprint(h.read());
      const decision = await routePilotEvent({ id: name, kind: "free_text", text: "texto" }, h.read, evaluator);
      assert.equal(decision.route, "llm"); assert.equal(decision.reason, reason); assert.equal(pilotFingerprint(h.read()), before);
    } finally { h.database.close(); }
  }
});

test("timeout and concurrent state changes fall back without applying", async () => {
  const h = harness();
  try {
    const timeout = await routePilotEvent({ id: "timeout", kind: "free_text", text: "texto" }, h.read,
      async () => await new Promise<RoutingEvaluation>(() => {}), 5);
    assert.equal(timeout.reason, "timeout");
    let first = true;
    const changed = await routePilotEvent({ id: "race", kind: "free_text", text: "texto" }, () => {
      const value = h.read();
      if (!first) value.state.constraints.push("Cambio concurrente");
      first = false;
      return value;
    }, async () => evaluation());
    assert.equal(changed.route, "llm"); assert.equal(changed.reason, "state_changed");
  } finally { h.database.close(); }
});

test("prepared playbooks are stale-safe and disk databases cannot be mutated by the pilot", async () => {
  const h = harness();
  try {
    const decision = await routePilotEvent({ id: "stale", kind: "lounge_unavailable" }, h.read);
    const run = h.states.ensureActiveRun();
    run.state.constraints.push("Cambio"); h.states.saveState(run.id, run.state);
    assert.deepEqual(applyPilotInMemory(h.database, decision), { applied: false, reason: "state_changed" });
  } finally { h.database.close(); }
  const path = join(mkdtempSync(join(tmpdir(), "routing-pilot-")), "pilot.db");
  const database = openDatabase(path);
  try {
    new StateRepository(database.connection).reset("recovered");
    const decision = await routePilotEvent({ id: "disk", kind: "lounge_unavailable" }, () => readPilotContext(database));
    assert.throws(() => applyPilotInMemory(database, decision), /memory/);
  } finally { database.close(); }
});
