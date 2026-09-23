import type { NextFunction, Request, Response, Express } from "express";

import { ContractError } from "../contracts/api.js";
import type { AuthService } from "./service.js";

export function mountAuth(app: Express, auth: AuthService | undefined): void {
  app.get("/auth/config", (_request, response) => {
    response.status(200).json({ required: Boolean(auth) });
  });

  app.post("/auth/request-code", (request, response, next) => {
    if (!auth) {
      response.status(503).json({ error: "Auth is not configured" });
      return;
    }
    void auth
      .requestCode(request.body)
      .then((result) => response.status(200).json(result))
      .catch(next);
  });

  app.post("/auth/verify", (request, response, next) => {
    if (!auth) {
      response.status(503).json({ error: "Auth is not configured" });
      return;
    }
    void auth
      .verify(request.body)
      .then((result) => response.status(200).json(result))
      .catch(next);
  });

  app.get("/auth/me", (request, response) => {
    if (!auth) {
      response.status(503).json({ error: "Auth is not configured" });
      return;
    }
    const user = auth.userFromAuthorization(request.get("authorization"));
    if (!user) {
      response.status(401).json({ error: "Sesión inválida" });
      return;
    }
    response.status(200).json({ user });
  });

  app.post("/auth/logout", (request, response) => {
    auth?.logout(request.get("authorization"));
    response.status(200).json({ ok: true });
  });
}

function isPublicPath(path: string): boolean {
  return (
    path === "/health" ||
    path.startsWith("/auth/") ||
    path.startsWith("/workflow/") ||
    path.startsWith("/coordinator/")
  );
}

export function requirePanelSession(auth: AuthService | undefined) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!auth) {
      next();
      return;
    }
    if (request.method === "OPTIONS" || isPublicPath(request.path)) {
      next();
      return;
    }
    const user = auth.userFromAuthorization(request.get("authorization"));
    if (!user) {
      next(new ContractError("Necesitas iniciar sesión", 401));
      return;
    }
    next();
  };
}
