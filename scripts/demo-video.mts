import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type InputMode = "happyrobot" | "api";
type IncidentId = "principal_pipe_burst" | "dock_blocked";

type TimelineEvent = {
  channel?: string;
  actor?: string;
  provenance?: { source?: string; eventId?: string; sessionId?: string };
};

type PublicState = {
  planVersion: number;
  coordinatorStatus: string;
  resolved: boolean;
  closureSummary?: string;
  spaces: Array<{ id: string; status: string; zone?: string }>;
  deliveries: Array<{ id: string; status: string; dockId?: string }>;
  shuttles: Array<{ id: string; destinationId: string }>;
  guestGroups: Array<{ count: number; confirmedCount: number }>;
  assignments?: Array<{ groupId: string; spaceId: string; count: number }>;
  commitments: Array<{ id: string; status: string; conditions?: unknown[] }>;
  agents: Array<{ id: string; status: string; objective?: string; reason?: string; lastResult?: string }>;
  calls: Array<{ agent?: string; status: string; transcript?: unknown[] }>;
  events: TimelineEvent[];
};

type ActionsResponse = { tasks: unknown[] };
type CoordinatorReport = { correlationId: string; happyrobotRunId: string | null; runId: string; planVersion: number; status: string; applied: boolean; latencyMs: number; consults: number; submissions: number; validationErrors: string[]; output?: { operations?: Array<Record<string, unknown>> } | null };
type FetchFn = typeof fetch;
type DemoEvent = ReturnType<typeof event>;

type CheckpointEvidence = {
  checkpoint: "M0" | "M2" | "M3" | "final";
  observedAt: string;
  planVersion: number;
  coordinatorStatus: string;
  resolved: boolean;
  principalStatus?: string;
  dockStatus?: string;
  deliveries: Record<string, string>;
  openCalls: number;
  openTasks: number;
  inputEventIds: string[];
  specialists: Record<string, { status: string; objective: boolean; reason: boolean; lastResult: boolean }>;
  closureSummary?: string;
};

type RehearsalEvidence = {
  rehearsal: number;
  startedAt: string;
  finishedAt?: string;
  outcome: "running" | "passed" | "failed";
  backendRunId?: string;
  inputs: Array<{ incidentId: IncidentId; eventId: string; workflowRunId?: string }>;
  coordinatorRuns: CoordinatorReport[];
  checkpoints: CheckpointEvidence[];
  diagnostic?: string;
};

type EvidenceReport = {
  schemaVersion: 1;
  createdAt: string;
  mode: InputMode;
  requestedRehearsals: number;
  outcome: "running" | "passed" | "failed";
  rehearsals: RehearsalEvidence[];
};

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

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} debe ser un entero >= 1`);
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

function defaultReportPath(): string {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return fileURLToPath(new URL(`../.demo/video-rehearsal-${stamp}.json`, import.meta.url));
}

function persistReport(path: string | undefined, report: EvidenceReport): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function json<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchFn(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function diagnostic(state: PublicState): string {
  const statuses = Object.fromEntries(state.spaces.filter((space) => ["principal", "muelleEste"].includes(space.id)).map((space) => [space.id, space.status]));
  const deliveries = Object.fromEntries(state.deliveries.filter((item) => ["CAT-01", "CAT-02"].includes(item.id)).map((item) => [item.id, item.status]));
  const eventIds = state.events.flatMap((item) => item.provenance?.eventId ? [item.provenance.eventId] : []);
  return JSON.stringify({ planVersion: state.planVersion, coordinatorStatus: state.coordinatorStatus, resolved: state.resolved, statuses, deliveries, openCalls: state.calls.filter((item) => item.status === "en_curso").length, eventIds });
}

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  describe?: (value: T) => string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await sleep(500);
  }
  throw new Error(`Timeout esperando ${label}${last && describe ? `; último estado: ${describe(last)}` : ""}`);
}

function event(tag: string, incidentId: IncidentId) {
  return {
    eventId: `demo-${tag}-${incidentId === "principal_pipe_burst" ? "call" : "sms"}`,
    channel: incidentId === "dock_blocked" ? "sms" : "call",
    actor: incidentId === "principal_pipe_burst" ? "Responsable de recinto" : "Logística MADRING",
    incidentId,
    summary: incidentId === "principal_pipe_burst"
      ? "Una rotura de tubería obliga a cerrar el Pabellón Principal sin hora confirmada de reapertura"
      : "Un camión de televisión bloquea el Muelle Este; CAT-01 y CAT-02 no pueden descargar",
    evidence: { sessionId: `demo-${tag}-${incidentId === "principal_pipe_burst" ? "call" : "sms"}` },
  } as const;
}

function timelineEvent(state: PublicState, payload: DemoEvent): TimelineEvent | undefined {
  return state.events.find((item) => item.provenance?.eventId === payload.eventId);
}

function observesInput(state: PublicState, payload: DemoEvent): boolean {
  const observed = timelineEvent(state, payload);
  return observed?.channel === payload.channel && observed.actor === payload.actor &&
    observed.provenance?.source === "happyrobot" && observed.provenance.sessionId === payload.evidence.sessionId;
}

function requireCheckpoint(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateCalm(state: PublicState): void {
  const expectedAreas = ["espacios", "catering", "transporte", "asistentes"];
  const total = state.guestGroups.reduce((sum, group) => sum + group.count, 0);
  const confirmed = state.guestGroups.reduce((sum, group) => sum + group.confirmedCount, 0);
  requireCheckpoint(state.planVersion === 1, `M0 incoherente: planVersion=${state.planVersion}, esperado 1`);
  requireCheckpoint(state.spaces.find((space) => space.id === "principal")?.status === "confirmado", "M0 incoherente: Principal no está confirmado");
  requireCheckpoint(state.events.every((item) => !item.provenance), "M0 incoherente: conserva inputs de un ensayo anterior");
  requireCheckpoint(total === 600 && confirmed === 600, `M0 incoherente: VIP total/confirmados=${total}/${confirmed}, esperado 600/600`);
  const missing = expectedAreas.filter((area) => !state.agents.some((agent) => agent.id === area));
  requireCheckpoint(missing.length === 0, `M0 incoherente: faltan especialistas ${missing.join(", ")}`);
}

function assignmentTotals(state: PublicState): { total: number; pabellonB: number; loungeSur: number; other: number } {
  const result = { total: 0, pabellonB: 0, loungeSur: 0, other: 0 };
  for (const assignment of state.assignments ?? []) {
    result.total += assignment.count;
    if (assignment.spaceId === "pabellonB") result.pabellonB += assignment.count;
    else if (assignment.spaceId === "loungeSur") result.loungeSur += assignment.count;
    else result.other += assignment.count;
  }
  return result;
}

function validateFirstCycle(state: PublicState): void {
  const distribution = assignmentTotals(state);
  requireCheckpoint(
    distribution.total === 600 && distribution.pabellonB === 450 && distribution.loungeSur === 150 && distribution.other === 0,
    `M2 incoherente: reparto ${JSON.stringify(distribution)}, esperado B 450 + Lounge 150`,
  );
}

function validateFinal(state: PublicState, actions: ActionsResponse, call: DemoEvent, sms: DemoEvent): void {
  requireCheckpoint(state.planVersion >= 2, `Final incoherente: planVersion=${state.planVersion}, esperado >=2`);
  requireCheckpoint(observesInput(state, call), `Final incoherente: falta procedencia de llamada ${call.eventId}`);
  requireCheckpoint(observesInput(state, sms), `Final incoherente: falta procedencia de SMS ${sms.eventId}`);
  requireCheckpoint(actions.tasks.length === 0, `Final incoherente: quedan ${actions.tasks.length} tareas abiertas`);
  const openCalls = state.calls.filter((item) => item.status === "en_curso").length;
  requireCheckpoint(openCalls === 0, `Final incoherente: quedan ${openCalls} llamadas abiertas`);
  for (const id of ["CAT-01", "CAT-02"]) {
    const delivery = state.deliveries.find((item) => item.id === id);
    requireCheckpoint(delivery?.dockId === "muelleSur", `Final incoherente: ${id} apunta a ${String(delivery?.dockId)}, esperado muelleSur`);
  }
  const places = new Map(state.spaces.map((space) => [space.id, space]));
  requireCheckpoint(state.shuttles.length === 4, `Final incoherente: hay ${state.shuttles.length} shuttles, esperados 4`);
  requireCheckpoint(
    state.shuttles.every((shuttle) => places.get(shuttle.destinationId)?.zone === "sur"),
    "Final incoherente: algún shuttle no termina en un destino conocido de Sur",
  );
  const conditionalConfirmed = state.commitments.filter((item) => item.conditions?.length && item.status === "confirmado");
  requireCheckpoint(conditionalConfirmed.length === 0, `Compromisos condicionados marcados como confirmados: ${conditionalConfirmed.map((item) => item.id).join(", ")}`);
  const incomplete = ["espacios", "catering", "transporte", "asistentes"].flatMap((area) => {
    const agent = state.agents.find((item) => item.id === area);
    if (!agent) return [`${area}: ausente`];
    const fields = ["objective", "reason", "lastResult"].filter((field) => !String(agent[field as "objective" | "reason" | "lastResult"] ?? "").trim());
    return fields.length ? [`${area}: ${fields.join(", ")}`] : [];
  });
  requireCheckpoint(incomplete.length === 0, `Especialistas sin evidencia completa: ${incomplete.join("; ")}`);
  const summary = state.closureSummary?.trim();
  requireCheckpoint(Boolean(summary), "Final incoherente: falta closureSummary");
  requireCheckpoint(state.resolved || state.coordinatorStatus === "atascado", `Final incoherente: resolved=false con coordinatorStatus=${state.coordinatorStatus}, esperado atascado`);
}

function checkpoint(name: CheckpointEvidence["checkpoint"], state: PublicState, openTasks: number): CheckpointEvidence {
  return {
    checkpoint: name,
    observedAt: new Date().toISOString(),
    planVersion: state.planVersion,
    coordinatorStatus: state.coordinatorStatus,
    resolved: state.resolved,
    principalStatus: state.spaces.find((space) => space.id === "principal")?.status,
    dockStatus: state.spaces.find((space) => space.id === "muelleEste")?.status,
    deliveries: Object.fromEntries(state.deliveries.filter((item) => ["CAT-01", "CAT-02"].includes(item.id)).map((item) => [item.id, item.status])),
    openCalls: state.calls.filter((item) => item.status === "en_curso").length,
    openTasks,
    inputEventIds: state.events.flatMap((item) => item.provenance?.eventId ? [item.provenance.eventId] : []),
    specialists: Object.fromEntries(state.agents.map((agent) => [agent.id, {
      status: agent.status,
      objective: Boolean(agent.objective?.trim()),
      reason: Boolean(agent.reason?.trim()),
      lastResult: Boolean(agent.lastResult?.trim()),
    }])),
    ...(state.closureSummary ? { closureSummary: state.closureSummary } : {}),
  };
}

async function sendDirect(fetchFn: FetchFn, apiUrl: string, token: string, payload: DemoEvent) {
  const result = await json<{ duplicate?: boolean }>(fetchFn, `${apiUrl}/workflow/happyrobot/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (result.duplicate) throw new Error(`El backend marcó ${payload.eventId} como duplicado`);
  return {};
}

async function sendHappyRobot(
  fetchFn: FetchFn,
  config: { hookUrl: string; backendBaseUrl: string },
  payload: DemoEvent,
) {
  const result = await json<{ run_id?: string; status?: string }>(fetchFn, config.hookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      sessionId: payload.evidence.sessionId,
      backend_base_url: config.backendBaseUrl,
    }),
  });
  if (!result.run_id) throw new Error(`HappyRobot no devolvió run_id (${result.status ?? "sin estado"})`);
  return { workflowRunId: result.run_id };
}

export async function runVideoDirector(fetchFn: FetchFn = fetch): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Uso: npm run demo:video -- --inputs=happyrobot|external|api [--rehearsals=N] [--report=ruta|-]");
    return;
  }
  const rawMode = option("inputs") ?? "happyrobot";
  const mode: InputMode = rawMode === "api" ? "api" : rawMode === "happyrobot" || rawMode === "external" ? "happyrobot" : (() => { throw new Error(`inputs desconocido: ${rawMode}`); })();
  const rehearsals = positiveInteger(option("rehearsals"), "rehearsals", 1);
  const rawReportPath = option("report");
  const reportPath = rawReportPath === "-" ? undefined : resolve(rawReportPath || defaultReportPath());
  const apiUrl = (process.env.DEMO_API_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const timeoutMs = Number(process.env.DEMO_VIDEO_TIMEOUT_MS?.trim() || 360_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000) throw new Error("DEMO_VIDEO_TIMEOUT_MS debe ser un entero >= 10000");
  const token = required(process.env.HAPPYROBOT_WEBHOOK_TOKEN, "HAPPYROBOT_WEBHOOK_TOKEN");
  const happyRobotConfig = mode === "happyrobot" ? {
    hookUrl: required(process.env.HAPPYROBOT_DEMO_INPUT_HOOK_URL, "HAPPYROBOT_DEMO_INPUT_HOOK_URL"),
    backendBaseUrl: required(publicBaseUrl(), "PUBLIC_BASE_URL o .demo/public-url"),
  } : undefined;
  const readState = () => json<PublicState>(fetchFn, `${apiUrl}/state`);
  const readActions = () => json<ActionsResponse>(fetchFn, `${apiUrl}/actions`);
  const readCoordinatorReport = async (): Promise<CoordinatorReport | undefined> => {
    const response = await fetchFn(`${apiUrl}/coordinator/happyrobot/report`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
    return response.json() as Promise<CoordinatorReport>;
  };
  const waitCoordinatorReport = (runId: string, planVersion: number, previous?: string) => waitFor(
    `informe HappyRobot plan v${planVersion}`,
    timeoutMs,
    readCoordinatorReport,
    (value) => Boolean(value && value.runId === runId && value.planVersion === planVersion && value.correlationId !== previous),
  ) as Promise<CoordinatorReport>;
  const report: EvidenceReport = { schemaVersion: 1, createdAt: new Date().toISOString(), mode, requestedRehearsals: rehearsals, outcome: "running", rehearsals: [] };
  persistReport(reportPath, report);
  if (reportPath) console.log(`[VIDEO] Evidencia: ${reportPath}`);

  for (let index = 1; index <= rehearsals; index += 1) {
    const evidence: RehearsalEvidence = { rehearsal: index, startedAt: new Date().toISOString(), outcome: "running", inputs: [], coordinatorRuns: [], checkpoints: [] };
    report.rehearsals.push(evidence);
    persistReport(reportPath, report);
    try {
      console.log(`[VIDEO] Ensayo ${index}/${rehearsals} · Reiniciando a calm…`);
      const reset = await json<{ runId?: string }>(fetchFn, `${apiUrl}/simulation/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture: "calm" }),
      });
      if (reset.runId) evidence.backendRunId = reset.runId;
      const calm = await waitFor("estado calm", timeoutMs, readState, (state) => state.spaces.find((space) => space.id === "principal")?.status === "confirmado", diagnostic);
      validateCalm(calm);
      evidence.checkpoints.push(checkpoint("M0", calm, (await readActions()).tasks.length));
      persistReport(reportPath, report);
      console.log("[VIDEO] M0 validado: 600/600, Principal confirmado y cero inputs previos. Mantén visible el Principal.");

      const tag = `${Date.now().toString(36)}-${index}`;
      const call = event(tag, "principal_pipe_burst");
      const sms = event(tag, "dock_blocked");
      const send = mode === "api"
        ? (payload: DemoEvent) => sendDirect(fetchFn, apiUrl, token, payload)
        : (payload: DemoEvent) => sendHappyRobot(fetchFn, happyRobotConfig!, payload);

      console.log(`[VIDEO] Input 1 (${mode}): rotura del Pabellón Principal.`);
      const callResult = await send(call);
      evidence.inputs.push({ incidentId: call.incidentId, eventId: call.eventId, ...callResult });
      if (callResult.workflowRunId) console.log(`[VIDEO] HappyRobot run ${callResult.workflowRunId}`);
      const firstCycle = await waitFor(
        "M2: primer ciclo con llamada trazada",
        timeoutMs,
        readState,
        (state) => state.spaces.find((space) => space.id === "principal")?.status === "cerrado" && observesInput(state, call) && state.coordinatorStatus !== "replanificando",
        diagnostic,
      );
      requireCheckpoint(firstCycle.planVersion >= 2, `M2 incoherente: planVersion=${firstCycle.planVersion}, esperado >=2`);
      validateFirstCycle(firstCycle);
      let firstCoordinator: CoordinatorReport | undefined;
      if (mode === "happyrobot") {
        requireCheckpoint(Boolean(reset.runId), "M2 incoherente: reset sin runId");
        firstCoordinator = await waitCoordinatorReport(reset.runId!, firstCycle.planVersion - 1);
        requireCheckpoint(firstCoordinator.status === "accepted" && firstCoordinator.applied, `M2 incoherente: HappyRobot ${firstCoordinator.status}, applied=${firstCoordinator.applied}`);
        requireCheckpoint(firstCoordinator.consults >= 1, `M2 incoherente: el Reasoning Agent hizo ${firstCoordinator.consults} consultas, esperaba consult_world`);
        requireCheckpoint(firstCoordinator.submissions === 1 && firstCoordinator.validationErrors.length === 0, `M2 incoherente: ${firstCoordinator.submissions} submissions, errores=${firstCoordinator.validationErrors.join("; ")}`);
        evidence.coordinatorRuns.push(firstCoordinator);
      }
      evidence.checkpoints.push(checkpoint("M2", firstCycle, (await readActions()).tasks.length));
      persistReport(reportPath, report);
      console.log(`[VIDEO] M2 validado: llamada trazada, Principal cerrado y primer ciclo observado en plan v${firstCycle.planVersion}.`);

      console.log(`[VIDEO] Input 2 (${mode}): SMS por bloqueo del Muelle Este.`);
      const smsResult = await send(sms);
      evidence.inputs.push({ incidentId: sms.incidentId, eventId: sms.eventId, ...smsResult });
      if (smsResult.workflowRunId) console.log(`[VIDEO] HappyRobot run ${smsResult.workflowRunId}`);
      const blocked = await waitFor(
        "M3: Muelle Este, CAT-01 y CAT-02 bloqueados con SMS trazado",
        timeoutMs,
        readState,
        (state) => state.spaces.find((space) => space.id === "muelleEste")?.status === "cerrado" &&
          ["CAT-01", "CAT-02"].every((id) => state.deliveries.find((item) => item.id === id)?.status === "bloqueada") && observesInput(state, sms),
        diagnostic,
      );
      evidence.checkpoints.push(checkpoint("M3", blocked, (await readActions()).tasks.length));
      persistReport(reportPath, report);
      console.log("[VIDEO] M3 validado: SMS trazado, Muelle Este y ambas entregas bloqueados. Recorre el panel de agentes.");

      if (mode === "happyrobot") {
        const secondCoordinator = await waitCoordinatorReport(reset.runId!, Number(firstCoordinator?.planVersion ?? 1) + 1, firstCoordinator?.correlationId);
        requireCheckpoint(secondCoordinator.status === "accepted" && secondCoordinator.applied, `M4 incoherente: HappyRobot ${secondCoordinator.status}, applied=${secondCoordinator.applied}`);
        requireCheckpoint(secondCoordinator.submissions === 1 && secondCoordinator.validationErrors.length === 0, `M4 incoherente: ${secondCoordinator.submissions} submissions, errores=${secondCoordinator.validationErrors.join("; ")}`);
        const operations = secondCoordinator.output?.operations ?? [];
        for (const id of ["CAT-01", "CAT-02"]) {
          requireCheckpoint(
            operations.some((operation) => operation.op === "redirect_delivery" && operation.id === id && operation.dockId === "muelleSur"),
            `M4 incoherente: falta redirect_delivery de ${id} a muelleSur`,
          );
        }
        evidence.coordinatorRuns.push(secondCoordinator);
      }

      const settled = await waitFor(
        "final sin replanificación, tareas ni llamadas abiertas",
        timeoutMs,
        async () => ({ state: await readState(), actions: await readActions() }),
        ({ state, actions }) => state.coordinatorStatus !== "replanificando" && actions.tasks.length === 0 && state.calls.every((item) => item.status !== "en_curso"),
        ({ state, actions }) => `${diagnostic(state)}, openTasks=${actions.tasks.length}`,
      );
      validateFinal(settled.state, settled.actions, call, sms);
      evidence.checkpoints.push(checkpoint("final", settled.state, settled.actions.tasks.length));
      evidence.outcome = "passed";
      evidence.finishedAt = new Date().toISOString();
      persistReport(reportPath, report);
      console.log(`[VIDEO] Final validado · plan v${settled.state.planVersion} · ${settled.state.coordinatorStatus} · 4 especialistas con objetivo, motivo y resultado · 0 tareas · 0 llamadas abiertas.`);
      console.log("[VIDEO] Abre compromisos y Resultado. Las llamadas dependen de los hooks de HappyRobot configurados.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      evidence.outcome = "failed";
      evidence.finishedAt = new Date().toISOString();
      evidence.diagnostic = message;
      report.outcome = "failed";
      persistReport(reportPath, report);
      throw new Error(`Ensayo ${index}/${rehearsals} falló: ${message}${reportPath ? `. Evidencia: ${reportPath}` : ""}`);
    }
  }

  report.outcome = "passed";
  persistReport(reportPath, report);
  console.log(`[VIDEO] ${rehearsals}/${rehearsals} ensayos superados${reportPath ? `. Evidencia: ${reportPath}` : "."}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVideoDirector().catch((error) => {
    console.error(`[VIDEO] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
