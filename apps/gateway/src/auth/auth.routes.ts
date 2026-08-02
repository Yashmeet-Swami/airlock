import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { AuthError } from "./authError.js";
import * as authService from "./auth.service.js";
import { loginSchema, refreshSchema, registerSchema } from "./schemas.js";

export const authRouter = Router();

const AUTH_ERROR_STATUS: Record<string, number> = {
  email_taken: 409,
  invalid_credentials: 401,
  invalid_refresh_token: 401,
  refresh_token_reuse_detected: 401,
};

function toResponse(pair: authService.TokenPair) {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    user: pair.user,
  };
}

authRouter.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  try {
    const { tenantName, email, password } = parsed.data;
    const pair = await authService.register(tenantName, email, password);
    res.status(201).json(toResponse(pair));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  try {
    const { email, password } = parsed.data;
    const pair = await authService.login(email, password);
    res.status(200).json(toResponse(pair));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  try {
    const pair = await authService.refresh(parsed.data.refreshToken);
    res.status(200).json(toResponse(pair));
  } catch (err) {
    next(err);
  }
});

export function authErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AuthError) {
    res.status(AUTH_ERROR_STATUS[err.code] ?? 400).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}
