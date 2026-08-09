const ACCESS_TOKEN_KEY = "airlock.accessToken";
const REFRESH_TOKEN_KEY = "airlock.refreshToken";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// A plain module-level store (not React state) so the non-React apiClient
// can read/write tokens directly; lib/auth.tsx subscribes to re-render.
let listeners: Array<() => void> = [];

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(pair: TokenPair): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, pair.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
  notify();
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  notify();
}

export function subscribeToTokenChanges(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
