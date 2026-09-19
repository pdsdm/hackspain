import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentTotals,
  incidentCount,
  literalToken,
  stateFingerprint,
  type CoordinatorReport,
  type PublicState,
} from "../../scripts/e2e-demo-real.mts";

function report(assignments: Array<Record<string, unknown>>): CoordinatorReport {
  return {
    provider: "happyrobot",
    model: "gpt-5.6-luna-low",
    correlationId: "corr",
    happyrobotRunId: "00000000-0000-0000-0000-000000000001",
    runId: "run",
    planVersion: 2,
    status: "accepted",
    applied: true,
    latencyMs: 1,
    consults: 0,
    submissions: 1,
    validationErrors: [],
    output: { assignments },
  };
}

function state(): PublicState {
  return {
    planVersion: 2,
    coordinatorStatus: "atascado",
    resolved: false,
    spaces: [{ id: "pabellonB", status: "pendiente" }, { id: "loungeSur", status: "pendiente" }],
    deliveries: [{ id: "CAT-01", status: "bloqueada", dockId: "muelleSur" }],
    calls: [],
    agents: [],
    shuttles: [],
    guestGroups: [],
    commitments: [{ id: "c-pabB", status: "en_consulta", planVersion: 2 }],
    events: [{ provenance: { eventId: "event-1" } }],
  };
}

test("extracts only a literal workflow token", () => {
  assert.equal(literalToken([{ type: "paragraph", children: [{ text: " legacy-token " }] }]), "legacy-token");
  assert.equal(literalToken([{ type: "paragraph", children: [{ type: "variable", variable_id: "TOKEN" }] }]), undefined);
});

test("requires the frozen 450 plus 150 assignment split", () => {
  assert.deepEqual(assignmentTotals(report([
    { groupId: "g-1", spaceId: "pabellonB", count: 450 },
    { groupId: "g-2", spaceId: "loungeSur", count: 150 },
  ])), { total: 600, pabellonB: 450, loungeSur: 150, other: 0 });
  assert.deepEqual(assignmentTotals(report([{ groupId: "g-1", spaceId: "norteC", count: 600 }])), {
    total: 600,
    pabellonB: 0,
    loungeSur: 0,
    other: 600,
  });
});

test("fingerprint ignores clock progress but catches operational mutation", () => {
  const first = state();
  const second = structuredClone(first);
  first.clock = { simSeconds: 43200 };
  second.clock = { simSeconds: 43300 };
  const actions = { tasks: [] };
  const currentReport = report([]);
  assert.equal(stateFingerprint(first, actions, currentReport), stateFingerprint(second, actions, currentReport));
  second.planVersion += 1;
  assert.notEqual(stateFingerprint(first, actions, currentReport), stateFingerprint(second, actions, currentReport));
  assert.equal(incidentCount(first, "event-1"), 1);
  assert.equal(incidentCount(first, "missing"), 0);
});
