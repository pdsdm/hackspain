import { randomUUID, timingSafeEqual } from "node:crypto";

import express, { type NextFunction, type Request, type Response } from "express";

import {
  translateHappyRobotResult,
  translateHappyRobotTranscript,
} from "./actions/adapters/happyrobot-inbound.js";
import { ActionExecutor } from "./actions/executor.js";
import { llmVerbose, loadLlmConfig } from "./agents/coordinator/llm.js";
import {
  happyrobotSessions,
  loadHappyRobotCoordinatorConfig,
  runHappyRobotCoordinator,
  type FetchFn,
  type HappyRobotCoordinatorConfig,
  type HappyRobotSessionRegistry,
} from "./agents/coordinator/happyrobot.js";
import { createJevEvaluator, type JevEvaluateFn } from "./agents/jev.js";
import { DEFAULT_TEST_PHONE, type AppConfig } from "./config.js";
import {
  ContractError,
  isRecord,
  parseAgentPhone,
  parseArea,
  parseCoordinatorProposal,
  parseEvent,
  parseHappyRobotIncident,
  parseIntervention,
  parseClock,
  parseReset,
  parseSpecialistResult,
  type Area,
  type SpecialistResultEnvelope,
} from "./contracts/api.js";
import { ControlService } from "./domain/control-service.js";
import { Engine } from "./domain/engine.js";
import { DomainValidationError } from "./domain/plan-rules.js";
import { verifyCallAcceptance, type CallAcceptanceVerification } from "./domain/result-verifier.js";
import { WorkflowService, callResultText } from "./domain/workflow-service.js";
import { ContactRepository } from "./state/contact-repository.js";
import type { CrisisDatabase } from "./state/database.js";
import { EventRepository } from "./state/event-repository.js";
import { HappyRobotEventRepository } from "./state/happyrobot-event-repository.js";
import { StateRepository } from "./state/state-repository.js";
import { TaskRepository } from "./state/task-repository.js";
import { WorkflowEventRepository } from "./state/workflow-event-repository.js";
import { loadWorld } from "./world/world.js";
import type { CompleteFn } from "./agents/coordinator/loop.js";
import { logWorkflow } from "./log.js";

export interface AppOptions {
  workflowToken: string | undefined;
  config?: AppConfig;
  completeFn?: CompleteFn;
  jevEvaluateFn?: JevEvaluateFn;
  happyrobot?: { config?: HappyRobotCoordinatorConfig; fetchFn?: FetchFn; registry?: HappyRobotSessionRegistry };
}

function defaultConfig(workflowToken: string | undefined): AppConfig {
  return {
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 8000,
    workflowToken,
    happyrobotApiKey: undefined,
    happyrobotTestPhone: DEFAULT_TEST_PHONE,
    initialFixture: "calm",
    clockSpeed: 1,
    coordinatorMode: "rules",
    jevEnabled: false,
    jevApplyConfirmations: false,
    jevReviewedTranscriptHashes: [],
    jevAllowUnreviewedTranscripts: false,
    jevTimeoutMs: 3_000,
    typesafeApiKey: undefined,
    jevModel: "jev-1.13.0",
    hooks: {},
    publicBaseUrl: "http://localhost:8000",
  };
}

/** Entero de query string acotado. Un valor inválido es error del llamante, no un default silencioso. */
function readPositiveInt(raw: unknown, field: string, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new ContractError(`${field} must be an integer between 0 and ${max}`, 400);
  }
  return value;
}

function sameToken(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createApp(
  database: CrisisDatabase,
  options: AppOptions = { workflowToken: undefined },
) {
  const config = options.config ?? defaultConfig(options.workflowToken);
  const app = express();
  const stateRepository = new StateRepository(database.connection, config.initialFixture);
  if (config.deploymentId) stateRepository.initializeDeployment(config.deploymentId);
  else stateRepository.ensureActiveRun();
  const taskRepository = new TaskRepository(database.connection);
  const eventRepository = new EventRepository(database.connection);
  const happyrobotEventRepository = new HappyRobotEventRepository(database.connection);
  const pendingHappyRobotEvents = new Map<string, Promise<Record<string, unknown>>>();
  const controlService = new ControlService(stateRepository, config.clockSpeed);
  const workflowService = new WorkflowService(
    stateRepository,
    taskRepository,
    new WorkflowEventRepository(database.connection),
  );
  const jevEvaluateFn = config.jevEnabled
    ? options.jevEvaluateFn ??
      (config.typesafeApiKey
        ? createJevEvaluator({
            apiKey: config.typesafeApiKey,
            model: config.jevModel,
            timeoutMs: config.jevTimeoutMs,
          })
        : undefined)
    : undefined;
  if (config.jevEnabled && !jevEvaluateFn) {
    console.error("[jev] JEV_ENABLED=true pero falta TYPESAFE_API_KEY");
  }
  const contactRepository = new ContactRepository(database.connection);
  const executor = new ActionExecutor(
    stateRepository,
    taskRepository,
    workflowService,
    { ...config, workflowToken: options.workflowToken ?? config.workflowToken },
    contactRepository,
  );
  let llmConfig;
  try {
    llmConfig = config.coordinatorMode === "llm" ? loadLlmConfig() : undefined;
  } catch (error) {
    console.error("[coord] loadLlmConfig falló:", error instanceof Error ? error.message : error);
    llmConfig = undefined;
  }
  if (config.coordinatorMode === "llm" && !llmConfig && !options.completeFn) {
    console.error("[coord] COORDINATOR_MODE=llm pero no hay proveedor; POST /events acabará en «no disponible»");
  } else if (llmConfig) {
    console.log(
      "[coord] listo",
      llmConfig.provider,
      llmConfig.harness,
      llmConfig.model,
      llmConfig.orgId ? "org=sí" : "org=no",
      llmVerbose() ? "verbose=sí" : "verbose=no",
    );
  }
  const world = loadWorld();
  const engine = new Engine(
    stateRepository,
    controlService,
    eventRepository,
    taskRepository,
    { states: stateRepository, tasks: taskRepository, workflows: workflowService },
    {
      mode: options.completeFn ? "llm" : config.coordinatorMode,
      ...(llmConfig ? { llmConfig } : {}),
      ...(options.completeFn ? { completeFn: options.completeFn } : {}),
      world,
    },
  );
  const happyrobotRegistry = options.happyrobot?.registry ?? happyrobotSessions;
  engine.attachExecutor(executor);
  executor.attachEngine(engine);

  app.disable("x-powered-by");
  app.locals.database = database;
  app.locals.stateRepository = stateRepository;
  app.locals.taskRepository = taskRepository;
  app.locals.engine = engine;
  app.locals.executor = executor;
  engine.recoverInterruptedCoordinator();

  app.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });
  app.options("/{*path}", (_request, response) => response.sendStatus(204));
  app.use(express.json({ limit: "256kb" }));

  const authorizeWorkflow = (request: Request, response: Response, next: NextFunction) => {
    const token = options.workflowToken ?? config.workflowToken;
    if (!token) {
      response.status(503).json({ error: "Workflow integration is not configured" });
      return;
    }
    const authorization = request.get("authorization");
    const prefix = "Bearer ";
    const received = authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : "";
    if (!received || !sameToken(received, token)) {
      response.status(401).json({ error: "Invalid workflow token" });
      return;
    }
    next();
  };

  const authorizeHappyRobotIncident = (request: Request, response: Response, next: NextFunction) => {
    const authorization = request.get("authorization");
    const prefix = "Bearer ";
    const received = authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : "";
    const token = options.workflowToken ?? config.workflowToken;
    if (received && token && sameToken(received, token)) {
      next();
      return;
    }
    response.status(token ? 401 : 503).json({ error: token ? "Invalid workflow token" : "Workflow integration is not configured" });
  };

  const recordWorkflowResult = (
    envelope: SpecialistResultEnvelope,
    verification?: CallAcceptanceVerification,
  ) => {
    const recorded = workflowService.recordSpecialistResult(envelope, verification);
    logWorkflow("result", {
      taskId: envelope.taskId,
      eventId: envelope.eventId,
      status: envelope.status,
      applied: recorded.applied,
      duplicate: recorded.duplicate,
    });
    if (recorded.applied && !recorded.duplicate) {
      void engine.handle({
        source: "happyrobot",
        kind: "call_result",
        text: callResultText(envelope),
        payload: {
          ...(envelope as unknown as Record<string, unknown>),
          ...(recorded.materialChange ? { materialChange: true, materialSummary: recorded.materialSummary } : {}),
        },
      });
    }
    return { ok: recorded.ok, applied: recorded.applied, duplicate: recorded.duplicate };
  };

  // JEV evalúa la evidencia antes de registrar el resultado (T35). Con JEV apagado
  // la verificación se resuelve sin salir del proceso y el camino es el de siempre.
  const verifyAndRecord = (
    envelope: SpecialistResultEnvelope,
    response: Response,
    next: NextFunction,
  ) => {
    const task = taskRepository.get(envelope.taskId);
    if (!task) throw new ContractError(`Task not found: ${envelope.taskId}`, 404);
    const active = stateRepository.ensureActiveRun();
    const evaluator =
      task.runId === active.id && task.planVersion === active.state.planVersion
        ? jevEvaluateFn
        : undefined;
    void verifyCallAcceptance(
      task,
      envelope,
      evaluator,
      active.state,
      config.jevApplyConfirmations,
      config.jevReviewedTranscriptHashes,
      { allowUnreviewedTranscripts: config.jevAllowUnreviewedTranscripts, timeoutMs: config.jevTimeoutMs },
    )
      .then((verification) => {
        response.status(200).json(
          recordWorkflowResult(envelope, config.jevEnabled ? verification : undefined),
        );
      })
      .catch(next);
  };

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  /**
   * El teléfono de cada área viaja dentro de su agente.
   *
   * Vive en `app_metadata` y no en el documento de estado, para que un reset no lo borre,
   * pero el panel lo lee del mismo sondeo que todo lo demás.
   */
  const stateWithPhones = () => {
    const state = stateRepository.getPublicState();
    const phones = contactRepository.list();
    if (!Array.isArray(state.agents)) return state;
    state.agents = state.agents.map((agent) => {
      if (!isRecord(agent)) return agent;
      const phone = phones[agent.id as Area] ?? config.happyrobotTestPhone;
      return phone ? { ...agent, phone } : agent;
    });
    return state;
  };

  app.get("/state", (_request, response) => {
    response.status(200).json(stateWithPhones());
  });

  app.post("/agents/:area/phone", (request, response, next) => {
    try {
      const area = parseArea(request.params.area);
      const body = parseAgentPhone(request.body ?? {});
      contactRepository.set(area, body.phone);
      const phone = contactRepository.get(area) ?? config.happyrobotTestPhone ?? null;
      console.log("[contacts] phone", area, body.phone === null ? "borrado" : "actualizado");
      response.status(200).json({ ok: true, area, phone });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Cronología reciente, sin arrastrar el estado entero.
   *
   * `/state` ya la lleva dentro, pero devuelve un documento grande con espacios, rutas y
   * vehículos; un consumidor que solo quiere saber qué acaba de pasar no debería pagar eso
   * en cada sondeo. Solo lectura y sin token, igual que `/state`.
   */
  /**
   * Histórico de eventos de entrada, también de ejecuciones anteriores.
   *
   * `GET /events` devuelve la cronología del panel, que solo guarda las últimas 80 y se
   * vacía en cada despliegue (T42). Esto lee la tabla de auditoría, que sobrevive a los
   * resets porque una ejecución se desactiva pero no se borra.
   */
  app.get("/events/history", (request, response, next) => {
    try {
      const limit = readPositiveInt(request.query.limit, "limit", 100, 500);
      const runId = typeof request.query.runId === "string" ? request.query.runId : undefined;
      const source = typeof request.query.source === "string" ? request.query.source : undefined;
      const kind = typeof request.query.kind === "string" ? request.query.kind : undefined;
      const events = eventRepository.list({
        ...(runId ? { runId } : {}),
        ...(source ? { source } : {}),
        ...(kind ? { kind } : {}),
        limit,
      });
      response.status(200).json({ events, count: events.length, activeRunId: stateRepository.ensureActiveRun().id });
    } catch (error) {
      next(error);
    }
  });

  app.get("/events", (request, response, next) => {
    try {
      const state = stateRepository.getPublicState();
      const all = Array.isArray(state.events)
        ? (state.events as Array<Record<string, unknown>>)
        : [];
      const limit = readPositiveInt(request.query.limit, "limit", 50, 200);
      const since = request.query.since === undefined
        ? undefined
        : readPositiveInt(request.query.since, "since", 0, Number.MAX_SAFE_INTEGER);
      const kind = typeof request.query.kind === "string" ? request.query.kind : undefined;
      const area = typeof request.query.area === "string" ? request.query.area : undefined;
      const filtered = all.filter((event) => {
        if (kind && event.kind !== kind) return false;
        if (area && event.area !== area) return false;
        // `realAt` es la hora real de registro; sin él el evento es anterior al sellado.
        if (since !== undefined && !(typeof event.realAt === "number" && event.realAt > since)) return false;
        return true;
      });
      response.status(200).json({
        events: filtered.slice(-limit),
        total: all.length,
        simSeconds: state.clock.simSeconds,
        planVersion: state.planVersion,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/actions", (_request, response) => {
    response.status(200).json({ tasks: engine.listActions() });
  });

  app.post("/interventions", (request, response, next) => {
    try {
      const intervention = parseIntervention(request.body);
      if (stateRepository.ensureActiveRun().state.clock.paused) {
        throw new ContractError("La operación está pausada; inicia el reloj antes de intervenir", 409);
      }
      void engine
        .handle({
          source: "human",
          kind: intervention.type,
          payload: intervention.payload ?? {},
        })
        .catch((error) => console.error("[interventions] handle", error));
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/simulation/clock", (request, response, next) => {
    try {
      const body = parseClock(request.body ?? {});
      response.status(200).json({ ok: true, ...controlService.setClock(body.speed, body.paused) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/simulation/reset", (request, response, next) => {
    try {
      const body = parseReset(request.body ?? {});
      void engine
        .reset(body.fixture)
        .then((result) => response.status(200).json({ ok: true, ...result }))
        .catch(next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/events", (request, response, next) => {
    try {
      const event = parseEvent(request.body);
      if (stateRepository.ensureActiveRun().state.clock.paused) {
        throw new ContractError("La operación está pausada; inicia el reloj antes de enviar eventos", 409);
      }
      const eventId = randomUUID();
      console.log("[events] POST /events", event.source, event.kind, event.text ?? "", eventId);
      void engine.handle({ ...event, id: eventId }).catch((error) => console.error("[events] handle", error));
      response.status(202).json({ ok: true, eventId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/workflow/happyrobot/events", authorizeHappyRobotIncident, (request, response, next) => {
    try {
      if (stateRepository.ensureActiveRun().state.clock.paused) {
        throw new ContractError("La operación está pausada; inicia el reloj antes de recibir eventos", 409);
      }
      const envelope = parseHappyRobotIncident(request.body);
      const reservation = happyrobotEventRepository.reserve(envelope);
      if (reservation.response) {
        response.status(200).json({ ...reservation.response, duplicate: true });
        return;
      }
      if (reservation.pending) {
        const pending = pendingHappyRobotEvents.get(envelope.eventId);
        if (!pending) throw new ContractError(`eventId is still being processed: ${envelope.eventId}`, 409);
        void pending
          .then((result) => response.status(200).json({ ...result, duplicate: true }))
          .catch(next);
        return;
      }

      const processing = engine.handle({
        id: envelope.eventId,
        source: "happyrobot",
        kind: envelope.incidentId,
        text: envelope.summary,
        actorId: envelope.actor,
        payload: {
          channel: envelope.channel,
          actor: envelope.actor,
          evidence: envelope.evidence,
          sessionId: envelope.evidence.sessionId,
        },
      }).then(() => {
        const state = stateRepository.ensureActiveRun().state;
        const result = {
          ok: true,
          duplicate: false,
          eventId: envelope.eventId,
          incidentId: envelope.incidentId,
          planVersion: state.planVersion,
        };
        happyrobotEventRepository.complete(envelope.eventId, result);
        return result;
      }).catch((error) => {
        happyrobotEventRepository.release(envelope.eventId);
        throw error;
      });
      pendingHappyRobotEvents.set(envelope.eventId, processing);
      void processing
        .then((result) => response.status(200).json(result))
        .catch(next)
        .finally(() => pendingHappyRobotEvents.delete(envelope.eventId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/workflow/coordinator/proposals", authorizeWorkflow, (request, response, next) => {
    try {
      response.status(200).json(
        workflowService.applyCoordinatorProposal(parseCoordinatorProposal(request.body)),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/workflow/coordinator/happyrobot/consult", authorizeWorkflow, (request, response, next) => {
    happyrobotRegistry
      .consult(request.body)
      .then((result) => response.status(200).json(result))
      .catch(next);
  });

  app.post("/workflow/coordinator/happyrobot/submit", authorizeWorkflow, (request, response, next) => {
    try {
      response.status(200).json(happyrobotRegistry.submit(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/coordinator/happyrobot/report", authorizeWorkflow, (_request, response) => {
    const report = happyrobotRegistry.getLastReport();
    if (!report) {
      response.status(404).json({ error: "No hay informe HappyRobot" });
      return;
    }
    response.status(200).json(report);
  });

  app.post("/coordinator/happyrobot/shadow", authorizeWorkflow, (request, response, next) => {
    let happyrobotConfig: HappyRobotCoordinatorConfig;
    try {
      happyrobotConfig = options.happyrobot?.config ?? loadHappyRobotCoordinatorConfig();
    } catch (error) {
      response.status(503).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (happyrobotRegistry.isActive()) {
      response.status(409).json({ error: "Ya hay una ejecución de HappyRobot activa" });
      return;
    }
    if (stateRepository.ensureActiveRun().state.coordinatorBusy !== undefined) {
      response.status(409).json({ error: "El coordinador está ocupado" });
      return;
    }
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const text = typeof body.text === "string" && body.text.trim() ? body.text.trim() : undefined;
    const event = {
      source: typeof body.source === "string" && body.source ? body.source : "chat",
      kind: typeof body.kind === "string" && body.kind ? body.kind : "free_text",
      ...(text ? { text } : {}),
    };
    runHappyRobotCoordinator({
      config: happyrobotConfig,
      event,
      deps: { world, states: stateRepository, tasks: taskRepository, workflows: workflowService },
      apply: false,
      registry: happyrobotRegistry,
      ...(options.happyrobot?.fetchFn ? { fetchFn: options.happyrobot.fetchFn } : {}),
    })
      .then((report) => response.status(200).json(report))
      .catch(next);
  });

  // La puerta del contrato: cuerpo exacto, sin interpretación.
  app.post("/workflow/results", authorizeWorkflow, (request, response, next) => {
    try {
      verifyAndRecord(parseSpecialistResult(request.body), response, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/workflow/happyrobot/transcript", authorizeWorkflow, (request, response, next) => {
    try {
      const update = translateHappyRobotTranscript(request.body, taskRepository);
      const task = taskRepository.get(update.taskId);
      if (!task) throw new ContractError(`Task not found: ${update.taskId}`, 404);
      const merged = stateRepository.appendCallTranscript({
        runId: task.runId,
        callId: update.callId,
        transcript: update.transcript,
        ...(update.sessionId ? { sessionId: update.sessionId } : {}),
        ...(update.happyrobotRunId ? { happyrobotRunId: update.happyrobotRunId } : {}),
      });
      response.status(200).json({
        ok: true,
        duplicate: merged.added === 0,
        added: merged.added,
        total: merged.total,
      });
    } catch (error) {
      next(error);
    }
  });

  // La puerta de HappyRobot: cuerpo nativo del workflow, traducido por el adaptador (T9).
  // Es la URL que el ejecutor manda en callbackUrl; sin esta ruta, el callback da 404.
  app.post("/workflow/happyrobot/results", authorizeWorkflow, (request, response, next) => {
    try {
      verifyAndRecord(translateHappyRobotResult(request.body, taskRepository), response, next);
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Endpoint not found" });
  });

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      if (error instanceof ContractError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof DomainValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        response.status(400).json({ error: "Invalid JSON body" });
        return;
      }
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
