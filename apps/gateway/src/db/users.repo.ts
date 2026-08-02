import type { User, UserRole } from "@airlock/shared-types";
import { queryUnscoped, type TenantScope } from "./client.js";

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

/** Only called during /auth/register, immediately after creating the owning tenant. */
export async function createUser(
  tenantId: string,
  email: string,
  passwordHash: string,
  role: UserRole,
): Promise<User> {
  const { rows } = await queryUnscoped<UserRow>(
    `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, email, passwordHash, role],
  );
  return toUser(rows[0]!);
}

/** Unscoped by necessity: login happens before we know which tenant the caller belongs to. */
export async function findUserByEmailWithPasswordHash(
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const { rows } = await queryUnscoped<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  if (!rows[0]) return null;
  return { ...toUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await queryUnscoped<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsersForTenant(scope: TenantScope): Promise<User[]> {
  const { rows } = await scope.query<UserRow>(`SELECT * FROM users WHERE tenant_id = $1`, [scope.tenantId]);
  return rows.map(toUser);
}
