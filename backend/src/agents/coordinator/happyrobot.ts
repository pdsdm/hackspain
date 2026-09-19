import { createHash, randomUUID } from "node:crypto";

import { TOOL_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { liveCoordinatorInput } from "./scenario.js";
import type { CoordinatorInput, CoordinatorOutput } from "./types.js";
import { parseOutput } from "./validate.js";
import { answerQuery, parseConsultArgs } from "./queries.js";
import { applyOperations, persistCoordinatorOutput } from "../../domain/apply-coordinator.js";
import type { WorkflowService } from "../../domain/workflow-service.js";
import type { StateRepository } from "../../state/state-repository.js";
import type { TaskRepository } from "../../state/task-repository.js";
import { worldSummary, type WorldModel } from "../../world/world.js";
import { logCoord, logCoordError } from "../../log.js";

export const HAPPYROBOT_COORDINATOR_MODEL = "gpt-5.6-luna-low";
const DEFAULT_API_BASE = "https://platform.eu.happyrobot.ai/api/v2";
const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_MS = 5_000;
const TERMINAL_FAILURE = new Set(["failed", "canceled", "skipped"]);
const TERMINAL_SUCCESS = new Set(["succeeded", "completed"]);

export interface HappyRobotCoordinatorConfig {
  apiKey: string;
  apiBase: string;
  workflowId: string;
  environment: string;
  model: string;
  apply: boolean;
  timeoutMs: number;
  publicBaseUrl: string;
}

export function readApplyFlag(value: string | undefined): boolean {
  return ["1", "true"].includes(value?.trim().toLowerCase() ?? "");
}

export function loadHappyRobotCoordinatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): HappyRobotCoordinatorConfig {
  const apiKey = env.HAPPYROBOT_API_KEY?.trim();
  const workflowId = env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID?.trim();
  if (!apiKey) throw new Error("COORDINATOR_HARNESS=happyrobot requiere HAPPYROBOT_API_KEY");
  if (!workflowId) throw new Error("COORDINATOR_HARNESS=happyrobot requiere HAPPYROBOT_COORDINATOR_WORKFLOW_ID");
  const timeoutRaw = env.HAPPYROBOT_COORDINATOR_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("HAPPYROBOT_COORDINATOR_TIMEOUT_MS must be an integer between 1000 and 600000");
  }
  return {
    apiKey,
    apiBase: (env.HAPPYROBOT_COORDINATOR_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, ""),
    workflowId,
    environment: env.HAPPYROBOT_COORDINATOR_ENVIRONMENT?.trim() || "development",
    model: env.COORDINATOR_MODEL?.trim() || HAPPYROBOT_COORDINATOR_MODEL,
    apply: readApplyFlag(env.HAPPYROBOT_COORDINATOR_APPLY),
    timeoutMs,
    publicBaseUrl: env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8000",
  };
}

export interface HappyRobotCoordinatorReport {
  provider: "happyrobot";
  model: string;
  environment: string;
  correlationId: string;
  happyrobotRunId: string | null;
  runId: string;
  planVersion: number;
  status: "accepted" | "failed" | "timeout" | "unavailable";
  applied: boolean;
  latencyMs: number;
  consults: number;
  submissions: number;
  validationErrors: string[];
  output: CoordinatorOutput | null;
  error?: string;
}

export interface HappyRobotSessionDeps {
  world: WorldModel;
  states: StateRepository;
  tasks: TaskRepository;
  workflows: WorkflowService;
}

interface Session {
  correlationId: string;
  runId: string;
  planVersion: number;
  input: CoordinatorInput;
  apply: boolean;
  deps: HappyRobotSessionDeps;
  consults: number;
  submissions: number;
  validationErrors: string[];
  resolve: (output: CoordinatorOutput) => void;
}

export interface ConsultResult {
  ok: boolean;
  stale?: boolean;
  error?: string;
  answer?: unknown;
}

export interface SubmitResult {
  accepted: boolean;
  retry: boolean;
  stale?: boolean;
  errors: string[];
  plan_version: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

const ENVELOPE_KEYS = new Set(["correlation_id", "run_id", "plan_version", "plan"]);

export function extractPlanText(body: Record<string, unknown>): string {
  const plan = body.plan;
  if (typeof plan === "string") return plan;
  if (isRecord(plan)) return JSON.stringify(plan);
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ENVELOPE_KEYS.has(key)) rest[key] = value;
  }
  return JSON.stringify(rest);
}

export class HappyRobotSessionRegistry {
  private active: Session | undefined;
  private lastReport: HappyRobotCoordinatorReport | undefined;

  isActive(): boolean {
    return this.active !== undefined;
  }

  activeCorrelationId(): string | undefined {
    return this.active?.correlationId;
  }

  getLastReport(): HappyRobotCoordinatorReport | undefined {
    return this.lastReport;
  }

  recordReport(report: HappyRobotCoordinatorReport): void {
    this.lastReport = report;
  }

  start(options: {
    correlationId: string;
    runId: string;
    planVersion: number;
    input: CoordinatorInput;
    apply: boolean;
    deps: HappyRobotSessionDeps;
  }): { done: Promise<CoordinatorOutput>; session: Session } {
    if (this.active) throw new Error(`otra ejecución de HappyRobot activa (${this.active.correlationId})`);
    let resolve: (output: CoordinatorOutput) => void = () => {};
    const done = new Promise<CoordinatorOutput>((res) => {
      resolve = res;
    });
    const session: Session = {
      ...options,
      consults: 0,
      submissions: 0,
      validationErrors: [],
      resolve,
    };
    this.active = session;
    return { done, session };
  }

  finish(session: Session): void {
    if (this.active === session) this.active = undefined;
  }

  private match(body: Record<string, unknown>): { session: Session } | { error: string; stale: boolean } {
    const session = this.active;
    if (!session) return { error: "no hay ninguna ejecución de HappyRobot activa", stale: true };
    const correlationId = readString(body, "correlation_id");
    if (correlationId !== session.correlationId) {
      return { error: "correlation_id no coincide con la ejecución activa", stale: true };
    }
    const runId = readString(body, "run_id");
    const planVersion = readNumber(body, "plan_version");
    if (runId !== session.runId) return { error: "run_id obsoleto", stale: true };
    if (planVersion !== session.planVersion) return { error: "plan_version obsoleta", stale: true };
    const live = session.deps.states.ensureActiveRun();
    if (live.id !== session.runId || live.state.planVersion !== session.planVersion) {
      return { error: "el plan cambió mientras HappyRobot razonaba", stale: true };
    }
    return { session };
  }

  async consult(rawBody: unknown): Promise<ConsultResult> {
    if (!isRecord(rawBody)) return { ok: false, error: "cuerpo inválido" };
    const matched = this.match(rawBody);
    if ("error" in matched) return { ok: false, stale: matched.stale, error: matched.error };
    const { session } = matched;
    session.consults += 1;
    const query = parseConsultArgs(isRecord(rawBody.query) ? rawBody.query : rawBody);
    if ("error" in query) return { ok: false, error: query.error };
    const live = session.deps.states.ensureActiveRun();
    try {
      return { ok: true, answer: await answerQuery(query, live.state, session.deps.world) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  submit(rawBody: unknown): SubmitResult {
    if (!isRecord(rawBody)) return { accepted: false, retry: false, errors: ["cuerpo inválido"], plan_version: null };
    const matched = this.match(rawBody);
    if ("error" in matched) {
      return { accepted: false, retry: false, stale: matched.stale, errors: [matched.error], plan_version: null };
    }
    const { session } = matched;
    session.submissions += 1;
    const parsed = parseOutput(extractPlanText(rawBody), session.input);
    if (!parsed.output) {
      const errors = parsed.issues.map((issue) => `${issue.code}: ${issue.detail}`);
      session.validationErrors.push(...errors);
      return { accepted: false, retry: true, errors, plan_version: session.planVersion };
    }
    const live = session.deps.states.ensureActiveRun();
    const openTaskIds = new Set(session.deps.tasks.listOpen(live.id).map((task) => task.id));
    const dry = applyOperations(structuredClone(live.state), session.deps.world, parsed.output.operations ?? [], openTaskIds).errors;
    if (dry.length > 0) {
      session.validationErrors.push(...dry);
      return { accepted: false, retry: true, errors: dry, plan_version: session.planVersion };
    }
    if (session.apply) {
      const persistErrors = persistCoordinatorOutput({
        runId: live.id,
        planVersion: live.state.planVersion,
        output: parsed.output,
        world: session.deps.world,
        workflows: session.deps.workflows,
        tasks: session.deps.tasks,
        states: session.deps.states,
      });
      if (persistErrors.length > 0) {
        session.validationErrors.push(...persistErrors);
        return { accepted: false, retry: true, errors: persistErrors, plan_version: session.planVersion };
      }
    }
    session.resolve(parsed.output);
    return { accepted: true, retry: false, errors: [], plan_version: session.planVersion };
  }
}

export const happyrobotSessions = new HappyRobotSessionRegistry();

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function systemPromptVersion(prompt: string = TOOL_SYSTEM_PROMPT): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

export function buildTriggerPayload(options: {
  correlationId: string;
  runId: string;
  planVersion: number;
  event: { source: string; kind: string; text?: string };
  input: CoordinatorInput;
  publicBaseUrl: string;
}): Record<string, unknown> {
  return {
    correlation_id: options.correlationId,
    run_id: options.runId,
    plan_version: options.planVersion,
    event: options.event,
    system_prompt: TOOL_SYSTEM_PROMPT,
    system_prompt_version: systemPromptVersion(),
    world_snapshot: buildUserPrompt(options.input),
    backend_base_url: options.publicBaseUrl,
  };
}

async function triggerRun(
  config: HappyRobotCoordinatorConfig,
  payload: Record<string, unknown>,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetchFn(`${config.apiBase}/workflows/${encodeURIComponent(config.workflowId)}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload, environment: config.environment }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`trigger HappyRobot ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { run_id?: unknown; queued_run_ids?: unknown };
  const fromQueue = Array.isArray(data.queued_run_ids) ? data.queued_run_ids[0] : undefined;
  const runId = typeof data.run_id === "string" && data.run_id ? data.run_id : fromQueue;
  if (typeof runId !== "string" || !runId) throw new Error("trigger HappyRobot sin run_id");
  return runId;
}

async function readRunStatus(
  config: HappyRobotCoordinatorConfig,
  happyrobotRunId: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetchFn(`${config.apiBase}/runs/${happyrobotRunId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal,
  });
  if (!response.ok) throw new Error(`GET run ${response.status}`);
  const data = (await response.json()) as { status?: unknown };
  return typeof data.status === "string" ? data.status : "unknown";
}

export interface RunHappyRobotOptions {
  config: HappyRobotCoordinatorConfig;
  event: { source: string; kind: string; text?: string };
  deps: HappyRobotSessionDeps;
  apply: boolean;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
  registry?: HappyRobotSessionRegistry;
  pollMs?: number;
}

export async function runHappyRobotCoordinator(options: RunHappyRobotOptions): Promise<HappyRobotCoordinatorReport> {
  const { config, deps } = options;
  const registry = options.registry ?? happyrobotSessions;
  const fetchFn = options.fetchFn ?? fetch;
  const started = Date.now();
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const run = deps.states.ensureActiveRun();
  const pending = deps.tasks.listOpen(run.id).map((task) => {
    const payload = isRecord(task.payload) ? task.payload : {};
    return {
      taskId: task.id,
      area: task.area,
      objective: String(payload.objective ?? ""),
      counterpart: String(payload.counterpart ?? ""),
    };
  });
  const input = liveCoordinatorInput(run.state, {
    pendingActions: pending,
    world: worldSummary(deps.world, run.state),
    event: options.event.text === undefined ? { source: options.event.source, kind: options.event.kind } : options.event,
  });
  const correlationId = randomUUID();
  const base: Omit<HappyRobotCoordinatorReport, "status" | "latencyMs" | "consults" | "submissions" | "validationErrors" | "output"> = {
    provider: "happyrobot",
    model: config.model,
    environment: config.environment,
    correlationId,
    happyrobotRunId: null,
    runId: run.id,
    planVersion: run.state.planVersion,
    applied: false,
  };
  const finish = (
    session: Session | undefined,
    status: HappyRobotCoordinatorReport["status"],
    extra: Partial<HappyRobotCoordinatorReport> = {},
  ): HappyRobotCoordinatorReport => {
    const report: HappyRobotCoordinatorReport = {
      ...base,
      status,
      latencyMs: Date.now() - started,
      consults: session?.consults ?? 0,
      submissions: session?.submissions ?? 0,
      validationErrors: session?.validationErrors ?? [],
      output: null,
      ...extra,
    };
    registry.recordReport(report);
    return report;
  };

  let started_: { done: Promise<CoordinatorOutput>; session: Session };
  try {
    started_ = registry.start({
      correlationId,
      runId: run.id,
      planVersion: run.state.planVersion,
      input,
      apply: options.apply,
      deps,
    });
  } catch (error) {
    return finish(undefined, "unavailable", { error: error instanceof Error ? error.message : String(error) });
  }
  const { done, session } = started_;

  try {
    const payload = buildTriggerPayload({
      correlationId,
      runId: run.id,
      planVersion: run.state.planVersion,
      event: options.event,
      input,
      publicBaseUrl: config.publicBaseUrl,
    });
    let happyrobotRunId: string;
    try {
      happyrobotRunId = await triggerRun(config, payload, fetchFn, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logCoordError("happyrobot trigger", message);
      return finish(session, signal.aborted ? "timeout" : "unavailable", { error: message });
    }
    base.happyrobotRunId = happyrobotRunId;
    logCoord("happyrobot run", happyrobotRunId, config.model, options.apply ? "apply" : "shadow");

    let settled: CoordinatorOutput | undefined;
    const settledPromise = done.then((output) => {
      settled = output;
    });
    const pollMs = options.pollMs ?? POLL_MS;
    let lastStatus = "unknown";
    let pollFailures = 0;
    while (!signal.aborted) {
      if (settled) {
        return finish(session, "accepted", { output: settled, applied: options.apply });
      }
      await Promise.race([sleep(pollMs, signal), settledPromise]);
      if (settled) {
        return finish(session, "accepted", { output: settled, applied: options.apply });
      }
      if (signal.aborted) break;
      try {
        lastStatus = await readRunStatus(config, happyrobotRunId, fetchFn, signal);
        pollFailures = 0;
      } catch (error) {
        pollFailures += 1;
        logCoordError("happyrobot poll", error instanceof Error ? error.message : String(error));
        if (pollFailures >= 3) return finish(session, "unavailable", { error: "no puedo leer el estado del run" });
        continue;
      }
      if (TERMINAL_FAILURE.has(lastStatus)) {
        return finish(session, "failed", { error: `run ${lastStatus}` });
      }
      if (TERMINAL_SUCCESS.has(lastStatus)) {
        if (settled) return finish(session, "accepted", { output: settled, applied: options.apply });
        return finish(session, "failed", { error: "run terminado sin submit_plan aceptado" });
      }
    }
    return finish(session, "timeout", { error: `sin plan aceptado en ${config.timeoutMs} ms (último estado: ${lastStatus})` });
  } finally {
    registry.finish(session);
  }
}

export function summarizeReport(report: HappyRobotCoordinatorReport): string {
  const lines = [
    `proveedor: ${report.provider} · modelo: ${report.model} · entorno: ${report.environment}`,
    `run HappyRobot: ${report.happyrobotRunId ?? "sin run"} · correlación: ${report.correlationId}`,
    `estado: ${report.status} · aplicado: ${report.applied ? "sí" : "no"} · latencia: ${(report.latencyMs / 1000).toFixed(1)}s`,
    `consultas: ${report.consults} · envíos: ${report.submissions}`,
  ];
  if (report.error) lines.push(`error: ${report.error}`);
  if (report.validationErrors.length > 0) {
    lines.push("errores de validación:");
    for (const item of report.validationErrors) lines.push(`  - ${item}`);
  }
  if (report.output) {
    lines.push(`lectura: ${report.output.reading}`);
    lines.push(`estado coordinador: ${report.output.coordinatorStatus} · acciones: ${report.output.actions.length} · operaciones: ${(report.output.operations ?? []).length}`);
    for (const action of report.output.actions) lines.push(`  [${action.area}] ${action.objective} — ${action.reason}`);
  }
  return lines.join("\n");
}
