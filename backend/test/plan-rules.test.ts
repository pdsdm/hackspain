import assert from "node:assert/strict";
import test from "node:test";

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

test("a proposal increments planVersion, invalidates old commitments and escalates spend", () => {
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
