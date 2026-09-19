import type { CrisisStateDocument } from "./crisis-state.js";
import { mulberry32 } from "./random.js";

export interface ArrivalStep {
  at: number;
  perMin: number;
}

export interface Burst {
  gateId: string;
  name: string;
  perMin: number;
  minutes: number;
}

export interface Saturation {
  gateId: string;
  name: string;
  zone: string;
  waiting: number;
}

export interface AttendanceResult {
  changed: boolean;
  bursts: Burst[];
  saturated: Saturation[];
}

export const SATURATION_WAITING = 2500;
export const SATURATION_COOLDOWN_SECONDS = 900;
export const BURST_PROBABILITY = 0.08;

const HOUR = 3600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function profileFactor(clock: Record<string, unknown>, seconds: number): number {
  const opening = Number(clock.openingAt ?? 46800);
  const race = Number(clock.raceAt ?? 54000);
  if (seconds < opening - 2 * HOUR) return 0.6;
  if (seconds < opening - HOUR) return 0.9;
  if (seconds < opening) return 1.3;
  if (seconds < opening + 20 * 60) return 1.8;
  if (seconds < race - 30 * 60) return 0.7;
  if (seconds < race) return 1.6;
  return 0.2;
}

export function stepValue(profile: ArrivalStep[], seconds: number): number | undefined {
  let value: number | undefined;
  for (const step of profile) {
    if (Number(step.at) <= seconds) value = Number(step.perMin);
  }
  return value;
}

export function burstAt(seed: number, minute: number, gateCount: number): { gate: number; perMin: number; minutes: number } | undefined {
  if (gateCount === 0) return undefined;
  const random = mulberry32((seed * 1_000_003 + minute) >>> 0);
  if (random() >= BURST_PROBABILITY) return undefined;
  return {
    gate: Math.floor(random() * gateCount),
    perMin: 200 + Math.floor(random() * 400),
    minutes: 3 + Math.floor(random() * 5),
  };
}

function effectiveArrivals(gate: Record<string, unknown>, clock: CrisisStateDocument["clock"], seconds: number): number {
  const profile = Array.isArray(gate.arrivalProfile) ? (gate.arrivalProfile as ArrivalStep[]) : undefined;
  const fromProfile = profile ? stepValue(profile, seconds) : undefined;
  const base = Number(gate.baseArrivalsPerMin ?? gate.arrivalsPerMin ?? 0);
  const planned = fromProfile ?? base * profileFactor(clock, seconds);
  const burst = Number(gate.burstUntil ?? 0) > seconds ? Number(gate.burstPerMin ?? 0) : 0;
  return Math.round(planned + burst);
}

export function advanceAttendance(state: CrisisStateDocument, from: number, to: number, seed: number): AttendanceResult {
  const result: AttendanceResult = { changed: false, bursts: [], saturated: [] };
  const gates = records(state, "gates");
  if (gates.length === 0 || to <= from) return result;
  const open = gates.filter((gate) => gate.status !== "cerrado");

  for (let minute = Math.floor(from / 60) + 1; minute <= Math.floor(to / 60); minute += 1) {
    const burst = burstAt(seed, minute, open.length);
    if (!burst) continue;
    const gate = open[burst.gate]!;
    gate.burstUntil = minute * 60 + burst.minutes * 60;
    gate.burstPerMin = burst.perMin;
    result.bursts.push({ gateId: String(gate.id), name: String(gate.name ?? gate.id), perMin: burst.perMin, minutes: burst.minutes });
  }

  const mins = (to - from) / 60;
  for (const gate of open) {
    const firstPass = gate.baseArrivalsPerMin === undefined;
    if (firstPass) {
      gate.baseArrivalsPerMin = Number(gate.arrivalsPerMin ?? 0);
      if (gate.status === "saturado") gate.lastSaturationAt = from;
    }
    const arrivalsPerMin = effectiveArrivals(gate, state.clock, to);
    const capacity = Number(gate.capacity ?? 0);
    const entered = Number(gate.entered ?? 0);
    const waiting = Number(gate.waiting ?? 0);
    const room = Math.max(0, capacity - entered);
    const arrivals = arrivalsPerMin * mins;
    const served = Math.min(Number(gate.throughputPerMin ?? 0) * mins, waiting + arrivals, room);
    const nextWaiting = Math.max(0, Math.round(waiting + arrivals - served));
    const nextEntered = Math.min(capacity, Math.round(entered + served));
    const saturated = nextWaiting > SATURATION_WAITING;
    gate.arrivalsPerMin = arrivalsPerMin;
    gate.waiting = nextWaiting;
    gate.entered = nextEntered;
    gate.status = saturated ? "saturado" : "abierto";
    if (saturated && to - Number(gate.lastSaturationAt ?? -Infinity) >= SATURATION_COOLDOWN_SECONDS) {
      gate.lastSaturationAt = to;
      result.saturated.push({ gateId: String(gate.id), name: String(gate.name ?? gate.id), zone: String(gate.zone ?? ""), waiting: nextWaiting });
    }
  }
  state.gates = gates;
  result.changed = true;
  return result;
}
