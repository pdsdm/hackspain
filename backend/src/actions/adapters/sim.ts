import { guessGroupId } from "../../agents/attendees/extract.js";
import { guessDeliveryId } from "../../agents/catering/extract.js";
import type { SpecialistResultEnvelope } from "../../contracts/api.js";
import type { DispatchTask } from "../../state/task-repository.js";
import type { SimReply } from "./sim-world.js";

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

function cateringData(
  task: DispatchTask,
  payload: Record<string, unknown>,
  deliveries: Record<string, unknown>[] | undefined,
  spaces: Record<string, unknown>[] | undefined,
): Record<string, unknown> {
  if (task.area !== "catering" || !deliveries) return {};
  const data = typeof payload.data === "object" && payload.data !== null ? (payload.data as Record<string, unknown>) : {};
  const mentioned = typeof data.deliveryId === "string"
    ? data.deliveryId
    : guessDeliveryId(`${String(payload.counterpart ?? "")} ${String(payload.objective ?? "")}`);
  const pending = deliveries.filter((item) => item.status !== "entregada");
  const targets = mentioned ? pending.filter((item) => item.id === mentioned) : pending;
  if (targets.length === 0) return {};
  const updates = targets.map((delivery) => {
    const dock = spaces?.find((item) => item.id === delivery.dockId);
    const dockClosed = dock !== undefined && (dock.status === "cerrado" || dock.status === "descartado");
    return dockClosed
      ? { id: delivery.id, status: "bloqueada", note: "Simulado: el proveedor no puede descargar en un muelle cerrado" }
      : { id: delivery.id, status: "confirmada", note: "Simulado: el proveedor confirma la entrega en el muelle asignado" };
  });
  return { deliveries: updates };
}

export function scheduleSimResult(input: {
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  eventId: string;
  guestGroups?: Record<string, unknown>[];
  deliveries?: Record<string, unknown>[];
  spaces?: Record<string, unknown>[];
  reply?: SimReply;
}): SpecialistResultEnvelope {
  const payload = typeof input.task.payload === "object" && input.task.payload !== null
    ? (input.task.payload as Record<string, unknown>)
    : {};
  const reply: SimReply = input.reply ?? {
    outcome: "accepted_with_conditions",
    summary: `Simulado: ${String(payload.counterpart ?? "la contraparte")} acepta con condiciones.`,
    conditions: ["Verificación pendiente en campo"],
    transcript: [
      { who: "agente", text: String(payload.objective ?? "Confirmar situación"), at: 5 },
      { who: "humano", text: "De acuerdo, con las condiciones habituales.", at: 18 },
    ],
  };
  const positive = reply.outcome === "accepted" || reply.outcome === "accepted_with_conditions";
  return {
    eventId: input.eventId,
    taskId: input.task.id,
    runId: input.runId,
    planVersion: input.planVersion,
    status: reply.outcome === "no_answer" ? "no_answer" : "completed",
    result: {
      outcome: reply.outcome,
      summary: reply.summary,
      conditions: reply.conditions,
      evidence: {
        callId: input.callId,
        transcript: reply.transcript,
      },
      data: positive
        ? {
            ...attendeesData(input.task, payload, input.guestGroups),
            ...cateringData(input.task, payload, input.deliveries, input.spaces),
          }
        : {},
    },
  };
}
