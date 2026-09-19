import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";

import express, { type NextFunction, type Request, type Response } from "express";

import { ActionExecutor } from "./actions/executor.js";
import { llmVerbose, loadLlmConfig } from "./agents/coordinator/llm.js";
import type { AppConfig } from "./config.js";
import {
  ContractError,
  parseCoordinatorProposal,
  parseEvent,
  parseIntervention,
  parseLive,
  parseReset,
  parseSpecialistResult,
  parseTwist,
} from "./contracts/api.js";
import { ControlService } from "./domain/control-service.js";
import { Engine } from "./domain/engine.js";
import { DomainValidationError } from "./domain/plan-rules.js";
import { WorkflowService } from "./domain/workflow-service.js";
import type { CrisisDatabase } from "./state/database.js";
import { EventRepository } from "./state/event-repository.js";
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
}

function defaultConfig(workflowToken: string | undefined): AppConfig {
  return {
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 8000,
    workflowToken,
    happyrobotApiKey: undefined,
    happyrobotTestPhone: undefined,
    initialFixture: "calm",
    clockSpeed: 1,
    coordinatorMode: "rules",
    hooks: {},
    publicBaseUrl: "http://localhost:8000",
  };
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
  const taskRepository = new TaskRepository(database.connection);
  const eventRepository = new EventRepository(database.connection);
  const controlService = new ControlService(stateRepository);
  const workflowService = new WorkflowService(
    stateRepository,
    taskRepository,
    new WorkflowEventRepository(database.connection),
  );
  const executor = new ActionExecutor(stateRepository, taskRepository, workflowService, {
    ...config,
    workflowToken: options.workflowToken ?? config.workflowToken,
  });
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
      world: loadWorld(),
    },
  );
  engine.attachExecutor(executor);
  executor.attachEngine(engine);

  app.disable("x-powered-by");
  app.locals.database = database;
  app.locals.stateRepository = stateRepository;
  app.locals.taskRepository = taskRepository;
  app.locals.engine = engine;
  app.locals.executor = executor;
  stateRepository.ensureActiveRun();
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

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/state", (_request, response) => {
    response.status(200).json(stateRepository.getPublicState());
  });

  app.get("/actions", (_request, response) => {
    response.status(200).json({ tasks: engine.listActions() });
  });

  app.post("/interventions", (request, response, next) => {
    try {
      const intervention = parseIntervention(request.body);
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

  app.post("/simulation/twists", (request, response, next) => {
    try {
      const twist = parseTwist(request.body);
      void engine
        .handle({ source: "jury", kind: twist, payload: { twist } })
        .catch((error) => console.error("[twists] handle", error));
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/simulation/live", (request, response, next) => {
    try {
      const body = parseLive(request.body ?? {});
      response.status(200).json({ ok: true, ...controlService.setLive(body.enabled, body.seed) });
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
      const eventId = randomUUID();
      console.log("[events] POST /events", event.source, event.kind, event.text ?? "", eventId);
      void engine.handle({ ...event, id: eventId }).catch((error) => console.error("[events] handle", error));
      response.status(202).json({ ok: true, eventId });
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

  app.post("/workflow/results", authorizeWorkflow, (request, response, next) => {
    try {
      const envelope = parseSpecialistResult(request.body);
      const recorded = workflowService.recordSpecialistResult(envelope);
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
          payload: envelope as unknown as Record<string, unknown>,
        });
      }
      response.status(200).json(recorded);
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
