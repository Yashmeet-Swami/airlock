import { PageHeader } from "../components/layout/index.js";
import { Badge, Card, EmptyState, Spinner, TBody, TD, TH, THead, TR, Table } from "../components/ui/index.js";
import { useAuditLog } from "../api/auditLog.js";

export function AuditLogPage() {
  const { data: entries, isLoading } = useAuditLog(200);

  return (
    <div>
      <PageHeader title="Audit Log" description="Every mutating admin action, most recent first." />

      {isLoading ? (
        <Card className="flex h-40 items-center justify-center">
          <Spinner />
        </Card>
      ) : !entries || entries.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions like creating routes or revoking API keys will show up here."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Timestamp</TH>
              <TH>Action</TH>
              <TH>Resource</TH>
              <TH>Actor</TH>
            </tr>
          </THead>
          <TBody>
            {entries.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-ink-secondary">{new Date(e.createdAt).toLocaleString()}</TD>
                <TD>
                  <Badge tone="neutral">{e.action}</Badge>
                </TD>
                <TD className="font-mono text-xs text-ink-secondary">
                  {e.resourceType}
                  {e.resourceId ? ` / ${e.resourceId}` : ""}
                </TD>
                <TD className="font-mono text-xs text-ink-muted">{e.actorUserId}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
