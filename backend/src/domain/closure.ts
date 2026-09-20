import { randomUUID } from "node:crypto";

import type { CrisisStateDocument } from "./crisis-state.js";

/** Un lugar asignable, aunque todavía no esté confirmado. */
const ASSIGNABLE_SPACE: ReadonlySet<string> = new Set(["operativo", "propuesto", "pendiente", "confirmado"]);
const CONFIRMED_SPACE: ReadonlySet<string> = new Set(["operativo", "confirmado"]);
const HOSPITALITY_KIND: ReadonlySet<string> = new Set(["pabellon", "lounge", "espera"]);
/** Compromisos que todavía esperan respuesta de la contraparte. */
const WAITING: ReadonlySet<string> = new Set(["propuesto", "en_consulta"]);
/** Compromisos con respuesta afirmativa, con o sin condiciones abiertas. */
const AGREED: ReadonlySet<string> = new Set(["aceptado_condiciones", "confirmado", "en_ejecucion", "completado"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function clockLabel(simSeconds: number): string {
  const total = Math.max(0, Math.floor(simSeconds)) % 86_400;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export interface ClosureReport {
  closed: boolean;
  /** Nada en marcha y el plan sin terminar: nadie va a mover esto si no se hace algo. */
  stalled: boolean;
  seated: number;
  assigned: number;
  confirmed: number;
  total: number;
  agreed: number;
  pendingConditions: number;
  summary: string;
  /** Qué falta, en una frase, cuando el plan está atascado. */
  gap: string;
}

/**
 * ¿Ha terminado el trabajo? Cierra cuando cada grupo tiene plaza confirmada, cada acuerdo
 * abierto tiene respuesta, no quedan condiciones abiertas y no hay nada en vuelo.
 */
export function evaluateClosure(state: CrisisStateDocument, openTasks: number): ClosureReport {
  const spaces = new Map(state.spaces.map((space) => [space.id, space]));
  const groups = records(state, "guestGroups");
  const total = groups.reduce((sum, group) => sum + Number(group.count ?? 0), 0);
  const currentAssignments = records(state, "assignments").filter((item) => item.planVersion === state.planVersion);
  const assignedGroups = groups.map((group) => {
    const count = Math.max(0, Number(group.count ?? 0));
    const confirmedCount = Math.min(count, Math.max(0, Number(group.confirmedCount ?? 0)));
    const proposed = currentAssignments.filter((item) => item.groupId === group.id).map((item) => ({
      space: spaces.get(String(item.spaceId)),
      count: Math.max(0, Number(item.count ?? 0)),
    }));
    const legacySpace = typeof group.assignedSpaceId === "string" ? spaces.get(String(group.assignedSpaceId)) : undefined;
    const placements = proposed.length > 0 ? proposed : legacySpace ? [{ space: legacySpace, count }] : [];
    const assignedCount = Math.min(count, placements.filter((item) => item.space && HOSPITALITY_KIND.has(String(item.space.kind)) && ASSIGNABLE_SPACE.has(String(item.space.status))).reduce((sum, item) => sum + item.count, 0));
    const confirmedCapacity = placements.filter((item) => item.space && HOSPITALITY_KIND.has(String(item.space.kind)) && CONFIRMED_SPACE.has(String(item.space.status))).reduce((sum, item) => sum + item.count, 0);
    return {
      group,
      count,
      confirmedCount: placements.length === 0 ? confirmedCount : Math.min(confirmedCount, confirmedCapacity),
      assignedCount: placements.length === 0 ? confirmedCount : assignedCount,
      placements,
    };
  });
  const assigned = assignedGroups.reduce((sum, item) => sum + item.assignedCount, 0);
  const confirmed = assignedGroups.reduce((sum, item) => sum + item.confirmedCount, 0);

  const occupancy = new Map<string, number>();
  for (const item of assignedGroups) {
    for (const placement of item.placements) {
      if (placement.space && placement.count > 0) occupancy.set(placement.space.id, (occupancy.get(placement.space.id) ?? 0) + placement.count);
    }
  }
  const capacityGaps = [...occupancy.entries()]
    .filter(([id, count]) => {
      const capacity = spaces.get(id)?.capacity;
      return typeof capacity !== "number" || !Number.isFinite(capacity) || count > capacity;
    })
    .map(([id, count]) => `${id} ${count}/${Number(spaces.get(id)?.capacity ?? 0)}`);
  const assignedZones = new Set(assignedGroups.flatMap((item) => item.placements.filter((placement) => placement.count > 0 && placement.space).map((placement) => placement.space!.zone)));
  const accessGaps = [...assignedZones].filter((zone) =>
    !state.spaces.some((space) => space.kind === "acceso" && space.zone === zone && CONFIRMED_SPACE.has(String(space.status))),
  );

  const current = state.commitments.filter((commitment) => commitment.planVersion === state.planVersion);
  const agreed = current.filter((commitment) => AGREED.has(commitment.status));
  const waiting = current.filter((commitment) => WAITING.has(commitment.status));
  const conditions = agreed.flatMap((commitment) =>
    Array.isArray(commitment.conditions)
      ? commitment.conditions.filter((condition): condition is string => typeof condition === "string" && condition.trim() !== "")
      : [],
  );
  const pendingConditions = conditions.length;

  const callsInFlight = records(state, "calls").some((call) => call.status === "en_curso");
  const pendingDecision =
    Boolean(state.waitingForDecision) ||
    records(state, "decisions").some((decision) => decision.status === "pendiente");

  const quiet = openTasks === 0 && !callsInFlight && state.agentsPaused !== true;
  const closed = total > 0 && assigned === total && confirmed === total && capacityGaps.length === 0 &&
    accessGaps.length === 0 && agreed.length > 0 && waiting.length === 0 && pendingConditions === 0 &&
    quiet && !pendingDecision;
  const stalled = !closed && quiet && !pendingDecision;
  const gaps: string[] = [];
  if (assigned < total) {
    const homeless = assignedGroups
      .filter((item) => item.assignedCount < item.count)
      .map((item) => `${String(item.group.name ?? item.group.id)} (${item.count - item.assignedCount})`);
    gaps.push(`${total - assigned} invitados sin sede asignada: ${homeless.join(", ")}`);
  }
  if (confirmed < total) gaps.push(`${total - confirmed} invitados sin plaza confirmada`);
  if (pendingConditions > 0) {
    gaps.push(`${pendingConditions} ${pendingConditions === 1 ? "condición abierta" : "condiciones abiertas"}: ${conditions.join("; ")}`);
  }
  if (waiting.length > 0 && quiet) {
    gaps.push(`${waiting.length} ${waiting.length === 1 ? "compromiso sin consulta activa" : "compromisos sin consulta activa"}: ${waiting.map((item) => item.title).join("; ")}`);
  }
  if (capacityGaps.length > 0) gaps.push(`aforo insuficiente: ${capacityGaps.join(", ")}`);
  if (accessGaps.length > 0) gaps.push(`${accessGaps.map((zone) => `acceso ${String(zone)[0]!.toUpperCase()}${String(zone).slice(1)} no operativo`).join(", ")}`);
  const gap = gaps.length > 0 ? `${gaps.join(" · ")}. No queda ninguna consulta en marcha.` : "";

  const cost = state.budget.committed > 0 ? state.budget.committed : state.budget.forecast;
  const costLabel = typeof cost === "number" && cost > 0 ? `${cost.toLocaleString("es-ES")} €` : "sin estimar";
  const summary =
    `Plan cerrado a las ${clockLabel(Number(state.clock.simSeconds))} · ${confirmed} de ${total} invitados con plaza confirmada · ` +
    `${assigned} con sede asignada · ${agreed.length} ${agreed.length === 1 ? "acuerdo aceptado" : "acuerdos aceptados"} · coste ${costLabel}`;

  return { closed, stalled, seated: assigned, assigned, confirmed, total, agreed: agreed.length, pendingConditions, summary, gap };
}

/**
 * Deja el cierre reflejado en el estado. Devuelve el estado nuevo solo si algo cambia, para
 * no reescribir el documento en cada evento.
 */
export function applyClosure(state: CrisisStateDocument, openTasks: number): CrisisStateDocument | undefined {
  const report = evaluateClosure(state, openTasks);
  const wasClosed = state.resolved === true;
  const wasStalled = state.coordinatorStatus === "atascado";
  const stuck = report.stalled && report.gap !== "";
  // El resumen solo vale mientras vale su desenlace: si ya no hay ni cierre ni atasco, se
  // borra, o el panel sigue enseñando un «Plan cerrado» que ya no es verdad.
  const staleSummary = state.closureSummary !== undefined && !report.closed && !stuck;
  if (report.closed === wasClosed && stuck === wasStalled && !staleSummary) return undefined;

  const next = structuredClone(state);
  next.resolved = report.closed;
  if (report.closed) {
    next.coordinatorStatus = "estable";
    next.closureSummary = report.summary;
    pushEvent(next, "acuerdo", report.summary);
    return next;
  }
  delete next.closureSummary;
  if (stuck) {
    // Decirlo en pantalla: un «replanificando» eterno con gente sin sede es mentira.
    next.coordinatorStatus = "atascado";
    next.closureSummary = report.gap;
    if (!wasStalled) pushEvent(next, "espera", `Plan incompleto · ${report.gap}`);
  } else if (wasStalled) {
    next.coordinatorStatus = "replanificando";
  }
  return next;
}

function pushEvent(state: CrisisStateDocument, kind: string, text: string): void {
  const events = records(state, "events");
  events.push({ id: `closure-${randomUUID()}`, time: state.clock.simSeconds, kind, text });
  state.events = events.slice(-80);
}
