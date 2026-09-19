import type { LlmConfig } from "./llm.js";
import { complete } from "./llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { liveCoordinatorInput } from "./scenario.js";
import type { CoordinatorInput, CoordinatorOutput, CoordinatorQuery } from "./types.js";
import { parseOutput } from "./validate.js";
import { applyOperations, persistCoordinatorOutput } from "../../domain/apply-coordinator.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import type { WorkflowService } from "../../domain/workflow-service.js";
import type { StateRepository } from "../../state/state-repository.js";
import type { TaskRepository } from "../../state/task-repository.js";
import {
  affectedBy,
  alternativesFor,
  etaFor,
  worldSummary,
  type WorldModel,
} from "../../world/world.js";

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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function answerQuery(
  query: CoordinatorQuery,
  state: CrisisStateDocument,
  world: WorldModel,
): unknown {
  if (query.type === "affected_by") return affectedBy(state, world, query.placeId);
  if (query.type === "alternatives_for") {
    return alternativesFor(world, state, query.placeId, query.minCapacity);
  }
  const shuttle = records(state, "shuttles").find((item) => item.id === query.vehicleId);
  const delivery = records(state, "deliveries").find((item) => item.id === query.vehicleId);
  const vehicle = shuttle ?? delivery;
  if (!vehicle) return { error: `vehículo desconocido ${query.vehicleId}` };
  const dockId = typeof vehicle.dockId === "string" ? vehicle.dockId : undefined;
  return etaFor(
    world,
    {
      origin: String(vehicle.origin ?? (delivery ? "Coslada" : "")),
      destinationId: String(vehicle.destinationId ?? vehicle.dockId ?? ""),
      ...(dockId ? { dockId } : {}),
      departAt: Number(vehicle.departAt ?? state.clock.simSeconds),
      delayMin: Number(vehicle.delayMin ?? 0),
    },
    query.destinationId,
    Number(state.clock.simSeconds),
  );
}

export async function runCoordinatorLoop(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
): Promise<"ok" | "unavailable"> {
  if (!deps.config && !deps.completeFn) return "unavailable";
  const timeout = AbortSignal.timeout(60_000);
  let previousErrors: string[] = [];
  let queryAnswers: unknown[] = [];
  const completeFn = deps.completeFn ?? complete;

  for (let round = 0; round < 3; round += 1) {
    if (timeout.aborted) return "unavailable";
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
    const input: CoordinatorInput = liveCoordinatorInput(run.state, {
      pendingActions: pending,
      world: worldSummary(deps.world, run.state),
      event: event.text === undefined ? { source: event.source, kind: event.kind } : event,
      queryAnswers,
      previousErrors,
    });
    let text: string;
    try {
      text = await completeFn(deps.config ?? ({} as LlmConfig), SYSTEM_PROMPT, buildUserPrompt(input), {
        signal: timeout,
      });
    } catch {
      return "unavailable";
    }

    const parsed = parseOutput(text, input);
    if (!parsed.output) {
      previousErrors = parsed.issues.map((issue) => `${issue.code}: ${issue.detail}`);
      continue;
    }

    const output: CoordinatorOutput = parsed.output;
    queryAnswers = (output.queries ?? []).map((query) => answerQuery(query, run.state, deps.world));
    const openTaskIds = new Set(deps.tasks.listOpen(run.id).map((task) => task.id));
    const dryErrors = applyOperations(
      structuredClone(run.state),
      deps.world,
      output.operations ?? [],
      openTaskIds,
    ).errors;
    if (dryErrors.length > 0) {
      previousErrors = dryErrors;
      continue;
    }
    if (output.done === false || (output.queries ?? []).length > 0) {
      previousErrors = [];
      continue;
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
        continue;
      }
      return "ok";
    } catch (error) {
      previousErrors = [error instanceof Error ? error.message : String(error)];
    }
  }
  return "unavailable";
}
