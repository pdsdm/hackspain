import { randomUUID } from "node:crypto";

import {
  ContractError,
  isRecord,
  type CoordinatorProposalEnvelope,
  type SpecialistResultEnvelope,
} from "../contracts/api.js";
import { PlanService } from "./plan-service.js";
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

  recordSpecialistResult(envelope: SpecialistResultEnvelope) {
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
      (state) => applySpecialistState(state, envelope, task.area),
      envelope.status === "completed" ? "completed" : "failed",
    );
    return { ok: true as const, ...recorded };
  }
}
