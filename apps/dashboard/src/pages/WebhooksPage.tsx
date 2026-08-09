import { useState } from "react";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import type { WebhookDeliveryStatus, WebhookEventName } from "@airlock/shared-types";
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
  type StatusTone,
} from "../components/ui/index.js";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useReplayDelivery,
  useWebhookDeliveries,
  useWebhooks,
  type WebhookInput,
} from "../api/webhooks.js";

const ALL_EVENTS: WebhookEventName[] = ["rate_limit.exceeded", "breaker.opened"];

const DELIVERY_STATUS_TONE: Record<WebhookDeliveryStatus, StatusTone> = {
  queued: "neutral",
  retrying: "warning",
  delivered: "good",
  dead_lettered: "critical",
};

function CreateWebhookModal({ onClose }: { onClose: () => void }) {
  const createWebhook = useCreateWebhook();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventName[]>(["rate_limit.exceeded"]);

  function toggleEvent(event: WebhookEventName) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  async function handleCreate() {
    try {
      const input: WebhookInput = { url, events };
      await createWebhook.mutateAsync(input);
      showToast("success", "Webhook created");
      onClose();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <Modal title="New webhook" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="URL">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/hooks/airlock"
            required
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-secondary">Events</span>
          <div className="flex flex-col gap-2">
            {ALL_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} />
                <span className="font-mono text-xs">{event}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={createWebhook.isPending || !url || events.length === 0}>
            {createWebhook.isPending ? "Creating..." : "Create webhook"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveriesModal({ webhookId, onClose }: { webhookId: string; onClose: () => void }) {
  const [status, setStatus] = useState<WebhookDeliveryStatus | "">("");
  const { data: deliveries, isLoading } = useWebhookDeliveries(webhookId, status || undefined);
  const replay = useReplayDelivery();

  async function handleReplay(id: string) {
    try {
      await replay.mutateAsync(id);
      showToast("success", "Delivery re-queued");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Replay failed");
    }
  }

  return (
    <Modal title="Deliveries" onClose={onClose}>
      <div className="mb-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value as WebhookDeliveryStatus | "")}>
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="retrying">Retrying</option>
          <option value="delivered">Delivered</option>
          <option value="dead_lettered">Dead-lettered</option>
        </Select>
      </div>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : !deliveries || deliveries.length === 0 ? (
        <EmptyState title="No deliveries yet" />
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH>Attempts</TH>
                <TH>Last error</TH>
                <TH></TH>
              </tr>
            </THead>
            <TBody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.eventName}</TD>
                  <TD>
                    <Badge tone={DELIVERY_STATUS_TONE[d.status]}>{d.status}</Badge>
                  </TD>
                  <TD className="tabular-nums">{d.attemptCount}</TD>
                  <TD className="max-w-xs truncate text-ink-secondary">{d.lastError ?? "-"}</TD>
                  <TD>
                    {d.status === "dead_lettered" && (
                      <Button variant="ghost" onClick={() => void handleReplay(d.id)} title="Replay">
                        <RotateCw size={14} />
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}

export function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteWebhook = useDeleteWebhook();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this webhook?")) return;
    try {
      await deleteWebhook.mutateAsync(id);
      showToast("success", "Webhook deleted");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Webhooks"
        description="Notify external services on rate-limit and circuit-breaker events."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New webhook
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <EmptyState title="No webhooks yet" action={<Button onClick={() => setCreateOpen(true)}>New webhook</Button>} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>URL</TH>
              <TH>Events</TH>
              <TH>Status</TH>
              <TH></TH>
            </tr>
          </THead>
          <TBody>
            {webhooks.map((wh) => (
              <TR key={wh.id}>
                <TD className="max-w-xs truncate font-mono text-xs">{wh.url}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((e) => (
                      <Badge key={e} tone="neutral">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>{wh.active ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setViewingId(wh.id)}>
                      Deliveries
                    </Button>
                    <Button variant="ghost" onClick={() => void handleDelete(wh.id)} title="Delete">
                      <Trash2 size={14} className="text-status-critical" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {createOpen && <CreateWebhookModal onClose={() => setCreateOpen(false)} />}
      {viewingId && <DeliveriesModal webhookId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
}
