export type ApiKeyScope =
  | "proxy:invoke"
  | "read:logs"
  | "write:routes"
  | "write:webhooks";

export interface ApiKey {
  id: string;
  tenantId: string;
  scopes: ApiKeyScope[];
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Only ever returned once, at creation time — never persisted in plaintext. */
export interface ApiKeyCreated extends ApiKey {
  rawKey: string;
}
