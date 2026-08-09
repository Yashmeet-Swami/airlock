import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/index.js";
import { Button, Card, Input, Spinner, showToast } from "../components/ui/index.js";
import { useTenant, useUpdateTenant } from "../api/tenants.js";
import { useAuth } from "../lib/auth.js";

export function SettingsPage() {
  const { data: tenant, isLoading } = useTenant();
  const updateTenant = useUpdateTenant();
  const { role } = useAuth();
  const [name, setName] = useState("");
  const [allowInternal, setAllowInternal] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setAllowInternal(tenant.allowInternalUpstreams);
    }
  }, [tenant]);

  async function handleSaveName() {
    try {
      await updateTenant.mutateAsync({ name });
      showToast("success", "Tenant name updated");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleToggleInternal(next: boolean) {
    setAllowInternal(next);
    try {
      await updateTenant.mutateAsync({ allowInternalUpstreams: next });
      showToast("success", `Internal upstreams ${next ? "allowed" : "blocked"}`);
    } catch (err) {
      setAllowInternal(!next);
      showToast("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  if (isLoading || !tenant) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Settings" description="Tenant-level configuration." />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">Tenant name</h2>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={() => void handleSaveName()} disabled={updateTenant.isPending || name === tenant.name}>
            Save
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Allow internal upstreams</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Airlock is self-hosted — routes may point at private/link-local addresses (e.g. a co-located Docker
          service) by default. Turn this off for a stricter, SaaS-style SSRF posture.
          {role !== "owner" && " Only an owner can change this."}
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={allowInternal}
            disabled={role !== "owner" || updateTenant.isPending}
            onChange={(e) => void handleToggleInternal(e.target.checked)}
          />
          Allow routes to target private/internal addresses
        </label>
      </Card>
    </div>
  );
}
