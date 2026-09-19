import type { CoordinatorQuery } from "./types.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import {
  affectedBy,
  alternativesFor,
  etaFor,
  type WorldModel,
} from "../../world/world.js";
import { planTrip } from "../../world/locate.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export async function answerQuery(
  query: CoordinatorQuery,
  state: CrisisStateDocument,
  world: WorldModel,
): Promise<unknown> {
  if (query.type === "affected_by") return affectedBy(state, world, query.placeId);
  if (query.type === "alternatives_for") {
    return alternativesFor(world, state, query.placeId, query.minCapacity);
  }
  const now = Number(state.clock.simSeconds);
  if (query.fromId) {
    const trip = await planTrip(world, query.fromId, query.destinationId);
    if (!trip) return { error: `no encuentro origen «${query.fromId}» o destino ${query.destinationId}` };
    return {
      fromId: trip.from.id,
      origin: trip.from.name,
      originPos: trip.from.pos,
      destinationId: query.destinationId,
      destination: trip.toName,
      minutes: trip.minutes,
      arriveAt: now + trip.minutes * 60,
      source: trip.source,
    };
  }
  const shuttle = records(state, "shuttles").find((item) => item.id === query.vehicleId);
  const delivery = records(state, "deliveries").find((item) => item.id === query.vehicleId);
  const extra = records(state, "vehicles").find((item) => item.id === query.vehicleId);
  const vehicle = shuttle ?? delivery ?? extra;
  if (!vehicle) return { error: `vehículo desconocido ${query.vehicleId}` };
  const dockId = typeof vehicle.dockId === "string" ? vehicle.dockId : undefined;
  const fromQuery = String(vehicle.from ?? vehicle.origin ?? (delivery ? "Coslada" : ""));
  const trip = await planTrip(world, fromQuery, query.destinationId);
  if (trip) {
    return {
      fromId: trip.from.id,
      origin: trip.from.name,
      originPos: trip.from.pos,
      destinationId: query.destinationId,
      destination: trip.toName,
      minutes: trip.minutes,
      arriveAt: Math.max(now, Number(vehicle.departAt ?? now)) + trip.minutes * 60 + Number(vehicle.delayMin ?? 0) * 60,
      source: trip.source,
    };
  }
  return etaFor(
    world,
    {
      origin: fromQuery,
      from: fromQuery,
      destinationId: String(vehicle.destinationId ?? vehicle.dockId ?? ""),
      ...(dockId ? { dockId } : {}),
      departAt: Number(vehicle.departAt ?? now),
      delayMin: Number(vehicle.delayMin ?? 0),
    },
    query.destinationId,
    now,
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
    if (typeof raw.destinationId !== "string") return { error: "route requiere destinationId" };
    const vehicleId = typeof raw.vehicleId === "string" ? raw.vehicleId : undefined;
    const fromId = typeof raw.fromId === "string" ? raw.fromId : typeof raw.from === "string" ? raw.from : undefined;
    if (!vehicleId && !fromId) return { error: "route requiere fromId (cualquier sitio) o vehicleId" };
    return {
      type,
      destinationId: raw.destinationId,
      ...(vehicleId ? { vehicleId } : {}),
      ...(fromId ? { fromId } : {}),
    };
  }
  return { error: `consulta desconocida ${String(type)}` };
}
