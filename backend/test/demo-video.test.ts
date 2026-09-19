import assert from "node:assert/strict";
import test from "node:test";

import { runVideoDirector } from "../../scripts/demo-video.mts";

const response = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

type PostedEvent = {
  eventId: string;
  channel: "call" | "sms";
  actor: string;
  incidentId: "principal_pipe_burst" | "dock_blocked";
  evidence: { sessionId: string };
};

function state(posts: PostedEvent[], incompleteArea?: string) {
  const hasCall = posts.some((item) => item.incidentId === "principal_pipe_burst");
  const hasSms = posts.some((item) => item.incidentId === "dock_blocked");
  const agents = ["espacios", "catering", "transporte", "asistentes"].map((id) => ({
    id,
    status: "estable",
    objective: `Objetivo ${id}`,
    ...(id === incompleteArea ? {} : { reason: `Motivo ${id}`, lastResult: `Resultado ${id}` }),
  }));
  return {
    planVersion: hasCall ? 2 : 1,
    coordinatorStatus: hasSms ? "atascado" : "estable",
    resolved: false,
    ...(hasSms ? { closureSummary: "Plan condicionado · 600 plazas pendientes de confirmación" } : {}),
    spaces: [
      { id: "principal", status: hasCall ? "cerrado" : "confirmado" },
      { id: "muelleEste", status: hasSms ? "cerrado" : "inactivo" },
    ],
    deliveries: [
      { id: "CAT-01", status: hasSms ? "bloqueada" : "confirmada" },
      { id: "CAT-02", status: hasSms ? "bloqueada" : "confirmada" },
    ],
    guestGroups: [{ id: "vip", count: 600, confirmedCount: hasCall ? 0 : 600 }],
    commitments: [{ id: "c-demo", status: "propuesto", conditions: ["Confirmación pendiente"] }],
    agents,
    calls: [],
    events: posts.map((item) => ({
      id: `timeline-${item.eventId}`,
      kind: "incidencia",
      text: item.incidentId,
      area: item.incidentId === "principal_pipe_burst" ? "espacios" : "catering",
      channel: item.channel,
      actor: item.actor,
      provenance: { source: "happyrobot", eventId: item.eventId, sessionId: item.evidence.sessionId },
    })),
  };
}

async function withDirector(
  argv: string[],
  incompleteArea?: string,
): Promise<{ posts: PostedEvent[]; resets: number; logs: string[] }> {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  const originalLog = console.log;
  const posts: PostedEvent[] = [];
  const logs: string[] = [];
  let resets = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/simulation/reset")) {
      posts.length = 0;
      resets += 1;
      return response({ ok: true, runId: `run-${resets}`, planVersion: 1 });
    }
    if (url.endsWith("/state")) return response(state(posts, incompleteArea));
    if (url.endsWith("/actions")) return response({ tasks: [] });
    if (url.endsWith("/workflow/happyrobot/events")) {
      const payload = JSON.parse(String(init?.body)) as PostedEvent;
      posts.push(payload);
      return response({ ok: true, duplicate: false, eventId: payload.eventId, incidentId: payload.incidentId, planVersion: 2 });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    process.argv = ["node", "demo-video.mts", ...argv];
    process.env = { ...originalEnv, DEMO_API_URL: "http://backend.test", HAPPYROBOT_WEBHOOK_TOKEN: "test-token", DEMO_VIDEO_TIMEOUT_MS: "10000" };
    console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
    await runVideoDirector(fetchFn);
    return { posts: [...posts], resets, logs };
  } finally {
    process.argv = originalArgv;
    process.env = originalEnv;
    console.log = originalLog;
  }
}

test("demo director repeats API rehearsals from calm and validates observable checkpoints", async () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  const originalLog = console.log;
  const allPosts: PostedEvent[] = [];
  const rehearsalPosts: PostedEvent[] = [];
  const logs: string[] = [];
  let resets = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/simulation/reset")) {
      rehearsalPosts.length = 0;
      resets += 1;
      return response({ ok: true, runId: `run-${resets}`, planVersion: 1 });
    }
    if (url.endsWith("/state")) return response(state(rehearsalPosts));
    if (url.endsWith("/actions")) return response({ tasks: [] });
    if (url.endsWith("/workflow/happyrobot/events")) {
      const payload = JSON.parse(String(init?.body)) as PostedEvent;
      rehearsalPosts.push(payload);
      allPosts.push(payload);
      return response({ ok: true, duplicate: false, eventId: payload.eventId, incidentId: payload.incidentId, planVersion: 2 });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    process.argv = ["node", "demo-video.mts", "--inputs=api", "--rehearsals=2", "--report=-"];
    process.env = { ...originalEnv, DEMO_API_URL: "http://backend.test", HAPPYROBOT_WEBHOOK_TOKEN: "test-token", DEMO_VIDEO_TIMEOUT_MS: "10000" };
    console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
    await runVideoDirector(fetchFn);
  } finally {
    process.argv = originalArgv;
    process.env = originalEnv;
    console.log = originalLog;
  }

  assert.equal(resets, 2);
  assert.equal(allPosts.length, 4);
  assert.deepEqual(allPosts.map((item) => item.channel), ["call", "sms", "call", "sms"]);
  assert.equal(new Set(allPosts.map((item) => item.eventId)).size, 4);
  assert.ok(allPosts.every((item) => item.actor.startsWith("SIMULACIÓN ·")));
  assert.ok(logs.some((line) => line.includes("Ensayo 2/2")));
  assert.ok(logs.some((line) => line.includes("2/2 ensayos superados")));
});

test("demo director fails with an actionable specialist coherence diagnostic", async () => {
  await assert.rejects(
    withDirector(["--inputs=api", "--report=-"], "transporte"),
    /transporte.*reason.*lastResult/,
  );
});
