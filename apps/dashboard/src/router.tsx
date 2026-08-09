import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/index.js";
import { useAuth } from "./lib/auth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { LogExplorerPage } from "./pages/LogExplorerPage.js";
import { LiveTrafficPage } from "./pages/LiveTrafficPage.js";
import { RoutesPage } from "./pages/RoutesPage.js";
import { ApiKeysPage } from "./pages/ApiKeysPage.js";
import { RateLimitsPage } from "./pages/RateLimitsPage.js";
import { WebhooksPage } from "./pages/WebhooksPage.js";
import { AuditLogPage } from "./pages/AuditLogPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function ProtectedShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export function AppRouter() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedShell>
            <OverviewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/logs"
        element={
          <ProtectedShell>
            <LogExplorerPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/live"
        element={
          <ProtectedShell>
            <LiveTrafficPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedShell>
            <AuditLogPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/routes"
        element={
          <ProtectedShell>
            <RoutesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedShell>
            <ApiKeysPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/rate-limits"
        element={
          <ProtectedShell>
            <RateLimitsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/webhooks"
        element={
          <ProtectedShell>
            <WebhooksPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedShell>
            <SettingsPage />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
