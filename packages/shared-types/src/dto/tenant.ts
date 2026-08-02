export interface Tenant {
  id: string;
  name: string;
  plan: string;
  allowInternalUpstreams: boolean;
  createdAt: string;
}
