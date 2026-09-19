import { randomUUID } from "node:crypto";

import { logCoord, logCoordError, logEvent } from "../log.js";

import { runCoordinatorLoop, type CompleteFn, type CoordinatorLoopDeps } from "../agents/coordinator/loop.js";
import { buildReplan } from "../agents/coordinator/replan.js";
import { liveCoordinatorInput } from "../agents/coordinator/scenario.js";
import { validateOutput } from "../agents/coordinator/validate.js";
import type { LlmConfig } from "../agents/coordinator/llm.js";
import type { CoordinatorMode, InitialFixture } from "../config.js";
import { ContractError, parseCallRequest, parseIntervention, parseTwist, type Intervention, type TwistId } from "../contracts/api.js";
import { persistReplan } from "./apply-coordinator.js";
import { ControlService } from "./control-service.js";
import type { ActionExecutor } from "../actions/executor.js";
import { EventRepository, type CoordinatorRunMode, type EventSource } from "../state/event-repository.js";
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
    const result = this.queue.then(() => this.process({ ...event, id: eventId }));
    // Un evento rechazado solo falla para quien lo envió; la cola sigue viva.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.then(() => eventId);
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
    logEvent("recibido", event.source, event.kind, event.text ?? "", {
      mode: this.options.mode,
      harness: this.options.llmConfig?.harness ?? "none",
      hasLlm: Boolean(this.options.llmConfig || this.options.completeFn),
    });
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
    this.appendTimeline(
      event.source === "jury" ? "incidencia" : "accion",
      event.text ?? `${event.source}:${event.kind}`,
    );

    let mode: CoordinatorRunMode = "none";
    try {
      if (event.source === "human") {
        if (event.kind === "call_request") {
          this.enqueueCallRequest(event);
        } else {
          const intervention = parseIntervention({
            type: event.kind,
            payload: event.payload,
          });
          this.control.applyIntervention(intervention);
          if (shouldCoordinateIntervention(intervention.type)) {
            mode = await this.runCoordinator(event);
          }
        }
      } else if (event.source === "jury") {
        const twist = parseTwist({ twist: event.payload?.twist ?? event.kind });
        const before = this.states.ensureActiveRun().state;
        const already = Array.isArray(before.twistsApplied) && before.twistsApplied.includes(twist);
        this.control.applyTwist(twist);
        if (!already) mode = await this.runCoordinator(event);
      } else {
        mode = await this.runCoordinator(event);
      }
    } catch (error) {
      logCoordError("excepción al procesar", error);
      if (error instanceof ContractError) throw error;
      this.markCoordinatorDown();
    }
    this.events.setMode(event.id, mode);
  }

  private enqueueCallRequest(event: IncomingEvent & { id: string }): void {
    const request = parseCallRequest(event.payload ?? {});
    const run = this.states.ensureActiveRun();
    this.tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: request.area,
      kind: "call",
      payload: {
        objective: request.objective,
        counterpart: request.counterpart,
        reason: "Solicitud manual del responsable",
        data: request.commitmentId ? { commitmentId: request.commitmentId } : {},
      },
      idempotencyKey: `call-request:${event.id}`,
    });
    this.executor?.pump();
  }

  private appendTimeline(kind: string, text: string): void {
    const after = this.states.ensureActiveRun();
    const events = records(after.state, "events");
    events.push({
      id: `intake-${randomUUID()}`,
      time: after.state.clock.simSeconds,
      kind,
      text,
    });
    after.state.events = events.slice(-80);
    this.states.saveState(after.id, after.state);
  }

  private twistOf(event: IncomingEvent): TwistId | undefined {
    const candidate = event.payload?.twist ?? event.kind;
    if (typeof candidate !== "string") return undefined;
    try {
      return parseTwist({ twist: candidate });
    } catch {
      return undefined;
    }
  }

  private applyRulesReplan(event: IncomingEvent): boolean {
    const twist = this.twistOf(event);
    if (!twist) return false;
    const run = this.states.ensureActiveRun();
    const output = buildReplan(run.state, twist, this.tasks.listOpen(run.id));
    if (!output) return false;
    const { issues } = validateOutput(structuredClone(output), liveCoordinatorInput(run.state));
    // El replan determinista reparte plazas, no propone gasto: la escalada por presupuesto
    // la lleva el flujo de aprobaciones y no debe bloquear la adaptación al giro.
    const blocking = issues.filter((issue) => issue.code !== "falta_escalado");
    if (blocking.length > 0) {
      logCoordError("replan rules", blocking.map((issue) => `${issue.code}: ${issue.detail}`).join("; "));
      return false;
    }
    const errors = persistReplan({
      runId: run.id,
      output,
      world: this.options.world,
      tasks: this.tasks,
      states: this.states,
    });
    if (errors.length > 0) {
      logCoordError("replan rules", errors.join("; "));
      return false;
    }
    this.executor?.pump();
    return true;
  }

  private async runCoordinator(event: IncomingEvent): Promise<"llm" | "rules" | "none"> {
    if (this.options.mode === "rules" && !this.options.completeFn) {
      logCoord("modo rules, sin LLM");
      this.applyRulesReplan(event);
      return "rules";
    }
    logCoord("llamando al coordinador", event.kind, event.text ?? "");
    const result = await runCoordinatorLoop(
      { source: event.source, kind: event.kind, ...(event.text ? { text: event.text } : {}) },
      {
        ...this.loopDeps,
        world: this.options.world,
        config: this.options.llmConfig,
        ...(this.options.completeFn ? { completeFn: this.options.completeFn } : {}),
      },
    );
    logCoord("resultado", result);
    if (result === "unavailable") {
      if (this.applyRulesReplan(event)) return "rules";
      this.markCoordinatorDown();
      return "none";
    }
    this.executor?.pump();
    return this.options.mode;
  }

  private markCoordinatorDown(): void {
    logCoordError("no disponible");
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
