import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/index.js";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  showToast,
} from "../components/ui/index.js";
import { useCreateRateLimitPolicy, useDeleteRateLimitPolicy, useRateLimitPolicies } from "../api/rateLimitPolicies.js";
import { useRoutes } from "../api/routes.js";
import type { Route } from "@airlock/shared-types";

function CreatePolicyModal({ routes, onClose }: { routes: Route[]; onClose: () => void }) {
  const createPolicy = useCreateRateLimitPolicy();
  const [routeId, setRouteId] = useState("");
  const [limitCount, setLimitCount] = useState(60);
  const [windowSeconds, setWindowSeconds] = useState(60);

  async function handleCreate() {
    try {
      await createPolicy.mutateAsync({ routeId: routeId || null, limitCount, windowSeconds });
      showToast("success", "Rate-limit policy created");
      onClose();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <Modal title="New rate-limit policy" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Scope">
          <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Tenant-wide (all routes)</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.pathPattern}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Limit count">
          <Input type="number" min={1} value={limitCount} onChange={(e) => setLimitCount(Number(e.target.value))} />
        </Field>
        <Field label="Window (seconds)">
          <Input
            type="number"
            min={1}
            value={windowSeconds}
            onChange={(e) => setWindowSeconds(Number(e.target.value))}
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={createPolicy.isPending}>
            {createPolicy.isPending ? "Creating..." : "Create policy"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RateLimitsPage() {
  const { data: policies, isLoading } = useRateLimitPolicies();
  const { data: routes } = useRoutes();
  const deletePolicy = useDeleteRateLimitPolicy();
  const [modalOpen, setModalOpen] = useState(false);

  function routeName(routeId: string | null): string {
    if (!routeId) return "Tenant-wide";
    return routes?.find((r) => r.id === routeId)?.pathPattern ?? routeId;
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this rate-limit policy?")) return;
    try {
      await deletePolicy.mutateAsync(id);
      showToast("success", "Policy deleted");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Rate Limits"
        description="Atomic per-route or tenant-wide request limits."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            New policy
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !policies || policies.length === 0 ? (
        <EmptyState title="No rate-limit policies yet" action={<Button onClick={() => setModalOpen(true)}>New policy</Button>} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Scope</TH>
              <TH>Limit</TH>
              <TH>Window</TH>
              <TH>Algorithm</TH>
              <TH></TH>
            </tr>
          </THead>
          <TBody>
            {policies.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{routeName(p.routeId)}</TD>
                <TD className="tabular-nums">{p.limitCount}</TD>
                <TD className="tabular-nums">{p.windowSeconds}s</TD>
                <TD>
                  <Badge tone="neutral">{p.algorithm}</Badge>
                </TD>
                <TD>
                  <Button variant="ghost" onClick={() => void handleDelete(p.id)} title="Delete">
                    <Trash2 size={14} className="text-status-critical" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {modalOpen && <CreatePolicyModal routes={routes ?? []} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
