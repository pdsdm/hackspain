import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PublicState {
  planVersion: number;
  coordinatorStatus: string;
  coordinatorBusy?: unknown;
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

interface CoordinatorReport {
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

interface ActionsResponse {
  tasks: unknown[];
}

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

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function resolveInputWorkflowId(apiBase: string, apiKey: string): Promise<string> {
  const configured = process.env.HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID?.trim();
  if (configured) return configured;
  const workflows = await json<{ data?: Array<{ id?: string; name?: string }> }>(`${apiBase}/workflows/?page_size=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  const workflow = workflows.data?.find((item) => item.name?.trim().toLowerCase() === "demo incident inputs");
  if (!workflow?.id) throw new Error("No existe el workflow HappyRobot Demo Incident Inputs");
  return workflow.id;
}

async function waitFor<T>(label: string, timeoutMs: number, read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`Timeout esperando ${label}${last === undefined ? "" : `; último valor: ${JSON.stringify(last).slice(0, 800)}`}`);
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
  const inputWorkflowId = await resolveInputWorkflowId(inputApiBase, apiKey);
  const inputEnvironment = process.env.HAPPYROBOT_DEMO_INPUT_ENVIRONMENT?.trim() || "development";
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

  try {
    await waitFor("health target", 60_000, () => fetch(`${localUrl}/health`), (response) => response.ok);
    const authHeaders = { Authorization: `Bearer ${token}` };
    const readState = () => json<PublicState>(`${localUrl}/state`);
    const readActions = () => json<ActionsResponse>(`${localUrl}/actions`);
    const readReport = async (): Promise<CoordinatorReport | undefined> => {
      const response = await fetch(`${localUrl}/coordinator/happyrobot/report`, { headers: authHeaders });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`GET report: ${response.status} ${await response.text()}`);
      return response.json() as Promise<CoordinatorReport>;
    };
    const triggerInput = async (payload: ReturnType<typeof event>): Promise<string> => {
      const result = await json<{ run_id?: string; status?: string }>(
        `${inputApiBase}/workflows/${encodeURIComponent(inputWorkflowId)}/runs`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            environment: inputEnvironment,
            payload: { ...payload, sessionId: payload.evidence.sessionId, backend_base_url: publicUrl },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!result.run_id) throw new Error(`HappyRobot no devolvió run_id (${result.status ?? "sin estado"})`);
      return result.run_id;
    };
    const waitReport = (previous: string | undefined) => waitFor(
      "informe nuevo del coordinador HappyRobot",
      timeoutMs,
      readReport,
      (report) => Boolean(report && report.correlationId !== previous && report.status !== "timeout" && report.status !== "unavailable"),
    ) as Promise<CoordinatorReport>;

    const reset = await json<{ externalActions?: string }>(`${localUrl}/simulation/e2e/reset`, {
      method: "POST",
      headers: authHeaders,
    });
    if (reset.externalActions !== "sim") throw new Error("El target no confirmó el aislamiento de acciones externas");
    const initial = await readState();
    checkpoints.initial = { planVersion: initial.planVersion, coordinatorStatus: initial.coordinatorStatus };
    check(initial.planVersion === 1, `M0: planVersion esperado 1, recibido ${initial.planVersion}`);
    check(initial.spaces.find((space) => space.id === "principal")?.status === "confirmado", "M0: Principal no está confirmado");

    const callRunId = await triggerInput(event(tag, "principal_pipe_burst"));
    console.log(`[E2E] Input 1 HappyRobot run ${callRunId}`);
    const afterCallEffect = await waitFor(
      "M1 Principal cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "principal")?.status === "cerrado",
    );
    const firstReport = await waitReport(undefined);
    const firstState = await waitFor(
      "M2 primer ciclo sin coordinador ocupado",
      timeoutMs,
      readState,
      (state) => state.coordinatorBusy === undefined,
    );
    checkpoints.first = {
      inputRunId: callRunId,
      planVersion: firstState.planVersion,
      report: firstReport,
      principal: afterCallEffect.spaces.find((space) => space.id === "principal"),
    };
    check(firstReport.status === "accepted", `M2: coordinador ${firstReport.status}`);
    check(firstReport.applied, "M2: el plan HappyRobot no se aplicó");
    check(firstReport.output !== null, "M2: informe sin output");
    const firstPlaces = ["pabellonB", "loungeSur"].map((id) => firstState.spaces.find((space) => space.id === id));
    check(firstPlaces.every((space) => space && space.status !== "inactivo"), "M2: B + Lounge no aparecen como alternativas activadas");
    const callIncident = afterCallEffect.events.find((item) => item.channel === "call" && item.actor === "SIMULACIÓN · Responsable de recinto");
    check(Boolean(callIncident), "M1: falta procedencia de llamada simulada");

    const reportBeforeSecond = await readReport();
    const smsRunId = await triggerInput(event(tag, "dock_blocked"));
    console.log(`[E2E] Input 2 HappyRobot run ${smsRunId}`);
    const afterDockEffect = await waitFor(
      "M3 Muelle Este cerrado",
      timeoutMs,
      readState,
      (state) => state.spaces.find((space) => space.id === "muelleEste")?.status === "cerrado",
    );
    const secondReport = await waitReport(reportBeforeSecond?.correlationId);
    const final = await waitFor(
      "M4 sin coordinador, tareas ni llamadas abiertas",
      timeoutMs,
      async () => ({ state: await readState(), actions: await readActions() }),
      ({ state, actions }) => state.coordinatorBusy === undefined && actions.tasks.length === 0 && !state.calls.some((call) => call.status === "en_curso"),
    );
    checkpoints.final = {
      inputRunId: smsRunId,
      planVersion: final.state.planVersion,
      coordinatorStatus: final.state.coordinatorStatus,
      resolved: final.state.resolved,
      closureSummary: final.state.closureSummary,
      report: secondReport,
    };
    check(secondReport.status === "accepted", `M4: coordinador ${secondReport.status}`);
    check(secondReport.applied, "M4: el segundo plan HappyRobot no se aplicó");
    check(secondReport.output !== null, "M4: segundo informe sin output");
    check(afterDockEffect.deliveries.filter((delivery) => delivery.status !== "entregada").every((delivery) => delivery.status === "bloqueada"), "M3: no todas las entregas activas quedaron bloqueadas");
    const smsIncident = afterDockEffect.events.find((item) => item.channel === "sms" && item.actor === "SIMULACIÓN · Logística MADRING");
    check(Boolean(smsIncident), "M3: falta procedencia de SMS simulado");
    for (const id of ["espacios", "catering", "transporte", "asistentes"]) {
      const agent = final.state.agents.find((item) => item.id === id);
      const objective = typeof agent?.objective === "string" ? agent.objective : "";
      const reason = typeof agent?.reason === "string" ? agent.reason : "";
      check(Boolean(agent), `M4: falta agente ${id}`);
      check(objective !== "" && !objective.includes("Vigilar el plan original"), `M4: ${id} sin objetivo actualizado`);
      check(reason !== "", `M4: ${id} sin motivo visible`);
    }
    const placeIds = new Set(final.state.spaces.map((space) => String(space.id)));
    check(final.state.shuttles.length === 4, `Final: esperados 4 shuttles, recibidos ${final.state.shuttles.length}`);
    check(final.state.shuttles.every((shuttle) => placeIds.has(String(shuttle.destinationId))), "Final: algún shuttle apunta a un destino inexistente");
    check(!final.state.calls.some((call) => call.status === "en_curso"), "Final: quedan llamadas en curso");
    check((await readActions()).tasks.length === 0, "Final: quedan tareas abiertas");
    check(final.state.resolved || final.state.coordinatorStatus === "atascado" || Boolean(final.state.closureSummary), "Final: no hay cierre ni limitación explícita");

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
  } finally {
    await stop(backend);
    await stop(tunnel);
  }
}

main().catch((error) => {
  console.error(`[E2E] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
