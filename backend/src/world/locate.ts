import type { LatLng, RouteEstimate, WorldModel, WorldPlace } from "./world.js";
import { placeById } from "./world.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const UA = "hackspain-madring/1.0 (demo; https://github.com/pdsdm/hackspain)";
const TIMEOUT_MS = 2500;

export interface ResolvedLocation {
  id: string;
  name: string;
  pos: LatLng;
  source: "world" | "geocode";
}

export interface TripPlan extends RouteEstimate {
  from: ResolvedLocation;
  toName: string;
  source: "world-link" | "osrm" | "straight";
}

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = globalThis.fetch.bind(globalThis);
const geoCache = new Map<string, ResolvedLocation | null>();
const osrmCache = new Map<string, RouteEstimate | null>();

export function setLocateFetch(next: FetchLike): void {
  fetchImpl = next;
}

export function clearLocateCache(): void {
  geoCache.clear();
  osrmCache.clear();
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return fold(value)
    .split(" ")
    .filter((word) => word.length > 2 && !["del", "las", "los", "una", "con", "por", "para"].includes(word));
}

export function findPlaceInWorld(world: WorldModel, query: string | undefined): WorldPlace | undefined {
  const q = fold(query ?? "");
  if (!q) return undefined;
  const exact = world.places.find((place) => fold(place.id) === q || fold(place.name) === q);
  if (exact) return exact;
  const words = tokens(q);
  if (words.length === 0) return undefined;
  const scored = world.places
    .map((place) => {
      const hay = fold(`${place.id} ${place.name}`);
      const hits = words.filter((word) => hay.includes(word)).length;
      return { place, hits };
    })
    .filter((item) => item.hits === words.length || (words.length === 1 && item.hits === 1))
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.place;
}

function parseCoords(query: string): LatLng | undefined {
  const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lat, lng];
}

async function timedJson(url: string): Promise<unknown> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export async function geocode(query: string): Promise<ResolvedLocation | undefined> {
  const key = fold(query);
  if (geoCache.has(key)) return geoCache.get(key) ?? undefined;
  const coords = parseCoords(query);
  if (coords) {
    const hit: ResolvedLocation = { id: key, name: query.trim(), pos: coords, source: "geocode" };
    geoCache.set(key, hit);
    return hit;
  }
  const q = /madrid|españa|spain/i.test(query) ? query.trim() : `${query.trim()}, Madrid, España`;
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=es&q=${encodeURIComponent(q)}`;
  try {
    const json = await timedJson(url);
    const row = Array.isArray(json) ? json[0] : undefined;
    if (!row || typeof row !== "object") {
      geoCache.set(key, null);
      return undefined;
    }
    const lat = Number((row as { lat?: string }).lat);
    const lon = Number((row as { lon?: string }).lon);
    const name = String((row as { display_name?: string }).display_name ?? query.trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      geoCache.set(key, null);
      return undefined;
    }
    const hit: ResolvedLocation = { id: `geo-${key.slice(0, 24)}`, name, pos: [lat, lon], source: "geocode" };
    geoCache.set(key, hit);
    return hit;
  } catch {
    geoCache.set(key, null);
    return undefined;
  }
}

export async function resolveLocation(world: WorldModel, query: string): Promise<ResolvedLocation | undefined> {
  const known = findPlaceInWorld(world, query);
  if (known) return { id: known.id, name: known.name, pos: known.pos, source: "world" };
  return geocode(query);
}

function haversineMinutes(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLng * sinLng;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.max(5, Math.round((km / 30) * 60));
}

export async function drivingRoute(from: LatLng, to: LatLng): Promise<RouteEstimate | undefined> {
  const key = `${from[0].toFixed(5)},${from[1].toFixed(5)};${to[0].toFixed(5)},${to[1].toFixed(5)}`;
  if (osrmCache.has(key)) return osrmCache.get(key) ?? undefined;
  const path = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  try {
    const json = (await timedJson(`${OSRM}${path}?overview=full&geometries=geojson`)) as {
      routes?: Array<{ duration?: number; geometry?: { coordinates?: [number, number][] } }>;
    };
    const route = json.routes?.[0];
    const line = route?.geometry?.coordinates ?? [];
    if (line.length < 2) {
      osrmCache.set(key, null);
      return undefined;
    }
    const estimate: RouteEstimate = {
      route: line.map(([lon, lat]) => [lat, lon] as LatLng),
      minutes: Math.max(1, Math.round((route?.duration ?? 0) / 60)),
      crossesZone: false,
    };
    osrmCache.set(key, estimate);
    return estimate;
  } catch {
    osrmCache.set(key, null);
    return undefined;
  }
}

export async function planTrip(world: WorldModel, fromQuery: string, toPlaceId: string): Promise<TripPlan | undefined> {
  const from = await resolveLocation(world, fromQuery);
  const to = placeById(world, toPlaceId);
  if (!from || !to) return undefined;
  if (from.source === "world") {
    const direct = world.links.find((link) => link.from === from.id && link.to === to.id);
    if (direct) {
      return {
        route: direct.route,
        minutes: direct.minutes,
        crossesZone: direct.kind === "external_transfer",
        from,
        toName: to.name,
        source: "world-link",
      };
    }
    const viaAccess = world.links.find((link) => link.from === from.id && link.to === "accesoSur");
    const transfer = world.links.find((link) => link.from === "accesoSur" && link.to === to.id);
    if (viaAccess && transfer) {
      return {
        route: [...viaAccess.route.slice(0, -1), ...transfer.route],
        minutes: viaAccess.minutes + transfer.minutes,
        crossesZone: true,
        from,
        toName: to.name,
        source: "world-link",
      };
    }
  }
  const osrm = await drivingRoute(from.pos, to.pos);
  if (osrm) return { ...osrm, from, toName: to.name, source: "osrm" };
  const originZone = from.source === "world" ? placeById(world, from.id)?.zone : null;
  return {
    from,
    toName: to.name,
    route: [from.pos, to.pos],
    minutes: haversineMinutes(from.pos, to.pos),
    crossesZone: Boolean(originZone && to.zone && originZone !== to.zone),
    source: "straight",
  };
}
