import { timingSafeEqual } from "node:crypto";

import express, { type NextFunction, type Request, type Response } from "express";

import {
  ContractError,
  parseCoordinatorProposal,
  parseIntervention,
  parseSpecialistResult,
  parseTwist,
} from "./contracts/api.js";
import { ControlService } from "./domain/control-service.js";
import { DomainValidationError } from "./domain/plan-rules.js";
import { WorkflowService } from "./domain/workflow-service.js";
import type { CrisisDatabase } from "./state/database.js";
import { StateRepository } from "./state/state-repository.js";
import { TaskRepository } from "./state/task-repository.js";
import { WorkflowEventRepository } from "./state/workflow-event-repository.js";

export interface AppOptions {
  workflowToken: string | undefined;
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
  const app = express();
  const stateRepository = new StateRepository(database.connection);
  const taskRepository = new TaskRepository(database.connection);
  const controlService = new ControlService(stateRepository);
  const workflowService = new WorkflowService(
    stateRepository,
    taskRepository,
    new WorkflowEventRepository(database.connection),
  );

  app.disable("x-powered-by");
  app.locals.database = database;
  app.locals.stateRepository = stateRepository;
  app.locals.taskRepository = taskRepository;
  stateRepository.ensureActiveRun();

  app.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });
  app.options("/{*path}", (_request, response) => response.sendStatus(204));
  app.use(express.json({ limit: "256kb" }));

  const authorizeWorkflow = (request: Request, response: Response, next: NextFunction) => {
    if (!options.workflowToken) {
      response.status(503).json({ error: "Workflow integration is not configured" });
      return;
    }
    const authorization = request.get("authorization");
    const prefix = "Bearer ";
    const token = authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : "";
    if (!token || !sameToken(token, options.workflowToken)) {
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

  app.post("/interventions", (request, response, next) => {
    try {
      controlService.applyIntervention(parseIntervention(request.body));
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/simulation/twists", (request, response, next) => {
    try {
      controlService.applyTwist(parseTwist(request.body));
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/simulation/reset", (_request, response) => {
    response.status(200).json({ ok: true, ...controlService.reset() });
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
      response.status(200).json(
        workflowService.recordSpecialistResult(parseSpecialistResult(request.body)),
      );
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
