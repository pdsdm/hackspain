import { randomUUID } from "node:crypto";

import type { ActionExecutor } from "../actions/executor.js";
import { advanceAttendance } from "./attendance.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { Engine } from "./engine.js";
import { createSimulationSeed } from "./random.js";
import type { StateRepository } from "../state/state-repository.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function addEvent(state: CrisisStateDocument, kind: string, text: string, area?: string): void {
  const events = records(state, "events");
  events.push({ id: `clock-${randomUUID()}`, time: state.clock.simSeconds, kind, text, ...(area ? { area } : {}) });
  state.events = events.slice(-80);
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

  start(): void {
    this.stop();
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.clock.speed = this.speed;
    this.ensureSeed(state);
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

    for (const vehicle of records(state, "vehicles")) {
      const status = String(vehicle.status ?? "");
      if (status !== "en_ruta" && status !== "desviado") continue;
      if (Number(vehicle.arriveAt ?? Infinity) > now) continue;
      vehicle.status = "llegado";
      const place = records(state, "spaces").find((item) => item.id === vehicle.destinationId);
      addEvent(state, "info", `${String(vehicle.name ?? vehicle.id)} (${String(vehicle.who ?? "")}) llega a ${String(place?.name ?? vehicle.destinationId)}`, "transporte");
      changed = true;
    }
    state.vehicles = records(state, "vehicles");

    if (state.clock.seed === undefined) {
      this.ensureSeed(state);
      changed = true;
    }
    const attendance = advanceAttendance(state, now - delta, now, Number(state.clock.seed));
    if (attendance.changed) changed = true;
    for (const burst of attendance.bursts) {
      addEvent(state, "info", `Pico de llegadas en ${burst.name}: +${burst.perMin} personas/min durante ${burst.minutes} min`, "asistentes");
    }
    for (const gate of attendance.saturated) {
      addEvent(state, "incidencia", `${gate.name} saturado: ${gate.waiting} personas en cola`, "asistentes");
    }

    if (changed) this.states.saveState(run.id, state);
    this.executor.fireDue(now);
    this.executor.pump();
  }

  private ensureSeed(state: CrisisStateDocument): void {
    if (state.clock.seed !== undefined) return;
    const legacySeed = Number(state.clock.attendanceSeed);
    state.clock.seed = Number.isInteger(legacySeed) && legacySeed > 0 ? legacySeed : createSimulationSeed();
    delete state.clock.attendanceSeed;
  }
}
