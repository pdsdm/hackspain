import { randomUUID } from "node:crypto";

import type { CrisisStateDocument } from "./crisis-state.js";

/** Un lugar donde de verdad se puede meter gente. */
const USABLE_SPACE: ReadonlySet<string> = new Set(["operativo", "propuesto", "pendiente", "confirmado"]);
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
  total: number;
  agreed: number;
  pendingConditions: number;
  summary: string;
  /** Qué falta, en una frase, cuando el plan está atascado. */
  gap: string;
}

/**
 * ¿Ha terminado el trabajo? Cierra cuando cada grupo tiene sede, cada acuerdo abierto tiene
 * respuesta y no queda nada en vuelo. No exige que no haya condiciones pendientes: las
 * cuenta y las dice, porque una recuperación honesta puede dejar flecos.
 */
export function evaluateClosure(state: CrisisStateDocument, openTasks: number): ClosureReport {
  const spaces = new Map(state.spaces.map((space) => [space.id, space]));
  const groups = records(state, "guestGroups");
  const total = groups.reduce((sum, group) => sum + Number(group.count ?? 0), 0);
  const seated = groups.reduce((sum, group) => {
    const space = typeof group.assignedSpaceId === "string" ? spaces.get(group.assignedSpaceId) : undefined;
    return sum + (space && USABLE_SPACE.has(String(space.status)) ? Number(group.count ?? 0) : 0);
  }, 0);

  const current = state.commitments.filter((commitment) => commitment.planVersion === state.planVersion);
  const agreed = current.filter((commitment) => AGREED.has(commitment.status));
  const waiting = current.filter((commitment) => WAITING.has(commitment.status));
  const pendingConditions = agreed.reduce(
    (sum, commitment) => sum + (Array.isArray(commitment.conditions) ? commitment.conditions.length : 0),
    0,
  );

  const callsInFlight = records(state, "calls").some((call) => call.status === "en_curso");
  const pendingDecision =
    Boolean(state.waitingForDecision) ||
    records(state, "decisions").some((decision) => decision.status === "pendiente");

  const quiet = openTasks === 0 && !callsInFlight && state.agentsPaused !== true;
  const closed = total > 0 && seated === total && agreed.length > 0 && waiting.length === 0 && quiet && !pendingDecision;
  // Atascado: no queda nada en marcha y sin embargo el plan no está terminado.
  const stalled = !closed && quiet && !pendingDecision && waiting.length === 0 && seated < total;
  const homeless = groups
    .filter((group) => {
      const space = typeof group.assignedSpaceId === "string" ? spaces.get(group.assignedSpaceId) : undefined;
      return !space || !USABLE_SPACE.has(String(space.status));
    })
    .map((group) => `${String(group.name ?? group.id)} (${Number(group.count ?? 0)})`);
  const gap = homeless.length > 0
    ? `${total - seated} invitados sin sede: ${homeless.join(", ")}. No queda ninguna consulta en marcha.`
    : "";

  const cost = state.budget.committed > 0 ? state.budget.committed : state.budget.forecast;
  const costLabel = typeof cost === "number" && cost > 0 ? `${cost.toLocaleString("es-ES")} €` : "sin estimar";
  const summary =
    `Plan cerrado a las ${clockLabel(Number(state.clock.simSeconds))} · ${seated} de ${total} invitados con sede · ` +
    `${agreed.length} ${agreed.length === 1 ? "acuerdo aceptado" : "acuerdos aceptados"} · ` +
    `${pendingConditions} ${pendingConditions === 1 ? "condición pendiente" : "condiciones pendientes"} · coste ${costLabel}`;

  return { closed, stalled, seated, total, agreed: agreed.length, pendingConditions, summary, gap };
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
