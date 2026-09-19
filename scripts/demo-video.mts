import { readFileSync } from "node:fs";

type InputMode = "happyrobot" | "api";

type PublicState = {
  planVersion: number;
  coordinatorStatus: string;
  resolved: boolean;
  spaces: Array<{ id: string; status: string }>;
  deliveries: Array<{ id: string; status: string }>;
  calls: Array<{ status: string }>;
};

type ActionsResponse = { tasks: unknown[] };
type FetchFn = typeof fetch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function required(value: string | undefined, name: string): string {
  const parsed = value?.trim();
  if (!parsed) throw new Error(`Falta ${name}`);
  return parsed;
}

function publicBaseUrl(): string | undefined {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured;
  try {
    return readFileSync(new URL("../.demo/public-url", import.meta.url), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

async function json<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchFn(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function waitFor(
  fetchFn: FetchFn,
  label: string,
  timeoutMs: number,
  read: () => Promise<PublicState>,
  predicate: (state: PublicState) => boolean,
): Promise<PublicState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await read();
    if (predicate(state)) return state;
    await sleep(500);
  }
  throw new Error(`Timeout esperando: ${label}`);
}

function event(tag: string, incidentId: "principal_pipe_burst" | "dock_blocked") {
  const call = incidentId === "principal_pipe_burst";
  return {
    eventId: `demo-${tag}-${call ? "call" : "sms"}`,
    channel: call ? "call" : "sms",
    actor: call ? "SIMULACIÓN · Responsable de recinto" : "SIMULACIÓN · Logística MADRING",
    incidentId,
    summary: call
      ? "Una rotura de tubería obliga a cerrar el Pabellón Principal sin hora confirmada de reapertura"
      : "Un camión de televisión bloquea el Muelle Este; CAT-01 y CAT-02 no pueden descargar",
    evidence: { sessionId: `demo-${tag}-${call ? "call" : "sms"}` },
  } as const;
}

async function sendDirect(fetchFn: FetchFn, apiUrl: string, token: string, payload: ReturnType<typeof event>) {
  return json<Record<string, unknown>>(fetchFn, `${apiUrl}/workflow/happyrobot/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

async function sendHappyRobot(
  fetchFn: FetchFn,
  config: { apiBase: string; apiKey: string; workflowId: string; environment: string; backendBaseUrl: string },
  payload: ReturnType<typeof event>,
) {
  const result = await json<{ run_id?: string; status?: string }>(
    fetchFn,
    `${config.apiBase}/workflows/${encodeURIComponent(config.workflowId)}/runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        environment: config.environment,
        payload: {
          ...payload,
          sessionId: payload.evidence.sessionId,
          backend_base_url: config.backendBaseUrl,
        },
      }),
    },
  );
  if (!result.run_id) throw new Error(`HappyRobot no devolvió run_id (${result.status ?? "sin estado"})`);
  return result.run_id;
}

export async function runVideoDirector(fetchFn: FetchFn = fetch): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Uso: npm run demo:video -- --inputs=happyrobot|external|api");
    return;
  }
  const rawMode = option("inputs") ?? "happyrobot";
  const mode: InputMode = rawMode === "api" ? "api" : rawMode === "happyrobot" || rawMode === "external" ? "happyrobot" : (() => { throw new Error(`inputs desconocido: ${rawMode}`); })();
  const apiUrl = (process.env.DEMO_API_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const timeoutMs = Number(process.env.DEMO_VIDEO_TIMEOUT_MS?.trim() || 360_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000) throw new Error("DEMO_VIDEO_TIMEOUT_MS debe ser un entero >= 10000");
  const token = mode === "api" ? required(process.env.HAPPYROBOT_WEBHOOK_TOKEN, "HAPPYROBOT_WEBHOOK_TOKEN") : "";
  const readState = () => json<PublicState>(fetchFn, `${apiUrl}/state`);
  const readActions = () => json<ActionsResponse>(fetchFn, `${apiUrl}/actions`);

  console.log("[VIDEO] Reiniciando a calm…");
  await json(fetchFn, `${apiUrl}/simulation/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixture: "calm" }),
  });
  await waitFor(fetchFn, "estado calm", timeoutMs, readState, (state) => state.spaces.find((space) => space.id === "principal")?.status === "confirmado");
  console.log("[VIDEO] Estado limpio. Empieza a grabar y mantén visible el Pabellón Principal.");

  const tag = Date.now().toString(36);
  const call = event(tag, "principal_pipe_burst");
  const sms = event(tag, "dock_blocked");
  const send = mode === "api"
    ? (payload: ReturnType<typeof event>) => sendDirect(fetchFn, apiUrl, token, payload)
    : (() => {
        const config = {
          apiBase: (process.env.HAPPYROBOT_DEMO_INPUT_API_BASE?.trim() || "https://platform.eu.happyrobot.ai/api/v2").replace(/\/+$/, ""),
          apiKey: required(process.env.HAPPYROBOT_API_KEY, "HAPPYROBOT_API_KEY"),
          workflowId: required(process.env.HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID, "HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID"),
          environment: process.env.HAPPYROBOT_DEMO_INPUT_ENVIRONMENT?.trim() || "development",
          backendBaseUrl: required(publicBaseUrl(), "PUBLIC_BASE_URL o .demo/public-url"),
        };
        return async (payload: ReturnType<typeof event>) => {
          const runId = await sendHappyRobot(fetchFn, config, payload);
          console.log(`[VIDEO] HappyRobot run ${runId}`);
          return { runId };
        };
      })();

  console.log(`[VIDEO] Input 1 (${mode}): llamada simulada por rotura de tubería.`);
  await send(call);
  await waitFor(fetchFn, "Pabellón Principal cerrado", timeoutMs, readState, (state) => state.spaces.find((space) => space.id === "principal")?.status === "cerrado");
  console.log("[VIDEO] Principal cerrado. Selecciónalo en el mapa.");

  console.log(`[VIDEO] Input 2 (${mode}): SMS simulado por bloqueo del Muelle Este.`);
  await send(sms);
  await waitFor(fetchFn, "Muelle Este y entregas bloqueados", timeoutMs, readState, (state) =>
    state.spaces.find((space) => space.id === "muelleEste")?.status === "cerrado" &&
    state.deliveries.filter((delivery) => delivery.status !== "entregada").every((delivery) => delivery.status === "bloqueada"),
  );
  console.log("[VIDEO] Muelle bloqueado. Selecciona Muelle Este y después el panel de agentes.");

  await waitFor(fetchFn, "coordinador fuera de replanificación", timeoutMs, readState, (state) => state.coordinatorStatus !== "replanificando");
  const finalState = await readState();
  const actions = await readActions();
  const openCalls = finalState.calls.filter((callItem) => callItem.status === "en_curso").length;
  console.log(`[VIDEO] Checkpoint final · plan v${finalState.planVersion} · ${finalState.coordinatorStatus} · ${actions.tasks.length} tareas abiertas · ${openCalls} llamadas abiertas.`);
  console.log("[VIDEO] Abre compromisos y termina en la tarjeta Resultado. La toma está lista para voz y subtítulos.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVideoDirector().catch((error) => {
    console.error(`[VIDEO] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
