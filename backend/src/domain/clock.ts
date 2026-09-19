import { randomUUID } from "node:crypto";

import type { ActionExecutor } from "../actions/executor.js";
import { advanceAttendance } from "./attendance.js";
import { nextAutoTwist, TWIST_LABELS } from "./auto-twists.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { Engine } from "./engine.js";
import { LIVE_INTERVAL_SECONDS, incidentAt } from "./incidents.js";
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
    private readonly configuredSeed?: number,
  ) {
    this.speed = speed;
  }

  attachEngine(engine: Engine): void {
    this.engine = engine;
  }

  private liveOnStart: { seed: number; mode: "open" | "catalog" } | undefined;

  enableLiveOnStart(seed: number, mode: "open" | "catalog" = "open"): void {
    this.liveOnStart = { seed, mode };
  }

  start(): void {
    this.stop();
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.clock.speed = this.speed;
    this.ensureSeed(state);
    if (this.liveOnStart) {
      state.clock.live = true;
      state.clock.liveSeed = this.liveOnStart.seed;
      state.clock.liveMode = this.liveOnStart.mode;
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

    for (const call of records(state, "calls")) {
      if (call.status !== "en_curso" || call.simulated === false) continue;
      const ended = Number(call.startedAt ?? now) + Number(call.endsAfter ?? 0);
      if (ended <= now) {
        call.status = "terminada";
        changed = true;
      }
    }
    state.calls = records(state, "calls");

    if (state.clock.seed === undefined) {
      this.ensureSeed(state);
      changed = true;
    }
    const attendance = advanceAttendance(state, now - delta, now, Number(state.clock.seed));
    if (attendance.changed) changed = true;
    for (const burst of attendance.bursts) {
      addEvent(state, "info", `Pico de llegadas en ${burst.name}: +${burst.perMin} personas/min durante ${burst.minutes} min`, "asistentes");
    }
    const notify = this.coordinatorFree(state);
    for (const gate of attendance.saturated) {
      addEvent(state, "incidencia", `${gate.name} saturado: ${gate.waiting} personas en cola`, "asistentes");
    }

    const incident = this.dueIncident(state, now);
    if (incident) changed = true;
    if (changed) this.states.saveState(run.id, state);
    this.executor.fireDue(now);
    this.executor.pump();
    if (notify) {
      for (const gate of attendance.saturated) {
        void this.engine
          ?.handle({
            source: "clock",
            kind: "gate_saturated",
            text: `${gate.name} saturado: ${gate.waiting} personas en cola en zona ${gate.zone}`,
            payload: { gateId: gate.gateId, waiting: gate.waiting },
          })
          .catch((error) => console.error("[attendance] handle", error));
      }
    }
    if (incident) {
      if (incident.kind === "twist") {
        void this.engine
          ?.handle({
            source: "clock",
            kind: "twist",
            text: incident.text,
            payload: { twist: incident.id },
          })
          .catch((error) => console.error("[live] twist", error));
      } else {
        void this.engine
          ?.handle({ source: "clock", kind: incident.kind, text: incident.text, payload: { incident: incident.id, index: incident.index } })
          .catch((error) => console.error("[live] handle", error));
      }
    }
  }

  private ensureSeed(state: CrisisStateDocument): void {
    if (state.clock.seed !== undefined) return;
    const legacySeed = Number(state.clock.attendanceSeed);
    state.clock.seed = Number.isInteger(legacySeed) && legacySeed > 0 ? legacySeed : this.configuredSeed ?? createSimulationSeed();
    delete state.clock.attendanceSeed;
  }

  private coordinatorFree(state: CrisisStateDocument): boolean {
    if (!this.engine) return false;
    const status = String(state.coordinatorStatus ?? "");
    return status !== "replanificando" && status !== "esperando_decision" && state.agentsPaused !== true;
  }

  private dueIncident(
    state: CrisisStateDocument,
    now: number,
  ): { kind: "incident" | "incident_open" | "twist"; id: string; text: string; index: number } | undefined {
    if (state.clock.live !== true || !this.coordinatorFree(state)) return undefined;
    if (now - Number(state.clock.liveLastAt ?? 0) < LIVE_INTERVAL_SECONDS) return undefined;
    const index = Number(state.clock.liveIndex ?? 0);
    const seed = Number(state.clock.liveSeed ?? 1);
    if (index % 2 === 1) {
      const twist = nextAutoTwist(state, seed);
      if (twist) {
        state.clock.liveLastAt = now;
        state.clock.liveIndex = index + 1;
        return { kind: "twist", id: twist, text: `Giro automático: ${TWIST_LABELS[twist]}`, index };
      }
    }
    const open = state.clock.liveMode !== "catalog" && this.engine?.hasLlm() === true;
    if (open) {
      state.clock.liveLastAt = now;
      state.clock.liveIndex = index + 1;
      return { kind: "incident_open", id: `gen-${index}`, text: "", index };
    }
    const incident = incidentAt(seed, index);
    if (!incident) return undefined;
    state.clock.liveLastAt = now;
    state.clock.liveIndex = index + 1;
    return { kind: "incident", id: incident.id, text: incident.text, index };
  }
}
