import { randomUUID } from "node:crypto";

import type { CrisisStateDocument } from "./crisis-state.js";

export interface GuestAllocation {
  guestId: string;
  spaceId: string;
  status: "proposed" | "confirmed";
}

export interface OperationalApproval {
  kind: "operational";
  title: string;
  summary: string;
  rationale: string;
  conditions: string[];
  effectApprove: string;
  effectReject: string;
}

export interface PlanProposal {
  title: string;
  summary: string;
  rationale: string;
  cost: number | null;
  approval?: OperationalApproval;
  conditions: string[];
  allocations: GuestAllocation[];
  confirmedNorthGuestIds: string[];
  confirmedExternalTransferSeats: number;
}

export class DomainValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "DomainValidationError";
  }
}

function validateAllocations(
  state: CrisisStateDocument,
  knownGuestIds: ReadonlySet<string>,
  proposal: PlanProposal,
): void {
  const issues: string[] = [];
  const assignedGuests = new Set<string>();
  const northAccess = new Set(proposal.confirmedNorthGuestIds);
  const occupancy = new Map<string, number>();
  const spaces = new Map(state.spaces.map((space) => [space.id, space]));
  let northGuests = 0;

  for (const allocation of proposal.allocations) {
    if (!knownGuestIds.has(allocation.guestId)) {
      issues.push(`Unknown guest: ${allocation.guestId}`);
    }
    if (assignedGuests.has(allocation.guestId)) {
      issues.push(`Guest allocated more than once: ${allocation.guestId}`);
    }
    assignedGuests.add(allocation.guestId);

    const space = spaces.get(allocation.spaceId);
    if (!space) {
      issues.push(`Unknown space: ${allocation.spaceId}`);
      continue;
    }

    occupancy.set(space.id, (occupancy.get(space.id) ?? 0) + 1);
    if (space.zone === "norte") {
      northGuests += 1;
      if (!northAccess.has(allocation.guestId)) {
        issues.push(`North access not confirmed for guest: ${allocation.guestId}`);
      }
    }
  }

  for (const [spaceId, guests] of occupancy) {
    const capacity = spaces.get(spaceId)?.capacity;
    if (capacity === undefined || guests > capacity) {
      issues.push(`Capacity exceeded for ${spaceId}: ${guests}/${capacity ?? 0}`);
    }
  }

  if (northGuests > proposal.confirmedExternalTransferSeats) {
    issues.push(
      `External transfer capacity insufficient: ${proposal.confirmedExternalTransferSeats}/${northGuests}`,
    );
  }

  if (proposal.cost !== null && (!Number.isFinite(proposal.cost) || proposal.cost < 0)) {
    issues.push(`Invalid proposal cost: ${proposal.cost}`);
  }

  if (issues.length > 0) {
    throw new DomainValidationError(issues);
  }
}

export function applyPlanProposal(
  current: CrisisStateDocument,
  knownGuestIds: ReadonlySet<string>,
  proposal: PlanProposal,
): CrisisStateDocument {
  validateAllocations(current, knownGuestIds, proposal);

  const state = structuredClone(current);
  state.planVersion += 1;
  state.budget.forecast = proposal.cost;

  for (const commitment of state.commitments) {
    if (
      commitment.planVersion < state.planVersion &&
      commitment.status !== "invalidado" &&
      commitment.status !== "completado"
    ) {
      commitment.status = "invalidado";
      commitment.updatedAt = state.clock.simSeconds;
    }
  }

  for (const decision of state.decisions) {
    if (decision.status !== "pendiente") continue;
    decision.status = "rechazada";
    const events = Array.isArray(state.events) ? state.events : [];
    events.push({
      id: `event-${randomUUID()}`,
      time: state.clock.simSeconds,
      kind: "decision",
      text: `Decisión «${String(decision.title)}» obsoleta: el plan al que pertenecía ya no está activo`,
    });
    state.events = events.slice(-80);
  }
  state.waitingForDecision = null;

  state.coordinatorStatus = state.agentsPaused ? "pausado" : "replanificando";
  if (proposal.approval) {
    const decisionId = `decision-plan-${state.planVersion}`;
    state.decisions.push({
      ...proposal.approval,
      id: decisionId,
      cost: proposal.cost,
      status: "pendiente",
      createdAt: state.clock.simSeconds,
    });
    state.waitingForDecision = decisionId;
    state.coordinatorStatus = "esperando_decision";
  }

  return state;
}
