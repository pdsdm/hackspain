// Carga los estados de demo de T5 (backend/fixtures/madring/states) y los proyecta
// a lo que el coordinador necesita leer. Lee los JSON, no el generador: ver
// backend/fixtures/README.md.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CoordinatorInput, InputCommitment, InputGuestGroup, InputSpace } from "./types.js";

export type FixtureName =
  | "calm"
  | "normal"
  | "crisis"
  | "proposal"
  | "recovered"
  | "lounge_unavailable"
  | "pabellon_b_400";

const STATES_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/madring/states");

interface RawState {
  clock: { simSeconds: number; openingAt: number; lunchAt: number; raceAt: number };
  planVersion: number;
  spaces: (InputSpace & { kind: string })[];
  guestGroups: (InputGuestGroup & { confirmedCount: number })[];
  commitments: (InputCommitment & { planVersion: number })[];
  budget: CoordinatorInput["budget"];
  constraints: string[];
}

export function hm(hours: number, minutes: number): number {
  return hours * 3600 + minutes * 60;
}

export function loadFixture(name: FixtureName): RawState {
  const path = resolve(STATES_DIRECTORY, `${name}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as RawState;
}

export function toCoordinatorInput(state: RawState): CoordinatorInput {
  return {
    clock: state.clock,
    planVersion: state.planVersion,
    spaces: state.spaces.map((space) => ({
      id: space.id,
      name: space.name,
      zone: space.zone,
      status: space.status,
      ...(space.capacity === undefined ? {} : { capacity: space.capacity }),
      ...(space.readyAt === undefined ? {} : { readyAt: space.readyAt }),
      ...(space.note === undefined ? {} : { note: space.note }),
    })),
    guestGroups: state.guestGroups.map((group) => ({
      id: group.id,
      name: group.name,
      count: group.count,
      where: group.where,
      ...(group.assignedSpaceId === undefined ? {} : { assignedSpaceId: group.assignedSpaceId }),
      ...(group.needs === undefined ? {} : { needs: group.needs }),
    })),
    commitments: state.commitments.map((commitment) => ({
      id: commitment.id,
      title: commitment.title,
      area: commitment.area,
      status: commitment.status,
      counterpart: commitment.counterpart,
      conditions: commitment.conditions,
    })),
    budget: state.budget,
    constraints: state.constraints,
  };
}

export function crisisInput(name: FixtureName = "crisis"): CoordinatorInput {
  return toCoordinatorInput(loadFixture(name));
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

export function liveCoordinatorInput(
  state: Record<string, unknown>,
  extras: Partial<CoordinatorInput> = {},
): CoordinatorInput {
  const clock = state.clock as CoordinatorInput["clock"];
  const spaces = asRecords(state.spaces) as CoordinatorInput["spaces"];
  const guestGroups = asRecords(state.guestGroups) as CoordinatorInput["guestGroups"];
  const commitments = asRecords(state.commitments) as CoordinatorInput["commitments"];
  const budget = state.budget as CoordinatorInput["budget"];
  const constraints = Array.isArray(state.constraints)
    ? state.constraints.filter((item): item is string => typeof item === "string")
    : [];
  const shuttles = asRecords(state.shuttles).map((shuttle) => ({
    id: String(shuttle.id),
    passengers: Number(shuttle.passengers ?? 0),
    origin: String(shuttle.origin ?? ""),
    destinationId: String(shuttle.destinationId ?? ""),
    arriveAt: Number(shuttle.arriveAt ?? 0),
    delayMin: Number(shuttle.delayMin ?? 0),
    status: String(shuttle.status ?? ""),
  }));
  const deliveries = asRecords(state.deliveries).map((delivery) => ({
    id: String(delivery.id),
    dockId: String(delivery.dockId ?? ""),
    arriveAt: Number(delivery.arriveAt ?? 0),
    status: String(delivery.status ?? ""),
  }));
  const gates = asRecords(state.gates).map((gate) => ({
    id: String(gate.id),
    status: String(gate.status ?? ""),
    arrivalsPerMin: Number(gate.arrivalsPerMin ?? 0),
    throughputPerMin: Number(gate.throughputPerMin ?? 0),
    waiting: Number(gate.waiting ?? 0),
  }));
  return {
    clock,
    planVersion: Number(state.planVersion),
    spaces,
    guestGroups,
    commitments,
    budget,
    constraints,
    shuttles,
    deliveries,
    gates,
    ...extras,
  };
}
