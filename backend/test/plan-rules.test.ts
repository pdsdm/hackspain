import assert from "node:assert/strict";
import test from "node:test";

import { ContractError } from "../src/contracts/api.js";
import { ControlService } from "../src/domain/control-service.js";
import { PlanService } from "../src/domain/plan-service.js";
import {
  DomainValidationError,
  type GuestAllocation,
  type PlanProposal,
} from "../src/domain/plan-rules.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";

function proposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
  return {
    title: "Autorizar plan Sur",
    summary: "Pabellón B y Lounge para 600 invitados",
    rationale: "Es la opción viable más rápida dentro de Sur",
    cost: 3200,
    conditions: ["Confirmar ambos espacios"],
    approval: {
      kind: "operational", title: "Aceptar apertura escalonada", summary: "150 invitados esperan hasta las 13:15",
      rationale: "Es la opción viable más rápida dentro de Sur", conditions: ["Confirmar ambos espacios"],
      effectApprove: "Aceptar la distribución", effectReject: "Buscar otra distribución",
    },
    allocations: [],
    confirmedNorthGuestIds: [],
    confirmedExternalTransferSeats: 0,
    ...overrides,
  };
}

const allocation = (number: number, spaceId: string): GuestAllocation => ({
  guestId: `guest-${String(number).padStart(3, "0")}`,
  spaceId,
  status: "proposed",
});

test("an operational proposal versions commitments and requests a non-financial decision", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const before = states.ensureActiveRun();
    const next = new PlanService(states).applyProposal(
      proposal({ allocations: [allocation(1, "pabellonB")] }),
    );

    assert.equal(next.planVersion, before.state.planVersion + 1);
    assert(
      next.commitments
        .filter((commitment) => commitment.planVersion < next.planVersion)
        .every((commitment) =>
          commitment.status === "invalidado" || commitment.status === "completado"
        ),
    );
    assert.equal(next.budget.committed, before.state.budget.committed);
    assert.equal(next.decisions.at(-1)?.rationale, "Es la opción viable más rápida dentro de Sur");
    assert.equal(next.waitingForDecision, `decision-plan-${next.planVersion}`);
    assert.equal(
      database.connection.prepare("SELECT COUNT(*) AS count FROM allocations").get()
        ?.count,
      1,
    );
  } finally {
    database.close();
  }
});

test("a proposal rejects duplicate guests and capacity excess", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    states.ensureActiveRun();
    const allocations = Array.from({ length: 451 }, (_, index) =>
      allocation(index + 1, "pabellonB"),
    );
    allocations.push(allocation(1, "loungeSur"));

    assert.throws(
      () => new PlanService(states).applyProposal(proposal({ allocations })),
      (error: unknown) =>
        error instanceof DomainValidationError &&
        error.issues.some((issue) => issue.includes("allocated more than once")) &&
        error.issues.some((issue) => issue.includes("Capacity exceeded")),
    );
  } finally {
    database.close();
  }
});

test("North allocations require individual access and confirmed external transport", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    states.ensureActiveRun();

    assert.throws(
      () =>
        new PlanService(states).applyProposal(
          proposal({
            allocations: [allocation(1, "norteC")],
            confirmedNorthGuestIds: [],
            confirmedExternalTransferSeats: 0,
          }),
        ),
      (error: unknown) =>
        error instanceof DomainValidationError &&
        error.issues.some((issue) => issue.includes("North access")) &&
        error.issues.some((issue) => issue.includes("transfer capacity")),
    );
  } finally {
    database.close();
  }
});

test("a replan marks the previous pending decision as obsolete and keeps one pending", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const service = new PlanService(states);
    service.applyProposal(proposal({ cost: 3200 }));
    const next = service.applyProposal(proposal({ cost: 4100, title: "Plan Sur ampliado" }));

    const pending = next.decisions.filter((decision) => decision.status === "pendiente");
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.cost, 4100);
    assert.equal(next.waitingForDecision, pending[0]?.id);
    assert.equal(next.decisions.find((decision) => decision.cost === 3200)?.status, "rechazada");
    assert(next.events.some((event) => String(event.text).includes("obsoleta")));
  } finally {
    database.close();
  }
});

test("resolving an obsolete decision is refused and does not move authorized budget", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const service = new PlanService(states);
    service.applyProposal(proposal({ cost: 3200 }));
    service.applyProposal(proposal({ cost: 4100 }));
    const control = new ControlService(states);
    const stale = states.ensureActiveRun().state.decisions.find((decision) => decision.cost === 3200);

    assert.throws(
      () => control.applyIntervention({ type: "approve_plan", payload: { decisionId: String(stale?.id) } }),
      (error: unknown) => error instanceof ContractError && error.status === 409,
    );
    assert.equal(states.ensureActiveRun().state.budget.authorized, 1500);
  } finally {
    database.close();
  }
});

test("reject_split twist resolves the decision the plan is waiting for", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const service = new PlanService(states);
    service.applyProposal(proposal({ cost: 3200 }));
    const live = service.applyProposal(proposal({ cost: 4100 }));
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    const stale = state.decisions.find((decision) => decision.cost === 3200);
    if (stale) stale.status = "pendiente";
    states.saveState(run.id, state);

    new ControlService(states).applyTwist("reject_split");

    const after = states.ensureActiveRun().state;
    assert.equal(after.decisions.find((decision) => decision.id === live.waitingForDecision)?.status, "rechazada");
    assert.equal(after.waitingForDecision, null);
  } finally {
    database.close();
  }
});
