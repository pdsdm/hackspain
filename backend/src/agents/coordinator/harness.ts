import { chat, type ChatMessage, type ChatTool } from "./llm.js";
import { TOOL_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { liveCoordinatorInput } from "./scenario.js";
import type { CoordinatorLoopDeps } from "./loop.js";
import { parseOutput } from "./validate.js";
import { applyOperations, persistCoordinatorOutput } from "../../domain/apply-coordinator.js";
import { answerQuery, parseConsultArgs } from "./queries.js";
import { worldSummary } from "../../world/world.js";

const TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "consult_world",
      description: "Consulta geografía y afectados antes de operar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["affected_by", "alternatives_for", "route"] },
          placeId: { type: "string" },
          minCapacity: { type: "number" },
          vehicleId: { type: "string" },
          fromId: { type: "string", description: "Origen libre: id del mundo, nombre o dirección. Se geocodifica si no está en el recinto." },
          destinationId: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_plan",
      description: "Entrega el plan del coordinador (CoordinatorOutput) para validar y aplicar.",
      parameters: {
        type: "object",
        additionalProperties: true,
        properties: {
          reading: { type: "string" },
          planVersion: { type: "number" },
          coordinatorStatus: { type: "string" },
          done: { type: "boolean" },
        },
        required: ["reading", "planVersion", "coordinatorStatus"],
      },
    },
  },
];

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("JSON inválido");
  }
}

export async function runToolHarness(
  event: { source: string; kind: string; text?: string },
  deps: CoordinatorLoopDeps,
  signal: AbortSignal,
): Promise<"ok" | "unavailable"> {
  const config = deps.config;
  if (!config) return "unavailable";
  const chatFn = deps.chatFn ?? chat;
  const run = deps.states.ensureActiveRun();
  const pending = deps.tasks.listOpen(run.id).map((task) => {
    const payload = task.payload && typeof task.payload === "object" ? (task.payload as Record<string, unknown>) : {};
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
  const messages: ChatMessage[] = [
    { role: "system", content: TOOL_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  for (let step = 0; step < 8; step += 1) {
    if (signal.aborted) return "unavailable";
    let result;
    try {
      result = await chatFn(config, messages, { tools: TOOLS, signal });
    } catch {
      return "unavailable";
    }

    if (result.tool_calls.length === 0) {
      if (!result.content) return "unavailable";
      const parsed = parseOutput(result.content, input);
      if (!parsed.output) {
        messages.push({ role: "assistant", content: result.content });
        messages.push({
          role: "user",
          content: `Errores: ${parsed.issues.map((issue) => issue.detail).join("; ")}. Usa submit_plan.`,
        });
        continue;
      }
      const persistErrors = await persistCoordinatorOutput({
        runId: run.id,
        planVersion: deps.states.ensureActiveRun().state.planVersion,
        output: parsed.output,
        world: deps.world,
        workflows: deps.workflows,
        tasks: deps.tasks,
        states: deps.states,
      });
      if (persistErrors.length === 0) return "ok";
      messages.push({ role: "assistant", content: result.content });
      messages.push({ role: "user", content: `Errores de regla: ${persistErrors.join("; ")}` });
      continue;
    }

    messages.push({
      role: "assistant",
      content: result.content ?? "",
      tool_calls: result.tool_calls,
    });

    const live = deps.states.ensureActiveRun();
    for (const call of result.tool_calls) {
      let payload: unknown;
      try {
        payload = parseJson(call.function.arguments);
      } catch {
        payload = { error: "argumentos no JSON" };
      }

      let toolContent: unknown;
      if (call.function.name === "consult_world") {
        const query = parseConsultArgs(payload);
        toolContent = "error" in query ? query : await answerQuery(query, live.state, deps.world);
      } else if (call.function.name === "submit_plan") {
        const parsed = parseOutput(typeof payload === "string" ? payload : JSON.stringify(payload), input);
        if (!parsed.output) {
          toolContent = { ok: false, errors: parsed.issues.map((issue) => `${issue.code}: ${issue.detail}`) };
        } else {
          const openTaskIds = new Set(deps.tasks.listOpen(live.id).map((task) => task.id));
          const dry = (await applyOperations(
            structuredClone(live.state),
            deps.world,
            parsed.output.operations ?? [],
            openTaskIds,
          )).errors;
          if (dry.length > 0) {
            toolContent = { ok: false, errors: dry };
          } else {
            const persistErrors = await persistCoordinatorOutput({
              runId: live.id,
              planVersion: live.state.planVersion,
              output: parsed.output,
              world: deps.world,
              workflows: deps.workflows,
              tasks: deps.tasks,
              states: deps.states,
            });
            if (persistErrors.length > 0) {
              toolContent = { ok: false, errors: persistErrors };
            } else {
              return "ok";
            }
          }
        }
      } else {
        toolContent = { error: `herramienta desconocida ${call.function.name}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(toolContent),
      });
    }
  }
  return "unavailable";
}
