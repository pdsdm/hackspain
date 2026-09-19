export type Feasibility = "si" | "condicionada" | "no" | "sin_respuesta";

export interface CandidateDelivery {
  id: string;
  name: string;
  services: number;
  dockId: string;
  dockName: string;
  arriveAt: number;
}

export interface CateringBrief {
  counterpart: string;
  headcount: number;
  openingAt: number;
  deliveries: CandidateDelivery[];
  dietaryNeeds?: string;
}

export interface DeliveryAnswer {
  id: string;
  feasible: Feasibility;
  dockId?: string | null;
  arriveAt?: number | string | null;
  services?: number | null;
  dietaryCovered?: boolean | null;
  staffAtDock?: string | null;
  cost?: number | null;
  conditions?: string[];
}

export interface CateringAnswer {
  callId: string;
  counterpart: string;
  deliveries: DeliveryAnswer[];
  notes?: string[];
}

export type DeliveryUpdateStatus = "confirmada" | "programada" | "bloqueada";

export interface DeliveryUpdate {
  id: string;
  status?: DeliveryUpdateStatus;
  dockId?: string;
  arriveAt?: number;
  services?: number;
  note?: string;
  evidenceCallId: string;
}

export type CateringCommitmentStatus = "en_consulta" | "aceptado_condiciones";

export interface CateringCommitment {
  id: string;
  title: string;
  area: "catering";
  status: CateringCommitmentStatus;
  counterpart: string;
  conditions: string[];
  evidenceCallId: string;
}

export interface CateringDependency {
  deliveryId: string;
  owner: "recinto" | "recepcion" | "catering";
  text: string;
}

export interface CateringResult {
  deliveryUpdates: DeliveryUpdate[];
  commitments: CateringCommitment[];
  dependencies: CateringDependency[];
  forecastDelta: number;
  missing: string[];
}

export interface ExtractionIssue {
  code: string;
  detail: string;
}
