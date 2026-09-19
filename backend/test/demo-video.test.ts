import assert from "node:assert/strict";
import test from "node:test";

import { runVideoDirector } from "../../scripts/demo-video.mts";

const response = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

function state(input: { principal?: string; dock?: string; delivery?: string; coordinator?: string } = {}) {
  return {
    planVersion: input.principal === "cerrado" ? 2 : 1,
    coordinatorStatus: input.coordinator ?? "estable",
    resolved: false,
    spaces: [
      { id: "principal", status: input.principal ?? "confirmado" },
      { id: "muelleEste", status: input.dock ?? "inactivo" },
    ],
    deliveries: [
      { id: "CAT-01", status: input.delivery ?? "programada" },
      { id: "CAT-02", status: input.delivery ?? "programada" },
    ],
    calls: [],
  };
}

test("demo director resets, sends call before SMS and waits for both effects", async () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
  const originalLog = console.log;
  const posts: Array<Record<string, unknown>> = [];
  const states = [
    state(),
    state({ principal: "cerrado", coordinator: "replanificando" }),
    state({ principal: "cerrado", dock: "cerrado", delivery: "bloqueada", coordinator: "replanificando" }),
    state({ principal: "cerrado", dock: "cerrado", delivery: "bloqueada" }),
  ];
  let stateIndex = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/simulation/reset")) return response({ ok: true });
    if (url.endsWith("/state")) return response(states[Math.min(stateIndex++, states.length - 1)]);
    if (url.endsWith("/actions")) return response({ tasks: [] });
    if (url.endsWith("/workflow/happyrobot/events")) {
      posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ ok: true, duplicate: false });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    process.argv = ["node", "demo-video.mts", "--inputs=api"];
    process.env = { ...originalEnv, DEMO_API_URL: "http://backend.test", HAPPYROBOT_WEBHOOK_TOKEN: "test-token", DEMO_VIDEO_TIMEOUT_MS: "10000" };
    console.log = () => undefined;
    await runVideoDirector(fetchFn);
  } finally {
    process.argv = originalArgv;
    process.env = originalEnv;
    console.log = originalLog;
  }

  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.channel, "call");
  assert.equal(posts[0]?.incidentId, "principal_pipe_burst");
  assert.match(String(posts[0]?.actor), /^SIMULACIÓN/);
  assert.equal(posts[1]?.channel, "sms");
  assert.equal(posts[1]?.incidentId, "dock_blocked");
  assert.match(String(posts[1]?.actor), /^SIMULACIÓN/);
});
