import type { CoordinatorQuery } from "./types.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import {
  affectedBy,
  alternativesFor,
  etaFor,
  type WorldModel,
} from "../../world/world.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function answerQuery(
  query: CoordinatorQuery,
  state: CrisisStateDocument,
  world: WorldModel,
): unknown {
  if (query.type === "affected_by") return affectedBy(state, world, query.placeId);
  if (query.type === "alternatives_for") {
    return alternativesFor(world, state, query.placeId, query.minCapacity);
  }
  const shuttle = records(state, "shuttles").find((item) => item.id === query.vehicleId);
  const delivery = records(state, "deliveries").find((item) => item.id === query.vehicleId);
  const vehicle = shuttle ?? delivery;
  if (!vehicle) return { error: `vehículo desconocido ${query.vehicleId}` };
  const dockId = typeof vehicle.dockId === "string" ? vehicle.dockId : undefined;
  return etaFor(
    world,
    {
      origin: String(vehicle.origin ?? (delivery ? "Coslada" : "")),
      destinationId: String(vehicle.destinationId ?? vehicle.dockId ?? ""),
      ...(dockId ? { dockId } : {}),
      departAt: Number(vehicle.departAt ?? state.clock.simSeconds),
      delayMin: Number(vehicle.delayMin ?? 0),
    },
    query.destinationId,
    Number(state.clock.simSeconds),
  );
}

export function parseConsultArgs(raw: unknown): CoordinatorQuery | { error: string } {
  if (!isRecord(raw)) return { error: "consult_world: argumentos inválidos" };
  const type = raw.type;
  if (type === "affected_by") {
    if (typeof raw.placeId !== "string") return { error: "affected_by requiere placeId" };
    return { type, placeId: raw.placeId };
  }
  if (type === "alternatives_for") {
    if (typeof raw.placeId !== "string") return { error: "alternatives_for requiere placeId" };
    return {
      type,
      placeId: raw.placeId,
      ...(typeof raw.minCapacity === "number" ? { minCapacity: raw.minCapacity } : {}),
    };
  }
  if (type === "route") {
    if (typeof raw.vehicleId !== "string" || typeof raw.destinationId !== "string") {
      return { error: "route requiere vehicleId y destinationId" };
    }
    return { type, vehicleId: raw.vehicleId, destinationId: raw.destinationId };
  }
  return { error: `consulta desconocida ${String(type)}` };
}
