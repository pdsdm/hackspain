import { getJson } from "./llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { liveCoordinatorInput } from "./scenario.js";
import { parseOutput } from "./validate.js";
import { persistCoordinatorOutput } from "../../domain/apply-coordinator.js";
import type { CoordinatorLoopDeps } from "./loop.js";
import { worldSummary } from "../../world/world.js";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    reading: { type: "string" },
    planVersion: { type: "number" },
    coordinatorStatus: { type: "string" },
    actions: { type: "array" },
    commitments: { type: "array" },
    assignments: { type: "array" },
    decision: {},
    unverified: { type: "array", items: { type: "string" } },
    operations: { type: "array" },
    queries: { type: "array" },
    done: { type: "boolean" },
  },
  required: ["reading", "planVersion", "coordinatorStatus", "actions", "commitments", "assignments", "unverified"],
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runDevinSession(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
  signal: AbortSignal,
): Promise<"ok" | "unavailable"> {
  const config = deps.config;
  const orgId = config?.orgId;
  if (!config || !orgId) return "unavailable";

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
    event: event.text === undefined ? { source: event.source, kind: event.kind } : event,
  });
  const prompt = `${SYSTEM_PROMPT}

${buildUserPrompt(input)}

Usa el harness de Devin. Actualiza el structured output con el JSON del coordinador (operations + done true) en cuanto tengas un plan válido. No clones repos ni edites código: solo razona el plan de crisis.`;

  const created = (await fetch(`${config.sessionApiUrl}/organizations/${orgId}/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      title: "MADRING coordinador",
      tags: ["madring", "coordinator"],
      devin_mode: config.devinMode,
      structured_output_schema: OUTPUT_SCHEMA,
      structured_output_required: true,
    }),
    signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return response.json();
  })) as { session_id?: string; sessionId?: string };

  const sessionId = created.session_id ?? created.sessionId;
  if (!sessionId) return "unavailable";

  while (!signal.aborted) {
    const session = (await getJson(
      `${config.sessionApiUrl}/organizations/${orgId}/sessions/${sessionId}`,
      config.apiKey,
      signal,
    )) as Record<string, unknown>;
    const output =
      session.structured_output ??
      (isRecord(session.structuredOutput) ? session.structuredOutput : undefined);
    if (output !== undefined && output !== null) {
      const parsed = parseOutput(typeof output === "string" ? output : JSON.stringify(output), input);
      if (parsed.output) {
        const persistErrors = persistCoordinatorOutput({
          runId: deps.states.ensureActiveRun().id,
          planVersion: deps.states.ensureActiveRun().state.planVersion,
          output: parsed.output,
          world: deps.world,
          workflows: deps.workflows,
          tasks: deps.tasks,
          states: deps.states,
        });
        if (persistErrors.length === 0) return "ok";
      }
    }
    const status = String(session.status ?? "");
    if (status === "exit" || status === "error" || status === "suspended") break;
    try {
      await sleep(4_000, signal);
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}
