import { useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
import type { ApiKeyScope } from "@airlock/shared-types";
import { PageHeader } from "../components/layout/index.js";
import {
  Badge,
  Button,
  EmptyState,
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
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../api/apiKeys.js";

const ALL_SCOPES: ApiKeyScope[] = ["proxy:invoke", "read:logs", "write:routes", "write:webhooks"];

function CreateApiKeyModal({ onClose }: { onClose: () => void }) {
  const createKey = useCreateApiKey();
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["proxy:invoke"]);
  const [rawKey, setRawKey] = useState<string | null>(null);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function handleCreate() {
    try {
      const result = await createKey.mutateAsync(scopes);
      setRawKey(result.rawKey);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Create failed");
    }
  }

  if (rawKey) {
    return (
      <Modal title="API key created" onClose={onClose}>
        <p className="mb-3 text-sm text-ink-secondary">Copy this key now — it won't be shown again.</p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-page px-3 py-2 font-mono text-sm">
          <span className="flex-1 truncate">{rawKey}</span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(rawKey);
              showToast("success", "Copied to clipboard");
            }}
            className="text-ink-muted hover:text-ink"
            aria-label="Copy"
          >
            <Copy size={16} />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New API key" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-secondary">Scopes</span>
          <div className="flex flex-col gap-2">
            {ALL_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                <span className="font-mono text-xs">{scope}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={createKey.isPending || scopes.length === 0}>
            {createKey.isPending ? "Creating..." : "Create key"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ApiKeysPage() {
  const { data: apiKeys, isLoading } = useApiKeys();
  const revokeKey = useRevokeApiKey();
  const [modalOpen, setModalOpen] = useState(false);

  async function handleRevoke(id: string) {
    if (!window.confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await revokeKey.mutateAsync(id);
      showToast("success", "API key revoked");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Keys tenants use to authenticate proxied requests."
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            New API key
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !apiKeys || apiKeys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description="Create one so your services can call the proxy."
          action={<Button onClick={() => setModalOpen(true)}>New API key</Button>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>ID</TH>
              <TH>Scopes</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Last used</TH>
              <TH></TH>
            </tr>
          </THead>
          <TBody>
            {apiKeys.map((key) => (
              <TR key={key.id}>
                <TD className="font-mono text-xs text-ink-muted">{key.id}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.map((s) => (
                      <Badge key={s} tone="neutral">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>{key.revokedAt ? <Badge tone="critical">Revoked</Badge> : <Badge tone="good">Active</Badge>}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{new Date(key.createdAt).toLocaleDateString()}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                </TD>
                <TD>
                  {!key.revokedAt && (
                    <Button variant="ghost" onClick={() => void handleRevoke(key.id)} title="Revoke">
                      <KeyRound size={14} className="text-status-critical" />
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {modalOpen && <CreateApiKeyModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
