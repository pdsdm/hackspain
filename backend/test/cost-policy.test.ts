import assert from "node:assert/strict";
import test from "node:test";

import { crisisInput } from "../src/agents/coordinator/scenario.js";
import { validateOutput } from "../src/agents/coordinator/validate.js";
import { parseIntervention, parseTwist } from "../src/contracts/api.js";
import { applyPlanProposal } from "../src/domain/plan-rules.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { ControlService } from "../src/domain/control-service.js";
import { PlanService } from "../src/domain/plan-service.js";
import { scheduleSimResult } from "../src/actions/adapters/sim.js";
import { buildUserPrompt } from "../src/agents/coordinator/prompt.js";
import { createApp } from "../src/app.js";

const proposal = (cost: number | null) => ({
  title: "Recuperar el servicio", summary: "Consultar alternativas en Sur", rationale: "Reducir el retraso",
  cost, conditions: [], allocations: [], confirmedNorthGuestIds: [], confirmedExternalTransferSeats: 0,
});
const decision = {
  title: "Aceptar apertura escalonada", summary: "150 personas esperan hasta las 13:15", cost: 0,
  conditions: ["Espera accesible"], effectApprove: "Continuar las consultas", effectReject: "Buscar otra distribución",
  rationale: "Mantener a todos en Sur",
};
const output = () => ({
  reading: "Consultar espacios", planVersion: 2, coordinatorStatus: "replanificando", estimatedCost: 6000,
  actions: [], commitments: [], assignments: [], decision: null, unverified: [],
});

for (const cost of [3200, 6000, 1000000, null]) {
  test(`a plan costing ${cost} never needs financial approval or commits money`, () => {
    const database = openDatabase(":memory:");
    try {
      const state = new StateRepository(database.connection).ensureActiveRun().state;
      state.budget.committed = 4900;
      const next = applyPlanProposal(state, new Set(), proposal(cost));
      assert.equal(next.budget.forecast, cost);
      assert.equal(next.budget.committed, 4900);
      assert.equal(next.waitingForDecision, null);
      assert.equal(next.decisions.filter((item) => item.status === "pendiente").length, 0);
      assert.notEqual(next.coordinatorStatus, "esperando_decision");
    } finally { database.close(); }
  });
}

for (const cost of [-1, NaN, Infinity]) {
  test(`invalid cost ${cost} is still rejected`, () => {
    const database = openDatabase(":memory:");
    try {
      const state = new StateRepository(database.connection).ensureActiveRun().state;
      assert.throws(() => applyPlanProposal(state, new Set(), proposal(cost)), /Invalid proposal cost/);
      assert.equal(validateOutput({ ...output(), estimatedCost: cost }, crisisInput()).output, null);
    } finally { database.close(); }
  });
}

test("the coordinator accepts a costly plan without an economic decision", () => {
  const input = crisisInput();
  input.budget.forecast = 6000;
  const parsed = validateOutput(output(), input);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.output?.estimatedCost, 6000);
  assert.equal(parsed.output?.decision, null);
});

test("legacy economic decisions become estimates, not fabricated human approvals", () => {
  const parsed = validateOutput({ ...output(), estimatedCost: undefined, coordinatorStatus: "esperando_decision", decision: { ...decision, cost: 3200 } }, crisisInput());
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.output?.estimatedCost, 3200);
  assert.equal(parsed.output?.decision, null);
  assert.equal(parsed.output?.coordinatorStatus, "replanificando");
});

test("operational decisions remain possible even at zero cost", () => {
  const parsed = validateOutput({ ...output(), coordinatorStatus: "esperando_decision", decision: { ...decision, kind: "operational" } }, crisisInput());
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.output?.decision?.kind, "operational");
});

test("split rejection no longer needs a spending decision and economic controls are retired", () => {
  assert.deepEqual(parseIntervention({ type: "reject_split" }), { type: "reject_split" });
  for (const type of ["approve_spend", "reject_spend"]) {
    assert.throws(() => parseIntervention({ type, payload: { decisionId: "old" } }), /Economic approvals are disabled/);
  }
  assert.throws(() => parseTwist({ twist: "reject_spend" }), /Unknown twist/);
});

test("a cost-only update is persisted without a new plan or approval", async () => {
  const database = openDatabase(":memory:");
  try {
    const app = createApp(database, { workflowToken: undefined, completeFn: async () => JSON.stringify(output()) });
    const before = app.locals.stateRepository.ensureActiveRun().state.planVersion;
    await app.locals.engine.handle({ source: "chat", kind: "free_text", text: "Previsión actualizada: 6000 euros" });
    const state = app.locals.stateRepository.getPublicState();
    assert.equal(state.budget.forecast, 6000);
    assert.equal(state.budget.committed, 0);
    assert.equal(state.planVersion, before);
    assert.equal(state.waitingForDecision, null);
  } finally { database.close(); }
});

test("the prompt reports costs without exposing legacy spending limits", () => {
  const input = crisisInput();
  input.budget.forecast = null;
  const prompt = buildUserPrompt(input);
  assert.match(prompt, /sin estimar/);
  assert.doesNotMatch(prompt, /contingencia \d|autorizado \d|límite autónomo/);
});

for (const type of ["approve_plan", "reject_plan"] as const) {
  test(`${type} preserves money and does not fabricate a resource confirmation`, () => {
    const database = openDatabase(":memory:");
    try {
      const states = new StateRepository(database.connection);
      const tasks = new TaskRepository(database.connection);
      const next = new PlanService(states).applyProposal({ ...proposal(6000), approval: { ...decision, kind: "operational" } });
      const run = states.ensureActiveRun();
      const before = structuredClone(run.state.budget);
      const task = tasks.enqueue({ runId: run.id, planVersion: next.planVersion, area: "espacios", kind: "call", payload: {}, idempotencyKey: type });
      new ControlService(states).applyIntervention({ type, payload: { decisionId: String(next.waitingForDecision) } });
      const after = states.getPublicState();
      assert.deepEqual(after.budget, before);
      assert.deepEqual(after.spaces, next.spaces);
      assert.equal(after.waitingForDecision, null);
      assert.equal(tasks.claimNext()?.id, type === "approve_plan" ? task.id : undefined);
      assert.throws(() => new ControlService(states).applyIntervention({ type, payload: { decisionId: String(next.waitingForDecision) } }));
    } finally { database.close(); }
  });
}

for (const variant of ["accepted", "conditional", "rejected", "missing_evidence", "wrong_call", "stale", "undispatched", "unknown_cost"]) {
  test(`cost accounting handles ${variant} without duplicate or invented charges`, () => {
    const database = openDatabase(":memory:");
    try {
      const states = new StateRepository(database.connection);
      const tasks = new TaskRepository(database.connection);
      const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
      const run = states.ensureActiveRun();
      const task = tasks.enqueue({ runId: run.id, planVersion: run.state.planVersion, area: "espacios", kind: "call", payload: {}, idempotencyKey: variant });
      if (variant !== "undispatched") {
        tasks.claimNext();
        tasks.markDispatchOutcome(task.id, "dispatched");
      }
      const envelope = scheduleSimResult({
        task, runId: run.id, planVersion: task.planVersion, callId: `call-${task.id}`, eventId: variant,
        reply: { outcome: "accepted", summary: "Reserva acordada", conditions: [], committedCost: 6000,
          transcript: [{ who: "humano", text: "Confirmo la reserva por 6000 euros", at: 10 }] },
      });
      if (variant === "conditional") envelope.result.conditions = ["Acceso pendiente"];
      if (variant === "rejected") envelope.result.outcome = "rejected";
      if (variant === "missing_evidence") envelope.result.evidence.transcript = [];
      if (variant === "wrong_call") envelope.result.evidence.callId = "another-call";
      if (variant === "unknown_cost") delete envelope.result.data.committedCost;
      if (variant === "stale") states.reset();
      workflows.recordSpecialistResult(envelope);
      assert.equal(states.getPublicState().budget.committed, variant === "accepted" ? 6000 : 0);
      workflows.recordSpecialistResult(envelope);
      workflows.recordSpecialistResult({ ...envelope, eventId: `${variant}-again` });
      assert.equal(states.getPublicState().budget.committed, variant === "accepted" ? 6000 : 0);
    } finally { database.close(); }
  });
}
