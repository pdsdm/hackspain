import { createHash } from "node:crypto";

import { isRecord } from "../contracts/api.js";
import type { DispatchTask } from "../state/task-repository.js";
import type { CrisisStateDocument } from "./crisis-state.js";

export interface AcceptanceScores {
  acceptsTargetExplicitly: number;
  answerMatchesTarget: number;
  hasUnresolvedConditions: number;
}

export interface VerificationTarget {
  commitmentId: string;
  resourceType: "space";
  resourceId: string;
}

export const DEMO_TARGET: VerificationTarget = {
  commitmentId: "c-pabB", resourceType: "space", resourceId: "pabellonB",
};
export const DEMO_COMMITMENT_TITLE = "Reserva de Pabellón B · 450 plazas";
const RESERVATION_CONDITIONS = new Set(["Confirmación de reserva", "Confirmar reserva"]);

export type AcceptanceDecision = "keep_conditional" | "confirm_target";

export function decideAcceptance(scores: AcceptanceScores): AcceptanceDecision {
  return [scores.acceptsTargetExplicitly, scores.answerMatchesTarget, scores.hasUnresolvedConditions]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
    scores.acceptsTargetExplicitly >= 0.95 &&
    scores.answerMatchesTarget >= 0.95 &&
    scores.hasUnresolvedConditions <= 0.1
    ? "confirm_target"
    : "keep_conditional";
}

export function readVerificationTarget(payload: unknown): VerificationTarget | undefined {
  if (!isRecord(payload) || !isRecord(payload.verificationTarget)) return undefined;
  const target = payload.verificationTarget;
  return target.commitmentId === DEMO_TARGET.commitmentId &&
    target.resourceType === DEMO_TARGET.resourceType && target.resourceId === DEMO_TARGET.resourceId
    ? { ...DEMO_TARGET } : undefined;
}

export function verificationSnapshot(state: CrisisStateDocument): string {
  const commitment = state.commitments.find((item) => item.id === DEMO_TARGET.commitmentId);
  const space = state.spaces.find((item) => item.id === DEMO_TARGET.resourceId);
  return createHash("sha256").update(JSON.stringify({
    planVersion: state.planVersion,
    title: commitment?.title,
    conditions: commitment?.conditions,
    capacity: space?.capacity,
    readyAt: space?.readyAt,
    note: space?.note,
    forecast: state.budget.forecast,
    constraints: state.constraints,
  })).digest("hex");
}

export function confirmationBlocker(state: CrisisStateDocument, task: DispatchTask): string | undefined {
  const payload = isRecord(task.payload) ? task.payload : {};
  if (!readVerificationTarget(payload) || task.area !== "espacios" || task.kind !== "call") return "target_no_admitido";
  if (!["dispatching", "dispatched", "unknown"].includes(task.status)) return "tarea_no_vigente";
  const commitment = state.commitments.find((item) => item.id === DEMO_TARGET.commitmentId);
  const space = state.spaces.find((item) => item.id === DEMO_TARGET.resourceId);
  if (task.planVersion !== state.planVersion || commitment?.planVersion !== state.planVersion ||
    commitment?.area !== "espacios" || commitment.title !== DEMO_COMMITMENT_TITLE ||
    !["propuesto", "en_consulta", "aceptado_condiciones"].includes(commitment.status)) return "compromiso_no_vigente";
  if (space?.zone !== "sur" || space.capacity !== 450 ||
    !["propuesto", "pendiente", "confirmado"].includes(String(space.status))) return "recurso_no_disponible";
  if (payload.verificationSnapshot !== verificationSnapshot(state)) return "terminos_modificados";
  if (state.waitingForDecision || state.decisions.some((item) => item.status === "pendiente")) return "decision_pendiente";
  const { forecast, authorized, committed } = state.budget;
  if (typeof forecast !== "number" || !Number.isFinite(forecast) || forecast < 0 ||
    forecast > authorized || committed > authorized) return "gasto_no_autorizado";
  const access = state.spaces.find((item) => item.id === "accesoSur");
  if (!access || !["operativo", "confirmado"].includes(String(access.status))) return "acceso_pendiente";
  if (!Array.isArray(commitment.conditions) || commitment.conditions.some((condition) =>
    typeof condition !== "string" || (!RESERVATION_CONDITIONS.has(condition) && condition !== "Autorización de gasto"))) {
    return "condiciones_pendientes";
  }
  return undefined;
}

export function resolvedConditions(conditions: unknown): string[] {
  return Array.isArray(conditions) ? conditions.filter((condition): condition is string =>
    typeof condition === "string" && !RESERVATION_CONDITIONS.has(condition) && condition !== "Autorización de gasto") : [];
}
