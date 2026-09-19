import type { SpecialistResultEnvelope } from "../../contracts/api.js";
import type { DispatchTask } from "../../state/task-repository.js";

export function scheduleSimResult(input: {
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  eventId: string;
}): SpecialistResultEnvelope {
  const payload = typeof input.task.payload === "object" && input.task.payload !== null
    ? (input.task.payload as Record<string, unknown>)
    : {};
  return {
    eventId: input.eventId,
    taskId: input.task.id,
    runId: input.runId,
    planVersion: input.planVersion,
    status: "completed",
    result: {
      outcome: "accepted_with_conditions",
      summary: `Simulado: ${String(payload.counterpart ?? "la contraparte")} acepta con condiciones.`,
      conditions: ["Verificación pendiente en campo"],
      evidence: {
        callId: input.callId,
        transcript: [
          { who: "agente", text: String(payload.objective ?? "Confirmar situación"), at: 5 },
          { who: "humano", text: "De acuerdo, con las condiciones habituales.", at: 18 },
        ],
      },
      data: {},
    },
  };
}
