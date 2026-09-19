import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface PublicState {
  planVersion: number;
  coordinatorStatus: string;
  clock?: Record<string, unknown>;
  coordinatorBusy?: unknown;
  e2eMode?: string;
  forceSimActions?: boolean;
  e2eCoordinatorApply?: boolean;
  resolved: boolean;
  closureSummary?: string;
  spaces: Array<Record<string, unknown>>;
  deliveries: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
  shuttles: Array<Record<string, unknown>>;
  guestGroups: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

export interface CoordinatorReport {
  provider: string;
  model: string;
  correlationId: string;
  happyrobotRunId: string | null;
  runId: string;
  planVersion: number;
  status: string;
  applied: boolean;
  latencyMs: number;
  consults: number;
  submissions: number;
  validationErrors: string[];
  output: Record<string, unknown> | null;
  error?: string;
}

export interface ActionsResponse {
  tasks: unknown[];
}

interface RunAudit {
  runId: string;
  status: string;
  nodes: Array<{ name: string; status: string; error?: string; duplicate?: boolean }>;
}

class FatalE2EError extends Error {}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const requiredNames = ["HAPPYROBOT_API_KEY", "HAPPYROBOT_WEBHOOK_TOKEN"] as const;

function required(name: typeof requiredNames[number]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env o .env.e2e`);
  return value;
}

function assertPublicHttps(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`${name} debe ser una URL HTTPS pública`);
  }
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function safeError(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 400);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

export function literalToken(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const paragraph of value) {
    if (!paragraph || typeof paragraph !== "object") continue;
    const children = (paragraph as Record<string, unknown>).children;
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const text = (child as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return undefined;
}

async function resolveInputWorkflow(apiBase: string, apiKey: string): Promise<{ id: string; slug?: string; webhookToken?: string }> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const configured = process.env.HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID?.trim();
  const workflows = await json<{ data?: Array<{ id?: string; name?: string; slug?: string; latest_version?: { id?: string } }> }>(`${apiBase}/workflows/?page_size=100`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const workflow = workflows.data?.find((item) => configured
    ? item.id === configured
    : item.name?.trim().toLowerCase() === "demo incident inputs");
  if (!workflow?.id) {
    if (configured) return { id: configured };
    throw new Error("No existe el workflow HappyRobot Demo Incident Inputs");
  }
  let webhookToken: string | undefined;
  const versionId = workflow.latest_version?.id;
  if (versionId) {
    const nodes = await json<{ data?: Array<{ name?: string; configuration?: { token?: unknown } }> }>(`${apiBase}/versions/${versionId}/nodes`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    webhookToken = literalToken(nodes.data?.find((node) => node.name === "Webhook POST")?.configuration?.token);
  }
  return {
    id: workflow.id,
    ...(workflow.slug ? { slug: workflow.slug } : {}),
    ...(webhookToken ? { webhookToken } : {}),
  };
}

async function auditHappyRobotRun(apiBase: string, apiKey: string, runId: string, timeoutMs: number): Promise<RunAudit> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error(`Run HappyRobot no auditable: ${runId}`);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const run = await waitFor(
    `run HappyRobot ${runId}`,
    timeoutMs,
    () => json<{ status?: string }>(`${apiBase}/runs/${runId}`, { headers, signal: AbortSignal.timeout(30_000) }),
    (value) => ["completed", "succeeded", "failed", "canceled", "skipped"].includes(value.status ?? ""),
  );
  const listed = await json<{ data?: Array<{ name?: string; status?: string; error?: unknown; output_id?: string }> }>(`${apiBase}/runs/${runId}/nodes`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const nodes: RunAudit["nodes"] = [];
  for (const node of listed.data ?? []) {
    let error = safeError(node.error);
    let duplicate: boolean | undefined;
    if (node.output_id) {
      const output = await json<Record<string, unknown>>(`${apiBase}/runs/${runId}/outputs/${node.output_id}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      const root = isRecord(output.data) ? output.data : output;
      const data = isRecord(root.data) ? root.data : undefined;
      error = error ?? safeError(data?.error) ?? safeError(root.error);
      if (typeof data?.duplicate === "boolean") duplicate = data.duplicate;
    }
    nodes.push({
      name: node.name ?? "sin nombre",
      status: node.status ?? "unknown",
      ...(error ? { error } : {}),
      ...(duplicate === undefined ? {} : { duplicate }),
    });
  }
  return { runId, status: run.status ?? "unknown", nodes };
}

async function waitFor<T>(label: string, timeoutMs: number, read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  let lastError: string | undefined;
  while (Date.now() < deadline) {
    try {
      last = await read();
      lastError = undefined;
      if (predicate(last)) return last;
    } catch (error) {
      if (error instanceof FatalE2EError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  const detail = lastError ?? (last === undefined ? "" : JSON.stringify(last).slice(0, 800));
  throw new Error(`Timeout esperando ${label}${detail ? `; último valor: ${detail}` : ""}`);
}

function startTunnel(localUrl: string): { child: ChildProcess; publicUrl: Promise<string> } {
  const child = spawn("cloudflared", ["tunnel", "--url", localUrl, "--no-autoupdate"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  let settled = false;
  const publicUrl = new Promise<string>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => {
      if (!settled) rejectUrl(new Error(`cloudflared no publicó URL: ${buffer.slice(-1200)}`));
    }, 30_000);
    const consume = (chunk: Buffer) => {
      const text = chunk.toString();
      buffer += text;
      const match = buffer.match(/https:\/\/[A-Za-z0-9-]+\.trycloudflare\.com/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolveUrl(match[0]);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!settled) rejectUrl(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!settled) rejectUrl(new Error(`cloudflared terminó con ${code}: ${buffer.slice(-1200)}`));
    });
  });
  return { child, publicUrl };
}

function startBackend(port: number, databasePath: string, publicUrl: string): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: resolve(ROOT, "backend"),
    env: {
      ...process.env,
      DATABASE_URL: databasePath,
      HOST: "127.0.0.1",
      PORT: String(port),
      INITIAL_FIXTURE: "calm",
      CLOCK_SPEED: "120",
      COORDINATOR_MODE: "llm",
      COORDINATOR_HARNESS: "happyrobot",
      HAPPYROBOT_COORDINATOR_APPLY: "true",
      PUBLIC_BASE_URL: publicUrl,
      HAPPYROBOT_HOOK_ESPACIOS: "",
      HAPPYROBOT_HOOK_CATERING: "",
      HAPPYROBOT_HOOK_TRANSPORTE: "",
      HAPPYROBOT_HOOK_ASISTENTES: "",
      HAPPYROBOT_TEST_PHONE: "",
      SIM_INCIDENTS: "off",
      RAILWAY_DEPLOYMENT_ID: "",
      COORDINATOR_VERBOSE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[backend] ${chunk.toString()}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[backend] ${chunk.toString()}`));
  return child;
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), sleep(5_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

function event(tag: string, incidentId: "principal_pipe_burst" | "dock_blocked") {
  const call = incidentId === "principal_pipe_burst";
  return {
    eventId: `e2e-${tag}-${call ? "call" : "sms"}`,
    channel: call ? "call" : "sms",
    actor: call ? "SIMULACIÓN · Responsable de recinto" : "SIMULACIÓN · Logística MADRING",
    incidentId,
    summary: call
      ? "Una rotura de tubería obliga a cerrar el Pabellón Principal sin hora confirmada de reapertura"
      : "Un camión de televisión bloquea el Muelle Este; CAT-01 y CAT-02 no pueden descargar",
    evidence: { sessionId: `e2e-${tag}-${call ? "call" : "sms"}` },
  } as const;
}

function outputRows(report: CoordinatorReport, field: string): Array<Record<string, unknown>> {
  return rows(report.output?.[field]);
}

function actionAreas(report: CoordinatorReport): Set<string> {
  return new Set(outputRows(report, "actions").map((action) => String(action.area)));
}

export function assignmentTotals(report: CoordinatorReport): { total: number; pabellonB: number; loungeSur: number; other: number } {
  const result = { total: 0, pabellonB: 0, loungeSur: 0, other: 0 };
  for (const assignment of outputRows(report, "assignments")) {
    const count = Number(assignment.count ?? 0);
    result.total += count;
    if (assignment.spaceId === "pabellonB") result.pabellonB += count;
    else if (assignment.spaceId === "loungeSur") result.loungeSur += count;
    else result.other += count;
  }
  return result;
}

export function incidentCount(state: PublicState, eventId: string): number {
  return state.events.filter((item) => isRecord(item.provenance) && item.provenance.eventId === eventId).length;
}

export function stateFingerprint(state: PublicState, actions: ActionsResponse, report: CoordinatorReport | undefined): string {
  return JSON.stringify({
    planVersion: state.planVersion,
    spaces: state.spaces.map((item) => [item.id, item.status]),
    deliveries: state.deliveries.map((item) => [item.id, item.status, item.dockId]),
    commitments: state.commitments.map((item) => [item.id, item.status, item.planVersion]),
    incidents: state.events.filter((item) => isRecord(item.provenance)).map((item) => (item.provenance as Record<string, unknown>).eventId),
    actions: actions.tasks.length,
    openCalls: state.calls.filter((call) => call.status === "en_curso").length,
    report: report?.correlationId,
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Uso: npm run demo:e2e-real -- --confirm-real-happyrobot");
    return;
  }
  if (!process.argv.includes("--confirm-real-happyrobot")) {
    throw new Error("Añade --confirm-real-happyrobot: este E2E crea runs reales de HappyRobot");
  }
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`Faltan variables en .env o .env.e2e: ${missing.join(", ")}`);
  const apiKey = required("HAPPYROBOT_API_KEY");
  const token = required("HAPPYROBOT_WEBHOOK_TOKEN");
  const inputApiBase = (process.env.HAPPYROBOT_DEMO_INPUT_API_BASE?.trim() || "https://platform.eu.happyrobot.ai/api/v2").replace(/\/+$/, "");
  const inputWorkflow = await resolveInputWorkflow(inputApiBase, apiKey);
  const inputEnvironment = process.env.HAPPYROBOT_DEMO_INPUT_ENVIRONMENT?.trim() || "development";
  const configuredInputHook = process.env.HAPPYROBOT_DEMO_INPUT_HOOK_URL?.trim();
  const inputHookUrl = configuredInputHook || (inputWorkflow.slug
    ? `https://workflows.platform.eu.happyrobot.ai/hooks/${inputEnvironment === "production" ? "" : `${inputEnvironment}/`}${inputWorkflow.slug}`
    : undefined);
  const timeoutMs = Number(process.env.E2E_DEMO_TIMEOUT_MS?.trim() || 480_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 900_000) {
    throw new Error("E2E_DEMO_TIMEOUT_MS debe estar entre 30000 y 900000");
  }
  const tag = Date.now().toString(36);
  const runtimeDir = resolve(ROOT, ".demo");
  const evidencePath = resolve(runtimeDir, `e2e-real-${tag}.json`);
  mkdirSync(runtimeDir, { recursive: true });
  const target = process.env.E2E_TARGET_URL?.trim();
  let localUrl: string;
  let publicUrl: string;
  let databasePath: string;
  let tunnel: ChildProcess | undefined;
  let backend: ChildProcess | undefined;
  if (target) {
    publicUrl = assertPublicHttps(target, "E2E_TARGET_URL");
    localUrl = publicUrl;
    databasePath = "production-isolated-run";
    console.log(`[E2E] Target remoto: ${publicUrl}`);
  } else {
    const coordinatorWorkflowId = process.env.HAPPYROBOT_COORDINATOR_WORKFLOW_ID?.trim();
    const coordinatorHookUrl = process.env.HAPPYROBOT_COORDINATOR_HOOK_URL?.trim();
    if (!coordinatorWorkflowId) throw new Error("Falta HAPPYROBOT_COORDINATOR_WORKFLOW_ID para modo local");
    if (!coordinatorHookUrl) throw new Error("Falta HAPPYROBOT_COORDINATOR_HOOK_URL para modo local");
    assertPublicHttps(coordinatorHookUrl, "HAPPYROBOT_COORDINATOR_HOOK_URL");
    const port = Number(process.env.E2E_DEMO_PORT?.trim() || 18124);
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("E2E_DEMO_PORT inválido");
    localUrl = `http://127.0.0.1:${port}`;
    databasePath = resolve(runtimeDir, `e2e-real-${tag}.db`);
    const startedTunnel = startTunnel(localUrl);
    tunnel = startedTunnel.child;
    publicUrl = assertPublicHttps(await startedTunnel.publicUrl, "Quick Tunnel");
    console.log(`[E2E] Túnel público: ${publicUrl}`);
    backend = startBackend(port, databasePath, publicUrl);
  }
  const failures: string[] = [];
  const checkpoints: Record<string, unknown> = {};
  const check = (condition: unknown, message: string) => {
    if (!condition) failures.push(message);
  };
  const checkAudit = (audit: RunAudit, label: string) => {
    check(["completed", "succeeded"].includes(audit.status), `${label}: run ${audit.status}`);
    check(audit.nodes.length > 0, `${label}: run sin nodos auditables`);
    for (const node of audit.nodes) {
      check(["completed", "succeeded"].includes(node.status), `${label}: nodo ${node.name} ${node.status}`);
      check(!node.error, `${label}: nodo ${node.name}: ${node.error}`);
    }
  };
  const checkReport = (report: CoordinatorReport, label: string, runId: string) => {
    check(report.provider === "happyrobot", `${label}: proveedor ${report.provider}`);
    check(report.runId === runId, `${label}: informe de otro run ${report.runId}`);
    check(report.status === "accepted", `${label}: coordinador ${report.status}`);
    check(report.applied, `${label}: plan HappyRobot no aplicado`);
    check(Boolean(report.happyrobotRunId), `${label}: falta runId HappyRobot del coordinador`);
    check(report.output !== null, `${label}: informe sin output`);
    check(report.validationErrors.length === 0, `${label}: ${report.validationErrors.length} errores de validación`);
    check(report.submissions === 1, `${label}: necesitó ${report.submissions} submissions`);
    const areas = actionAreas(report);
    for (const area of ["espacios", "catering", "transporte", "asistentes"]) {
      check(areas.has(area), `${label}: falta acción de ${area}`);
    }
  };

  try {
    await waitFor("health target", 60_000, () => fetch(`${localUrl}/health`), (response) => response.ok);
    const authHeaders = { Authorization: `Bearer ${token}` };
    let activeE2ERunId: string | undefined;
    const readState = async () => {
      const state = await json<PublicState>(`${localUrl}/state`);
      if (activeE2ERunId && (state.e2eMode !== "production-isolated" || state.forceSimActions !== true || state.e2eCoordinatorApply !== true)) {
        throw new FatalE2EError(`El run E2E ${activeE2ERunId} fue reemplazado o Railway se redesplegó`);
      }
      return state;
    };
    const readActions = () => json<ActionsResponse>(`${localUrl}/actions`);
    const readReport = async (): Promise<CoordinatorReport | undefined> => {
      const response = await fetch(`${localUrl}/coordinator/happyrobot/report`, { headers: authHeaders });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`GET report: ${response.status} ${await response.text()}`);
      return response.json() as Promise<CoordinatorReport>;
    };
    const triggerInput = async (payload: ReturnType<typeof event>): Promise<string> => {
      const requestPayload = { ...payload, sessionId: payload.evidence.sessionId, backend_base_url: publicUrl };
      const apiResponse = await fetch(`${inputApiBase}/workflows/${encodeURIComponent(inputWorkflow.id)}/runs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ environment: inputEnvironment, payload: requestPayload }),
        signal: AbortSignal.timeout(30_000),
      });
      if (apiResponse.ok) {
        const result = await apiResponse.json() as { run_id?: string; queued_run_ids?: string[]; id?: string };
        const runId = result.run_id || result.queued_run_ids?.[0] || result.id;
        if (!runId) throw new Error("HappyRobot no devolvió run_id");
        return runId;
      }
      const apiError = await apiResponse.text();
      if (apiResponse.status !== 404 || !inputHookUrl) {
        throw new Error(`HappyRobot input API ${apiResponse.status}: ${apiError}`);
      }
      console.log("[E2E] API de runs no encuentra el workflow; usando hook directo publicado");
      const hookResponse = await fetch(inputHookUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(30_000),
      });
      const hookText = await hookResponse.text();
      if (!hookResponse.ok) throw new Error(`HappyRobot input hook ${hookResponse.status}: ${hookText}`);
      try {
        const result = JSON.parse(hookText) as { run_id?: string; queued_run_ids?: string[]; id?: string };
        return result.run_id || result.queued_run_ids?.[0] || result.id || `hook-${payload.eventId}`;
      } catch {
        return `hook-${payload.eventId}`;
      }
    };
    const waitReport = (previous: string | undefined, runId: string) => waitFor(
      "informe nuevo del coordinador HappyRobot",
      timeoutMs,
      readReport,
      (report) => Boolean(report && report.runId === runId && report.correlationId !== previous && report.status !== "timeout" && report.status !== "unavailable"),
    ) as Promise<CoordinatorReport>;

    const inputTokenHash = inputWorkflow.webhookToken
      ? createHash("sha256").update(inputWorkflow.webhookToken).digest("hex")
      : undefined;
    const reset = await json<{ externalActions?: string; runId?: string }>(`${localUrl}/simulation/e2e/reset`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(inputTokenHash ? { inputTokenHash } : {}),
    });
    if (reset.externalActions !== "sim") throw new Error("El target no confirmó el aislamiento de acciones externas");
    if (!reset.runId) throw new Error("El reset E2E no devolvió runId");
    const e2eRunId = reset.runId;
    activeE2ERunId = e2eRunId;
    const initial = await readState();
    checkpoints.initial = { runId: e2eRunId, planVersion: initial.planVersion, coordinatorStatus: initial.coordinatorStatus };
    check(initial.e2eMode === "production-isolated" && initial.forceSimActions === true && initial.e2eCoordinatorApply === true, "M0: el run activo no conserva el aislamiento E2E");
    check(initial.planVersion === 1, `M0: planVersion esperado 1, recibido ${initial.planVersion}`);
    check(initial.spaces.find((space) => space.id === "principal")?.status === "confirmado", "M0: Principal no está confirmado");

    const callEvent = event(tag, "principal_pipe_burst");
    const callRunId = await triggerInput(callEvent);
    console.log(`[E2E] Input 1 HappyRobot run ${callRunId}`);
    const callAuditPromise = auditHappyRobotRun(inputApiBase, apiKey, callRunId, timeoutMs);
    const afterCallEffect = await waitFor(
      "M1 Principal cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "principal")?.status === "cerrado",
    );
    const firstReport = await waitReport(undefined, e2eRunId);
    const callAudit = await callAuditPromise;
    const firstCoordinatorAudit = firstReport.happyrobotRunId
      ? await auditHappyRobotRun(inputApiBase, apiKey, firstReport.happyrobotRunId, timeoutMs)
      : undefined;
    const firstSettled = await waitFor(
      "M2 primer ciclo terminado",
      timeoutMs,
      async () => ({ state: await readState(), actions: await readActions() }),
      ({ state, actions }) => state.coordinatorStatus !== "replanificando" && actions.tasks.length === 0 && !state.calls.some((call) => call.status === "en_curso"),
    );
    const firstState = firstSettled.state;
    checkpoints.first = {
      inputRunId: callRunId,
      inputAudit: callAudit,
      coordinatorAudit: firstCoordinatorAudit,
      planVersion: firstState.planVersion,
      report: firstReport,
      principal: afterCallEffect.spaces.find((space) => space.id === "principal"),
    };
    checkAudit(callAudit, "M1 input HappyRobot");
    check(Boolean(firstCoordinatorAudit), "M2: run del coordinador no auditable");
    if (firstCoordinatorAudit) checkAudit(firstCoordinatorAudit, "M2 coordinador HappyRobot");
    checkReport(firstReport, "M2", e2eRunId);
    const firstDistribution = assignmentTotals(firstReport);
    check(firstDistribution.total === 600, `M2: asignadas ${firstDistribution.total}/600 plazas`);
    check(firstDistribution.pabellonB === 450 && firstDistribution.loungeSur === 150 && firstDistribution.other === 0, `M2: reparto ${JSON.stringify(firstDistribution)}`);
    const firstPlaces = ["pabellonB", "loungeSur"].map((id) => firstState.spaces.find((space) => space.id === id));
    check(firstPlaces.every((space) => space && !["inactivo", "cerrado", "descartado"].includes(String(space.status))), "M2: B + Lounge no aparecen como alternativas activadas");
    check(firstState.commitments.some((item) => item.id === "c-pabB"), "M2: falta compromiso de Pabellón B");
    check(firstState.commitments.some((item) => ["c-loungeSur", "c-lounge"].includes(String(item.id))), "M2: falta compromiso de Lounge Sur");
    check(incidentCount(afterCallEffect, callEvent.eventId) === 1, "M1: la llamada no aparece exactamente una vez");
    const callIncident = afterCallEffect.events.find((item) => item.channel === "call" && item.actor === "SIMULACIÓN · Responsable de recinto");
    check(Boolean(callIncident), "M1: falta procedencia de llamada simulada");
    check(firstState.calls.every((call) => call.simulated === true), "M2: se detectó una comunicación de especialista no simulada");

    const reportBeforeSecond = await readReport();
    const smsEvent = event(tag, "dock_blocked");
    const smsRunId = await triggerInput(smsEvent);
    console.log(`[E2E] Input 2 HappyRobot run ${smsRunId}`);
    const smsAuditPromise = auditHappyRobotRun(inputApiBase, apiKey, smsRunId, timeoutMs);
    const afterDockEffect = await waitFor(
      "M3 Muelle Este cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "muelleEste")?.status === "cerrado",
    );
    const secondReport = await waitReport(reportBeforeSecond?.correlationId, e2eRunId);
    const smsAudit = await smsAuditPromise;
    const secondCoordinatorAudit = secondReport.happyrobotRunId
      ? await auditHappyRobotRun(inputApiBase, apiKey, secondReport.happyrobotRunId, timeoutMs)
      : undefined;
    const final = await waitFor(
      "M4 sin coordinador, tareas ni llamadas abiertas",
      timeoutMs,
      async () => ({ state: await readState(), actions: await readActions() }),
      ({ state, actions }) => state.coordinatorBusy === undefined && state.coordinatorStatus !== "replanificando" && actions.tasks.length === 0 && !state.calls.some((call) => call.status === "en_curso"),
    );
    checkpoints.final = {
      inputRunId: smsRunId,
      inputAudit: smsAudit,
      coordinatorAudit: secondCoordinatorAudit,
      planVersion: final.state.planVersion,
      coordinatorStatus: final.state.coordinatorStatus,
      resolved: final.state.resolved,
      closureSummary: final.state.closureSummary,
      report: secondReport,
    };
    checkAudit(smsAudit, "M3 input HappyRobot");
    check(Boolean(secondCoordinatorAudit), "M4: run del coordinador no auditable");
    if (secondCoordinatorAudit) checkAudit(secondCoordinatorAudit, "M4 coordinador HappyRobot");
    checkReport(secondReport, "M4", e2eRunId);
    check(firstReport.correlationId !== secondReport.correlationId, "M4: los dos ciclos comparten correlationId");
    check(firstReport.happyrobotRunId !== secondReport.happyrobotRunId, "M4: los dos ciclos comparten run HappyRobot");
    check(secondReport.planVersion >= firstReport.planVersion, "M4: planVersion retrocedió entre ciclos");
    const secondDistribution = assignmentTotals(secondReport);
    check(secondDistribution.total === 600, `M4: asignadas ${secondDistribution.total}/600 plazas`);
    check(secondDistribution.pabellonB === 450 && secondDistribution.loungeSur === 150 && secondDistribution.other === 0, `M4: reparto ${JSON.stringify(secondDistribution)}`);
    const activeDeliveries = afterDockEffect.deliveries.filter((delivery) => delivery.status !== "entregada");
    check(activeDeliveries.length > 0 && activeDeliveries.every((delivery) => delivery.status === "bloqueada"), "M3: no todas las entregas activas quedaron bloqueadas");
    check(incidentCount(afterDockEffect, smsEvent.eventId) === 1, "M3: el SMS no aparece exactamente una vez");
    const smsIncident = afterDockEffect.events.find((item) => item.channel === "sms" && item.actor === "SIMULACIÓN · Logística MADRING");
    check(Boolean(smsIncident), "M3: falta procedencia de SMS simulado");
    check(final.state.e2eMode === "production-isolated" && final.state.forceSimActions === true && final.state.e2eCoordinatorApply === true, "Final: se perdió el aislamiento E2E");
    check(final.state.spaces.find((item) => item.id === "principal")?.status === "cerrado", "Final: Principal dejó de estar cerrado");
    check(final.state.spaces.find((item) => item.id === "muelleEste")?.status === "cerrado", "Final: Muelle Este dejó de estar cerrado");
    for (const id of ["espacios", "catering", "transporte", "asistentes"]) {
      const agent = final.state.agents.find((item) => item.id === id);
      const objective = typeof agent?.objective === "string" ? agent.objective : "";
      const reason = typeof agent?.reason === "string" ? agent.reason : "";
      const lastResult = typeof agent?.lastResult === "string" ? agent.lastResult : "";
      check(Boolean(agent), `M4: falta agente ${id}`);
      check(objective !== "" && !objective.includes("Vigilar el plan original"), `M4: ${id} sin objetivo actualizado`);
      check(reason !== "", `M4: ${id} sin motivo visible`);
      check(lastResult !== "", `M4: ${id} sin último resultado visible`);
    }
    const places = new Map(final.state.spaces.map((space) => [String(space.id), space]));
    check(final.state.shuttles.length === 4, `Final: esperados 4 shuttles, recibidos ${final.state.shuttles.length}`);
    check(final.state.shuttles.every((shuttle) => places.has(String(shuttle.destinationId))), "Final: algún shuttle apunta a un destino inexistente");
    check(final.state.shuttles.every((shuttle) => places.get(String(shuttle.destinationId))?.zone === "sur"), "Final: algún shuttle salió de Sur");
    check(final.state.calls.every((call) => call.simulated === true), "Final: se ejecutó una comunicación de especialista real");
    check(!final.state.calls.some((call) => call.status === "en_curso"), "Final: quedan llamadas en curso");
    const finalActions = await readActions();
    check(finalActions.tasks.length === 0, "Final: quedan tareas abiertas");
    check(final.state.resolved || final.state.coordinatorStatus === "atascado" || Boolean(final.state.closureSummary), "Final: no hay cierre ni limitación explícita");

    const reportBeforeDuplicate = await readReport();
    const fingerprintBeforeDuplicate = stateFingerprint(final.state, finalActions, reportBeforeDuplicate);
    const duplicateRunId = await triggerInput(callEvent);
    const duplicateAudit = await auditHappyRobotRun(inputApiBase, apiKey, duplicateRunId, timeoutMs);
    await sleep(1_000);
    const duplicateState = await readState();
    const duplicateActions = await readActions();
    const reportAfterDuplicate = await readReport();
    const fingerprintAfterDuplicate = stateFingerprint(duplicateState, duplicateActions, reportAfterDuplicate);
    checkAudit(duplicateAudit, "Idempotencia input HappyRobot");
    check(fingerprintAfterDuplicate === fingerprintBeforeDuplicate, "Idempotencia: repetir eventId mutó el estado o relanzó el coordinador");
    check(incidentCount(duplicateState, callEvent.eventId) === 1, "Idempotencia: el incidente duplicado aparece más de una vez");
    check(duplicateAudit.nodes.some((node) => node.duplicate === true), "Idempotencia: HappyRobot no expuso duplicate=true");
    checkpoints.idempotency = { inputRunId: duplicateRunId, inputAudit: duplicateAudit, stateUnchanged: fingerprintAfterDuplicate === fingerprintBeforeDuplicate };

    const evidence = {
      generatedAt: new Date().toISOString(),
      mode: "real-happyrobot-isolated-sim-specialists",
      publicUrl,
      databasePath,
      checkpoints,
      failures,
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(`[E2E] Evidencia: ${evidencePath}`);
    if (failures.length > 0) throw new Error(`E2E terminó con ${failures.length} incumplimientos:\n- ${failures.join("\n- ")}`);
    console.log("[E2E] OK: recorrido real HappyRobot completo y coherente con el storyboard");
  } catch (error) {
    const runtimeError = error instanceof Error ? error.message : String(error);
    writeFileSync(evidencePath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode: "real-happyrobot-isolated-sim-specialists",
      publicUrl,
      databasePath,
      checkpoints,
      failures,
      runtimeError,
    }, null, 2));
    console.error(`[E2E] Evidencia parcial: ${evidencePath}`);
    throw error;
  } finally {
    await stop(backend);
    await stop(tunnel);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error) => {
    console.error(`[E2E] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
