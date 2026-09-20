import type { ChatFn, LlmConfig } from "./llm.js";
import { complete } from "./llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { liveCoordinatorInput } from "./scenario.js";
import type { CoordinatorInput, CoordinatorOutput } from "./types.js";
import { parseOutput } from "./validate.js";
import { applyOperations, persistCoordinatorOutput } from "../../domain/apply-coordinator.js";
import type { WorkflowService } from "../../domain/workflow-service.js";
import type { StateRepository } from "../../state/state-repository.js";
import type { TaskRepository } from "../../state/task-repository.js";
import { worldSummary, type WorldModel } from "../../world/world.js";
import { answerQuery } from "./queries.js";
import { runToolHarness } from "./harness.js";
import { runDevinSession } from "./devin.js";
import { runHappyRobotCoordinator, summarizeReport } from "./happyrobot.js";
import { logCoord, logCoordError } from "../../log.js";

export type CompleteFn = (
  config: LlmConfig,
  system: string,
  user: string,
  options?: { signal?: AbortSignal },
) => Promise<string>;

export interface CoordinatorLoopDeps {
  world: WorldModel;
  states: StateRepository;
  tasks: TaskRepository;
  workflows: WorkflowService;
  config: LlmConfig | undefined;
  completeFn?: CompleteFn;
  chatFn?: ChatFn;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotInput(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
  extra: { queryAnswers: unknown[]; previousErrors: string[] },
): CoordinatorInput {
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
  return liveCoordinatorInput(run.state, {
    pendingActions: pending,
    world: worldSummary(deps.world, run.state),
    event: event.text === undefined ? { source: event.source, kind: event.kind } : event,
    queryAnswers: extra.queryAnswers,
    previousErrors: extra.previousErrors,
  });
}

async function runJsonLoop(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
  signal: AbortSignal,
): Promise<"ok" | "unavailable"> {
  let previousErrors: string[] = [];
  let queryAnswers: unknown[] = [];
  const completeFn = deps.completeFn ?? complete;

  for (let round = 0; round < 3; round += 1) {
    if (signal.aborted) return "unavailable";
    const input = snapshotInput(event, deps, { queryAnswers, previousErrors });
    const ask = () =>
      completeFn(deps.config ?? ({} as LlmConfig), SYSTEM_PROMPT, buildUserPrompt(input), { signal });
    let text: string;
    try {
      text = await ask();
    } catch (error) {
      // Un corte de red del proveedor tira el replan entero: se reintenta una vez antes de rendirse.
      logCoordError("LLM complete() falló", error instanceof Error ? error.message : String(error));
      if (signal.aborted) return "unavailable";
      try {
        text = await ask();
      } catch (retryError) {
        logCoordError(
          "LLM complete() falló también en el reintento",
          retryError instanceof Error ? retryError.message : String(retryError),
        );
        return "unavailable";
      }
    }

    const parsed = parseOutput(text, input);
    if (!parsed.output) {
      previousErrors = parsed.issues.map((issue) => `${issue.code}: ${issue.detail}`);
      logCoordError(`ronda ${round + 1} parse`, previousErrors.join("; "));
      continue;
    }

    const output: CoordinatorOutput = parsed.output;
    const queries = output.queries ?? [];
    queryAnswers = [];
    for (const query of queries) {
      queryAnswers.push(await answerQuery(query, deps.states.ensureActiveRun().state, deps.world));
    }
    const run = deps.states.ensureActiveRun();
    const openTaskIds = new Set(deps.tasks.listOpen(run.id).map((task) => task.id));
    const dryErrors = applyOperations(
      structuredClone(run.state),
      deps.world,
      output.operations ?? [],
      openTaskIds,
    ).errors;
    if (dryErrors.length > 0) {
      previousErrors = dryErrors;
      logCoordError(`ronda ${round + 1} operaciones`, dryErrors.join("; "));
      continue;
    }
    if (output.done === false) {
      previousErrors = [];
      logCoord(`ronda ${round + 1}`, "done false", queries.length > 0 ? `${queries.length} queries` : "sin queries");
      continue;
    }
    if (queries.length > 0) {
      logCoord("aviso", `ronda ${round + 1}: done true con ${queries.length} queries; persisto el plan`);
    }
    try {
      const persistErrors = persistCoordinatorOutput({
        runId: run.id,
        planVersion: run.state.planVersion,
        output,
        world: deps.world,
        workflows: deps.workflows,
        tasks: deps.tasks,
        states: deps.states,
      });
      if (persistErrors.length > 0) {
        previousErrors = persistErrors;
        logCoordError(`ronda ${round + 1} persistir`, persistErrors.join("; "));
        continue;
      }
      return "ok";
    } catch (error) {
      previousErrors = [error instanceof Error ? error.message : String(error)];
      logCoordError(`ronda ${round + 1} persistir`, previousErrors.join("; "));
    }
  }
  logCoordError("bucle agotado", previousErrors.join("; ") || "sin detalle");
  return "unavailable";
}

export async function runCoordinatorLoop(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
): Promise<"ok" | "unavailable"> {
  if (!deps.config && !deps.completeFn) {
    logCoordError("sin config LLM ni completeFn (¿COORDINATOR_MODE=llm sin clave, o loadLlmConfig falló?)");
    return "unavailable";
  }
  if (deps.config?.harness === "happyrobot" && !deps.completeFn) {
    return runHappyRobotHarness(event, deps);
  }
  const timeoutMs = deps.config?.harness === "devin" ? 180_000 : 120_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  logCoord("bucle", deps.config?.provider ?? "mock", deps.config?.harness ?? "json", `tope ${timeoutMs}ms`);
  if (deps.completeFn || !deps.config || deps.config.harness === "json" || deps.config.provider === "anthropic") {
    return runJsonLoop(event, deps, timeout);
  }
  try {
    if (deps.config.harness === "devin") return await runDevinSession(event, deps, timeout);
    return await runToolHarness(event, deps, timeout);
  } catch (error) {
    logCoordError("excepción en harness", error);
    return "unavailable";
  }
}

async function runHappyRobotHarness(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
): Promise<"ok" | "unavailable"> {
  const config = deps.config?.happyrobot;
  if (!config) {
    logCoordError("harness happyrobot sin configuración (HAPPYROBOT_COORDINATOR_WORKFLOW_ID)");
    return "unavailable";
  }
  const state = deps.states.ensureActiveRun().state;
  const apply = config.apply || (state.forceSimActions === true && state.e2eCoordinatorApply === true);
  logCoord("bucle", "happyrobot", config.model, apply ? "apply" : "shadow", `tope ${config.timeoutMs}ms`);
  try {
    const report = await runHappyRobotCoordinator({
      config,
      event,
      deps: { world: deps.world, states: deps.states, tasks: deps.tasks, workflows: deps.workflows },
      apply,
    });
    logCoord("happyrobot informe\n" + summarizeReport(report));
    if (report.status !== "accepted" || !report.applied) return "unavailable";
    return "ok";
  } catch (error) {
    logCoordError("excepción en harness happyrobot", error);
    return "unavailable";
  }
}
