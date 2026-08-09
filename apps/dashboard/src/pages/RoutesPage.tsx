import { useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { HttpMethod, Route } from "@airlock/shared-types";
import { PageHeader } from "../components/layout/index.js";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  showToast,
} from "../components/ui/index.js";
import { useCreateRoute, useDeleteRoute, useRoutes, useUpdateRoute, type RouteInput } from "../api/routes.js";
import { useInvalidateCache } from "../api/cache.js";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function RouteFormModal({
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  initial?: Route;
  onClose: () => void;
  onSubmit: (input: RouteInput) => void;
  submitting: boolean;
}) {
  const [pathPattern, setPathPattern] = useState(initial?.pathPattern ?? "");
  const [upstreamUrl, setUpstreamUrl] = useState(initial?.upstreamUrl ?? "");
  const [methods, setMethods] = useState<HttpMethod[]>(initial?.methods ?? ["GET"]);
  const [authRequired, setAuthRequired] = useState(initial?.authRequired ?? true);
  const [cacheable, setCacheable] = useState(initial?.cacheable ?? false);
  const [cacheTtlS, setCacheTtlS] = useState(initial?.cacheTtlS ?? 0);

  function toggleMethod(method: HttpMethod) {
    setMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ pathPattern, upstreamUrl, methods, authRequired, cacheable, cacheTtlS });
  }

  return (
    <Modal title={initial ? "Edit route" : "New route"} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="Path pattern">
          <Input
            value={pathPattern}
            onChange={(e) => setPathPattern(e.target.value)}
            placeholder="/v1/payments"
            required
          />
        </Field>
        <Field label="Upstream URL">
          <Input
            value={upstreamUrl}
            onChange={(e) => setUpstreamUrl(e.target.value)}
            placeholder="http://mock-upstream:4000"
            required
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-secondary">Methods</span>
          <div className="flex flex-wrap gap-3">
            {METHODS.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={methods.includes(m)} onChange={() => toggleMethod(m)} />
                {m}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input type="checkbox" checked={authRequired} onChange={(e) => setAuthRequired(e.target.checked)} />
            Auth required
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input type="checkbox" checked={cacheable} onChange={(e) => setCacheable(e.target.checked)} />
            Cacheable
          </label>
        </div>
        {cacheable && (
          <Field label="Cache TTL (seconds)">
            <Input type="number" min={0} value={cacheTtlS} onChange={(e) => setCacheTtlS(Number(e.target.value))} />
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || methods.length === 0}>
            {submitting ? "Saving..." : initial ? "Save changes" : "Create route"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RoutesPage() {
  const { data: routes, isLoading } = useRoutes();
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();
  const invalidateCache = useInvalidateCache();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(route: Route) {
    setEditing(route);
    setModalOpen(true);
  }

  async function handleSubmit(input: RouteInput) {
    try {
      if (editing) {
        await updateRoute.mutateAsync({ id: editing.id, input });
        showToast("success", "Route updated");
      } else {
        await createRoute.mutateAsync(input);
        showToast("success", "Route created");
      }
      setModalOpen(false);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDelete(route: Route) {
    if (!window.confirm(`Delete route "${route.pathPattern}"?`)) return;
    try {
      await deleteRoute.mutateAsync(route.id);
      showToast("success", "Route deleted");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleInvalidate(route: Route) {
    try {
      await invalidateCache.mutateAsync(route.id);
      showToast("success", "Cache invalidated");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Invalidate failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Routes"
        description="Configure which upstreams your tenant's traffic proxies to."
        action={
          <Button onClick={openCreate}>
            <Plus size={16} />
            New route
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !routes || routes.length === 0 ? (
        <EmptyState
          title="No routes yet"
          description="Create your first route to start proxying traffic."
          action={<Button onClick={openCreate}>New route</Button>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Path</TH>
              <TH>Upstream</TH>
              <TH>Methods</TH>
              <TH>Auth</TH>
              <TH>Cache</TH>
              <TH></TH>
            </tr>
          </THead>
          <TBody>
            {routes.map((route) => (
              <TR key={route.id}>
                <TD className="font-mono text-xs">{route.pathPattern}</TD>
                <TD className="max-w-xs truncate font-mono text-xs text-ink-secondary">{route.upstreamUrl}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {route.methods.map((m) => (
                      <Badge key={m} tone="neutral">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>
                  {route.authRequired ? <Badge tone="good">Required</Badge> : <Badge tone="neutral">Public</Badge>}
                </TD>
                <TD>{route.cacheable ? <Badge tone="good">{route.cacheTtlS}s</Badge> : <Badge tone="neutral">Off</Badge>}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => void handleInvalidate(route)} title="Invalidate cache">
                      <RefreshCw size={14} />
                    </Button>
                    <Button variant="ghost" onClick={() => openEdit(route)} title="Edit">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" onClick={() => void handleDelete(route)} title="Delete">
                      <Trash2 size={14} className="text-status-critical" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {modalOpen && (
        <RouteFormModal
          initial={editing ?? undefined}
          onClose={() => setModalOpen(false)}
          onSubmit={(input) => void handleSubmit(input)}
          submitting={createRoute.isPending || updateRoute.isPending}
        />
      )}
    </div>
  );
}
