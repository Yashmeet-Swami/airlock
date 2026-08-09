import { updateTenant } from "../../src/db/tenants.repo.js";

/**
 * Test-only convenience: several suites point routes at loopback echo/flaky
 * fixture servers (127.0.0.1) to exercise real proxying — the same thing the
 * SSRF check (§21.3) correctly blocks by default for a real, unflagged
 * tenant. Flagging the test's own tenant as trusted lets those suites keep
 * using real local servers without weakening the default-blocked behavior
 * that apps/gateway/test/security/tenantIsolation.test.ts verifies.
 */
export async function trustInternalUpstreams(tenantId: string): Promise<void> {
  await updateTenant(tenantId, { allowInternalUpstreams: true });
}
