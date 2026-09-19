import type { ExtractionIssue, GroupAnswer, GuestGroupUpdate } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function checkShape(value: unknown): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  const add = (detail: string) => issues.push({ code: "forma", detail });
  if (!isRecord(value)) {
    add("la respuesta no es un objeto JSON");
    return issues;
  }
  if (!Array.isArray(value.groups)) {
    add("groups no es una lista");
    return issues;
  }
  for (const [index, raw] of value.groups.entries()) {
    if (!isRecord(raw)) {
      add(`groups[${index}] no es un objeto`);
      continue;
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") add(`groups[${index}].id vacío`);
    for (const key of ["sent", "delivered", "accepted"]) {
      if (count(raw[key]) === undefined) add(`groups[${index}].${key} no es un entero ≥ 0`);
    }
  }
  return issues;
}

export function extract(
  value: unknown,
  known: ReadonlyMap<string, number>,
): { updates: GuestGroupUpdate[]; issues: ExtractionIssue[] } {
  const issues = checkShape(value);
  if (issues.length > 0) return { updates: [], issues };
  const updates: GuestGroupUpdate[] = [];
  for (const raw of (value as { groups: GroupAnswer[] }).groups) {
    const total = known.get(raw.id);
    if (total === undefined) {
      issues.push({ code: "grupo_desconocido", detail: raw.id });
      continue;
    }
    if (raw.delivered > raw.sent || raw.accepted > raw.delivered || raw.sent > total) {
      issues.push({ code: "cuenta_invalida", detail: `${raw.id}: sent ${raw.sent}, delivered ${raw.delivered}, accepted ${raw.accepted}, total ${total}` });
      continue;
    }
    const update: GuestGroupUpdate = { id: raw.id, informedCount: raw.delivered, acceptedCount: raw.accepted };
    if (raw.needsCovered === false && typeof raw.pending === "string" && raw.pending.trim() !== "") {
      update.needs = `${raw.pending.trim()} · pendiente`;
    } else if (raw.needsCovered === true && typeof raw.pending === "string" && raw.pending.trim() !== "") {
      update.needs = `${raw.pending.trim()} · cubierta`;
    }
    updates.push(update);
  }
  return { updates, issues };
}

export function toResultData(updates: GuestGroupUpdate[]): { guestGroups: GuestGroupUpdate[] } {
  return { guestGroups: updates };
}

export function guessGroupId(text: string): string | undefined {
  const match = /g-(acceso|shuttles|propios)/.exec(text);
  return match ? match[0] : undefined;
}
