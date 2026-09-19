import express, { type NextFunction, type Request, type Response } from "express";

import type { CrisisDatabase } from "./state/database.js";
import { StateRepository } from "./state/state-repository.js";

export function createApp(database: CrisisDatabase) {
  const app = express();
  const stateRepository = new StateRepository(database.connection);
  app.disable("x-powered-by");
  app.locals.database = database;
  app.locals.stateRepository = stateRepository;
  stateRepository.ensureActiveRun();

  app.use((_request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });
  app.options("/{*path}", (_request, response) => response.sendStatus(204));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/state", (_request, response) => {
    response.status(200).json(stateRepository.getPublicState());
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Endpoint not found" });
  });

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
