import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "../../frontend/src/domain/initialState.ts";
import { createFixtureState } from "../../frontend/src/domain/fixtures.ts";
import { reducer } from "../../frontend/src/domain/reducer.ts";
import { applyIntervention, TWISTS } from "../../frontend/src/domain/twists.ts";
import { fmtEur } from "../../frontend/src/domain/time.ts";
import { compareStates } from "../../frontend/src/domain/changes.ts";

test("the local demo progresses without financial decisions", () => {
  let state = createInitialState();
  state.clock.paused = false;
  state.clock.speed = 1;
  state.budget.authorized = 0;
  state.budget.contingency = 0;
  for (let index = 0; index < 35; index += 1) state = reducer(state, { type: "TICK", deltaSeconds: 20 });
  assert.equal(state.waitingForDecision, null);
  assert.equal(state.decisions.length, 0);
  assert.equal(state.budget.forecast, 3200);
  assert.equal(state.budget.committed, 3200);
  assert.equal(state.budget.authorized, 0);
  assert.equal(state.budget.contingency, 0);
});

test("split rejection works without a pending approval and is idempotent", () => {
  const state = createInitialState();
  applyIntervention(state, "reject_split");
  assert.equal(state.scriptId, "norte");
  assert(state.twistsApplied.includes("reject_split"));
  const version = state.planVersion;
  applyIntervention(state, "reject_split");
  assert.equal(state.planVersion, version);
  assert(!TWISTS.some((twist) => String(twist.id) === "reject_spend"));
});

test("accepting or rejecting an operational fixture never changes money", () => {
  for (const type of ["approve_plan", "reject_plan"]) {
    const state = createFixtureState("proposal");
    const budget = structuredClone(state.budget);
    const spaces = structuredClone(state.spaces);
    applyIntervention(state, type);
    assert.equal(state.waitingForDecision, null);
    assert.deepEqual(state.budget, budget);
    assert.deepEqual(state.spaces, spaces);
  }
});

test("unknown cost is not formatted as zero and legacy limits do not appear as changes", () => {
  assert.equal(fmtEur(null), "Sin estimar");
  const before = createInitialState();
  const after = structuredClone(before);
  after.budget.authorized = 100000;
  after.budget.contingency = 200000;
  assert(!compareStates(before, after).some((change) => change.id === "budget"));
  after.budget.forecast = 6000;
  const cost = compareStates(before, after).find((change) => change.id === "budget");
  assert.equal(cost?.title, "Coste de recuperación");
  assert.doesNotMatch(cost?.after ?? "", /autorizado|límite|fondo/);
});
