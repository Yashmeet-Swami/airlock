import type { ApiKeyScope, UserRole } from "@airlock/shared-types";

type JwtAuth = {
  type: "jwt";
  userId: string;
  tenantId: string;
  role: UserRole;
};

type ApiKeyAuth = {
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
