import { randomUUID } from "node:crypto";

import { runCoordinatorLoop, type CompleteFn, type CoordinatorLoopDeps } from "../agents/coordinator/loop.js";
import type { LlmConfig } from "../agents/coordinator/llm.js";
import type { CoordinatorMode, InitialFixture } from "../config.js";
import { ContractError, parseIntervention, parseTwist, type Intervention } from "../contracts/api.js";
import { ControlService } from "./control-service.js";
import type { ActionExecutor } from "../actions/executor.js";
import { EventRepository, type EventSource } from "../state/event-repository.js";
import type { StateRepository } from "../state/state-repository.js";
import type { TaskRepository } from "../state/task-repository.js";
import type { WorldModel } from "../world/world.js";

export interface IncomingEvent {
  id?: string;
  source: EventSource;
  kind: string;
  text?: string;
  payload?: Record<string, unknown>;
  actorId?: string;
}

export interface EngineOptions {
  mode: CoordinatorMode;
  llmConfig?: LlmConfig;
  completeFn?: CompleteFn;
  world: WorldModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: { [key: string]: unknown }, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export class Engine {
  private queue: Promise<void> = Promise.resolve();
  private executor: ActionExecutor | undefined;

  constructor(
    private readonly states: StateRepository,
    private readonly control: ControlService,
    private readonly events: EventRepository,
    private readonly tasks: TaskRepository,
    private readonly loopDeps: Omit<CoordinatorLoopDeps, "config" | "completeFn" | "world">,
    private readonly options: EngineOptions,
  ) {}

  attachExecutor(executor: ActionExecutor): void {
    this.executor = executor;
  }

  handle(event: IncomingEvent): Promise<string> {
    const eventId = event.id ?? randomUUID();
    this.queue = this.queue.then(() => this.process({ ...event, id: eventId }));
    return this.queue.then(() => eventId);
  }

  async reset(fixture?: InitialFixture): Promise<{ runId: string; planVersion: number }> {
    await this.queue;
    this.executor?.clear();
    return this.control.reset(fixture);
  }

  listActions() {
    const run = this.states.ensureActiveRun();
    return this.tasks.listOpen(run.id).map((task) => {
      const payload = isRecord(task.payload) ? task.payload : {};
      return {
        taskId: task.id,
        area: task.area,
        kind: task.kind,
        status: task.status,
        planVersion: task.planVersion,
        objective: payload.objective ?? "",
      };
    });
  }

  private async process(event: IncomingEvent & { id: string }): Promise<void> {
    const run = this.states.ensureActiveRun();
    this.events.append({
      id: event.id,
      runId: run.id,
      source: event.source,
      kind: event.kind,
      text: event.text,
      payload: event.payload ?? {},
      actorId: event.actorId,
      simSeconds: Number(run.state.clock.simSeconds),
      mode: "none",
    });

    try {
      if (event.source === "human") {
        const intervention = parseIntervention({
          type: event.kind,
          payload: event.payload,
        });
        this.control.applyIntervention(intervention);
        if (shouldCoordinateIntervention(intervention.type)) {
          await this.runCoordinator(event);
        }
      } else if (event.source === "jury") {
        const twist = parseTwist({ twist: event.payload?.twist ?? event.kind });
        const before = this.states.ensureActiveRun().state;
        const already = Array.isArray(before.twistsApplied) && before.twistsApplied.includes(twist);
        this.control.applyTwist(twist);
        if (!already) await this.runCoordinator(event);
      } else {
        await this.runCoordinator(event);
      }
    } catch (error) {
      if (error instanceof ContractError) throw error;
      this.markCoordinatorDown();
    }

    const after = this.states.ensureActiveRun();
    const events = records(after.state, "events");
    events.push({
      id: `intake-${event.id}`,
      time: after.state.clock.simSeconds,
      kind: event.source === "jury" ? "incidencia" : "accion",
      text: event.text ?? `${event.source}:${event.kind}`,
    });
    after.state.events = events.slice(-80);
    this.states.saveState(after.id, after.state);
  }

  private async runCoordinator(event: IncomingEvent): Promise<"llm" | "rules" | "none"> {
    if (this.options.mode === "rules" && !this.options.completeFn) {
      return "rules";
    }
    const result = await runCoordinatorLoop(
      { source: event.source, kind: event.kind, ...(event.text ? { text: event.text } : {}) },
      {
        ...this.loopDeps,
        world: this.options.world,
        config: this.options.llmConfig,
        ...(this.options.completeFn ? { completeFn: this.options.completeFn } : {}),
      },
    );
    if (result === "unavailable") {
      this.markCoordinatorDown();
      return "none";
    }
    this.executor?.pump();
    return this.options.mode;
  }

  private markCoordinatorDown(): void {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    const events = records(state, "events");
    events.push({
      id: `coord-down-${randomUUID()}`,
      time: state.clock.simSeconds,
      kind: "fallo",
      text: "coordinador no disponible",
    });
    state.events = events.slice(-80);
    state.coordinatorStatus = "replanificando";
    this.states.saveState(run.id, state);
  }
}

function shouldCoordinateIntervention(type: Intervention["type"]): boolean {
  return type === "approve_spend" || type === "reject_spend" || type === "reject_split" || type === "set_constraint";
}
