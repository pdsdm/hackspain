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
}
