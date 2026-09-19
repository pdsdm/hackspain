import { randomUUID } from "node:crypto";

import {
  ContractError,
  isRecord,
  type CoordinatorProposalEnvelope,
  type SpecialistResultEnvelope,
} from "../contracts/api.js";
import { PlanService } from "./plan-service.js";
import { confirmationBlocker, decideAcceptance, readVerificationTarget, resolvedConditions, verificationSnapshot, type VerificationTarget } from "./acceptance-policy.js";
import { commitmentIdForAction, commitmentIdFromTaskPayload } from "./commitment-link.js";
import type { CallAcceptanceVerification } from "./result-verifier.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { StateRepository } from "../state/state-repository.js";
import type { DispatchTask, TaskRepository } from "../state/task-repository.js";
import type { WorkflowEventRepository } from "../state/workflow-event-repository.js";

export interface CoordinatorResponse extends Record<string, unknown> {
  ok: true;
  duplicate: boolean;
  runId: string;
  planVersion: number;
  tasks: Array<{ actionId: string; taskId: string }>;
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function verificationTargetFor(
  action: CoordinatorProposalEnvelope["actions"][number],
  state: CrisisStateDocument,
): VerificationTarget | undefined {
  const target = readVerificationTarget(action.payload);
  if (!target || action.area !== "espacios" || action.kind !== "call") return undefined;
  const commitment = state.commitments.find((item) => item.id === target.commitmentId);
  const resource = state.spaces.find((item) => item.id === target.resourceId);
  return commitment?.area === "espacios" && commitment.planVersion === state.planVersion && resource?.zone === "sur"
    ? target : undefined;
}

function applyCoordinatorState(
  state: CrisisStateDocument,
  envelope: CoordinatorProposalEnvelope,
): CrisisStateDocument {
  const next = structuredClone(state);
  const commitments = new Map(next.commitments.map((commitment) => [commitment.id, commitment]));
  for (const commitment of envelope.commitments) {
    commitments.set(commitment.id, {
      ...commitment,
      planVersion: next.planVersion,
      updatedAt: next.clock.simSeconds,
    });
  }
  next.commitments = [...commitments.values()];

  const agents = records(next, "agents");
  for (const action of envelope.actions) {
    const agent = agents.find((item) => item.id === action.area);
    if (agent) {
      agent.objective = action.objective;
      agent.reason = action.reason;
      agent.status = next.agentsPaused ? "pausado" : "activo";
    }
  }
  next.agents = agents;

  const events = records(next, "events");
  events.push({
    id: `coordinator-${envelope.eventId}`,
    time: next.clock.simSeconds,
    kind: "accion",
    text: envelope.reading,
  });
  next.events = events.slice(-80);
  next.lastCoordinatorUnverified = envelope.unverified;
  return next;
}

function applySpecialistState(
  state: CrisisStateDocument,
  envelope: SpecialistResultEnvelope,
  task: DispatchTask,
  verification?: CallAcceptanceVerification,
): CrisisStateDocument {
  const area = task.area;
  const next = structuredClone(state);
  const cost = envelope.result.data.committedCost;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0 &&
    ["dispatching", "dispatched", "unknown"].includes(task.status) && envelope.status === "completed" &&
    envelope.result.outcome === "accepted" && envelope.result.conditions.length === 0 &&
    envelope.result.evidence.callId === `call-${task.id}` &&
    envelope.result.evidence.transcript?.some((line) => line.who === "humano" && line.text.trim())) {
    const total = Math.round((next.budget.committed + cost) * 100) / 100;
    if (!Number.isFinite(total)) throw new ContractError("Invalid committed cost total");
    next.budget.committed = total;
  }
  const agents = records(next, "agents");
  const agent = agents.find((item) => item.id === area);
  if (agent) {
    agent.lastResult = envelope.result.summary;
    agent.status = envelope.status === "completed" ? "estable" : "incidencia";
  }
  next.agents = agents;

  const events = records(next, "events");
  events.push({
    id: `workflow-result-${randomUUID()}`,
    time: next.clock.simSeconds,
    kind: envelope.status === "completed" ? "acuerdo" : "fallo",
    text: envelope.result.summary,
    area,
  });
  next.events = events.slice(-80);

  const callId = envelope.result.evidence.callId;
  if (callId) {
    const calls = records(next, "calls");
    const call = calls.find((item) => item.id === callId);
    if (call) {
      call.status = envelope.status === "no_answer" ? "sin_respuesta" : "terminada";
      if (envelope.result.evidence.transcript) {
        call.transcript = envelope.result.evidence.transcript;
      }
    }
    next.calls = calls;
  }

  const groupUpdates = envelope.result.data.guestGroups;
  if (envelope.status === "completed" && Array.isArray(groupUpdates)) {
    const groups = records(next, "guestGroups");
    for (const raw of groupUpdates) {
      if (typeof raw !== "object" || raw === null) continue;
      const update = raw as Record<string, unknown>;
      const group = groups.find((item) => item.id === update.id);
      if (!group) continue;
      const total = typeof group.count === "number" ? group.count : Number.POSITIVE_INFINITY;
      if (typeof update.informedCount === "number") {
        group.informedCount = Math.min(total, Math.max(Number(group.informedCount ?? 0), update.informedCount));
      }
      if (typeof update.acceptedCount === "number") {
        group.acceptedCount = Math.min(total, Math.max(Number(group.acceptedCount ?? 0), update.acceptedCount));
      }
      if (typeof update.needs === "string" && update.needs.trim() !== "") group.needs = update.needs;
    }
    next.guestGroups = groups;
  }

  const deliveryUpdates = envelope.result.data.deliveries;
  if (envelope.status === "completed" && Array.isArray(deliveryUpdates)) {
    const deliveries = records(next, "deliveries");
    const docks = records(next, "spaces");
    for (const raw of deliveryUpdates) {
      if (typeof raw !== "object" || raw === null) continue;
      const update = raw as Record<string, unknown>;
      const delivery = deliveries.find((item) => item.id === update.id);
      if (!delivery || delivery.status === "entregada") continue;
      if (typeof update.dockId === "string") {
        const dock = docks.find((item) => item.id === update.dockId && item.kind === "muelle");
        if (dock && dock.status !== "cerrado" && dock.status !== "descartado") delivery.dockId = update.dockId;
      }
      if (typeof update.arriveAt === "number" && Number.isFinite(update.arriveAt) && update.arriveAt > 0) {
        delivery.arriveAt = update.arriveAt;
      }
      if (typeof update.services === "number" && Number.isInteger(update.services) && update.services > 0) {
        delivery.services = update.services;
      }
      if (update.status === "confirmada" || update.status === "programada" || update.status === "bloqueada") {
        const dock = docks.find((item) => item.id === delivery.dockId);
        const dockClosed = dock !== undefined && (dock.status === "cerrado" || dock.status === "descartado");
        delivery.status = update.status === "confirmada" && dockClosed ? "programada" : update.status;
      }
      if (typeof update.note === "string" && update.note.trim() !== "") delivery.note = update.note;
    }
    next.deliveries = deliveries;
  }

  // El compromiso sale de la verificación, de lo que devuelva el workflow o, si ninguno lo
  // dice, del que anotamos al despachar la acción.
  const commitmentId =
    verification?.target?.commitmentId ??
    envelope.result.data.commitmentId ??
    commitmentIdFromTaskPayload(task.payload);
  if (typeof commitmentId === "string") {
    const commitment = next.commitments.find((item) => item.id === commitmentId);
    if (commitment && commitment.planVersion === next.planVersion &&
      ["propuesto", "en_consulta", "aceptado_condiciones"].includes(commitment.status)) {
      const resource = next.spaces.find((item) => item.id === verification?.target?.resourceId);
      if (verification?.decision === "confirm_target" && resource) {
        commitment.status = "confirmado";
        commitment.conditions = resolvedConditions(commitment.conditions);
        resource.status = "confirmado";
      } else if (envelope.result.outcome === "accepted" || envelope.result.outcome === "accepted_with_conditions") {
        commitment.status = "aceptado_condiciones";
      } else if (envelope.result.outcome === "rejected") {
        commitment.status = "invalidado";
      }
      commitment.updatedAt = next.clock.simSeconds;
    }
  }
  if (verification) {
    events.push({
      id: `verification-${randomUUID()}`,
      time: next.clock.simSeconds,
      // El desacuerdo es una incidencia: el resultado de la llamada afirma más de lo que
      // sostiene la transcripción y el responsable tiene que poder verlo en la cronología.
      kind: verification.decision === "confirm_target" ? "acuerdo" : verification.gap ? "incidencia" : "accion",
      text: verification.gap
        ? `JEV · Pabellón B (Sur) / c-pabB: el resultado de la llamada dice «aceptado sin condiciones», pero la transcripción no lo sostiene: ${verification.gap}. Revisa la llamada antes de darla por cerrada.`
        : `JEV · ${verification.target ? "Pabellón B (Sur) / c-pabB" : "Sin target confirmable"}: ${verification.decision === "confirm_target" ? "reserva confirmada" : "sin confirmación automática"}. Motivo: ${verification.reason.replaceAll("_", " ")}. No acredita preparación física ni invitados ubicados.`,
      area,
    });
    next.events = events.slice(-80);
  }
  return next;
}

export class WorkflowService {
  private readonly plans: PlanService;

  constructor(
    private readonly states: StateRepository,
    private readonly tasks: TaskRepository,
    private readonly events: WorkflowEventRepository,
  ) {
    this.plans = new PlanService(states);
  }

  applyCoordinatorProposal(envelope: CoordinatorProposalEnvelope): CoordinatorResponse {
    const reservation = this.events.reserve(
      envelope.eventId,
      envelope.runId,
      envelope.planVersion,
      envelope,
    );
    if (reservation.duplicate) {
      return { ...(reservation.response as CoordinatorResponse), duplicate: true };
    }

    let planApplied = false;
    try {
      const planned = this.plans.applyProposalFor(
        envelope.runId,
        envelope.planVersion,
        envelope.proposal,
      );
      planApplied = true;
      const state = applyCoordinatorState(planned, envelope);
      this.states.saveState(envelope.runId, state);

      // Tareas del plan anterior que nunca salieron. claimNext solo despacha la versión
      // vigente, así que sin arrastrarlas se quedan «pending» para siempre: ni se ejecutan
      // ni se cancelan, y el plan no puede cerrarse nunca.
      // Solo las que no se han despachado: una llamada en vuelo tiene su resultado atado a
      // la versión con la que salió, y moverla lo convierte en un resultado fuera de
      // contexto.
      const oldPending = this.tasks
        .listOpen(envelope.runId)
        .filter((task) => task.status === "pending" && task.planVersion < state.planVersion);
      const replacements = new Set(envelope.actions.map((action) => `${action.area}:${action.kind}`));

      const queued = envelope.actions.map((action) => {
        const verificationTarget = verificationTargetFor(action, state);
        const commitmentId = commitmentIdForAction(state, action);
        const task = this.tasks.enqueue({
          runId: envelope.runId,
          planVersion: state.planVersion,
          area: action.area,
          kind: action.kind,
          payload: {
            objective: action.objective,
            counterpart: action.counterpart,
            dueAt: action.dueAt,
            reason: action.reason,
            dependsOnKeys: action.dependsOn.map(
              (dependency) => `${envelope.eventId}:${dependency}`,
            ),
            ...(verificationTarget ? { verificationTarget, verificationSnapshot: verificationSnapshot(state) } : {}),
            data: { ...action.payload, ...(commitmentId ? { commitmentId } : {}) },
          },
          idempotencyKey: `${envelope.eventId}:${action.actionId}`,
        });
        return { actionId: action.actionId, taskId: task.id };
      });
      for (const task of oldPending) {
        const superseded = replacements.has(`${task.area}:${task.kind}`);
        if (superseded || !this.tasks.dependenciesSatisfied(task.id)) {
          this.tasks.cancel(task.id, superseded ? "superseded by current plan" : "dependency did not complete");
        } else {
          this.tasks.carryToPlan(task.id, state.planVersion);
        }
      }

      const response: CoordinatorResponse = {
        ok: true,
        duplicate: false,
        runId: envelope.runId,
        planVersion: state.planVersion,
        tasks: queued,
      };
      this.events.complete(envelope.eventId, response);
      return response;
    } catch (error) {
      if (!planApplied) this.events.release(envelope.eventId);
      throw error;
    }
  }

  recordSpecialistResult(
    envelope: SpecialistResultEnvelope,
    verification?: CallAcceptanceVerification,
  ) {
    const task = this.tasks.get(envelope.taskId);
    if (!task) throw new ContractError(`Task not found: ${envelope.taskId}`, 404);
    if (task.runId !== envelope.runId || task.planVersion !== envelope.planVersion) {
      throw new ContractError(
        `Result context does not match task: ${envelope.taskId}`,
        409,
      );
    }

    const recorded = this.tasks.recordResult(
      task.id,
      envelope.eventId,
      envelope,
      (state) => {
        const currentTask = this.tasks.get(task.id)!;
        const target = readVerificationTarget(currentTask.payload);
        let checked = verification;
        if (verification?.decision === "confirm_target") {
          const blocker = confirmationBlocker(state, currentTask) ??
            (!this.tasks.dependenciesSatisfied(task.id) ? "dependencias_pendientes" : undefined) ??
            (verification.snapshot !== verificationSnapshot(state) ? "terminos_modificados" : undefined) ??
            (!target || verification.target?.commitmentId !== target.commitmentId ||
              verification.target?.resourceId !== target.resourceId || !verification.scores ||
              decideAcceptance(verification.scores) !== "confirm_target" || envelope.status !== "completed" ||
              envelope.result.outcome !== "accepted" || envelope.result.conditions.length > 0 ||
              envelope.result.evidence.callId !== `call-${task.id}` ? "evidencia_insuficiente" : undefined);
          if (blocker) checked = { ...verification, decision: "keep_conditional", reason: blocker };
        }
        if (checked && target) checked = { ...checked, target };
        else if (checked) checked = { decision: "keep_conditional", reason: "target_no_admitido" };
        return applySpecialistState(state, envelope, currentTask, checked);
      },
      envelope.status === "completed" ? "completed" : "failed",
    );
    const accepted = envelope.result.outcome === "accepted" || envelope.result.outcome === "accepted_with_conditions";
    if (recorded.applied && !recorded.duplicate && envelope.status === "completed" && accepted && this.tasks.listOpen(task.runId).length === 0) {
      const run = this.states.ensureActiveRun();
      if (run.id === task.runId && run.state.coordinatorBusy === undefined && !run.state.waitingForDecision && run.state.agentsPaused !== true && run.state.coordinatorStatus === "replanificando") {
        const state = structuredClone(run.state);
        state.coordinatorStatus = "estable";
        this.states.saveState(run.id, state);
      }
    }
    return { ok: true as const, ...recorded };
  }
}
