import type { ApiKeyScope, UserRole } from "@airlock/shared-types";

export type JwtAuth = {
  type: "jwt";
  userId: string;
  tenantId: string;
  role: UserRole;
};

export type ApiKeyAuth = {
  type: "apikey";
  apiKeyId: string;
  tenantId: string;
  scopes: ApiKeyScope[];
};

declare global {
  namespace Express {
    interface Request {
      auth?: JwtAuth | ApiKeyAuth;
    }
  }
}

export {};
