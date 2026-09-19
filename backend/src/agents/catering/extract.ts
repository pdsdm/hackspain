import { parseClock } from "../spaces/extract.js";
import { QUESTION_ORDER } from "./prompt.js";
import type {
  CateringAnswer,
  CateringBrief,
  CateringCommitment,
  CateringDependency,
  CateringResult,
  DeliveryAnswer,
  DeliveryUpdate,
  DeliveryUpdateStatus,
  ExtractionIssue,
  Feasibility,
} from "./types.js";

const FEASIBILITIES: readonly Feasibility[] = ["si", "condicionada", "no", "sin_respuesta"];

type QuestionKey = (typeof QUESTION_ORDER)[number]["key"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hhmm(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function checkShape(value: unknown): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  const add = (detail: string) => issues.push({ code: "forma", detail });
  if (!isRecord(value)) {
    add("la respuesta no es un objeto JSON");
    return issues;
  }
  if (typeof value.callId !== "string" || value.callId.trim() === "") add("callId vacío");
  if (typeof value.counterpart !== "string" || value.counterpart.trim() === "") add("counterpart vacío");
  if (!Array.isArray(value.deliveries)) {
    add("deliveries no es una lista");
    return issues;
  }
  for (const [index, raw] of value.deliveries.entries()) {
    if (!isRecord(raw)) {
      add(`deliveries[${index}] no es un objeto`);
      continue;
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") add(`deliveries[${index}].id vacío`);
    if (!FEASIBILITIES.includes(raw.feasible as Feasibility)) {
      add(`deliveries[${index}].feasible desconocida: ${String(raw.feasible)}`);
    }
    if (raw.conditions !== undefined && !Array.isArray(raw.conditions)) {
      add(`deliveries[${index}].conditions no es una lista`);
    }
  }
  return issues;
}

function ownerOf(condition: string): CateringDependency["owner"] {
  const text = condition.toLowerCase();
  if (/recepci[oó]n|abrir|abra|llave/.test(text)) return "recepcion";
  if (/muelle|recinto|acceso|seguridad/.test(text)) return "recinto";
  return "catering";
}

function normalizeDelivery(
  answer: DeliveryAnswer,
  brief: CateringBrief,
  callId: string,
  issues: ExtractionIssue[],
): {
  update: DeliveryUpdate;
  commitment: CateringCommitment | null;
  dependencies: CateringDependency[];
  missing: string[];
  cost: number;
} | null {
  const candidate = brief.deliveries.find((item) => item.id === answer.id);
  if (candidate === undefined) {
    issues.push({ code: "entrega_desconocida", detail: answer.id });
    return null;
  }

  const known = new Map<QuestionKey, unknown>();
  const conditions = cleanStrings(answer.conditions);

  let services: number | undefined;
  if (typeof answer.services === "number" && Number.isFinite(answer.services) && answer.services > 0) {
    services = Math.floor(answer.services);
    known.set("cantidades", services);
    if (services !== candidate.services) {
      issues.push({ code: "cantidad_contradictoria", detail: `${candidate.id}: contrato ${candidate.services}, llamada ${services}` });
    }
  }

  let dockId: string | undefined;
  if (typeof answer.dockId === "string" && answer.dockId.trim() !== "") {
    dockId = answer.dockId.trim();
    known.set("muelle", dockId);
  }

  let arriveAt: number | undefined;
  if (answer.arriveAt !== undefined && answer.arriveAt !== null) {
    arriveAt = parseClock(answer.arriveAt);
    if (arriveAt === undefined) {
      issues.push({ code: "hora_ilegible", detail: `${candidate.id}: ${String(answer.arriveAt)}` });
    } else {
      known.set("hora", arriveAt);
    }
  }

  if (typeof answer.dietaryCovered === "boolean") {
    known.set("requisitos alimentarios", answer.dietaryCovered);
    if (!answer.dietaryCovered && !conditions.some((condition) => /aliment|men[uú]|al[eé]rg|dieta/i.test(condition))) {
      conditions.push("no garantiza los requisitos alimentarios registrados");
    }
  }

  const staff = typeof answer.staffAtDock === "string" ? answer.staffAtDock.trim() : "";
  if (staff !== "") known.set("personal", staff);

  let cost = 0;
  if (typeof answer.cost === "number" && Number.isFinite(answer.cost) && answer.cost >= 0) {
    cost = answer.cost;
    known.set("coste", cost);
  }

  if (answer.feasible !== "no" && arriveAt !== undefined && arriveAt > brief.openingAt) {
    const hour = hhmm(arriveAt);
    if (!conditions.some((condition) => condition.includes(hour))) {
      conditions.push(`llega a las ${hour}, después de la apertura de las ${hhmm(brief.openingAt)}`);
    }
  }

  if (answer.feasible === "condicionada" && conditions.length === 0) {
    issues.push({ code: "condicion_sin_detalle", detail: candidate.id });
  }

  let status: DeliveryUpdateStatus | undefined;
  if (answer.feasible === "no") status = "bloqueada";
  else if (answer.feasible === "si" && conditions.length === 0) status = "confirmada";
  else if (answer.feasible !== "sin_respuesta") status = "programada";

  const noteParts: string[] = [];
  if (answer.feasible === "sin_respuesta") noteParts.push("sin respuesta del proveedor");
  if (staff !== "") noteParts.push(`en el muelle: ${staff}`);
  if (conditions.length > 0) noteParts.push(`pendiente: ${conditions.join("; ")}`);

  const update: DeliveryUpdate = {
    id: candidate.id,
    ...(status !== undefined ? { status } : {}),
    ...(dockId !== undefined ? { dockId } : {}),
    ...(arriveAt !== undefined ? { arriveAt } : {}),
    ...(services !== undefined ? { services } : {}),
    ...(noteParts.length > 0 ? { note: noteParts.join(" · ") } : {}),
    evidenceCallId: callId,
  };

  const commitment: CateringCommitment | null =
    answer.feasible === "no" || answer.feasible === "sin_respuesta"
      ? null
      : {
          id: `c-catering-${candidate.id}`,
          title: `${candidate.name} en ${dockId ?? candidate.dockName}`,
          area: "catering",
          status: conditions.length > 0 ? "aceptado_condiciones" : "en_consulta",
          counterpart: brief.counterpart,
          conditions,
          evidenceCallId: callId,
        };

  const dependencies: CateringDependency[] = conditions.map((condition) => ({
    deliveryId: candidate.id,
    owner: ownerOf(condition),
    text: condition,
  }));

  const missing =
    answer.feasible === "no" || answer.feasible === "sin_respuesta"
      ? []
      : QUESTION_ORDER.filter((question) => !known.has(question.key)).map(
          (question) => `${candidate.id}: ${question.key}`,
        );

  return { update, commitment, dependencies, missing, cost };
}

export function extract(
  answer: CateringAnswer,
  brief: CateringBrief,
): { result: CateringResult; issues: ExtractionIssue[] } {
  const issues: ExtractionIssue[] = [];
  const result: CateringResult = { deliveryUpdates: [], commitments: [], dependencies: [], forecastDelta: 0, missing: [] };
  for (const delivery of answer.deliveries) {
    const normalized = normalizeDelivery(delivery, brief, answer.callId, issues);
    if (normalized === null) continue;
    result.deliveryUpdates.push(normalized.update);
    if (normalized.commitment !== null) result.commitments.push(normalized.commitment);
    result.dependencies.push(...normalized.dependencies);
    result.missing.push(...normalized.missing);
    result.forecastDelta += normalized.cost;
  }
  return { result, issues };
}

export function parseAnswer(
  text: string,
  brief: CateringBrief,
): { result: CateringResult | null; issues: ExtractionIssue[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { result: null, issues: [{ code: "json_invalido", detail: "la respuesta no es JSON" }] };
  }
  const shapeIssues = checkShape(value);
  if (shapeIssues.length > 0) return { result: null, issues: shapeIssues };
  return extract(value as CateringAnswer, brief);
}

export function toResultData(updates: DeliveryUpdate[]): { deliveries: Array<Omit<DeliveryUpdate, "evidenceCallId">> } {
  return { deliveries: updates.map(({ evidenceCallId: _evidence, ...rest }) => rest) };
}

export function guessDeliveryId(text: string): string | undefined {
  const match = /CAT-\d{2}/i.exec(text);
  return match ? match[0].toUpperCase() : undefined;
}
