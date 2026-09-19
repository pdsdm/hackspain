import type { ActionExecutor } from "../actions/executor.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { Engine } from "./engine.js";
import { LIVE_INTERVAL_SECONDS, incidentAt } from "./incidents.js";
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
  private engine: Engine | undefined;

  constructor(
    private readonly states: StateRepository,
    private readonly executor: ActionExecutor,
    speed = 1,
  ) {
    this.speed = speed;
  }

  attachEngine(engine: Engine): void {
    this.engine = engine;
  }

  private liveOnStart: { seed: number } | undefined;

  enableLiveOnStart(seed: number): void {
    this.liveOnStart = { seed };
  }

  start(): void {
    this.stop();
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.clock.speed = this.speed;
    if (this.liveOnStart) {
      state.clock.live = true;
      state.clock.liveSeed = this.liveOnStart.seed;
      state.clock.liveIndex = 0;
      state.clock.liveLastAt = 0;
    }
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

    const incident = this.dueIncident(state, now);
    if (incident) changed = true;
    if (changed) this.states.saveState(run.id, state);
    this.executor.fireDue(now);
    this.executor.pump();
    if (incident) {
      void this.engine
        ?.handle({ source: "clock", kind: "incident", text: incident.text, payload: { incident: incident.id } })
        .catch((error) => console.error("[live] handle", error));
    }
  }

  private dueIncident(state: CrisisStateDocument, now: number): { id: string; text: string } | undefined {
    if (!this.engine || state.clock.live !== true) return undefined;
    const status = String(state.coordinatorStatus ?? "");
    if (status === "replanificando" || status === "esperando_decision" || state.agentsPaused === true) return undefined;
    if (now - Number(state.clock.liveLastAt ?? 0) < LIVE_INTERVAL_SECONDS) return undefined;
    const index = Number(state.clock.liveIndex ?? 0);
    const incident = incidentAt(Number(state.clock.liveSeed ?? 1), index);
    if (!incident) return undefined;
    state.clock.liveLastAt = now;
    state.clock.liveIndex = index + 1;
    return { id: incident.id, text: incident.text };
  }
}
