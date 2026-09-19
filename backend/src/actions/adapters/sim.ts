import { guessGroupId } from "../../agents/attendees/extract.js";
import type { SpecialistResultEnvelope } from "../../contracts/api.js";
import type { DispatchTask } from "../../state/task-repository.js";

function attendeesData(
  task: DispatchTask,
  payload: Record<string, unknown>,
  groups: Record<string, unknown>[] | undefined,
): Record<string, unknown> {
  if (task.area !== "asistentes" || !groups) return {};
  const data = typeof payload.data === "object" && payload.data !== null ? (payload.data as Record<string, unknown>) : {};
  const groupId = typeof data.groupId === "string"
    ? data.groupId
    : guessGroupId(`${String(payload.counterpart ?? "")} ${String(payload.objective ?? "")}`);
  const group = groups.find((item) => item.id === groupId);
  if (!group || typeof group.count !== "number") return {};
  const delivered = Math.max(0, group.count - Math.floor(group.count * 0.05));
  return { guestGroups: [{ id: group.id, informedCount: delivered, acceptedCount: delivered }] };
}

export function scheduleSimResult(input: {
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  eventId: string;
  guestGroups?: Record<string, unknown>[];
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
      data: attendeesData(input.task, payload, input.guestGroups),
    },
  };
}
