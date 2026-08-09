import { useState, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import { PageHeader } from "../components/layout/index.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  showToast,
} from "../components/ui/index.js";
import { useLogSearch, type LogSearchParams } from "../api/logs.js";
import { useReplayRequest } from "../api/replay.js";
import { useExportLogs } from "../api/analytics.js";

const PAGE_SIZE = 20;

function statusTone(statusCode: number | null): "neutral" | "critical" | "warning" | "good" {
  if (statusCode === null) return "neutral";
  if (statusCode >= 500) return "critical";
  if (statusCode >= 400) return "warning";
  return "good";
}

export function LogExplorerPage() {
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [submitted, setSubmitted] = useState<LogSearchParams>({ page: 1 });

  const { data, isLoading, isFetching } = useLogSearch(submitted);
  const replay = useReplayRequest();
  const exportLogs = useExportLogs();

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSubmitted({ q, route, status_code: statusCode, page: 1 });
  }

  function goToPage(page: number) {
    setSubmitted((s) => ({ ...s, page }));
  }

  async function handleReplay(requestId: string) {
    try {
      const result = await replay.mutateAsync(requestId);
      showToast("success", `Replayed — upstream responded ${result.status}`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Replay failed");
    }
  }

  async function handleExport() {
    try {
      const result = await exportLogs.mutateAsync({
        format: "csv",
        route: submitted.route,
        status_code: submitted.status_code ? Number(submitted.status_code) : undefined,
      });
      window.open(result.url, "_blank");
      showToast("success", `Exported ${result.count} rows`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Export failed");
    }
  }

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const page = submitted.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Log Explorer"
        description="Search proxied requests indexed from OpenSearch."
        action={
          <Button variant="secondary" onClick={() => void handleExport()} disabled={exportLogs.isPending}>
            <Download size={16} />
            {exportLogs.isPending ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      <Card className="mb-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="error message / user agent" />
          </Field>
          <Field label="Route">
            <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/v1/payments" />
          </Field>
          <Field label="Status code">
            <Input value={statusCode} onChange={(e) => setStatusCode(e.target.value)} placeholder="500" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              <Search size={16} />
              Search
            </Button>
          </div>
        </form>
      </Card>

      {isLoading ? (
        <Card className="flex h-40 items-center justify-center">
          <Spinner />
        </Card>
      ) : results.length === 0 ? (
        <EmptyState title="No results" description="Try a different filter, or proxy a request through a route first." />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            {total} result{total === 1 ? "" : "s"}
            {isFetching && " — updating..."}
          </p>
          <Table>
            <THead>
              <tr>
                <TH>Timestamp</TH>
                <TH>Route</TH>
                <TH>Status</TH>
                <TH>Latency</TH>
                <TH>Request ID</TH>
                <TH>Error</TH>
                <TH></TH>
              </tr>
            </THead>
            <TBody>
              {results.map((r) => (
                <TR key={r.requestId}>
                  <TD className="whitespace-nowrap text-ink-secondary">{new Date(r.timestamp).toLocaleString()}</TD>
                  <TD className="font-mono text-xs">{r.route}</TD>
                  <TD>
                    <Badge tone={statusTone(r.statusCode)}>{r.statusCode ?? "n/a"}</Badge>
                  </TD>
                  <TD className="tabular-nums">{r.latencyMs ?? "-"} ms</TD>
                  <TD className="font-mono text-xs text-ink-muted">{r.requestId}</TD>
                  <TD className="max-w-xs truncate text-ink-secondary">{r.errorMessage ?? "-"}</TD>
                  <TD>
                    <Button variant="ghost" onClick={() => void handleReplay(r.requestId)} disabled={replay.isPending}>
                      Replay
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
