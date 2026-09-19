import assert from "node:assert/strict";

import { moodFor } from "../src/actions/adapters/sim-world.js";
import type { StateRepository } from "../src/state/state-repository.js";
import type { DispatchTask } from "../src/state/task-repository.js";

export function useAcceptingSeed(states: StateRepository, task: DispatchTask): void {
  const seed = Array.from({ length: 100 }, (_, index) => index + 1)
    .find((value) => moodFor(value, task).lean === "accepted");
  assert(seed);
  const run = states.ensureActiveRun();
  run.state.clock.liveSeed = seed;
  states.saveState(run.id, run.state);
}
