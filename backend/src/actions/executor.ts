import type { AppConfig, AreaHook } from "../config.js";
import type { SpecialistResultEnvelope } from "../contracts/api.js";
import type { CrisisStateDocument } from "../domain/crisis-state.js";
import type { Engine } from "../domain/engine.js";
import type { WorkflowService } from "../domain/workflow-service.js";
import type { StateRepository } from "../state/state-repository.js";
import type { DispatchTask, TaskRepository } from "../state/task-repository.js";
import { logAction, logActionError } from "../log.js";
import { dispatchHappyRobot } from "./adapters/happyrobot.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

interface DueResult {
  at: number;
  envelope: SpecialistResultEnvelope;
  // Un timeout solo se entrega si la tarea sigue esperando el callback real.
  onlyIfDispatched?: boolean;
}

function noAnswerEnvelope(input: {
  task: DispatchTask;
  runId: string;
  callId: string;
}): SpecialistResultEnvelope {
  const payload = isRecord(input.task.payload) ? input.task.payload : {};
  return {
    eventId: `timeout-${input.task.id}`,
    taskId: input.task.id,
    runId: input.runId,
    planVersion: input.task.planVersion,
    status: "no_answer",
    result: {
      outcome: "no_answer",
      summary: `${String(payload.counterpart ?? "La contraparte")} no responde; sin resultado de la llamada.`,
      conditions: [],
      evidence: { callId: input.callId },
      data: {},
    },
  };
}

function noChannelEnvelope(input: { task: DispatchTask; runId: string }): SpecialistResultEnvelope {
  return {
    eventId: `no-channel-${input.task.id}`,
    taskId: input.task.id,
    runId: input.runId,
    planVersion: input.task.planVersion,
    status: "failed",
    result: {
      outcome: "failed",
      summary: `Sin canal real configurado para ${input.task.area}`,
      conditions: [],
      evidence: {},
      data: {},
    },
  };
}

export class ActionExecutor {
  // Segundos de reloj que esperamos el callback de HappyRobot antes de dar la tarea por no contestada.
  static readonly DISPATCH_TIMEOUT_SECONDS = 180;

  private due: DueResult[] = [];
  private engine: Engine | undefined;

  constructor(
    private readonly states: StateRepository,
    private readonly tasks: TaskRepository,
    private readonly workflows: WorkflowService,
    private readonly config: AppConfig,
  ) {}

  attachEngine(engine: Engine): void {
    this.engine = engine;
  }

  clear(): void {
    this.due = [];
  }

  fireDue(now: number): void {
    const ready = this.due.filter((item) => item.at <= now);
    this.due = this.due.filter((item) => item.at > now);
    for (const item of ready) {
      if (item.onlyIfDispatched && this.tasks.get(item.envelope.taskId)?.status !== "dispatched") continue;
      this.deliver(item.envelope);
    }
  }

  pump(): void {
    const run = this.states.ensureActiveRun();
    if (run.state.clock.paused || run.state.agentsPaused || run.state.waitingForDecision || run.state.rejectedPlanVersion === run.state.planVersion) return;
    for (let index = 0; index < 3; index += 1) {
      const task = this.tasks.claimNext();
      if (!task) return;
      if (this.deferRealCall(task)) return;
      this.dispatch(task).catch((error) => {
        logActionError("dispatch failed", {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
        this.tasks.markDispatchOutcome(task.id, "unknown");
      });
    }
  }

  private isReal(task: DispatchTask): boolean {
    const hook = this.config.hooks[task.area as AreaHook];
    return Boolean(hook && this.config.happyrobotApiKey);
  }

  private deferRealCall(task: DispatchTask): boolean {
    if (!this.isReal(task)) return false;
    const state = this.states.ensureActiveRun().state;
    const busy = records(state, "calls").some((call) =>
      call.status === "en_curso" &&
      ["dispatching", "dispatched"].includes(this.tasks.get(String(call.id).replace(/^call-/, ""))?.status ?? ""));
    if (!busy) return false;
    this.tasks.release(task.id);
    return true;
  }

  private async dispatch(task: DispatchTask): Promise<void> {
    const run = this.states.ensureActiveRun();
    const hook = this.config.hooks[task.area as AreaHook];
    const real = this.isReal(task);
    if (!real) {
      logAction("dispatch", {
        taskId: task.id,
        runId: run.id,
        planVersion: task.planVersion,
        area: task.area,
        kind: task.kind,
        adapter: "none",
      });
      this.deliver(noChannelEnvelope({ task, runId: run.id }));
      return;
    }

    const payload = isRecord(task.payload) ? task.payload : {};
    const callId = `call-${task.id}`;
    const state = structuredClone(run.state);
    const calls = records(state, "calls");
    calls.push({
      id: callId,
      agent: task.area,
      counterpart: String(payload.counterpart ?? "Interlocutor"),
      channel: task.kind === "sms" ? "sms" : task.kind === "email" ? "email" : "llamada",
      startedAt: state.clock.simSeconds,
      status: "en_curso",
      transcript: [],
    });
    state.calls = calls;
    const agent = records(state, "agents").find((item) => item.id === task.area);
    if (agent) agent.status = "llamada";
    state.agents = records(state, "agents");
    this.states.saveState(run.id, state);

    logAction("dispatch", {
      taskId: task.id,
      runId: run.id,
      planVersion: task.planVersion,
      area: task.area,
      kind: task.kind,
      adapter: "happyrobot",
    });
    const outcome = await dispatchHappyRobot({
      hookUrl: hook!,
      apiKey: this.config.happyrobotApiKey!,
      task,
      runId: run.id,
      planVersion: task.planVersion,
      callId,
      publicBaseUrl: this.config.publicBaseUrl,
      testPhone: this.config.happyrobotTestPhone,
      state,
    });
    this.tasks.markDispatchOutcome(task.id, outcome);
    logAction("dispatch outcome", { taskId: task.id, adapter: "happyrobot", outcome });
    if (outcome === "dispatched") {
      this.due.push({
        at: Number(state.clock.simSeconds) + ActionExecutor.DISPATCH_TIMEOUT_SECONDS,
        envelope: noAnswerEnvelope({ task, runId: run.id, callId }),
        onlyIfDispatched: true,
      });
    }
  }

  private deliver(envelope: SpecialistResultEnvelope): void {
    let recorded;
    try {
      recorded = this.workflows.recordSpecialistResult(envelope);
    } catch (error) {
      // Un resultado fuera de contexto (plan ya cambiado, tarea cancelada) se descarta con
      // un aviso. Esto corre dentro del tick del reloj: sin este límite, una excepción aquí
      // se lleva por delante el proceso entero en mitad de la demo.
      logActionError("result descartado", {
        taskId: envelope.taskId,
        eventId: envelope.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    logAction("result", {
      taskId: envelope.taskId,
      eventId: envelope.eventId,
      status: envelope.status,
      applied: recorded.applied,
      duplicate: recorded.duplicate,
    });
    if (recorded.applied && !recorded.duplicate) {
      void this.engine?.handle({
        source: "happyrobot",
        kind: "call_result",
        payload: {
          ...(envelope as unknown as Record<string, unknown>),
          ...(recorded.materialChange ? { materialChange: true, materialSummary: recorded.materialSummary } : {}),
        },
      });
    }
  }
}
