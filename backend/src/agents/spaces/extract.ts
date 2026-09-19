// Convierte la respuesta de una llamada de Espacios en datos para el estado (T11).
// No decide si la condición encaja en el plan: eso es del coordinador (T10).

import { QUESTION_ORDER } from "./prompt.js";
import type {
  Availability,
  ExtractionIssue,
  RaceFeed,
  SpaceAnswer,
  SpaceUpdate,
  SpaceUpdateStatus,
  SpacesAnswer,
  SpacesBrief,
  SpacesCommitment,
  SpacesResult,
  Zone,
} from "./types.js";

const AVAILABILITIES: readonly Availability[] = [
  "disponible",
  "condicionada",
  "no_disponible",
  "sin_respuesta",
];
const ZONES: readonly Zone[] = ["norte", "sur"];
const RACE_FEEDS: readonly RaceFeed[] = ["si", "no", "desconocido"];

type QuestionKey = (typeof QUESTION_ORDER)[number]["key"];

const DAY_SECONDS = 24 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hhmm(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Acepta la hora como la diga el interlocutor ("13:15", "13.15", "13h15", "13 h")
 * o ya en segundos desde medianoche. Lo que no se entienda no se adivina.
 */
export function parseClock(value: number | string): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value < DAY_SECONDS ? value : undefined;
  }

  const text = value.trim().toLowerCase();
  const withMinutes = /^(\d{1,2})\s*[:.h]\s*(\d{2})$/.exec(text);
  if (withMinutes !== null) {
    const hours = Number(withMinutes[1]);
    const minutes = Number(withMinutes[2]);
    if (hours > 23 || minutes > 59) return undefined;
    return hours * 3600 + minutes * 60;
  }

  const onlyHours = /^(\d{1,2})\s*h?$/.exec(text);
  if (onlyHours !== null) {
    const hours = Number(onlyHours[1]);
    if (hours > 23) return undefined;
    return hours * 3600;
  }

  return undefined;
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function statusFor(availability: Availability): SpaceUpdateStatus {
  if (availability === "no_disponible") return "descartado";
  if (availability === "sin_respuesta") return "pendiente";
  return "propuesto";
}

/** Comprueba que la respuesta tiene la forma del esquema antes de normalizarla. */
export function checkShape(value: unknown): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  const add = (detail: string) => issues.push({ code: "forma", detail });

  if (!isRecord(value)) {
    add("la respuesta no es un objeto JSON");
    return issues;
  }

  if (typeof value.callId !== "string" || value.callId.trim() === "") add("callId vacío");
  if (typeof value.counterpart !== "string" || value.counterpart.trim() === "") {
    add("counterpart vacío");
  }

  if (!Array.isArray(value.spaces)) {
    add("spaces no es una lista");
    return issues;
  }

  for (const [index, raw] of value.spaces.entries()) {
    if (!isRecord(raw)) {
      add(`spaces[${index}] no es un objeto`);
      continue;
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") add(`spaces[${index}].id vacío`);
    if (!AVAILABILITIES.includes(raw.availability as Availability)) {
      add(`spaces[${index}].availability desconocida: ${String(raw.availability)}`);
    }
    if (raw.conditions !== undefined && !Array.isArray(raw.conditions)) {
      add(`spaces[${index}].conditions no es una lista`);
    }
  }

  return issues;
}

function normalizeSpace(
  answer: SpaceAnswer,
  brief: SpacesBrief,
  callId: string,
  issues: ExtractionIssue[],
): { update: SpaceUpdate; commitment: SpacesCommitment | null; missing: string[]; cost: number } | null {
  const candidate = brief.candidates.find((item) => item.id === answer.id);
  if (candidate === undefined) {
    issues.push({ code: "espacio_desconocido", detail: answer.id });
    return null;
  }

  const known = new Map<QuestionKey, unknown>();

  let capacity: number | undefined;
  if (typeof answer.capacity === "number" && Number.isFinite(answer.capacity) && answer.capacity > 0) {
    capacity = Math.floor(answer.capacity);
    known.set("capacidad", capacity);
    if (candidate.capacity !== undefined && candidate.capacity !== capacity) {
      issues.push({
        code: "capacidad_contradictoria",
        detail: `${candidate.id}: catálogo ${candidate.capacity}, llamada ${capacity}`,
      });
    }
  }

  let zone: Zone | undefined;
  if (typeof answer.zone === "string" && ZONES.includes(answer.zone)) {
    zone = answer.zone;
    known.set("zona", zone);
    if (zone !== candidate.zone) {
      issues.push({
        code: "zona_contradictoria",
        detail: `${candidate.id}: catálogo ${candidate.zone}, llamada ${zone}`,
      });
    }
  }

  let readyAt: number | undefined;
  if (answer.readyAt !== undefined && answer.readyAt !== null) {
    readyAt = parseClock(answer.readyAt);
    if (readyAt === undefined) {
      issues.push({ code: "hora_ilegible", detail: `${candidate.id}: ${String(answer.readyAt)}` });
    } else {
      known.set("hora de montaje", readyAt);
    }
  }

  const access = typeof answer.access === "string" ? answer.access.trim() : "";
  if (access !== "") known.set("accesos", access);

  const raceFeed =
    typeof answer.raceFeed === "string" && RACE_FEEDS.includes(answer.raceFeed)
      ? answer.raceFeed
      : undefined;
  if (raceFeed !== undefined && raceFeed !== "desconocido") known.set("señal de carrera", raceFeed);

  let cost = 0;
  if (typeof answer.cost === "number" && Number.isFinite(answer.cost) && answer.cost >= 0) {
    cost = answer.cost;
    known.set("coste", cost);
  }

  const conditions = cleanStrings(answer.conditions);
  const status = statusFor(answer.availability);

  // Una hora de disponibilidad posterior a la apertura es una condición, no un descarte.
  if (status === "propuesto" && readyAt !== undefined && readyAt > brief.openingAt) {
    const hour = hhmm(readyAt);
    if (!conditions.some((condition) => condition.includes(hour))) {
      conditions.push(
        `no está utilizable hasta las ${hour}, después de la apertura de las ${hhmm(brief.openingAt)}`,
      );
    }
  }

  if (answer.availability === "condicionada" && conditions.length === 0) {
    issues.push({ code: "condicion_sin_detalle", detail: candidate.id });
  }

  const noteParts: string[] = [];
  if (access !== "") noteParts.push(`acceso: ${access}`);
  if (raceFeed !== undefined) noteParts.push(`señal de carrera: ${raceFeed}`);

  const update: SpaceUpdate = {
    id: candidate.id,
    status,
    ...(capacity !== undefined ? { capacity } : {}),
    ...(zone !== undefined ? { zone } : {}),
    ...(readyAt !== undefined ? { readyAt } : {}),
    ...(noteParts.length > 0 ? { note: noteParts.join(" · ") } : {}),
    evidenceCallId: callId,
  };

  const commitment: SpacesCommitment | null =
    status === "descartado"
      ? null
      : {
          id: `c-espacios-${candidate.id}`,
          title: `${candidate.name} para los ${brief.headcount} invitados de hospitalidad`,
          area: "espacios",
          status:
            answer.availability === "condicionada" || conditions.length > 0
              ? "aceptado_condiciones"
              : "en_consulta",
          counterpart: brief.counterpart,
          conditions,
          evidenceCallId: callId,
        };

  const missing =
    status === "descartado"
      ? []
      : QUESTION_ORDER.filter((question) => !known.has(question.key)).map(
          (question) => `${candidate.id}: ${question.key}`,
        );

  return { update, commitment, missing, cost };
}

export function extract(
  answer: SpacesAnswer,
  brief: SpacesBrief,
): { result: SpacesResult; issues: ExtractionIssue[] } {
  const issues: ExtractionIssue[] = [];
  const spaceUpdates: SpaceUpdate[] = [];
  const commitments: SpacesCommitment[] = [];
  const missing: string[] = [];
  let forecastDelta = 0;

  for (const space of answer.spaces) {
    const normalized = normalizeSpace(space, brief, answer.callId, issues);
    if (normalized === null) continue;
    spaceUpdates.push(normalized.update);
    if (normalized.commitment !== null) commitments.push(normalized.commitment);
    missing.push(...normalized.missing);
    forecastDelta += normalized.cost;
  }

  return { result: { spaceUpdates, commitments, forecastDelta, missing }, issues };
}

export function parseAnswer(
  text: string,
  brief: SpacesBrief,
): { result: SpacesResult | null; issues: ExtractionIssue[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { result: null, issues: [{ code: "json_invalido", detail: "la respuesta no es JSON" }] };
  }

  const shapeIssues = checkShape(value);
  if (shapeIssues.length > 0) {
    return { result: null, issues: shapeIssues };
  }

  return extract(value as SpacesAnswer, brief);
}
