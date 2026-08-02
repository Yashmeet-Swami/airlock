export interface RateLimitPolicy {
  id: string;
  tenantId: string;
  routeId: string | null;
  limitCount: number;
  windowSeconds: number;
  algorithm: string;
  createdAt: string;
}
