import ms from "ms";
import { v4 as uuidv4 } from "uuid";
import type { User } from "@airlock/shared-types";
import { env } from "../config/env.js";
import { createTenant } from "../db/tenants.repo.js";
import {
  createUser,
  findUserByEmailWithPasswordHash,
  findUserById,
} from "../db/users.repo.js";
import {
  findRefreshTokenById,
  insertRefreshToken,
  markRefreshTokenRotated,
  revokeAllRefreshTokensForUser,
} from "../db/refreshTokens.repo.js";
import { sha256Hex } from "../security/hash.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../security/jwt.js";
import { AuthError } from "./authError.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: User;
}

async function issueTokenPair(user: User): Promise<TokenPair> {
  const refreshId = uuidv4();
  const refreshToken = signRefreshToken({ sub: user.id, jti: refreshId });
  const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_TTL));
  await insertRefreshToken(refreshId, user.id, sha256Hex(refreshToken), expiresAt);

  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  return { accessToken, refreshToken, user };
}

export async function register(tenantName: string, email: string, password: string): Promise<TokenPair> {
  const existing = await findUserByEmailWithPasswordHash(email);
  if (existing) throw new AuthError("email_taken", "An account with this email already exists");

  const tenant = await createTenant(tenantName);
  const passwordHash = await hashPassword(password);
  const user = await createUser(tenant.id, email, passwordHash, "owner");
  return issueTokenPair(user);
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const user = await findUserByEmailWithPasswordHash(email);
  if (!user) throw new AuthError("invalid_credentials", "Invalid email or password");

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new AuthError("invalid_credentials", "Invalid email or password");

  const { passwordHash: _unused, ...publicUser } = user;
  return issueTokenPair(publicUser);
}

export async function refresh(rawRefreshToken: string): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AuthError("invalid_refresh_token", "Invalid or expired refresh token");
  }

  const row = await findRefreshTokenById(payload.jti);
  if (!row || row.token_hash !== sha256Hex(rawRefreshToken)) {
    throw new AuthError("invalid_refresh_token", "Invalid or expired refresh token");
  }

  if (row.revoked_at) {
    // Rotation reuse: this refresh token was already exchanged once before.
    // Treat as a possible theft and burn the whole session family (§13.3).
    await revokeAllRefreshTokensForUser(row.user_id);
    throw new AuthError("refresh_token_reuse_detected", "Refresh token reuse detected; all sessions revoked");
  }

  if (row.expires_at.getTime() < Date.now()) {
    throw new AuthError("invalid_refresh_token", "Invalid or expired refresh token");
  }

  const user = await findUserById(row.user_id);
  if (!user) throw new AuthError("invalid_refresh_token", "Invalid or expired refresh token");

  const pair = await issueTokenPair(user);
  const newPayload = verifyRefreshToken(pair.refreshToken);
  await markRefreshTokenRotated(row.id, newPayload.jti);
  return pair;
}
