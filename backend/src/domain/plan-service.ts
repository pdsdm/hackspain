import { readFileSync } from "node:fs";

import { ContractError } from "../contracts/api.js";
import { applyPlanProposal, type PlanProposal } from "./plan-rules.js";
import type { StateRepository } from "../state/state-repository.js";

const SEED_URL = new URL("../../fixtures/madring/seed.json", import.meta.url);

interface ScenarioSeed {
  guests: Array<{ id: string }>;
}

function loadGuestIds(): ReadonlySet<string> {
  const seed = JSON.parse(readFileSync(SEED_URL, "utf8")) as ScenarioSeed;
  return new Set(seed.guests.map((guest) => guest.id));
}

export class PlanService {
  private readonly knownGuestIds = loadGuestIds();

  constructor(private readonly states: StateRepository) {}

  applyProposal(proposal: PlanProposal) {
    const run = this.states.ensureActiveRun();
    return this.applyProposalFor(run.id, run.state.planVersion, proposal);
  }

  applyProposalFor(runId: string, planVersion: number, proposal: PlanProposal) {
    const run = this.states.ensureActiveRun();
    if (run.id !== runId || run.state.planVersion !== planVersion) {
      throw new ContractError(`Stale or inactive plan context: ${runId}@${planVersion}`, 409);
    }
    const nextState = applyPlanProposal(run.state, this.knownGuestIds, proposal);
    this.states.savePlan(run.id, planVersion, nextState, proposal.allocations);
    return nextState;
  }
}
