import { queryUnscoped } from "./client.js";

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  revoked_at: Date | null;
  replaced_by: string | null;
  created_at: Date;
  expires_at: Date;
}

export async function insertRefreshToken(
  id: string,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await queryUnscoped(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt],
  );
}

export async function findRefreshTokenById(id: string): Promise<RefreshTokenRow | null> {
  const { rows } = await queryUnscoped<RefreshTokenRow>(`SELECT * FROM refresh_tokens WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function markRefreshTokenRotated(id: string, replacedById: string): Promise<void> {
  await queryUnscoped(`UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [
    id,
    replacedById,
  ]);
}

/** Reuse-detection response: an already-rotated (or already-revoked) refresh token
 *  was presented again — revoke every other still-active token for that user (§13.3). */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await queryUnscoped(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
}
