export interface StateClock {
  simSeconds: number;
  [key: string]: unknown;
}

export interface StateSpace {
  id: string;
  zone: "norte" | "sur";
  capacity?: number;
  [key: string]: unknown;
}

export interface StateCommitment {
  id: string;
  status: string;
  planVersion: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface StateAssignment {
  groupId: string;
  spaceId: string;
  count: number;
  status: "proposed" | "confirmed";
  planVersion: number;
}

export interface StateBudget {
  autonomousLimit: number;
  authorized: number;
  committed: number;
  [key: string]: unknown;
}

export interface CrisisStateDocument {
  clock: StateClock;
  planVersion: number;
  spaces: StateSpace[];
  commitments: StateCommitment[];
  assignments?: StateAssignment[];
  decisions: Array<Record<string, unknown>>;
  budget: StateBudget;
  scriptId: "main" | "norte" | "reducido";
  scriptCursor: number;
  nextScriptAt: number | null;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

export function parseCrisisState(value: unknown): CrisisStateDocument {
  const state = requireRecord(value, "state");
  const clock = requireRecord(state.clock, "state.clock");
  const budget = requireRecord(state.budget, "state.budget");

  if (!Array.isArray(state.spaces) || !Array.isArray(state.commitments) || !Array.isArray(state.decisions)) {
    throw new Error("state spaces, commitments and decisions must be arrays");
  }

  requireNumber(clock.simSeconds, "state.clock.simSeconds");
  requireNumber(state.planVersion, "state.planVersion");
  requireNumber(budget.autonomousLimit, "state.budget.autonomousLimit");
  requireNumber(budget.authorized, "state.budget.authorized");
  requireNumber(budget.committed, "state.budget.committed");

  return structuredClone(value) as CrisisStateDocument;
}

export function toPublicState(state: CrisisStateDocument): CrisisStateDocument {
  const { coordinatorBusy: _busy, ...rest } = structuredClone(state);
  if (Array.isArray(rest.calls)) {
    rest.calls = rest.calls.map((value) => {
      if (!isRecord(value)) return value;
      const call = { ...value };
      delete call._happyrobotSessionId;
      delete call._happyrobotRunId;
      return call;
    });
  }
  return {
    ...rest,
    simulated: false,
    scriptId: "main",
    scriptCursor: 0,
    nextScriptAt: null,
  };
}
