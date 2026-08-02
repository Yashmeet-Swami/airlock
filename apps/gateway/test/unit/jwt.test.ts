import { describe, expect, it } from "vitest";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../../src/security/jwt.js";

describe("jwt", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ sub: "user-1", tenantId: "tenant-1", role: "admin" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.tenantId).toBe("tenant-1");
    expect(payload.role).toBe("admin");
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken({ sub: "user-1", jti: "refresh-1" });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.jti).toBe("refresh-1");
  });

  it("rejects a tampered access token", () => {
    const token = signAccessToken({ sub: "user-1", tenantId: "tenant-1", role: "viewer" });
    expect(() => verifyAccessToken(token.slice(0, -2) + "xx")).toThrow();
  });

  it("rejects an access token verified as a refresh token (different secrets)", () => {
    const token = signAccessToken({ sub: "user-1", tenantId: "tenant-1", role: "viewer" });
    expect(() => verifyRefreshToken(token)).toThrow();
  });
});
