export type UserRole = "owner" | "admin" | "viewer";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
