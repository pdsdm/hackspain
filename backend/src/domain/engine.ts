import { randomUUID } from "node:crypto";

import { logCoord, logCoordError, logEvent } from "../log.js";

import { runCoordinatorLoop, type CompleteFn, type CoordinatorLoopDeps } from "../agents/coordinator/loop.js";
import { buildReplan } from "../agents/coordinator/replan.js";
import { liveCoordinatorInput } from "../agents/coordinator/scenario.js";
import { applyClosure } from "./closure.js";
import { validateOutput } from "../agents/coordinator/validate.js";
import type { LlmConfig } from "../agents/coordinator/llm.js";
import type { CoordinatorMode, InitialFixture } from "../config.js";
import { ContractError, parseCallRequest, parseIntervention, parseTwist, type HappyRobotIncidentId, type Intervention, type TwistId } from "../contracts/api.js";
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
  static readonly MAX_RESULT_REPLANS = 3;

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
    // Una intervención del responsable no puede esperar a que acabe la pasada del
    // coordinador: se aplica al estado ya y solo la replanificación va a la cola.
    let applied = false;
    try {
      applied = this.applyHumanNow(event);
    } catch (error) {
      return Promise.reject(error);
    }
    const result = this.queue.then(() => this.process({ ...event, id: eventId, alreadyApplied: applied }));
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

  /** Aplica ya la intervención humana. Devuelve si lo ha hecho, para no repetirla en la cola. */
  private applyHumanNow(event: IncomingEvent): boolean {
    if (event.source !== "human" || event.kind === "call_request") return false;
    const intervention = parseIntervention({ type: event.kind, payload: event.payload });
    this.control.applyIntervention(intervention);
    return true;
  }

  private async process(event: IncomingEvent & { id: string; alreadyApplied?: boolean }): Promise<void> {
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
    // La intervención ya se anotó a sí misma en la cronología con su texto de verdad.
    const isSpecialistResult = event.source === "happyrobot" && event.kind === "call_result";
    if (event.source !== "clock" && !event.alreadyApplied && !isHappyRobotIncident(event) && !isSpecialistResult) {
      this.appendTimeline(
        event.source === "jury" ? "incidencia" : "accion",
        event.text ?? `${event.source}:${event.kind}`,
      );
    }

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
          if (!event.alreadyApplied) this.control.applyIntervention(intervention);
          if (shouldCoordinateIntervention(intervention.type)) {
            mode = await this.runCoordinator(event);
          }
        }
      } else if (event.source === "jury" || (event.source === "clock" && event.kind === "twist")) {
        const twist = parseTwist({ twist: event.payload?.twist ?? event.kind });
        const before = this.states.ensureActiveRun().state;
        const already = Array.isArray(before.twistsApplied) && before.twistsApplied.includes(twist);
        this.control.applyTwist(twist);
        if (!already) mode = await this.runCoordinator(event);
      } else if (isHappyRobotIncident(event)) {
        const applied = this.control.applyHappyRobotIncident(
          event.kind as HappyRobotIncidentId,
          event.text ?? event.kind,
          {
            channel: event.payload!.channel as "call" | "sms",
            actor: event.actorId!,
            eventId: event.id,
            sessionId: event.payload!.sessionId as string,
          },
        );
        if (applied) mode = await this.runCoordinator(event);
      } else if (event.source === "happyrobot" && event.kind === "call_result") {
        // Un fallo por falta de canal real es instantáneo y masivo: sin esta guarda, cada
        // plan sin hooks configurados dispara hasta MAX_RESULT_REPLANS replanificaciones
        // seguidas sin que haya pasado nada nuevo.
        const isNoChannel = typeof event.payload?.eventId === "string" && event.payload.eventId.startsWith("no-channel-");
        if (isNoChannel) {
          // sin replan: solo se limpian las tareas bloqueadas por esta.
        } else if (event.payload?.status === "no_answer" && event.payload.materialChange !== true) {
          this.retryNoAnswer(event.payload);
        } else if (callResultMatchesPlan(event.payload, run.id, run.state.planVersion) && callResultChangesPlan(event.payload)) {
          if (this.resultReplanStreak() >= Engine.MAX_RESULT_REPLANS) {
            this.skipLoopingReplan();
          } else {
            const materialSummary = typeof event.payload?.materialSummary === "string" ? event.payload.materialSummary : undefined;
            mode = await this.runCoordinator(materialSummary ? { ...event, text: materialSummary } : event, true);
          }
        }
        this.dropBlockedTasks();
      } else {
        mode = await this.runCoordinator(event);
      }
    } catch (error) {
      logCoordError("excepción al procesar", error);
      if (error instanceof ContractError) throw error;
      this.markCoordinatorDown();
    }
    this.closeIfDone();
    this.events.setMode(event.id, mode);
  }

  /**
   * Comprueba si la crisis ya está resuelta. Sin esto el panel se queda «replanificando»
   * para siempre y la demo no tiene final.
   */
  private closeIfDone(): void {
    const run = this.states.ensureActiveRun();
    if (run.state.coordinatorBusy !== undefined) return;
    const next = applyClosure(run.state, this.tasks.listOpen(run.id).length);
    if (next) this.states.saveState(run.id, next);
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

  private resultReplanStreak(): number {
    const value = this.states.ensureActiveRun().state.resultReplanStreak;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private setResultReplanStreak(value: number): void {
    const run = this.states.ensureActiveRun();
    if ((run.state.resultReplanStreak ?? 0) === value) return;
    const state = structuredClone(run.state);
    state.resultReplanStreak = value;
    this.states.saveState(run.id, state);
  }

  private skipLoopingReplan(): void {
    logCoordError("replanificación en bucle: se omite hasta un input externo nuevo");
    const streak = this.resultReplanStreak();
    this.setResultReplanStreak(streak + 1);
    if (streak !== Engine.MAX_RESULT_REPLANS) return;
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    const events = records(state, "events");
    events.push({
      id: `coord-loop-${randomUUID()}`,
      time: state.clock.simSeconds,
      kind: "espera",
      text: `Coordinador en pausa tras ${Engine.MAX_RESULT_REPLANS} replanificaciones seguidas sin input nuevo; el responsable decide.`,
    });
    state.events = events.slice(-80);
    this.states.saveState(run.id, state);
  }

  private dropBlockedTasks(): void {
    const run = this.states.ensureActiveRun();
    const cancelled = this.tasks.cancelBlocked(run.id);
    if (cancelled.length === 0) return;
    for (const task of cancelled) {
      logCoord("tarea cancelada: su dependencia no contestó", task.area, task.kind);
      const objective = isRecord(task.payload) && typeof task.payload.objective === "string" ? task.payload.objective : task.kind;
      this.appendTimeline("fallo", `${task.area}: se cancela «${objective}» porque la tarea de la que dependía no obtuvo respuesta.`);
    }
    this.executor?.pump();
  }

  private retryNoAnswer(payload: Record<string, unknown> | undefined): void {
    const taskId = typeof payload?.taskId === "string" ? payload.taskId : undefined;
    const task = taskId ? this.tasks.get(taskId) : undefined;
    if (!task) return;
    const run = this.states.ensureActiveRun();
    if (task.runId !== run.id || task.planVersion !== run.state.planVersion) return;
    if (task.idempotencyKey.endsWith(":retry")) {
      logCoord("sin respuesta por segunda vez, no se reintenta", task.area);
      return;
    }
    logCoord("sin respuesta, se reintenta la misma tarea", task.area);
    this.tasks.enqueue({
      runId: task.runId,
      planVersion: task.planVersion,
      area: task.area,
      kind: task.kind,
      payload: task.payload,
      idempotencyKey: `${task.idempotencyKey}:retry`,
    });
    this.executor?.pump();
  }

  private async runCoordinator(event: IncomingEvent, fromResult = false): Promise<"llm" | "rules" | "none"> {
    this.setResultReplanStreak(fromResult ? this.resultReplanStreak() + 1 : 0);
    if (this.options.mode === "rules" && !this.options.completeFn) {
      logCoord("modo rules, sin LLM");
      this.applyRulesReplan(event);
      return "rules";
    }
    logCoord("llamando al coordinador", event.kind, event.text ?? "");
    this.markCoordinatorBusy(event);
    let result: "ok" | "unavailable";
    try {
      result = await runCoordinatorLoop(
        { source: event.source, kind: event.kind, ...(event.text ? { text: event.text } : {}) },
        {
          ...this.loopDeps,
          world: this.options.world,
          config: this.options.llmConfig,
          ...(this.options.completeFn ? { completeFn: this.options.completeFn } : {}),
        },
      );
    } finally {
      this.clearCoordinatorBusy();
    }
    logCoord("resultado", result);
    if (result === "unavailable") {
      if (this.applyRulesReplan(event)) return "rules";
      this.markCoordinatorDown();
      return "none";
    }
    this.executor?.pump();
    return this.options.mode;
  }

  private markCoordinatorBusy(event: IncomingEvent): void {
    const run = this.states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.coordinatorBusy = { eventId: event.id, text: event.text ?? `${event.source}:${event.kind}` };
    if (state.coordinatorStatus === "estable") state.coordinatorStatus = "replanificando";
    this.states.saveState(run.id, state);
  }

  private clearCoordinatorBusy(): void {
    const run = this.states.ensureActiveRun();
    if (run.state.coordinatorBusy === undefined) return;
    const state = structuredClone(run.state);
    delete state.coordinatorBusy;
    this.states.saveState(run.id, state);
  }

  recoverInterruptedCoordinator(): boolean {
    const run = this.states.ensureActiveRun();
    const busy = run.state.coordinatorBusy;
    if (!isRecord(busy)) return false;
    const text = typeof busy.text === "string" ? busy.text : "";
    logCoordError("interrumpido por reinicio", text);
    const state = structuredClone(run.state);
    delete state.coordinatorBusy;
    const events = records(state, "events");
    events.push({
      id: `coord-interrupted-${randomUUID()}`,
      time: state.clock.simSeconds,
      kind: "fallo",
      text: `coordinador interrumpido por reinicio del backend: ${text}. Envía el evento otra vez.`,
    });
    state.events = events.slice(-80);
    this.states.saveState(run.id, state);
    return true;
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

function isHappyRobotIncident(event: IncomingEvent): boolean {
  return event.source === "happyrobot" && (event.kind === "principal_pipe_burst" || event.kind === "dock_blocked");
}

function callResultMatchesPlan(
  payload: Record<string, unknown> | undefined,
  runId: string,
  planVersion: number,
): boolean {
  return payload?.runId === runId && payload.planVersion === planVersion;
}

function callResultChangesPlan(payload: Record<string, unknown> | undefined): boolean {
  if (payload?.materialChange === true) return true;
  const status = payload?.status;
  if (status === "no_answer") return false;
  if (status !== "completed") return true;
  const result = payload?.result;
  const outcome = typeof result === "object" && result !== null ? (result as Record<string, unknown>).outcome : undefined;
  return outcome !== "accepted" && outcome !== "accepted_with_conditions";
}

function shouldCoordinateIntervention(type: Intervention["type"]): boolean {
  return type === "approve_plan" || type === "reject_plan" || type === "reject_split" || type === "set_constraint";
}
