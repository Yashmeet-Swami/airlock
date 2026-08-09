import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserRole } from "@airlock/shared-types";
import { apiFetch } from "./apiClient.js";
import { clearTokens, getAccessToken, setTokens, subscribeToTokenChanges } from "./tokenStore.js";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}

interface AuthContextValue {
  accessToken: string | null;
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
  role: UserRole | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// JWTs are base64url, not encrypted — this just reads claims already trusted
// client-side for display/routing; the backend re-verifies the signature on
// every request regardless.
function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());

  useEffect(() => subscribeToTokenChanges(() => setAccessTokenState(getAccessToken())), []);

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>("/auth/login", { method: "POST", body: { email, password } });
    setTokens(res);
  }

  function logout(): void {
    clearTokens();
  }

  const claims = accessToken ? decodeAccessToken(accessToken) : null;

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: accessToken !== null,
        userId: claims?.sub ?? null,
        tenantId: claims?.tenantId ?? null,
        role: claims?.role ?? null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
