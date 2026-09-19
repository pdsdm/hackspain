import { TWIST_IDS, type TwistId } from "../contracts/api.js";
import type { CrisisStateDocument } from "./crisis-state.js";
import { mulberry32 } from "./random.js";

export const TWIST_LABELS: Record<TwistId, string> = {
  lounge_unavailable: "El Lounge Sur deja de estar disponible",
  pabellon_b_400: "Pabellón B reduce su aforo a 400",
  shuttle_delay: "BUS-02 se retrasa 20 minutos",
  delivery_delay: "CAT-02 se retrasa 25 minutos",
  dock_blocked: "Muelle Este Sur bloqueado",
  provider_silent: "El transportista no responde",
  reject_spend: "El responsable rechaza el gasto adicional",
  reject_split: "Se rechaza dividir la hospitalidad; se evalúa Norte C",
  guest_need: "Una invitada comunica una necesidad de accesibilidad no registrada",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(state: CrisisStateDocument, field: string): Array<Record<string, unknown>> {
  const value = state[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function findById(values: Array<Record<string, unknown>>, id: string) {
  return values.find((value) => value.id === id);
}

function applied(state: CrisisStateDocument): Set<string> {
  return new Set(
    Array.isArray(state.twistsApplied)
      ? state.twistsApplied.filter((value): value is string => typeof value === "string")
      : [],
  );
}

export function twistSequence(seed: number): TwistId[] {
  const random = mulberry32((seed * 0x9e3779b9) >>> 0);
  const ids = [...TWIST_IDS];
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap]!, ids[index]!];
  }
  return ids;
}

export function twistEligible(state: CrisisStateDocument, twist: TwistId): boolean {
  const spaces = records(state, "spaces");
  switch (twist) {
    case "lounge_unavailable":
      return findById(spaces, "loungeSur")?.status !== "descartado";
    case "pabellon_b_400":
      return Number(findById(spaces, "pabellonB")?.capacity ?? 0) !== 400;
    case "shuttle_delay": {
      const shuttle = findById(records(state, "shuttles"), "BUS-02");
      return Boolean(shuttle) && shuttle?.status !== "llegado";
    }
    case "delivery_delay": {
      const delivery = findById(records(state, "deliveries"), "CAT-02");
      return Boolean(delivery) && delivery?.status !== "entregada";
    }
    case "dock_blocked":
      return findById(spaces, "muelleEste")?.status !== "cerrado";
    case "provider_silent":
      return findById(records(state, "agents"), "transporte")?.status !== "incidencia";
    case "reject_spend":
      return records(state, "decisions").some((decision) => decision.status === "pendiente");
    case "reject_split":
      return findById(spaces, "pabellonB")?.status !== "descartado";
    case "guest_need": {
      const group = findById(records(state, "guestGroups"), "g-propios");
      return typeof group?.needs !== "string" || !group.needs.includes("accesibilidad");
    }
  }
}

export function nextAutoTwist(state: CrisisStateDocument, seed: number): TwistId | undefined {
  const done = applied(state);
  for (const twist of twistSequence(seed)) {
    if (done.has(twist)) continue;
    if (!twistEligible(state, twist)) continue;
    return twist;
  }
  return undefined;
}
