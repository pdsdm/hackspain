import { readFileSync } from "node:fs";

import type { CrisisStateDocument } from "../domain/crisis-state.js";

export type LatLng = [number, number];
export type PlaceKind = "pabellon" | "lounge" | "espera" | "acceso" | "muelle" | "paddock" | "parking" | "puerta" | "parada";
export type PlaceZone = "norte" | "sur" | null;

export interface WorldPlace {
  id: string;
  name: string;
  kind: PlaceKind | string;
  zone: PlaceZone;
  pos: LatLng;
  capacity?: number;
  serves?: string[];
  contactRef?: string;
}

export interface WorldLink {
  from: string;
  to: string;
  kind: "road" | "external_transfer";
  route: LatLng[];
  minutes: number;
  requiresNorthAccess?: boolean;
}

export interface WorldModel {
  places: WorldPlace[];
  links: WorldLink[];
  zones: { sur: LatLng[]; norte: LatLng[] };
}

export interface RouteEstimate {
  route: LatLng[];
  minutes: number;
  crossesZone: boolean;
}

export interface VehicleLike {
  origin?: string;
  destinationId?: string;
  dockId?: string;
  departAt: number;
  delayMin?: number;
}

const WORLD_URL = new URL("../../fixtures/madring/world.json", import.meta.url);

const ORIGIN_STOPS: Record<string, string> = {
  Chamartín: "chamartin",
  "Plaza de Castilla": "castilla",
  "Aeropuerto T4": "t4",
  Coslada: "coslada",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLng * sinLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function liveStatus(state: CrisisStateDocument, placeId: string): string | undefined {
  const space = records(state, "spaces").find((item) => item.id === placeId);
  if (typeof space?.status === "string") return space.status;
  const gate = records(state, "gates").find((item) => item.id === placeId);
  if (typeof gate?.status === "string") return gate.status;
  return undefined;
}

export function loadWorld(): WorldModel {
  return JSON.parse(readFileSync(WORLD_URL, "utf8")) as WorldModel;
}

export function placeById(world: WorldModel, id: string): WorldPlace | undefined {
  return world.places.find((place) => place.id === id);
}

export function alternativesFor(
  world: WorldModel,
  state: CrisisStateDocument,
  placeId: string,
  minCapacity?: number,
): Array<WorldPlace & { requiresTransfer: boolean }> {
  const origin = placeById(world, placeId);
  if (!origin) return [];
  const results: Array<WorldPlace & { requiresTransfer: boolean }> = [];
  for (const place of world.places) {
    if (place.id === origin.id || place.kind !== origin.kind) continue;
    const status = liveStatus(state, place.id);
    if (status === "cerrado" || status === "descartado") continue;
    if (minCapacity !== undefined && (place.capacity ?? 0) < minCapacity) continue;
    const sameZone = place.zone !== null && place.zone === origin.zone;
    results.push({ ...place, requiresTransfer: !sameZone && place.zone !== null && origin.zone !== null });
  }
  return results.sort((left, right) => Number(left.requiresTransfer) - Number(right.requiresTransfer));
}

export function affectedBy(state: CrisisStateDocument, world: WorldModel, placeId: string) {
  const place = placeById(world, placeId);
  const name = place?.name ?? placeId;
  const zone = place?.zone;
  const shuttles = records(state, "shuttles").filter((item) => item.destinationId === placeId);
  const deliveries = records(state, "deliveries").filter((item) => item.dockId === placeId);
  const guestGroups = records(state, "guestGroups").filter((item) => {
    if (item.assignedSpaceId === placeId) return true;
    return typeof item.where === "string" && item.where.toLowerCase().includes(name.toLowerCase());
  });
  const gates = records(state, "gates").filter((item) => zone !== null && item.zone === zone);
  const commitments = records(state, "commitments").filter((item) => {
    const title = typeof item.title === "string" ? item.title : "";
    const note = typeof item.note === "string" ? item.note : "";
    return title.includes(name) || note.includes(name);
  });
  return { shuttles, deliveries, guestGroups, gates, commitments };
}

function originStopId(origin: string | undefined, fallbackId: string): string {
  if (!origin) return fallbackId;
  return ORIGIN_STOPS[origin] ?? origin;
}

export function routeTo(
  world: WorldModel,
  fromId: string,
  toPlaceId: string,
): RouteEstimate {
  const from = placeById(world, fromId);
  const to = placeById(world, toPlaceId);
  const direct = world.links.find((link) => link.from === fromId && link.to === toPlaceId);
  if (direct) {
    return {
      route: direct.route,
      minutes: direct.minutes,
      crossesZone: direct.kind === "external_transfer" || Boolean(from?.zone && to?.zone && from.zone !== to.zone),
    };
  }

  const viaAccess = world.links.find((link) => link.from === fromId && link.to === "accesoSur");
  const transfer = world.links.find((link) => link.from === "accesoSur" && link.to === toPlaceId);
  if (viaAccess && transfer) {
    return {
      route: [...viaAccess.route.slice(0, -1), ...transfer.route],
      minutes: viaAccess.minutes + transfer.minutes,
      crossesZone: true,
    };
  }

  const start = from?.pos ?? ([40.47, -3.62] as LatLng);
  const end = to?.pos ?? start;
  const minutes = Math.max(5, Math.round((haversineKm(start, end) / 30) * 60));
  return {
    route: [start, end],
    minutes,
    crossesZone: Boolean(from?.zone && to?.zone && from.zone !== to.zone),
  };
}

export function etaFor(
  world: WorldModel,
  vehicle: VehicleLike,
  toPlaceId: string,
  now: number,
): RouteEstimate & { arriveAt: number } {
  const fromId =
    originStopId(vehicle.origin, vehicle.destinationId ?? vehicle.dockId ?? toPlaceId);
  const estimate = routeTo(world, fromId, toPlaceId);
  const delay = (vehicle.delayMin ?? 0) * 60;
  return {
    ...estimate,
    arriveAt: Math.max(now, vehicle.departAt) + estimate.minutes * 60 + delay,
  };
}

export function worldSummary(world: WorldModel, state: CrisisStateDocument) {
  return {
    places: world.places.map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind,
      zone: place.zone,
      capacity: place.capacity,
      status: liveStatus(state, place.id) ?? "desconocido",
    })),
    links: world.links.map((link) => ({
      from: link.from,
      to: link.to,
      kind: link.kind,
      minutes: link.minutes,
    })),
  };
}
