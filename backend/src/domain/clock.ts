import type { ActionExecutor } from "../actions/executor.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { StateRepository } from "../state/state-repository.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export class SimulationClock {
  private timer: ReturnType<typeof setInterval> | undefined;
  private speed: number;

  constructor(
    private readonly states: StateRepository,
    private readonly executor: ActionExecutor,
    speed = 1,
  ) {
    this.speed = speed;
  }

  start(): void {
    this.stop();
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.clock.speed = this.speed;
    this.states.saveState(run.id, state);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  tick(): void {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    if (state.clock.paused) {
      this.executor.pump();
      return;
    }
    const delta = Number(state.clock.speed ?? this.speed);
    state.clock.simSeconds = Number(state.clock.simSeconds) + delta;
    let changed = delta !== 0;
    const now = Number(state.clock.simSeconds);

    for (const shuttle of records(state, "shuttles")) {
      if (Number(shuttle.arriveAt ?? Infinity) <= now && shuttle.status !== "llegado") {
        shuttle.status = "llegado";
        changed = true;
      }
    }
    state.shuttles = records(state, "shuttles");

    for (const delivery of records(state, "deliveries")) {
      if (
        Number(delivery.arriveAt ?? Infinity) <= now &&
        delivery.status !== "entregada" &&
        delivery.status !== "bloqueada"
      ) {
        delivery.status = "entregada";
        changed = true;
      }
    }
    state.deliveries = records(state, "deliveries");

    for (const call of records(state, "calls")) {
      if (call.status !== "en_curso") continue;
      const ended = Number(call.startedAt ?? now) + Number(call.endsAfter ?? 0);
      if (ended <= now) {
        call.status = "terminada";
        changed = true;
      }
    }
    state.calls = records(state, "calls");

    if (changed) this.states.saveState(run.id, state);
    this.executor.fireDue(now);
    this.executor.pump();
  }
}
