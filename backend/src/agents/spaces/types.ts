// Contrato del agente de Espacios (docs/specs/T11-espacios.md).
// Dos piezas: el guion con el que negocia (prompt.ts) y el esquema con el que su
// respuesta vuelve al estado como datos (extract.ts).
// Los tipos de destino son Space, Commitment y Call de frontend/src/domain/types.ts;
// cuando T7 publique el tipo canónico en el backend, sustituir estos espejos por él.

export type Zone = "norte" | "sur";

/** Espacio que el coordinador pide comprobar en esta llamada. */
export interface CandidateSpace {
  id: string;
  name: string;
  zone: Zone;
  /** Capacidad del catálogo: una pista que la llamada tiene que confirmar, no un dato. */
  capacity?: number;
}

/** Lo que el coordinador entrega al agente antes de llamar. */
export interface SpacesBrief {
  counterpart: string;
  headcount: number;
  zone: Zone;
  /** Hora a la que hay que abrir, en segundos desde medianoche. */
  openingAt: number;
  candidates: CandidateSpace[];
}

export type Availability = "disponible" | "condicionada" | "no_disponible" | "sin_respuesta";
export type RaceFeed = "si" | "no" | "desconocido";

/**
 * Lo que la llamada devuelve sobre un espacio. Todo lo que no sea `id` y
 * `availability` puede faltar: un dato que no aparece en la conversación queda vacío.
 */
export interface SpaceAnswer {
  id: string;
  availability: Availability;
  capacity?: number | null;
  zone?: Zone | null;
  /** Segundos desde medianoche o la hora tal como la dijo el interlocutor ("13:15"). */
  readyAt?: number | string | null;
  access?: string | null;
  raceFeed?: RaceFeed | null;
  cost?: number | null;
  conditions?: string[];
}

export interface SpacesAnswer {
  /** Id de la llamada en `calls[]`: la evidencia de dónde sale cada dato. */
  callId: string;
  counterpart: string;
  spaces: SpaceAnswer[];
  notes?: string[];
}

/** Ningún resultado de una llamada deja un espacio en `confirmado`. */
export type SpaceUpdateStatus = "propuesto" | "pendiente" | "descartado";

export interface SpaceUpdate {
  id: string;
  status: SpaceUpdateStatus;
  capacity?: number;
  zone?: Zone;
  readyAt?: number;
  note?: string;
  evidenceCallId: string;
}

/** Tampoco `confirmado`: eso lo decide el coordinador cuando valide lo que falta. */
export type SpacesCommitmentStatus = "en_consulta" | "aceptado_condiciones";

export interface SpacesCommitment {
  id: string;
  title: string;
  area: "espacios";
  status: SpacesCommitmentStatus;
  counterpart: string;
  conditions: string[];
  evidenceCallId: string;
}

export interface SpacesResult {
  spaceUpdates: SpaceUpdate[];
  commitments: SpacesCommitment[];
  /** Coste declarado en la llamada; alimenta `budget.forecast`. Sin dato, 0. */
  forecastDelta: number;
  /** Datos que no aparecieron y hay que volver a preguntar, como "pab-b: coste". */
  missing: string[];
}

export interface ExtractionIssue {
  code: string;
  detail: string;
}
