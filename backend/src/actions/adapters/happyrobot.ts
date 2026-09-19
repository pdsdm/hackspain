import { readFileSync } from "node:fs";

import { logAction, logActionError } from "../../log.js";
import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import type { DispatchTask } from "../../state/task-repository.js";

const SEED_URL = new URL("../../../fixtures/madring/seed.json", import.meta.url);

interface SeedContact {
  id: string;
  role: string;
  phone: string | null;
  email: string | null;
}

const ROLE_BY_AREA: Record<string, string> = {
  espacios: "venue-manager",
  catering: "catering-manager",
  transporte: "transport-manager",
  asistentes: "reception-manager",
};

const FALLBACK_CONTACT: SeedContact = {
  id: "test-organizer",
  role: "organizer",
  phone: null,
  email: null,
};

let seedContacts: SeedContact[] | undefined;

function contacts(): SeedContact[] {
  if (!seedContacts) {
    seedContacts = (JSON.parse(readFileSync(SEED_URL, "utf8")) as { contacts: SeedContact[] }).contacts;
  }
  return seedContacts;
}

// E.164: "+" y de 7 a 15 dígitos, sin espacios ni guiones. HappyRobot rechaza el resto.
const E164 = /^\+[1-9]\d{6,14}$/;
const warnedPhones = new Set<string>();

/**
 * Los teléfonos no están en el fixture a propósito (es sintético y público): salen del
 * entorno, por área y con un número de pruebas de reserva.
 */
function phoneFor(area: string, phones: Record<string, string>): string | null {
  const raw = phones[area] ?? phones.default;
  if (raw === undefined) return null;
  if (E164.test(raw)) return raw;
  if (!warnedPhones.has(raw)) {
    warnedPhones.add(raw);
    logActionError(`teléfono de ${area} descartado, no está en E.164 (+34600000000): "${raw}"`);
  }
  return null;
}

function contactFor(area: string, phones: Record<string, string>): SeedContact {
  const role = ROLE_BY_AREA[area] ?? "organizer";
  const contact = contacts().find((item) => item.role === role) ?? FALLBACK_CONTACT;
  return { ...contact, phone: contact.phone ?? phoneFor(area, phones) };
}

export async function dispatchHappyRobot(input: {
  hookUrl: string;
  apiKey: string;
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  publicBaseUrl: string;
  contactPhones: Record<string, string>;
  state: CrisisStateDocument;
}): Promise<"dispatched" | "unknown"> {
  const payload = typeof input.task.payload === "object" && input.task.payload !== null
    ? (input.task.payload as Record<string, unknown>)
    : {};
  const contact = contactFor(input.task.area, input.contactPhones);
  if (contact.phone === null && input.task.kind === "call") {
    logAction(`sin teléfono para ${input.task.area}: el workflow decidirá a quién llama`);
  }
  try {
    const response = await fetch(input.hookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        taskId: input.task.id,
        runId: input.runId,
        planVersion: input.planVersion,
        area: input.task.area,
        objective: payload.objective ?? "",
        counterpart: payload.counterpart ?? "",
        reason: payload.reason ?? "",
        callId: input.callId,
        contact,
        situation: {
          simSeconds: input.state.clock.simSeconds,
          planVersion: input.state.planVersion,
          coordinatorStatus: input.state.coordinatorStatus,
        },
        callbackUrl: `${input.publicBaseUrl}/workflow/happyrobot/results`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Sin esta traza, un hook mal configurado se veía igual que una contraparte que no
      // coge el teléfono: la tarea quedaba en "unknown" y nadie sabía por qué.
      logActionError(`hook de ${input.task.area} respondió ${response.status} ${response.statusText}`);
      return "unknown";
    }
    logAction(`despachada ${input.task.area} ${input.task.kind} ${input.task.id} por HappyRobot`);
    return "dispatched";
  } catch (error) {
    logActionError(`hook de ${input.task.area} falló:`, error instanceof Error ? error.message : error);
    return "unknown";
  }
}
