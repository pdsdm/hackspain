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
  e2eSuppressResultReplan?: boolean;
  e2eRealTransportCall?: boolean;
  agentsPaused?: boolean;
  resolved: boolean;
  closureSummary?: string;
  spaces: Array<Record<string, unknown>>;
  deliveries: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
  shuttles: Array<Record<string, unknown>>;
  guestGroups: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
  inboxTriage?: Record<string, unknown>;
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

interface CycleTiming {
  inputToEffectMs: number;
  effectToCoordinatorMs: number;
  coordinatorLatencyMs: number;
  coordinatorToSettledMs: number;
  totalMs: number;
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

function event(tag: string, incidentId: "inbox_batch" | "dock_blocked") {
  const batch = incidentId === "inbox_batch";
  const noise = [
    "[+0ms] Catering confirma que el menú impreso lleva el logotipo correcto",
    "[+400ms] Un invitado pregunta si habrá guardarropa",
    "[+800ms] Marketing solicita una foto del acceso principal",
    "[+1200ms] El parte meteorológico mantiene cielo despejado",
    "[+1600ms] Un proveedor confirma que su factura fue recibida",
    "[+2000ms] Seguridad recuerda el color de las acreditaciones",
    "[+2400ms] La tienda pide reponer merchandising después de la apertura",
    "[+2800ms] Un conductor pregunta por el punto de café del personal",
    "[+3200ms] Producción confirma que la música ambiente está preparada",
    "[+3600ms] URGENTE: una rotura de tubería obliga a cerrar el Pabellón Principal sin hora confirmada de reapertura",
  ];
  return {
    eventId: `e2e-${tag}-${batch ? "inbox" : "sms"}`,
    channel: batch ? "call" : "sms",
    actor: batch ? "SIMULACIÓN · Centralita MADRING" : "SIMULACIÓN · Logística MADRING",
    incidentId,
    summary: batch
      ? `Lote de 10 mensajes recibidos en 3,6 segundos:\n${noise.join("\n")}`
      : "Un camión de televisión bloquea el Muelle Este; CAT-01 y CAT-02 no pueden descargar",
    evidence: { sessionId: `e2e-${tag}-${batch ? "inbox" : "sms"}` },
  } as const;
}

function outputRows(report: CoordinatorReport, field: string): Array<Record<string, unknown>> {
  return rows(report.output?.[field]);
}

function actionAreas(report: CoordinatorReport): Set<string> {
  return new Set(outputRows(report, "actions").map((action) => String(action.area)));
}

function areaObjectives(report: CoordinatorReport, area: string): string {
  return outputRows(report, "actions").filter((action) => action.area === area).map((action) => String(action.objective ?? "")).join(" ");
}

function totalsFromAssignments(assignments: Array<Record<string, unknown>>): { total: number; pabellonB: number; loungeSur: number; other: number } {
  const result = { total: 0, pabellonB: 0, loungeSur: 0, other: 0 };
  for (const assignment of assignments) {
    const count = Number(assignment.count ?? 0);
    result.total += count;
    if (assignment.spaceId === "pabellonB") result.pabellonB += count;
    else if (assignment.spaceId === "loungeSur") result.loungeSur += count;
    else result.other += count;
  }
  return result;
}

export function assignmentTotals(report: CoordinatorReport): { total: number; pabellonB: number; loungeSur: number; other: number } {
  return totalsFromAssignments(outputRows(report, "assignments"));
}

function stateAssignmentTotals(state: PublicState): { total: number; pabellonB: number; loungeSur: number; other: number } {
  return totalsFromAssignments(rows(state.assignments));
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
    assignments: rows(state.assignments).map((item) => [item.groupId, item.spaceId, item.count, item.planVersion]),
    incidents: state.events.filter((item) => isRecord(item.provenance)).map((item) => (item.provenance as Record<string, unknown>).eventId),
    actions: actions.tasks.length,
    openCalls: state.calls.filter((call) => call.status === "en_curso").length,
    report: report?.correlationId,
  });
}

export function latencySummary(values: number[]): { samples: number; meanMs: number; medianMs: number } {
  if (values.length === 0) return { samples: 0, meanMs: 0, medianMs: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return {
    samples: values.length,
    meanMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    medianMs: Math.round(medianMs),
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Uso: npm run demo:e2e-real -- --confirm-real-happyrobot [--confirm-real-transport-call]");
    return;
  }
  if (!process.argv.includes("--confirm-real-happyrobot")) {
    throw new Error("Añade --confirm-real-happyrobot: este E2E crea runs reales de HappyRobot");
  }
  const realTransportCall = process.argv.includes("--confirm-real-transport-call");
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
    check(report.latencyMs <= 20_000, `${label}: HappyRobot tardó ${report.latencyMs} ms, esperado <= 20000`);
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
      if (activeE2ERunId && (state.e2eMode !== "production-isolated" || state.forceSimActions !== true || state.e2eCoordinatorApply !== true || state.e2eSuppressResultReplan !== true || state.e2eRealTransportCall !== realTransportCall)) {
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
      const url = inputHookUrl ?? `${inputApiBase}/workflows/${encodeURIComponent(inputWorkflow.id)}/runs`;
      const direct = Boolean(inputHookUrl);
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(direct ? requestPayload : { environment: inputEnvironment, payload: requestPayload }),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HappyRobot input ${direct ? "hook" : "API"} ${response.status}: ${text}`);
      try {
        const result = JSON.parse(text) as { run_id?: string; queued_run_ids?: string[]; id?: string };
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
      body: JSON.stringify({ ...(inputTokenHash ? { inputTokenHash } : {}), ...(realTransportCall ? { realTransportCall: true } : {}) }),
    });
    const expectedActions = realTransportCall ? "transport-real-rest-sim" : "sim";
    if (reset.externalActions !== expectedActions) throw new Error(`El target no confirmó el modo de acciones ${expectedActions}`);
    if (!reset.runId) throw new Error("El reset E2E no devolvió runId");
    const e2eRunId = reset.runId;
    activeE2ERunId = e2eRunId;
    const stateReadStartedAt = Date.now();
    const initial = await readState();
    const stateReadMs = Date.now() - stateReadStartedAt;
    checkpoints.initial = { runId: e2eRunId, planVersion: initial.planVersion, coordinatorStatus: initial.coordinatorStatus, stateReadMs };
    check(initial.e2eMode === "production-isolated" && initial.forceSimActions === true && initial.e2eCoordinatorApply === true && initial.e2eSuppressResultReplan === true && initial.e2eRealTransportCall === realTransportCall, "M0: el run activo no conserva el aislamiento E2E");
    check(initial.planVersion === 1, `M0: planVersion esperado 1, recibido ${initial.planVersion}`);
    check(initial.spaces.find((space) => space.id === "principal")?.status === "confirmado", "M0: Principal no está confirmado");
    check(stateReadMs <= 2_000, `M0: /state tardó ${stateReadMs} ms, esperado <= 2000`);

    await json(`${localUrl}/interventions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "pause" }),
    });
    const paused = await waitFor("control humano: pausa", 10_000, readState, (state) => state.agentsPaused === true);
    await json(`${localUrl}/interventions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "resume" }),
    });
    const resumed = await waitFor("control humano: reanudación", 10_000, readState, (state) => state.agentsPaused !== true);
    check(paused.planVersion === initial.planVersion && resumed.planVersion === initial.planVersion, "Control humano: pausa/reanudación alteró planVersion");
    checkpoints.control = { pauseObserved: paused.agentsPaused === true, resumeObserved: resumed.agentsPaused !== true, planVersion: resumed.planVersion };

    const journeyStartedAt = Date.now();
    const callEvent = event(tag, "inbox_batch");
    const firstStartedAt = Date.now();
    const callRunId = await triggerInput(callEvent);
    console.log(`[E2E] Input 1 HappyRobot run ${callRunId}`);
    const callAuditPromise = auditHappyRobotRun(inputApiBase, apiKey, callRunId, timeoutMs);
    const inboxVisible = await waitFor(
      "M1 lote visible",
      timeoutMs,
      readState,
      (state) => incidentCount(state, callEvent.eventId) === 1,
    );
    const inboxVisibleMs = Date.now() - firstStartedAt;
    check(inboxVisibleMs <= 2_000, `M1: el lote tardó ${inboxVisibleMs} ms en aparecer, esperado <= 2000`);
    checkpoints.triage = { received: 10, relevant: 1, ignored: 9, visibleMs: inboxVisibleMs, event: inboxVisible.events.find((item) => isRecord(item.provenance) && item.provenance.eventId === callEvent.eventId) };
    const afterCallEffect = await waitFor(
      "M1 Principal cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "principal")?.status === "cerrado",
    );
    const firstEffectAt = Date.now();
    const firstReport = await waitReport(undefined, e2eRunId);
    const firstReportAt = Date.now();
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
    const firstSettledAt = Date.now();
    const firstState = firstSettled.state;
    const firstTiming: CycleTiming = {
      inputToEffectMs: firstEffectAt - firstStartedAt,
      effectToCoordinatorMs: firstReportAt - firstEffectAt,
      coordinatorLatencyMs: firstReport.latencyMs,
      coordinatorToSettledMs: firstSettledAt - firstReportAt,
      totalMs: firstSettledAt - firstStartedAt,
    };
    const firstCycleLimitMs = realTransportCall ? 180_000 : 30_000;
    check(firstTiming.totalMs <= firstCycleLimitMs, `M2: ciclo completo tardó ${firstTiming.totalMs} ms, esperado <= ${firstCycleLimitMs}`);
    checkpoints.first = {
      inputRunId: callRunId,
      inputAudit: callAudit,
      coordinatorAudit: firstCoordinatorAudit,
      timing: firstTiming,
      planVersion: firstState.planVersion,
      report: firstReport,
      principal: afterCallEffect.spaces.find((space) => space.id === "principal"),
    };
    checkAudit(callAudit, "M1 input HappyRobot");
    check(Boolean(firstCoordinatorAudit), "M2: run del coordinador no auditable");
    if (firstCoordinatorAudit) checkAudit(firstCoordinatorAudit, "M2 coordinador HappyRobot");
    checkReport(firstReport, "M2", e2eRunId);
    check(firstReport.consults >= 1, "M2: el agente no usó consult_world para discriminar la señal");
    check(/10 recibidos.*1 relevante.*9 descartados/i.test(String(firstReport.output?.reading ?? "")), "M2: el agente no explica el triaje 10/1/9");
    check(firstState.inboxTriage?.status === "triaged" && firstState.inboxTriage.selected === "principal_pipe_burst", "M2: el triaje no quedó persistido en /state");
    check(firstReport.planVersion === 1 && firstState.planVersion === 2, `M2: versiones inesperadas informe/estado ${firstReport.planVersion}/${firstState.planVersion}`);
    const firstActions = outputRows(firstReport, "actions");
    check(firstActions.length === 5, `M2: esperadas 5 acciones concretas, recibidas ${firstActions.length}`);
    check(firstActions.filter((action) => action.area === "espacios").length === 2, "M2: Espacios debe consultar B y Lounge por separado");
    const firstSpacesDue = Math.min(...firstActions.filter((action) => action.area === "espacios").map((action) => Number(action.dueAt ?? Number.POSITIVE_INFINITY)));
    const firstCateringDue = Math.min(...firstActions.filter((action) => action.area === "catering").map((action) => Number(action.dueAt ?? Number.POSITIVE_INFINITY)));
    check(firstSpacesDue <= firstCateringDue, "M2: la sede de 600 VIP no está priorizada antes que Catering");
    check(/600|CAT-01|CAT-02/i.test(areaObjectives(firstReport, "catering")), "M2: Catering no concreta el servicio afectado");
    check(/BUS-01|cuatro shuttles/i.test(areaObjectives(firstReport, "transporte")) && /Sur/i.test(areaObjectives(firstReport, "transporte")), "M2: Transporte no concreta los cuatro shuttles en Sur");
    check(firstActions.some((action) => action.area === "transporte" && action.channel === "llamada"), "M2: Transporte no genera una llamada");
    check(/6|seis/i.test(areaObjectives(firstReport, "asistentes")) && /inform|avis|mensaj|segment/i.test(areaObjectives(firstReport, "asistentes")), "M2: Asistentes no distribuye seis personas y segmenta avisos");
    const firstDistribution = assignmentTotals(firstReport);
    check(firstDistribution.total === 600, `M2: asignadas ${firstDistribution.total}/600 plazas`);
    check(firstDistribution.pabellonB === 450 && firstDistribution.loungeSur === 150 && firstDistribution.other === 0, `M2: reparto ${JSON.stringify(firstDistribution)}`);
    const firstStateDistribution = stateAssignmentTotals(firstState);
    check(JSON.stringify(firstStateDistribution) === JSON.stringify(firstDistribution), `M2: el reparto no quedó visible en /state: ${JSON.stringify(firstStateDistribution)}`);
    const firstPlaces = ["pabellonB", "loungeSur"].map((id) => firstState.spaces.find((space) => space.id === id));
    check(firstPlaces.every((space) => space && !["inactivo", "cerrado", "descartado"].includes(String(space.status))), "M2: B + Lounge no aparecen como alternativas activadas");
    check(firstState.commitments.some((item) => item.id === "c-pabB"), "M2: falta compromiso de Pabellón B");
    check(firstState.commitments.some((item) => ["c-loungeSur", "c-lounge"].includes(String(item.id))), "M2: falta compromiso de Lounge Sur");
    check(incidentCount(afterCallEffect, callEvent.eventId) === 1, "M1: el lote no aparece exactamente una vez");
    const callIncident = afterCallEffect.events.find((item) => item.channel === "call" && item.actor === "SIMULACIÓN · Centralita MADRING");
    check(Boolean(callIncident), "M1: falta procedencia del lote simulado");
    const firstRealCalls = firstState.calls.filter((call) => call.simulated === false);
    if (realTransportCall) {
      check(firstRealCalls.length === 1 && firstRealCalls[0]?.agent === "transporte", `M2: esperada una llamada real de Transporte, observadas ${firstRealCalls.length}`);
      check(firstRealCalls[0]?.status === "terminada", `M2: la llamada real terminó como ${String(firstRealCalls[0]?.status)}`);
      check(Array.isArray(firstRealCalls[0]?.transcript) && firstRealCalls[0].transcript.length > 0, "M2: la llamada real no conserva transcript");
    } else {
      check(firstRealCalls.length === 0, "M2: se detectó una comunicación real sin autorización explícita");
    }

    const reportBeforeSecond = await readReport();
    const smsEvent = event(tag, "dock_blocked");
    const secondStartedAt = Date.now();
    const smsRunId = await triggerInput(smsEvent);
    console.log(`[E2E] Input 2 HappyRobot run ${smsRunId}`);
    const smsAuditPromise = auditHappyRobotRun(inputApiBase, apiKey, smsRunId, timeoutMs);
    const afterDockEffect = await waitFor(
      "M3 Muelle Este cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "muelleEste")?.status === "cerrado",
    );
    const secondEffectAt = Date.now();
    const secondReport = await waitReport(reportBeforeSecond?.correlationId, e2eRunId);
    const secondReportAt = Date.now();
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
    const finalAt = Date.now();
    const secondTiming: CycleTiming = {
      inputToEffectMs: secondEffectAt - secondStartedAt,
      effectToCoordinatorMs: secondReportAt - secondEffectAt,
      coordinatorLatencyMs: secondReport.latencyMs,
      coordinatorToSettledMs: finalAt - secondReportAt,
      totalMs: finalAt - secondStartedAt,
    };
    check(secondTiming.inputToEffectMs <= 2_000, `M3: input→efecto tardó ${secondTiming.inputToEffectMs} ms, esperado <= 2000`);
    check(secondTiming.totalMs <= 30_000, `M4: ciclo completo tardó ${secondTiming.totalMs} ms, esperado <= 30000`);
    checkpoints.final = {
      inputRunId: smsRunId,
      inputAudit: smsAudit,
      coordinatorAudit: secondCoordinatorAudit,
      timing: secondTiming,
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
    const secondActions = outputRows(secondReport, "actions");
    check(secondActions.length >= 4, `M4: esperadas acciones de cuatro áreas, recibidas ${secondActions.length}`);
    check(/muelle|descarga/i.test(areaObjectives(secondReport, "catering")), "M4: Catering no cambia descarga tras bloquearse el muelle");
    check(/muelle|recepci|inform|avis|mensaj/i.test(areaObjectives(secondReport, "asistentes")), "M4: Asistentes no redistribuye recepción o mensajes tras el muelle");
    check(/BUS-01|cuatro shuttles/i.test(areaObjectives(secondReport, "transporte")), "M4: Transporte no revisa los cuatro shuttles");
    for (const area of ["catering", "transporte", "asistentes"]) {
      check(areaObjectives(secondReport, area) !== areaObjectives(firstReport, area), `M4: ${area} repite el objetivo de M2 sin adaptarse`);
    }
    check(/muelle|catering|descarga/i.test(String(secondReport.output?.reading ?? "")), "M4: la lectura no prioriza el nuevo bloqueo de servicio");
    const secondOperations = outputRows(secondReport, "operations");
    for (const id of ["CAT-01", "CAT-02"]) {
      check(secondOperations.some((operation) => operation.op === "redirect_delivery" && operation.id === id && operation.dockId === "muelleSur"), `M4: falta redirección explícita de ${id} a Muelle Sur`);
    }
    check(!secondOperations.some((operation) => [operation.id, operation.destinationId, operation.dockId].includes("muelleNorte")), "M4: el plan usa Muelle Norte sin ruta exterior");
    check(firstReport.correlationId !== secondReport.correlationId, "M4: los dos ciclos comparten correlationId");
    check(firstReport.happyrobotRunId !== secondReport.happyrobotRunId, "M4: los dos ciclos comparten run HappyRobot");
    check(secondReport.planVersion === 2 && final.state.planVersion === 3, `M4: versiones inesperadas informe/estado ${secondReport.planVersion}/${final.state.planVersion}; debe haber solo dos ciclos`);
    const secondDistribution = assignmentTotals(secondReport);
    check(secondDistribution.total === 600, `M4: asignadas ${secondDistribution.total}/600 plazas`);
    check(secondDistribution.pabellonB === 450 && secondDistribution.loungeSur === 150 && secondDistribution.other === 0, `M4: reparto ${JSON.stringify(secondDistribution)}`);
    const finalStateDistribution = stateAssignmentTotals(final.state);
    check(JSON.stringify(finalStateDistribution) === JSON.stringify(secondDistribution), `M4: el reparto no quedó visible en /state: ${JSON.stringify(finalStateDistribution)}`);
    const activeDeliveries = afterDockEffect.deliveries.filter((delivery) => delivery.status !== "entregada");
    check(activeDeliveries.length > 0 && activeDeliveries.every((delivery) => delivery.status === "bloqueada"), "M3: no todas las entregas activas quedaron bloqueadas");
    check(incidentCount(afterDockEffect, smsEvent.eventId) === 1, "M3: el SMS no aparece exactamente una vez");
    const smsIncident = afterDockEffect.events.find((item) => item.channel === "sms" && item.actor === "SIMULACIÓN · Logística MADRING");
    check(Boolean(smsIncident), "M3: falta procedencia de SMS simulado");
    check(final.state.e2eMode === "production-isolated" && final.state.forceSimActions === true && final.state.e2eCoordinatorApply === true && final.state.e2eSuppressResultReplan === true, "Final: se perdió el aislamiento E2E");
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
    const finalRealCalls = final.state.calls.filter((call) => call.simulated === false);
    check(finalRealCalls.length === (realTransportCall ? 1 : 0), `Final: esperadas ${realTransportCall ? 1 : 0} llamadas reales, observadas ${finalRealCalls.length}`);
    check(!final.state.calls.some((call) => call.status === "en_curso"), "Final: quedan llamadas en curso");
    const provenanceEvents = final.state.events.filter((item) => isRecord(item.provenance));
    check(provenanceEvents.length === 2, `Final: esperados 2 inputs relevantes, observados ${provenanceEvents.length}`);
    check(provenanceEvents.every((item) => String(item.actor ?? "").startsWith("SIMULACIÓN ·")), "Final: algún input se presenta como comunicación real");
    const finalActions = await readActions();
    check(finalActions.tasks.length === 0, "Final: quedan tareas abiertas");
    check(final.state.resolved || final.state.coordinatorStatus === "atascado" || Boolean(final.state.closureSummary), "Final: no hay cierre ni limitación explícita");
    check(!String(final.state.closureSummary ?? "").includes("sin sede asignada"), "Final: el cierre perdió las asignaciones propuestas del plan");

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

    const happyrobotLatency = latencySummary([firstReport.latencyMs, secondReport.latencyMs]);
    const coreJourneyMs = finalAt - journeyStartedAt;
    const journeyLimitMs = realTransportCall ? 240_000 : 60_000;
    check(coreJourneyMs <= journeyLimitMs, `Recorrido M1-M4 tardó ${coreJourneyMs} ms, esperado <= ${journeyLimitMs}`);
    checkpoints.performance = {
      note: "Dos ciclos HappyRobot del recorrido grabado",
      happyrobot: happyrobotLatency,
      coreJourneyMs,
      totalWithIdempotencyMs: Date.now() - journeyStartedAt,
      cycles: { first: firstTiming, second: secondTiming },
    };
    console.log(`[E2E] Latencia HappyRobot · media ${happyrobotLatency.meanMs} ms · mediana ${happyrobotLatency.medianMs} ms · recorrido ${coreJourneyMs} ms`);

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
