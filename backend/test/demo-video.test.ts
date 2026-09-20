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
  incidentId: "inbox_batch" | "principal_pipe_burst" | "dock_blocked";
  evidence: { sessionId: string };
};

function state(posts: PostedEvent[], incompleteArea?: string) {
  const hasCall = posts.some((item) => item.incidentId === "inbox_batch" || item.incidentId === "principal_pipe_burst");
  const hasSms = posts.some((item) => item.incidentId === "dock_blocked");
  const agents = ["espacios", "catering", "transporte", "asistentes"].map((id) => ({
    id,
    status: "estable",
    objective: `Objetivo ${id}`,
    ...(id === incompleteArea ? {} : { reason: `Motivo ${id}`, lastResult: `Resultado ${id}` }),
  }));
  return {
    planVersion: hasSms ? 3 : hasCall ? 2 : 1,
    coordinatorStatus: hasSms ? "atascado" : "estable",
    resolved: false,
    ...(hasSms ? { closureSummary: "Plan condicionado · 600 plazas pendientes de confirmación" } : {}),
    spaces: [
      { id: "principal", status: hasCall ? "cerrado" : "confirmado", zone: "sur" },
      { id: "pabellonB", status: hasCall ? "pendiente" : "inactivo", zone: "sur" },
      { id: "loungeSur", status: hasCall ? "pendiente" : "inactivo", zone: "sur" },
      { id: "muelleEste", status: hasSms ? "cerrado" : "inactivo", zone: "sur" },
      { id: "muelleSur", status: "operativo", zone: "sur" },
      { id: "accesoSur", status: "operativo", zone: "sur" },
    ],
    deliveries: [
      { id: "CAT-01", status: hasSms ? "bloqueada" : "confirmada", dockId: "muelleSur" },
      { id: "CAT-02", status: hasSms ? "bloqueada" : "confirmada", dockId: "muelleSur" },
    ],
    shuttles: ["BUS-01", "BUS-02", "BUS-03", "BUS-04"].map((id) => ({ id, destinationId: "accesoSur" })),
    guestGroups: [{ id: "vip", count: 600, confirmedCount: hasCall ? 0 : 600 }],
    assignments: hasCall ? [
      { groupId: "g-acceso", spaceId: "pabellonB", count: 90 },
      { groupId: "g-shuttles", spaceId: "pabellonB", count: 180 },
      { groupId: "g-propios", spaceId: "pabellonB", count: 180 },
      { groupId: "g-propios", spaceId: "loungeSur", count: 150 },
    ] : [],
    ...(posts.some((item) => item.incidentId === "inbox_batch") ? { inboxTriage: { received: 10, relevant: 1, ignored: 9, status: "triaged", selected: "principal_pipe_burst" } } : {}),
    commitments: [{ id: "c-demo", status: "propuesto", conditions: ["Confirmación pendiente"] }],
    agents,
    calls: hasCall ? [{ agent: "transporte", status: "terminada", simulated: true, transcript: [{ who: "agente", text: "Confirmar shuttles", at: 2 }] }] : [],
    events: posts.map((item) => ({
      id: `timeline-${item.eventId}`,
      kind: "incidencia",
      text: item.incidentId,
      area: item.incidentId === "dock_blocked" ? "catering" : "espacios",
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
  assert.deepEqual(allPosts.map((item) => item.incidentId), ["principal_pipe_burst", "dock_blocked", "principal_pipe_burst", "dock_blocked"]);
  assert.equal(allPosts.some((item) => item.incidentId === "inbox_batch"), false);
  assert.deepEqual(allPosts.map((item) => item.channel), ["call", "sms", "call", "sms"]);
  assert.equal(new Set(allPosts.map((item) => item.eventId)).size, 4);
  assert.ok(allPosts.every((item) => item.actor.startsWith("SIMULACIÓN ·")));
  assert.ok(logs.some((line) => line.includes("Ensayo 2/2")));
  assert.ok(logs.some((line) => line.includes("2/2 ensayos superados")));
});

test("demo director uses the environment-specific HappyRobot hook", async () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  const originalLog = console.log;
  const posts: PostedEvent[] = [];
  const urls: string[] = [];
  const logs: string[] = [];
  const hookUrl = "https://workflows.platform.eu.happyrobot.ai/hooks/development/demo-inputs";
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/simulation/e2e/reset")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init?.body)), { realTransportCall: true });
      posts.length = 0;
      return response({ ok: true, runId: "run-hook", planVersion: 1, externalActions: "coordinator-transport-call-rest-sim" });
    }
    if (url.endsWith("/state")) return response(state(posts));
    if (url.endsWith("/actions")) return response({ tasks: [] });
    if (url.endsWith("/coordinator/happyrobot/report")) {
      const second = posts.some((item) => item.incidentId === "dock_blocked");
      return response({
        correlationId: second ? "corr-2" : "corr-1",
        happyrobotRunId: second ? "coord-2" : "coord-1",
        runId: "run-hook",
        planVersion: second ? 2 : 1,
        status: "accepted",
        applied: true,
        latencyMs: 100,
        consults: second ? 0 : 1,
        submissions: 1,
        validationErrors: [],
        output: second ? { operations: [
          { op: "redirect_delivery", id: "CAT-01", dockId: "muelleSur" },
          { op: "redirect_delivery", id: "CAT-02", dockId: "muelleSur" },
        ] } : { operations: [] },
      });
    }
    if (url === hookUrl) {
      const payload = JSON.parse(String(init?.body)) as PostedEvent & { backend_base_url: string; sessionId: string };
      assert.equal(payload.backend_base_url, "https://backend.example");
      assert.equal(payload.sessionId, payload.evidence.sessionId);
      posts.push(payload);
      return response({ run_id: `hr-${posts.length}`, status: "workflow started" });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    process.argv = ["node", "demo-video.mts", "--inputs=happyrobot", "--real-transport-call", "--report=-"];
    process.env = {
      ...originalEnv,
      DEMO_API_URL: "http://backend.test",
      DEMO_VIDEO_TIMEOUT_MS: "10000",
      HAPPYROBOT_DEMO_INPUT_HOOK_URL: hookUrl,
      HAPPYROBOT_WEBHOOK_TOKEN: "test-token",
      PUBLIC_BASE_URL: "https://backend.example",
    };
    console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
    await runVideoDirector(fetchFn);
  } finally {
    process.argv = originalArgv;
    process.env = originalEnv;
    console.log = originalLog;
  }

  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map((item) => item.channel), ["call", "sms"]);
  assert.equal(urls.filter((url) => url === hookUrl).length, 2);
  assert.equal(urls.some((url) => url.includes("/workflows/")), false);
  assert.ok(logs.some((line) => line.includes("llamada real controlada de Transporte está autorizada")));
  assert.equal(logs.some((line) => line.includes("0 llamadas.")), false);
});

test("demo director fails with an actionable specialist coherence diagnostic", async () => {
  await assert.rejects(
    withDirector(["--inputs=api", "--report=-"], "transporte"),
    /transporte.*reason.*lastResult/,
  );
});
