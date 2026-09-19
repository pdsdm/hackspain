import { createHash } from "node:crypto";

import { JevHttpError } from "../agents/jev.js";
import { qualifiesForLounge, ROUTING_TIMEOUT_MS, type RoutingEvaluate, type RoutingEvaluation } from "../agents/jev-routing.js";
import { buildReplan } from "../agents/coordinator/replan.js";
import { liveCoordinatorInput } from "../agents/coordinator/scenario.js";
import { validateOutput } from "../agents/coordinator/validate.js";
import type { CoordinatorOutput } from "../agents/coordinator/types.js";
import { isRecord } from "../contracts/api.js";
import type { CrisisDatabase } from "../state/database.js";
import { StateRepository } from "../state/state-repository.js";
import { TaskRepository } from "../state/task-repository.js";
import { EventRepository } from "../state/event-repository.js";
import { loadWorld } from "../world/world.js";
import { applyOperations, persistReplan } from "./apply-coordinator.js";
import { applyTwistEffect } from "./control-service.js";
import type { CrisisStateDocument } from "./crisis-state.js";

export const PLAYBOOK_VERSION = "lounge-loss-v1";
export interface PilotContext { runId: string; state: CrisisStateDocument; openTaskIds: string[] }
export interface PilotEvent { id: string; kind: "free_text" | "lounge_unavailable"; text?: string }
export interface PreparedPlaybook { runId: string; eventId: string; fingerprint: string; version: typeof PLAYBOOK_VERSION }
export interface PilotDecision {
  route: "playbook" | "llm" | "noop";
  via: "direct" | "jev" | "guard";
  reason: string;
  latencyMs: number;
  evaluation?: RoutingEvaluation;
  prepared?: PreparedPlaybook;
}

const rows = (state: CrisisStateDocument, key: string) => Array.isArray(state[key]) ? state[key].filter(isRecord) : [];

export function readPilotContext(database: CrisisDatabase): PilotContext {
  const run = new StateRepository(database.connection).getActiveRun();
  if (!run) throw new Error("pilot_no_active_run");
  const open = database.connection.prepare("SELECT id FROM dispatch_tasks WHERE run_id = ? AND status IN ('pending', 'dispatching', 'dispatched', 'unknown')").all(run.id);
  return { runId: run.id, state: run.state, openTaskIds: open.map((row) => String(row.id)).sort() };
}

export function pilotFingerprint(context: PilotContext): string {
  const { state } = context;
  return createHash("sha256").update(JSON.stringify({
    runId: context.runId, version: state.planVersion, spaces: state.spaces, commitments: state.commitments,
    groups: state.guestGroups, shuttles: state.shuttles, deliveries: state.deliveries,
    constraints: state.constraints, decisions: state.decisions, waiting: state.waitingForDecision,
    paused: state.agentsPaused, busy: state.coordinatorBusy, status: state.coordinatorStatus,
    incidents: state.incidentsApplied, twists: state.twistsApplied, open: context.openTaskIds,
    openingAt: state.clock.openingAt,
  })).digest("hex");
}

export function loungeGuard(context: PilotContext): string | null {
  const { state } = context;
  if (state.agentsPaused) return "agents_paused";
  if (state.waitingForDecision || state.decisions.some((d) => d.status === "pendiente")) return "operational_decision_pending";
  if (state.coordinatorBusy || state.coordinatorStatus !== "estable") return "coordinator_not_stable";
  if (state.rejectedPlanVersion === state.planVersion) return "plan_rejected";
  if (context.openTaskIds.length || rows(state, "calls").some((call) => call.status === "en_curso")) return "tasks_in_flight";
  if (!Array.isArray(state.twistsApplied) || state.twistsApplied.length ||
    (Array.isArray(state.incidentsApplied) && state.incidentsApplied.length)) return "other_incident";
  if (!Array.isArray(state.constraints) || state.constraints.some((c) => c !== "Norte y Sur sin conexión interior")) return "unknown_constraint";
  if (!Number.isFinite(state.clock.simSeconds) || typeof state.clock.openingAt !== "number" ||
    state.clock.simSeconds >= state.clock.openingAt) return "outside_time_window";
  const get = (id: string) => state.spaces.find((s) => s.id === id);
  if (get("principal")?.status !== "cerrado") return "not_recovered_south_plan";
  const pavilion = get("pabellonB"), lounge = get("loungeSur"), north = get("norteC");
  if (pavilion?.status !== "confirmado" || pavilion.capacity !== 450 || pavilion.zone !== "sur" ||
    lounge?.status !== "confirmado" || lounge.capacity !== 150 || lounge.zone !== "sur") return "south_plan_changed";
  if (!north || north.zone !== "norte" || (north.capacity ?? 0) < 150 ||
    !["inactivo", "propuesto", "pendiente", "confirmado"].includes(String(north.status)) ||
    typeof north.readyAt !== "number" || !Number.isFinite(north.readyAt)) return "north_not_consultable";
  if (!["operativo", "confirmado"].includes(String(get("accesoSur")?.status))) return "south_access_closed";
  const groups = rows(state, "guestGroups");
  const expected = new Map([["g-acceso", 90], ["g-shuttles", 180], ["g-propios", 330]]);
  if (groups.length !== 3 || new Set(groups.map((g) => g.id)).size !== 3 ||
    groups.some((g) => expected.get(String(g.id)) !== g.count || g.confirmedCount !== g.count)) return "guest_distribution_changed";
  for (const id of ["c-pabB", "c-lounge", "c-espera"]) {
    const commitment = state.commitments.find((c) => c.id === id);
    if (!commitment || commitment.status !== "confirmado" || commitment.planVersion !== state.planVersion ||
      !Array.isArray(commitment.conditions) || commitment.conditions.length) return "agreements_changed";
  }
  if (rows(state, "agents").some((a) => a.status === "incidencia") || state.transportUnavailable ||
    rows(state, "shuttles").some((s) => ["retrasado", "cancelado"].includes(String(s.status))) ||
    rows(state, "deliveries").some((d) => ["bloqueada", "retrasada", "invalidada"].includes(String(d.status)))) return "other_operational_failure";
  return null;
}

export function buildLoungePilot(context: PilotContext): { state: CrisisStateDocument; output: CoordinatorOutput } | null {
  if (loungeGuard(context)) return null;
  const draft = structuredClone(context.state);
  applyTwistEffect(draft, "lounge_unavailable");
  const plan = buildReplan(draft, "lounge_unavailable", []);
  if (!plan) return null;
  const validated = validateOutput(plan, liveCoordinatorInput(draft));
  if (!validated.output || applyOperations(structuredClone(draft), loadWorld(), validated.output.operations ?? [], new Set()).errors.length) return null;
  return { state: draft, output: validated.output };
}

export async function routePilotEvent(
  event: PilotEvent,
  read: () => PilotContext,
  evaluate?: RoutingEvaluate,
  timeoutMs = ROUTING_TIMEOUT_MS,
): Promise<PilotDecision> {
  const started = performance.now();
  const finish = (decision: Omit<PilotDecision, "latencyMs">): PilotDecision => ({ ...decision, latencyMs: Math.round(performance.now() - started) });
  const context = read();
  if (event.kind === "lounge_unavailable" && Array.isArray(context.state.twistsApplied) && context.state.twistsApplied.includes("lounge_unavailable")) {
    return finish({ route: "noop", via: "direct", reason: "already_applied" });
  }
  const blocker = loungeGuard(context);
  if (blocker) return finish({ route: "llm", via: "guard", reason: blocker });
  const fingerprint = pilotFingerprint(context);
  let evaluation: RoutingEvaluation | undefined;
  if (event.kind === "free_text") {
    if (!evaluate || !event.text?.trim()) return finish({ route: "llm", via: "guard", reason: "no_evaluator_or_text" });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      evaluation = await Promise.race([
        evaluate(event.text, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("routing_timeout")); }, timeoutMs);
        }),
      ]);
    } catch (error) {
      const reason = error instanceof JevHttpError && [401, 403].includes(error.status) ? "provider_auth" :
        error instanceof Error && error.message === "routing_text_not_reviewed" ? "privacy_not_reviewed" :
        controller.signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) ? "timeout" : "evaluation_failed";
      return finish({ route: "llm", via: "jev", reason });
    } finally { clearTimeout(timer); }
    if (!qualifiesForLounge(evaluation.scores)) return finish({ route: "llm", via: "jev", reason: "semantic_gate", evaluation });
  } else if (event.kind !== "lounge_unavailable") {
    return finish({ route: "llm", via: "guard", reason: "unsupported_event" });
  }
  const current = read();
  if (pilotFingerprint(current) !== fingerprint) return finish({ route: "llm", via: "guard", reason: "state_changed", ...(evaluation ? { evaluation } : {}) });
  if (!buildLoungePilot(current)) return finish({ route: "llm", via: "guard", reason: "playbook_not_applicable", ...(evaluation ? { evaluation } : {}) });
  return finish({ route: "playbook", via: evaluation ? "jev" : "direct", reason: "bounded_lounge_loss",
    prepared: { runId: current.runId, eventId: event.id, fingerprint, version: PLAYBOOK_VERSION }, ...(evaluation ? { evaluation } : {}) });
}

export function applyPilotInMemory(database: CrisisDatabase, decision: PilotDecision): { applied: boolean; reason: string } {
  const main = database.connection.prepare("PRAGMA database_list").all().find((row) => row.name === "main");
  if (!main || main.file !== "") throw new Error("pilot_requires_memory_database");
  const prepared = decision.prepared;
  if (decision.route !== "playbook" || !prepared || prepared.version !== PLAYBOOK_VERSION) return { applied: false, reason: "not_selected" };
  database.connection.exec("BEGIN IMMEDIATE");
  try {
    const context = readPilotContext(database);
    const plan = prepared.runId === context.runId && prepared.fingerprint === pilotFingerprint(context) ? buildLoungePilot(context) : null;
    if (!plan) {
      database.connection.exec("ROLLBACK");
      return { applied: false, reason: "state_changed" };
    }
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    states.saveState(context.runId, plan.state);
    const errors = persistReplan({ runId: context.runId, output: plan.output, world: loadWorld(), tasks, states });
    if (errors.length) throw new Error("pilot_plan_invalid");
    new EventRepository(database.connection).append({
      id: `pilot:${context.runId}:${prepared.eventId}`, runId: context.runId, source: "chat", kind: "pilot_playbook",
      text: undefined, actorId: undefined, simSeconds: plan.state.clock.simSeconds, mode: "rules",
      payload: { playbook: PLAYBOOK_VERSION, via: decision.via, reason: decision.reason, planVersion: plan.state.planVersion },
    });
    database.connection.exec("COMMIT");
    return { applied: true, reason: "queued_without_dispatch" };
  } catch {
    database.connection.exec("ROLLBACK");
    throw new Error("pilot_application_rolled_back");
  }
}
