import { readFileSync } from "node:fs";

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

function contactFor(area: string): SeedContact {
  const seed = JSON.parse(readFileSync(SEED_URL, "utf8")) as { contacts: SeedContact[] };
  const role = ROLE_BY_AREA[area] ?? "organizer";
  return seed.contacts.find((contact) => contact.role === role) ?? {
    id: "test-organizer",
    role: "organizer",
    phone: null,
    email: null,
  };
}

export async function dispatchHappyRobot(input: {
  hookUrl: string;
  apiKey: string;
  task: DispatchTask;
  runId: string;
  planVersion: number;
  callId: string;
  publicBaseUrl: string;
  state: CrisisStateDocument;
}): Promise<"dispatched" | "unknown"> {
  const payload = typeof input.task.payload === "object" && input.task.payload !== null
    ? (input.task.payload as Record<string, unknown>)
    : {};
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
        contact: contactFor(input.task.area),
        situation: {
          simSeconds: input.state.clock.simSeconds,
          planVersion: input.state.planVersion,
          coordinatorStatus: input.state.coordinatorStatus,
        },
        callbackUrl: `${input.publicBaseUrl}/workflow/results`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? "dispatched" : "unknown";
  } catch {
    return "unknown";
  }
}
