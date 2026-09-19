// Contrato de decisión del coordinador (docs/specs/T10-coordinador.md).
// La entrada es un subconjunto estructural de CrisisState (frontend/src/domain/types.ts).
// Cuando T7 publique el tipo canónico en el backend, sustituir CoordinatorInput por él.

export type Area = "espacios" | "catering" | "transporte" | "asistentes";
export type Zone = "norte" | "sur";

export type CommitmentStatus =
  | "propuesto"
  | "en_consulta"
  | "aceptado_condiciones"
  | "confirmado"
  | "en_ejecucion"
  | "completado"
  | "invalidado";

export type CoordinatorStatus = "estable" | "replanificando" | "esperando_decision" | "pausado";

export interface InputSpace {
  id: string;
  name: string;
  zone: Zone;
  kind?: string;
  capacity?: number;
  status: string;
  readyAt?: number;
  note?: string;
}

export interface InputGuestGroup {
  id: string;
  name: string;
  count: number;
  where: string;
  assignedSpaceId?: string;
  informedCount?: number;
  needs?: string;
}

export interface InputCommitment {
  id: string;
  title: string;
  area: Area;
  status: CommitmentStatus;
  counterpart: string;
  conditions: string[];
}

export interface InputBudget {
  contingency: number;
  autonomousLimit: number;
  authorized: number;
  forecast: number;
  committed: number;
}

export interface CoordinatorInput {
  clock: { simSeconds: number; openingAt: number; lunchAt: number; raceAt: number };
  planVersion: number;
  spaces: InputSpace[];
  guestGroups: InputGuestGroup[];
  commitments: InputCommitment[];
  budget: InputBudget;
  constraints: string[];
  shuttles?: InputShuttle[];
  deliveries?: InputDelivery[];
  gates?: InputGate[];
  pendingActions?: InputPendingAction[];
  world?: { places: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> };
  event?: { source: string; kind: string; text?: string };
  queryAnswers?: unknown[];
  previousErrors?: string[];
}

export interface InputShuttle {
  id: string;
  passengers: number;
  origin: string;
  destinationId: string;
  arriveAt: number;
  delayMin: number;
  status: string;
}

export interface InputDelivery {
  id: string;
  dockId: string;
  arriveAt: number;
  status: string;
}

export interface InputGate {
  id: string;
  status: string;
  arrivalsPerMin: number;
  throughputPerMin: number;
  waiting: number;
}

export interface InputPendingAction {
  taskId: string;
  area: string;
  objective: string;
  counterpart: string;
}

export interface CoordinatorAction {
  id: string;
  area: Area;
  channel: "llamada" | "sms" | "email";
  counterpart: string;
  objective: string;
  dueAt: number;
  dependsOn: string[];
  reason: string;
}

export interface CoordinatorCommitment {
  id: string;
  title: string;
  area: Area;
  status: CommitmentStatus;
  counterpart: string;
  conditions: string[];
}

// Una asignación por tramo: un grupo puede repartirse entre varios espacios,
// porque 90 + 180 + 330 no cabe en 450 + 150 sin dividir al menos un grupo.
export interface CoordinatorAssignment {
  groupId: string;
  spaceId: string;
  count: number;
}

export interface CoordinatorDecision {
  title: string;
  summary: string;
  cost: number;
  conditions: string[];
  effectApprove: string;
  effectReject: string;
  rationale: string;
}

export interface CoordinatorOutput {
  reading: string;
  planVersion: number;
  coordinatorStatus: CoordinatorStatus;
  actions: CoordinatorAction[];
  commitments: CoordinatorCommitment[];
  assignments: CoordinatorAssignment[];
  decision: CoordinatorDecision | null;
  unverified: string[];
  operations?: CoordinatorOperation[];
  queries?: CoordinatorQuery[];
  done?: boolean;
}

export type CoordinatorQuery =
  | { type: "affected_by"; placeId: string }
  | { type: "alternatives_for"; placeId: string; minCapacity?: number }
  | { type: "route"; vehicleId: string; destinationId: string };

export type CoordinatorOperation =
  | { op: "set_place"; id: string; status: string; note?: string; capacity?: number; readyAt?: number }
  | { op: "set_gate"; id: string; status?: string; arrivalsPerMin?: number; throughputPerMin?: number; waiting?: number }
  | { op: "reroute_shuttle"; id: string; destinationId: string; delayMin?: number; status?: string; note?: string }
  | { op: "redirect_delivery"; id: string; dockId: string; delayMin?: number; status?: string; note?: string }
  | { op: "set_group"; id: string; where?: string; assignedSpaceId?: string; needs?: string }
  | { op: "cancel_action"; taskId: string; reason: string }
  | { op: "set_agent"; area: Area; objective: string; reason: string; status: string }
  | { op: "log_event"; kind: string; text: string; area?: string }
  | { op: "add_constraint"; text: string };
