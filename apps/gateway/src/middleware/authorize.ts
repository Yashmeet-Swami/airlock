import type { NextFunction, Request, Response } from "express";
import type { ApiKeyScope, UserRole } from "@airlock/shared-types";

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, admin: 1, owner: 2 };

/** Role hierarchy per blueprint §14.1: owner > admin > viewer. */
export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.auth?.type !== "jwt") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (ROLE_RANK[req.auth.role] < ROLE_RANK[minRole]) {
      res.status(403).json({ error: "forbidden", message: `Requires role >= ${minRole}` });
      return;
    }
    next();
  };
}

/** Scope check for API-key-authenticated /proxy/* requests (§14.2). */
export function requireScope(scope: ApiKeyScope) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.auth?.type !== "apikey") {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!req.auth.scopes.includes(scope)) {
      res.status(403).json({ error: "forbidden", message: `API key missing required scope: ${scope}` });
      return;
    }
    next();
  };
}
