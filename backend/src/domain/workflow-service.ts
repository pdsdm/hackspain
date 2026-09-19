import { randomUUID } from "node:crypto";

import {
  ContractError,
  isRecord,
  type CoordinatorProposalEnvelope,
  type SpecialistResultEnvelope,
} from "../contracts/api.js";
import { PlanService } from "./plan-service.js";
import { confirmationBlocker, decideAcceptance, readVerificationTarget, resolvedConditions, verificationSnapshot, type VerificationTarget } from "./acceptance-policy.js";
import type { CallAcceptanceVerification } from "./result-verifier.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import type { StateRepository } from "../state/state-repository.js";
import type { TaskRepository } from "../state/task-repository.js";
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
  area: string,
  verification?: CallAcceptanceVerification,
): CrisisStateDocument {
  const next = structuredClone(state);
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

  const commitmentId = verification?.target?.commitmentId ?? envelope.result.data.commitmentId;
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
      kind: verification.decision === "confirm_target" ? "acuerdo" : "accion",
      text: `JEV · ${verification.target ? "Pabellón B (Sur) / c-pabB" : "Sin target confirmable"}: ${verification.decision === "confirm_target" ? "reserva confirmada" : "sin confirmación automática"}. Motivo: ${verification.reason.replaceAll("_", " ")}. No acredita preparación física ni invitados ubicados.`,
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

      const queued = envelope.actions.map((action) => {
        const verificationTarget = verificationTargetFor(action, state);
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
            data: action.payload,
          },
          idempotencyKey: `${envelope.eventId}:${action.actionId}`,
        });
        return { actionId: action.actionId, taskId: task.id };
      });

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
        return applySpecialistState(state, envelope, currentTask.area, checked);
      },
      envelope.status === "completed" ? "completed" : "failed",
    );
    return { ok: true as const, ...recorded };
  }
}
