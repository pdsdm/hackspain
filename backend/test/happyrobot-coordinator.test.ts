import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import {
  HappyRobotSessionRegistry,
  buildTriggerPayload,
  loadHappyRobotCoordinatorConfig,
  runHappyRobotCoordinator,
  type HappyRobotCoordinatorConfig,
  type HappyRobotSessionDeps,
} from "../src/agents/coordinator/happyrobot.js";
import { loadLlmConfig } from "../src/agents/coordinator/llm.js";
import { runCoordinatorLoop } from "../src/agents/coordinator/loop.js";
import { crisisInput } from "../src/agents/coordinator/scenario.js";
import type { CoordinatorOutput } from "../src/agents/coordinator/types.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";

const WORLD = loadWorld();

const CONFIG: HappyRobotCoordinatorConfig = {
  apiKey: "hr_test",
  apiBase: "https://hr.test/api/v2",
  workflowId: "wf-1",
  environment: "development",
  model: "gpt-5.6-luna-low",
  apply: false,
  timeoutMs: 2_000,
  publicBaseUrl: "https://backend.test",
};

const ENV_BASE = {
  HAPPYROBOT_API_KEY: "hr_test",
  HAPPYROBOT_COORDINATOR_WORKFLOW_ID: "wf-1",
  COORDINATOR_HARNESS: "happyrobot",
};

function baseOutput(overrides: Partial<CoordinatorOutput> = {}): CoordinatorOutput {
  return {
    reading: "Hay que revisar el Acceso Sur.",
    planVersion: 1,
    coordinatorStatus: "replanificando",
    actions: [],
    commitments: [],
    assignments: [],
    decision: null,
    unverified: [],
    operations: [],
    queries: [],
    done: true,
    ...overrides,
  };
}

function openDeps(fixture: "calm" | "crisis" = "crisis") {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection, fixture);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const deps: HappyRobotSessionDeps = { world: WORLD, states, tasks, workflows };
  return { database, deps, states, tasks, workflows };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface FakeHappyRobot {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  calls: Array<{ url: string; method: string; body: unknown }>;
}

function fakeHappyRobot(options: {
  trigger?: () => Response;
  status?: () => string;
  onTrigger?: (payload: Record<string, unknown>) => void;
}): FakeHappyRobot {
  const calls: FakeHappyRobot["calls"] = [];
  return {
    calls,
    fetchFn: async (url, init) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      if (method === "POST" && url.endsWith("/workflows/wf-1/runs")) {
        assert.equal((init!.headers as Record<string, string>).Authorization, "Bearer hr_test");
        if (options.onTrigger) options.onTrigger((body as { payload: Record<string, unknown> }).payload);
        return options.trigger ? options.trigger() : jsonResponse(200, { run_id: "hr-run-1", status: "queued" });
      }
      if (method === "GET" && url.includes("/runs/hr-run-1")) {
        return jsonResponse(200, { id: "hr-run-1", status: options.status ? options.status() : "running" });
      }
      throw new Error(`petición inesperada ${method} ${url}`);
    },
  };
}

test("loadHappyRobotCoordinatorConfig exige la clave y el workflow y no se activa solo con la clave", () => {
  assert.throws(() => loadHappyRobotCoordinatorConfig({ HAPPYROBOT_COORDINATOR_WORKFLOW_ID: "wf-1" }), /HAPPYROBOT_API_KEY/);
  assert.throws(() => loadHappyRobotCoordinatorConfig({ HAPPYROBOT_API_KEY: "hr" }), /WORKFLOW_ID/);
  const config = loadHappyRobotCoordinatorConfig({ ...ENV_BASE, PUBLIC_BASE_URL: "https://tunnel.test/" });
  assert.equal(config.model, "gpt-5.6-luna-low");
  assert.equal(config.environment, "development");
  assert.equal(config.apply, false);
  assert.equal(config.publicBaseUrl, "https://tunnel.test");
  assert.equal(config.apiBase, "https://platform.eu.happyrobot.ai/api/v2");

  const helmcode = loadLlmConfig({ HELMCODE_API_KEY: "hc", HAPPYROBOT_API_KEY: "hr", HAPPYROBOT_COORDINATOR_WORKFLOW_ID: "wf-1" });
  assert.equal(helmcode.provider, "helmcode");
  assert.equal(helmcode.harness, "json");

  const pilot = loadLlmConfig({ ...ENV_BASE, HELMCODE_API_KEY: "hc", HAPPYROBOT_COORDINATOR_APPLY: "true" });
  assert.equal(pilot.provider, "happyrobot");
  assert.equal(pilot.harness, "happyrobot");
  assert.equal(pilot.happyrobot?.apply, true);

  assert.equal(loadConfig({ HAPPYROBOT_API_KEY: "hr" }).coordinatorMode, "rules");
  assert.equal(loadConfig(ENV_BASE).coordinatorMode, "llm");
});

test("el trigger lleva runId, planVersion, prompt y snapshot fijados por el backend", () => {
  const input = crisisInput("crisis");
  const payload = buildTriggerPayload({
    correlationId: "corr-1",
    runId: "run-1",
    planVersion: 3,
    event: { source: "chat", kind: "free_text", text: "fuga" },
    input,
    publicBaseUrl: "https://backend.test",
  });
  assert.equal(payload.correlation_id, "corr-1");
  assert.equal(payload.run_id, "run-1");
  assert.equal(payload.plan_version, 3);
  assert.equal(payload.backend_base_url, "https://backend.test");
  assert.ok(String(payload.system_prompt).includes("consult_world"));
  assert.match(String(payload.system_prompt_version), /^[a-f0-9]{12}$/);
  assert.ok(String(payload.world_snapshot).length > 100);
});

test("run completado: consult_world responde y submit_plan acepta en modo shadow sin mutar el estado", async () => {
  const { database, deps, states } = openDeps();
  try {
    const registry = new HappyRobotSessionRegistry();
    const before = JSON.stringify(states.ensureActiveRun().state);
    const run = states.ensureActiveRun();
    let consult: Awaited<ReturnType<HappyRobotSessionRegistry["consult"]>> | undefined;
    let submit: ReturnType<HappyRobotSessionRegistry["submit"]> | undefined;
    const fake = fakeHappyRobot({
      onTrigger: (payload) => {
        const envelope = { correlation_id: payload.correlation_id, run_id: payload.run_id, plan_version: payload.plan_version };
        queueMicrotask(async () => {
          consult = await registry.consult({ ...envelope, query: { type: "affected_by", placeId: "accesoSur" } });
          submit = registry.submit({
            ...envelope,
            plan: baseOutput({
              planVersion: run.state.planVersion,
              operations: [{ op: "set_place", id: "accesoSur", status: "cerrado" }],
            }),
          });
        });
      },
    });
    const report = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text", text: "fuga" }, deps, apply: false, registry, fetchFn: fake.fetchFn, pollMs: 20 });
    assert.equal(report.status, "accepted");
    assert.equal(report.happyrobotRunId, "hr-run-1");
    assert.equal(report.model, "gpt-5.6-luna-low");
    assert.equal(report.applied, false);
    assert.equal(report.consults, 1);
    assert.equal(report.submissions, 1);
    assert.ok(report.latencyMs >= 0);
    assert.equal(report.output?.reading, "Hay que revisar el Acceso Sur.");
    assert.equal(consult?.ok, true);
    assert.equal(submit?.accepted, true);
    assert.equal(JSON.stringify(states.ensureActiveRun().state), before);
    assert.equal(registry.isActive(), false);
    assert.equal(registry.getLastReport()?.correlationId, report.correlationId);
    assert.ok(!JSON.stringify(report).includes("hr_test"));
  } finally {
    database.close();
  }
});

test("apply=true persiste el plan aceptado", async () => {
  const { database, deps, states } = openDeps();
  try {
    const registry = new HappyRobotSessionRegistry();
    const run = states.ensureActiveRun();
    const fake = fakeHappyRobot({
      onTrigger: (payload) => {
        queueMicrotask(() => {
          registry.submit({
            correlation_id: payload.correlation_id,
            run_id: payload.run_id,
            plan_version: payload.plan_version,
            ...baseOutput({ planVersion: run.state.planVersion, operations: [{ op: "set_place", id: "accesoSur", status: "cerrado" }] }),
          });
        });
      },
    });
    const report = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: true, registry, fetchFn: fake.fetchFn, pollMs: 20 });
    assert.equal(report.status, "accepted");
    assert.equal(report.applied, true);
    const acceso = states.ensureActiveRun().state.spaces.find((space) => space.id === "accesoSur");
    assert.equal(acceso?.status, "cerrado");
  } finally {
    database.close();
  }
});

test("submit_plan devuelve errores estructurados y acepta el reintento corregido", async () => {
  const { database, deps, states } = openDeps();
  try {
    const registry = new HappyRobotSessionRegistry();
    const run = states.ensureActiveRun();
    const results: Array<ReturnType<HappyRobotSessionRegistry["submit"]>> = [];
    const fake = fakeHappyRobot({
      onTrigger: (payload) => {
        const envelope = { correlation_id: payload.correlation_id, run_id: payload.run_id, plan_version: payload.plan_version };
        queueMicrotask(() => {
          results.push(registry.submit({ ...envelope, plan: "esto no es JSON" }));
          results.push(registry.submit({ ...envelope, plan: baseOutput({ planVersion: run.state.planVersion, operations: [{ op: "set_place", id: "noExiste", status: "cerrado" }] }) }));
          results.push(registry.submit({ ...envelope, coordinator_output: baseOutput({ planVersion: run.state.planVersion }) }));
        });
      },
    });
    const report = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry, fetchFn: fake.fetchFn, pollMs: 20 });
    assert.equal(results[0]?.accepted, false);
    assert.equal(results[0]?.retry, true);
    assert.match(results[0]?.errors[0] ?? "", /json_invalido/);
    assert.equal(results[1]?.accepted, false);
    assert.equal(results[1]?.retry, true);
    assert.ok(results[1]!.errors.length > 0);
    assert.equal(results[2]?.accepted, true);
    assert.equal(report.status, "accepted");
    assert.equal(report.submissions, 3);
    assert.equal(report.validationErrors.length, 2);
  } finally {
    database.close();
  }
});

test("las herramientas rechazan sesiones inactivas, correlación ajena y runId/planVersion obsoletos", async () => {
  const { database, deps, states } = openDeps();
  try {
    const registry = new HappyRobotSessionRegistry();
    const idle = await registry.consult({ correlation_id: "x", run_id: "r", plan_version: 1, query: { type: "affected_by", placeId: "accesoSur" } });
    assert.equal(idle.ok, false);
    assert.equal(idle.stale, true);

    const run = states.ensureActiveRun();
    const { session } = registry.start({ correlationId: "corr-1", runId: run.id, planVersion: run.state.planVersion, input: crisisInput("crisis"), apply: false, deps });
    const good = { correlation_id: "corr-1", run_id: run.id, plan_version: run.state.planVersion };

    const wrongCorrelation = await registry.consult({ ...good, correlation_id: "otra", query: { type: "affected_by", placeId: "accesoSur" } });
    assert.equal(wrongCorrelation.stale, true);
    const wrongRun = registry.submit({ ...good, run_id: "otro-run", plan: baseOutput() });
    assert.equal(wrongRun.accepted, false);
    assert.equal(wrongRun.retry, false);
    assert.equal(wrongRun.stale, true);
    const wrongVersion = registry.submit({ ...good, plan_version: run.state.planVersion + 1, plan: baseOutput() });
    assert.equal(wrongVersion.stale, true);
    const badQuery = await registry.consult({ ...good, query: { type: "route" } });
    assert.equal(badQuery.ok, false);
    assert.equal(badQuery.stale, false);
    assert.match(badQuery.error ?? "", /route requiere/);

    assert.throws(() => registry.start({ correlationId: "corr-2", runId: run.id, planVersion: 1, input: crisisInput("crisis"), apply: false, deps }), /activa/);

    const moved = structuredClone(run.state);
    moved.planVersion = run.state.planVersion + 1;
    states.saveState(run.id, moved);
    const staleWorld = registry.submit({ ...good, plan: baseOutput() });
    assert.equal(staleWorld.stale, true);
    assert.match(staleWorld.errors[0] ?? "", /cambió/);
    registry.finish(session);
    assert.equal(registry.isActive(), false);
  } finally {
    database.close();
  }
});

test("trigger rechazado, run fallido y timeout devuelven informes legibles", async () => {
  const { database, deps } = openDeps();
  try {
    const rejected = fakeHappyRobot({ trigger: () => jsonResponse(401, { error: "unauthorized" }) });
    const rejectedReport = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry: new HappyRobotSessionRegistry(), fetchFn: rejected.fetchFn, pollMs: 20 });
    assert.equal(rejectedReport.status, "unavailable");
    assert.match(rejectedReport.error ?? "", /401/);
    assert.equal(rejectedReport.happyrobotRunId, null);

    const noRun = fakeHappyRobot({ trigger: () => jsonResponse(200, { status: "queued" }) });
    const noRunReport = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry: new HappyRobotSessionRegistry(), fetchFn: noRun.fetchFn, pollMs: 20 });
    assert.equal(noRunReport.status, "unavailable");
    assert.match(noRunReport.error ?? "", /run_id/);

    const failed = fakeHappyRobot({ status: () => "failed" });
    const failedReport = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry: new HappyRobotSessionRegistry(), fetchFn: failed.fetchFn, pollMs: 20 });
    assert.equal(failedReport.status, "failed");
    assert.equal(failedReport.output, null);

    const finishedSilently = fakeHappyRobot({ status: () => "completed" });
    const silentReport = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry: new HappyRobotSessionRegistry(), fetchFn: finishedSilently.fetchFn, pollMs: 20 });
    assert.equal(silentReport.status, "failed");
    assert.match(silentReport.error ?? "", /sin submit_plan/);

    const slow = fakeHappyRobot({ status: () => "running" });
    const registry = new HappyRobotSessionRegistry();
    const timeoutReport = await runHappyRobotCoordinator({ config: { ...CONFIG, timeoutMs: 1_000 }, event: { source: "chat", kind: "free_text" }, deps, apply: false, registry, fetchFn: slow.fetchFn, pollMs: 50 });
    assert.equal(timeoutReport.status, "timeout");
    assert.match(timeoutReport.error ?? "", /1000 ms/);
    assert.equal(registry.isActive(), false);
  } finally {
    database.close();
  }
});

test("el bucle del coordinador en modo shadow no aplica el plan y cae al fallback", async () => {
  const { database, deps, states, tasks, workflows } = openDeps();
  try {
    const before = JSON.stringify(states.ensureActiveRun().state);
    const fake = fakeHappyRobot({ status: () => "failed" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fake.fetchFn as typeof fetch;
    try {
      const result = await runCoordinatorLoop(
        { source: "chat", kind: "free_text", text: "fuga" },
        {
          world: deps.world,
          states,
          tasks,
          workflows,
          config: loadLlmConfig({ ...ENV_BASE, HAPPYROBOT_COORDINATOR_TIMEOUT_MS: "1000" }),
        },
      );
      assert.equal(result, "unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(JSON.stringify(states.ensureActiveRun().state), before);
  } finally {
    database.close();
  }
});

test("los endpoints exigen el token y el shadow devuelve el informe sin mutar el estado", async () => {
  const database = openDatabase(":memory:");
  const registry = new HappyRobotSessionRegistry();
  const fake = fakeHappyRobot({
    onTrigger: (payload) => {
      queueMicrotask(async () => {
        await fetch(`${base}/workflow/coordinator/happyrobot/consult`, {
          method: "POST",
          headers: { Authorization: "Bearer secreto", "Content-Type": "application/json" },
          body: JSON.stringify({ correlation_id: payload.correlation_id, run_id: payload.run_id, plan_version: payload.plan_version, query: { type: "alternatives_for", placeId: "loungeSur" } }),
        });
        await fetch(`${base}/workflow/coordinator/happyrobot/submit`, {
          method: "POST",
          headers: { Authorization: "Bearer secreto", "Content-Type": "application/json" },
          body: JSON.stringify({ correlation_id: payload.correlation_id, run_id: payload.run_id, plan_version: payload.plan_version, plan: baseOutput({ planVersion: payload.plan_version as number }) }),
        });
      });
    },
  });
  const server = createApp(database, {
    workflowToken: "secreto",
    happyrobot: { config: { ...CONFIG, timeoutMs: 3_000 }, fetchFn: fake.fetchFn, registry },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    const unauthorized = await fetch(`${base}/workflow/coordinator/happyrobot/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(unauthorized.status, 401);
    const idle = await fetch(`${base}/workflow/coordinator/happyrobot/consult`, {
      method: "POST",
      headers: { Authorization: "Bearer secreto", "Content-Type": "application/json" },
      body: JSON.stringify({ correlation_id: "x", run_id: "r", plan_version: 1, query: { type: "affected_by", placeId: "accesoSur" } }),
    });
    assert.equal(idle.status, 200);
    assert.equal(((await idle.json()) as { stale?: boolean }).stale, true);

    const stateBefore = await (await fetch(`${base}/state`)).text();
    const shadow = await fetch(`${base}/coordinator/happyrobot/shadow`, {
      method: "POST",
      headers: { Authorization: "Bearer secreto", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "fuga en Acceso Sur" }),
    });
    assert.equal(shadow.status, 200);
    const report = (await shadow.json()) as { status: string; applied: boolean; consults: number; submissions: number; happyrobotRunId: string; model: string };
    assert.equal(report.status, "accepted");
    assert.equal(report.applied, false);
    assert.equal(report.consults, 1);
    assert.equal(report.submissions, 1);
    assert.equal(report.happyrobotRunId, "hr-run-1");
    assert.equal(report.model, "gpt-5.6-luna-low");
    assert.equal(await (await fetch(`${base}/state`)).text(), stateBefore);
    assert.equal((await fetch(`${base}/actions`).then((r) => r.json()) as { tasks: unknown[] }).tasks.length, 0);
  } finally {
    server.close();
    database.close();
  }
});

test("el shadow responde 503 sin configuración de HappyRobot", async () => {
  const database = openDatabase(":memory:");
  const saved = { key: process.env.HAPPYROBOT_API_KEY, workflow: process.env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID };
  delete process.env.HAPPYROBOT_API_KEY;
  delete process.env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID;
  const server = createApp(database, { workflowToken: "secreto", happyrobot: { registry: new HappyRobotSessionRegistry() } }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    const response = await fetch(`${base}/coordinator/happyrobot/shadow`, { method: "POST", headers: { Authorization: "Bearer secreto", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 503);
  } finally {
    if (saved.key !== undefined) process.env.HAPPYROBOT_API_KEY = saved.key;
    if (saved.workflow !== undefined) process.env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID = saved.workflow;
    server.close();
    database.close();
  }
});
