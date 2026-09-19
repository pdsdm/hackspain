import type { PlanProposal } from "../domain/plan-rules.js";

const AREAS = ["espacios", "catering", "transporte", "asistentes"] as const;
const ACTION_KINDS = ["call", "sms", "email", "manual"] as const;
const COMMITMENT_STATUSES = ["propuesto", "en_consulta", "aceptado_condiciones"] as const;
const INTERVENTION_TYPES = ["approve_spend", "reject_spend", "reject_split", "pause", "resume", "set_constraint", "take_call"] as const;
const TWIST_IDS = ["lounge_unavailable", "pabellon_b_400", "shuttle_delay", "delivery_delay", "dock_blocked", "provider_silent", "reject_spend", "reject_split", "guest_need"] as const;
const RESULT_STATUSES = ["completed", "failed", "no_answer"] as const;
const OUTCOMES = ["accepted", "accepted_with_conditions", "rejected", "no_answer", "failed"] as const;

export type Area = (typeof AREAS)[number];
export type ActionKind = (typeof ACTION_KINDS)[number];
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];
export type InterventionType = (typeof INTERVENTION_TYPES)[number];
export type TwistId = (typeof TWIST_IDS)[number];
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export type SpecialistOutcome = (typeof OUTCOMES)[number];

export interface Intervention {
  type: InterventionType;
  payload?: { text?: string; decisionId?: string; callId?: string };
}

export interface ProposedCommitment {
  id: string;
  title: string;
  area: Area;
  status: CommitmentStatus;
  counterpart: string;
  conditions: string[];
}

export interface WorkflowAction {
  actionId: string;
  area: Area;
  kind: ActionKind;
  objective: string;
  counterpart: string;
  dueAt: number;
  reason: string;
  dependsOn: string[];
  payload: Record<string, unknown>;
}

export interface CoordinatorProposalEnvelope {
  eventId: string;
  runId: string;
  planVersion: number;
  reading: string;
  proposal: PlanProposal;
  commitments: ProposedCommitment[];
  actions: WorkflowAction[];
  unverified: string[];
}

export interface TranscriptLine {
  who: "agente" | "humano";
  text: string;
  at: number;
}

export interface SpecialistResultEnvelope {
  eventId: string;
  taskId: string;
  runId: string;
  planVersion: number;
  status: ResultStatus;
  result: {
    outcome: SpecialistOutcome;
    summary: string;
    conditions: string[];
    evidence: { sessionId?: string; callId?: string; transcript?: TranscriptLine[] };
    data: Record<string, unknown>;
  };
}

export class ContractError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 503 = 400) {
    super(message);
    this.name = "ContractError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ContractError(`${field} must be an object`);
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContractError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : string(value, field);
}

function finiteNumber(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new ContractError(`${field} must be a finite number >= ${minimum}`);
  }
  return value;
}

function integer(value: unknown, field: string, minimum = 0, maximum?: number): number {
  const parsed = finiteNumber(value, field, minimum);
  if (!Number.isInteger(parsed) || (maximum !== undefined && parsed > maximum)) {
    throw new ContractError(`${field} must be an integer between ${minimum} and ${maximum ?? "infinity"}`);
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  const parsed = string(value, field);
  if (!values.includes(parsed as T)) throw new ContractError(`Unknown ${field}: ${parsed}`);
  return parsed as T;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new ContractError(`${field} must be an array`);
  return value.map((item, index) => string(item, `${field}[${index}]`));
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ContractError(`${field} must be an array`);
  return value;
}

function unique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new ContractError(`${field} must not contain duplicate IDs`);
  }
}

export function parseIntervention(value: unknown): Intervention {
  const input = record(value, "body");
  const type = enumValue(input.type, "intervention type", INTERVENTION_TYPES);
  const payload = input.payload === undefined ? undefined : record(input.payload, "payload");
  const text = optionalString(payload?.text, "payload.text");
  const decisionId = optionalString(payload?.decisionId, "payload.decisionId");
  const callId = optionalString(payload?.callId, "payload.callId");
  if (["approve_spend", "reject_spend", "reject_split"].includes(type) && !decisionId) throw new ContractError("payload.decisionId is required");
  if (type === "set_constraint" && !text) throw new ContractError("payload.text is required");
  if (type === "take_call" && !callId) throw new ContractError("payload.callId is required");
  const parsedPayload = { ...(text ? { text } : {}), ...(decisionId ? { decisionId } : {}), ...(callId ? { callId } : {}) };
  return { type, ...(Object.keys(parsedPayload).length > 0 ? { payload: parsedPayload } : {}) };
}

export function parseTwist(value: unknown): TwistId {
  return enumValue(record(value, "body").twist, "twist", TWIST_IDS);
}

function parsePlanProposal(value: unknown): PlanProposal {
  const input = record(value, "proposal");
  const allocations = array(input.allocations, "proposal.allocations").map((value, index) => {
    const item = record(value, `proposal.allocations[${index}]`);
    return {
      guestId: string(item.guestId, `proposal.allocations[${index}].guestId`),
      spaceId: string(item.spaceId, `proposal.allocations[${index}].spaceId`),
      status: enumValue(item.status, `proposal.allocations[${index}].status`, ["proposed", "confirmed"] as const),
    };
  });
  return {
    title: string(input.title, "proposal.title"),
    summary: string(input.summary, "proposal.summary"),
    rationale: string(input.rationale, "proposal.rationale"),
    cost: finiteNumber(input.cost, "proposal.cost"),
    conditions: stringArray(input.conditions, "proposal.conditions"),
    allocations,
    confirmedNorthGuestIds: stringArray(input.confirmedNorthGuestIds, "proposal.confirmedNorthGuestIds"),
    confirmedExternalTransferSeats: integer(input.confirmedExternalTransferSeats, "proposal.confirmedExternalTransferSeats"),
  };
}

function parseCommitment(value: unknown, index: number): ProposedCommitment {
  const field = `commitments[${index}]`;
  const input = record(value, field);
  return {
    id: string(input.id, `${field}.id`),
    title: string(input.title, `${field}.title`),
    area: enumValue(input.area, `${field}.area`, AREAS),
    status: enumValue(input.status, `${field}.status`, COMMITMENT_STATUSES),
    counterpart: string(input.counterpart, `${field}.counterpart`),
    conditions: stringArray(input.conditions, `${field}.conditions`),
  };
}

function parseAction(value: unknown, index: number): WorkflowAction {
  const field = `actions[${index}]`;
  const input = record(value, field);
  return {
    actionId: string(input.actionId, `${field}.actionId`),
    area: enumValue(input.area, `${field}.area`, AREAS),
    kind: enumValue(input.kind, `${field}.kind`, ACTION_KINDS),
    objective: string(input.objective, `${field}.objective`),
    counterpart: string(input.counterpart, `${field}.counterpart`),
    dueAt: integer(input.dueAt, `${field}.dueAt`, 0, 86_399),
    reason: string(input.reason, `${field}.reason`),
    dependsOn: stringArray(input.dependsOn, `${field}.dependsOn`),
    payload: record(input.payload, `${field}.payload`),
  };
}

export function parseCoordinatorProposal(value: unknown): CoordinatorProposalEnvelope {
  const input = record(value, "body");
  const commitments = array(input.commitments, "commitments").map(parseCommitment);
  const actions = array(input.actions, "actions").map(parseAction);
  const actionIds = actions.map((action) => action.actionId);
  unique(commitments.map((commitment) => commitment.id), "commitments");
  unique(actionIds, "actions");
  const knownActions = new Set(actionIds);
  for (const action of actions) {
    for (const dependency of action.dependsOn) {
      if (!knownActions.has(dependency) || dependency === action.actionId) {
        throw new ContractError(`actions.${action.actionId}.dependsOn contains an unknown or self dependency: ${dependency}`);
      }
    }
  }
  return {
    eventId: string(input.eventId, "eventId"),
    runId: string(input.runId, "runId"),
    planVersion: integer(input.planVersion, "planVersion", 1),
    reading: string(input.reading, "reading"),
    proposal: parsePlanProposal(input.proposal),
    commitments,
    actions,
    unverified: stringArray(input.unverified, "unverified"),
  };
}

function parseTranscript(value: unknown): TranscriptLine[] {
  if (value === undefined) return [];
  return array(value, "result.evidence.transcript").map((value, index) => {
    const field = `result.evidence.transcript[${index}]`;
    const input = record(value, field);
    return {
      who: enumValue(input.who, `${field}.who`, ["agente", "humano"] as const),
      text: string(input.text, `${field}.text`),
      at: finiteNumber(input.at, `${field}.at`),
    };
  });
}

export function parseSpecialistResult(value: unknown): SpecialistResultEnvelope {
  const input = record(value, "body");
  const status = enumValue(input.status, "status", RESULT_STATUSES);
  const rawResult = record(input.result, "result");
  const outcome = enumValue(rawResult.outcome, "result.outcome", OUTCOMES);
  if ((status === "failed" && outcome !== "failed") || (status === "no_answer" && outcome !== "no_answer") || (status === "completed" && ["failed", "no_answer"].includes(outcome))) {
    throw new ContractError(`status ${status} is incompatible with outcome ${outcome}`);
  }
  const rawEvidence = record(rawResult.evidence, "result.evidence");
  const sessionId = optionalString(rawEvidence.sessionId, "result.evidence.sessionId");
  const callId = optionalString(rawEvidence.callId, "result.evidence.callId");
  const transcript = parseTranscript(rawEvidence.transcript);
  return {
    eventId: string(input.eventId, "eventId"),
    taskId: string(input.taskId, "taskId"),
    runId: string(input.runId, "runId"),
    planVersion: integer(input.planVersion, "planVersion", 1),
    status,
    result: {
      outcome,
      summary: string(rawResult.summary, "result.summary"),
      conditions: stringArray(rawResult.conditions, "result.conditions"),
      evidence: { ...(sessionId ? { sessionId } : {}), ...(callId ? { callId } : {}), ...(transcript.length > 0 ? { transcript } : {}) },
      data: record(rawResult.data, "result.data"),
    },
  };
}
