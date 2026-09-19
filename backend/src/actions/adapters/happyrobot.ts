import { readFileSync } from "node:fs";

import type { CrisisStateDocument } from "../../domain/crisis-state.js";
import { logAction, logActionError } from "../../log.js";
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

function contactFor(area: string): SeedContact {
  const role = ROLE_BY_AREA[area] ?? "organizer";
  return contacts().find((item) => item.role === role) ?? FALLBACK_CONTACT;
}

export async function dispatchHappyRobot(input: {
  hookUrl: string;
  apiKey: string;
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  publicBaseUrl: string;
  testPhone: string | undefined;
  state: CrisisStateDocument;
}): Promise<"dispatched" | "unknown"> {
  const payload = typeof input.task.payload === "object" && input.task.payload !== null
    ? (input.task.payload as Record<string, unknown>)
    : {};
  const data = typeof payload.data === "object" && payload.data !== null
    ? (payload.data as Record<string, unknown>)
    : {};
  const seedContact = contactFor(input.task.area);
  const contact = { ...seedContact, phone: input.testPhone ?? seedContact.phone };
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
        phone_number: contact.phone,
        contact,
        data,
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
      logActionError("happyrobot rejected", {
        taskId: input.task.id,
        area: input.task.area,
        status: response.status,
      });
      return "unknown";
    }
    logAction("happyrobot accepted", {
      taskId: input.task.id,
      area: input.task.area,
      status: response.status,
    });
    return "dispatched";
  } catch (error) {
    logActionError("happyrobot request failed", {
      taskId: input.task.id,
      area: input.task.area,
      error: error instanceof Error ? error.message : String(error),
    });
    return "unknown";
  }
}
