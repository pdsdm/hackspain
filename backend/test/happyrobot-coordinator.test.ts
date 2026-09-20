import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import {
  HappyRobotSessionRegistry,
  buildTriggerPayload,
  happyrobotSessions,
  loadHappyRobotCoordinatorConfig,
  runHappyRobotCoordinator,
  type HappyRobotCoordinatorConfig,
  type HappyRobotSessionDeps,
  type SubmitResult,
} from "../src/agents/coordinator/happyrobot.js";
import { complete, loadLlmConfig } from "../src/agents/coordinator/llm.js";
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

function replaceEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
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
  assert.equal(pilot.textProvider?.provider, "helmcode");
  assert.equal(pilot.textProvider?.harness, "json");
  assert.equal(loadLlmConfig(ENV_BASE).textProvider, undefined);

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
            ...baseOutput({
              planVersion: run.state.planVersion,
              assignments: [{ groupId: "g-acceso", spaceId: "pabellonB", count: 90 }],
              operations: [{ op: "set_place", id: "accesoSur", status: "cerrado" }],
            }),
          });
        });
      },
    });
    const report = await runHappyRobotCoordinator({ config: CONFIG, event: { source: "chat", kind: "free_text" }, deps, apply: true, registry, fetchFn: fake.fetchFn, pollMs: 20 });
    assert.equal(report.status, "accepted");
    assert.equal(report.applied, true);
    const state = states.ensureActiveRun().state;
    const acceso = state.spaces.find((space) => space.id === "accesoSur");
    assert.equal(acceso?.status, "cerrado");
    assert.deepEqual(state.assignments, [{ groupId: "g-acceso", spaceId: "pabellonB", count: 90, status: "proposed", planVersion: 2 }]);
  } finally {
    database.close();
  }
});

test("con HAPPYROBOT_COORDINATOR_HOOK_URL el trigger va al hook directo y no sondea el run", async () => {
  const { database, deps, states } = openDeps();
  try {
    const registry = new HappyRobotSessionRegistry();
    const run = states.ensureActiveRun();
    const calls: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.run_id, run.id);
      assert.equal(body.payload, undefined);
      queueMicrotask(() => {
        registry.submit({ correlation_id: body.correlation_id, run_id: body.run_id, plan_version: body.plan_version, plan: baseOutput({ planVersion: run.state.planVersion }) });
      });
      return new Response("", { status: 200 });
    };
    const report = await runHappyRobotCoordinator({
      config: { ...CONFIG, hookUrl: "https://hooks.test/hooks/development/wf" },
      event: { source: "chat", kind: "free_text" },
      deps,
      apply: false,
      registry,
      fetchFn,
      pollMs: 20,
    });
    assert.equal(report.status, "accepted");
    assert.equal(report.happyrobotRunId, null);
    assert.deepEqual(calls, ["POST https://hooks.test/hooks/development/wf"]);
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
    assert.equal((await fetch(`${base}/coordinator/happyrobot/report`)).status, 401);
    assert.equal((await fetch(`${base}/coordinator/happyrobot/report`, { headers: { Authorization: "Bearer secreto" } })).status, 404);
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
    const report = (await shadow.json()) as { status: string; applied: boolean; consults: number; submissions: number; happyrobotRunId: string; model: string; correlationId: string };
    assert.equal(report.status, "accepted");
    assert.equal(report.applied, false);
    assert.equal(report.consults, 1);
    assert.equal(report.submissions, 1);
    assert.equal(report.happyrobotRunId, "hr-run-1");
    assert.equal(report.model, "gpt-5.6-luna-low");
    const auditResponse = await fetch(`${base}/coordinator/happyrobot/report`, { headers: { Authorization: "Bearer secreto" } });
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json() as { correlationId: string; status: string; applied: boolean };
    assert.equal(audit.correlationId, report.correlationId);
    assert.equal(audit.status, "accepted");
    assert.equal(audit.applied, false);
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

test("el harness shadow no aplica ni lanza una segunda inferencia", async () => {
  const { database, deps, states, tasks, workflows } = openDeps();
  const originalFetch = globalThis.fetch;
  const hookUrl = "https://hooks.test/hooks/development/shadow";
  const config = loadLlmConfig({ ...ENV_BASE, HAPPYROBOT_COORDINATOR_HOOK_URL: hookUrl, HELMCODE_API_KEY: "hc_shadow" });
  const run = states.ensureActiveRun();
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), hookUrl);
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    queueMicrotask(() => {
      happyrobotSessions.submit({
        correlation_id: payload.correlation_id,
        run_id: payload.run_id,
        plan_version: payload.plan_version,
        plan: baseOutput({ planVersion: run.state.planVersion }),
      });
    });
    return new Response("", { status: 200 });
  };
  try {
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "fuga" },
      { world: deps.world, states, tasks, workflows, config },
    );
    assert.equal(result, "unavailable");
    assert.equal(calls, 1);
    assert.equal(happyrobotSessions.getLastReport()?.applied, false);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("un fallo HappyRobot no lanza una segunda inferencia oculta", async () => {
  const { database, deps, states, tasks, workflows } = openDeps();
  const originalFetch = globalThis.fetch;
  const hookUrl = "https://hooks.test/hooks/development/failure";
  const config = loadLlmConfig({ ...ENV_BASE, HAPPYROBOT_COORDINATOR_HOOK_URL: hookUrl, HELMCODE_API_KEY: "hc_failure" });
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    assert.equal(String(input), hookUrl);
    return jsonResponse(503, { error: "unavailable" });
  };
  try {
    const result = await runCoordinatorLoop(
      { source: "chat", kind: "free_text", text: "fuga" },
      { world: deps.world, states, tasks, workflows, config },
    );
    assert.equal(result, "unavailable");
    assert.equal(calls, 1);
    assert.equal(happyrobotSessions.getLastReport()?.status, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("complete delega el texto auxiliar al proveedor configurado sin usar HappyRobot", async () => {
  const config = loadLlmConfig({ ...ENV_BASE, HELMCODE_API_KEY: "hc_test" });
  const originalFetch = globalThis.fetch;
  const restoreEnv = replaceEnv({ COORDINATOR_VERBOSE: "0" });
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), "https://api.helmcode.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer hc_test");
    const body = JSON.parse(String(init?.body)) as { model?: string; messages?: unknown[] };
    assert.equal(body.model, "deepseek-v4-flash");
    assert.equal(body.messages?.length, 2);
    return jsonResponse(200, { choices: [{ message: { content: "respuesta auxiliar" } }] });
  };
  try {
    assert.equal(config.provider, "happyrobot");
    assert.equal(config.textProvider?.provider, "helmcode");
    assert.equal(await complete(config, "sistema", "usuario"), "respuesta auxiliar");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("el incidente HappyRobot atraviesa ingesta, coordinador, submit_plan y persistencia", async () => {
  const database = openDatabase(":memory:");
  const originalFetch = globalThis.fetch;
  const hookUrl = "https://hooks.test/hooks/development/orquestador";
  const token = "pipeline-token";
  const coordinatorEnv = {
    COORDINATOR_MODE: "llm",
    COORDINATOR_HARNESS: "happyrobot",
    HAPPYROBOT_API_KEY: "hr_pipeline",
    HAPPYROBOT_COORDINATOR_WORKFLOW_ID: "wf-pipeline",
    HAPPYROBOT_COORDINATOR_HOOK_URL: hookUrl,
    HAPPYROBOT_COORDINATOR_APPLY: "true",
    HAPPYROBOT_COORDINATOR_TIMEOUT_MS: "3000",
    HAPPYROBOT_WEBHOOK_TOKEN: token,
    PUBLIC_BASE_URL: "https://backend.test",
    COGNITION_API_KEY: undefined,
    DEVIN_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    HELMCODE_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    COORDINATOR_VERBOSE: "0",
  } satisfies Record<string, string | undefined>;
  const restoreEnv = replaceEnv(coordinatorEnv);
  const config = loadConfig({ ...coordinatorEnv, INITIAL_FIXTURE: "calm" });
  const server = createApp(database, { workflowToken: token, config }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let callback: Promise<Response> | undefined;

  globalThis.fetch = async (input, init) => {
    if (String(input) !== hookUrl) return originalFetch(input, init);
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const planVersion = Number(payload.plan_version);
    callback = originalFetch(`${base}/workflow/coordinator/happyrobot/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        correlation_id: payload.correlation_id,
        run_id: payload.run_id,
        plan_version: planVersion,
        plan: baseOutput({
          planVersion,
          operations: [{ op: "log_event", kind: "accion", text: "Plan HappyRobot aplicado", area: "espacios" }],
        }),
      }),
    });
    return new Response("", { status: 200 });
  };

  try {
    assert.equal(happyrobotSessions.isActive(), false);
    const reset = await fetch(`${base}/simulation/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture: "calm" }),
    });
    assert.equal(reset.status, 200);
    // Un reset devuelve la mesa a detenida: hay que iniciar antes de recibir el incidente.
    await originalFetch(`${base}/simulation/clock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: false }),
    });
    const response = await fetch(`${base}/workflow/happyrobot/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "pipeline-pipe-1",
        channel: "call",
        actor: "Responsable de recinto",
        incidentId: "principal_pipe_burst",
        summary: "Una rotura de tubería obliga a cerrar el Pabellón Principal",
        evidence: { sessionId: "pipeline-session-1" },
      }),
    });
    assert.equal(response.status, 200);
    const ingress = await response.json() as { ok: boolean; duplicate: boolean; planVersion: number };
    assert.equal(ingress.ok, true);
    assert.equal(ingress.duplicate, false);
    assert.equal(ingress.planVersion, 2);
    assert.ok(callback);
    const callbackResponse = await callback;
    assert.equal(callbackResponse.status, 200);
    const submitted = await callbackResponse.json() as SubmitResult;
    assert.equal(submitted.accepted, true);
    assert.equal(submitted.retry, false);

    const state = await (await fetch(`${base}/state`)).json() as {
      spaces: Array<{ id: string; status: string }>;
      events: Array<{ text?: string }>;
      coordinatorBusy?: unknown;
    };
    assert.equal(state.spaces.find((space) => space.id === "principal")?.status, "cerrado");
    assert.ok(state.events.some((event) => event.text === "Plan HappyRobot aplicado"));
    assert.equal(state.coordinatorBusy, undefined);
    assert.equal(happyrobotSessions.isActive(), false);
    const report = happyrobotSessions.getLastReport();
    assert.equal(report?.status, "accepted");
    assert.equal(report?.applied, true);
    assert.equal(report?.submissions, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
});
