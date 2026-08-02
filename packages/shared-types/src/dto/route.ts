export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Route {
  id: string;
  tenantId: string;
  pathPattern: string;
  upstreamUrl: string;
  methods: HttpMethod[];
  authRequired: boolean;
  cacheable: boolean;
  cacheTtlS: number;
  createdAt: string;
}
