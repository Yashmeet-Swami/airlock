import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Activity, AlertTriangle, KeyRound, RefreshCw, Route as RouteIcon, Zap } from "lucide-react";
import { PageHeader } from "../components/layout/index.js";
import { StatTile, TimeSeriesChart, TopRoutesChart } from "../components/charts/index.js";
import { Button, Card, EmptyState, Spinner } from "../components/ui/index.js";
import { useAggregateOverTime, useAggregateTopRoutes } from "../api/analytics.js";
import { useRoutes } from "../api/routes.js";
import { useApiKeys } from "../api/apiKeys.js";

interface RangePreset {
  key: string;
  label: string;
  window: string;
  hoursAgo: number;
}

// Each range picks its own bucket size — a 30-day view bucketed by 5 minutes
// would be unreadable, so granularity is derived from the range, not chosen
// independently (previously the only control here was raw bucket size, which
// meant "hourly buckets" silently covered the tenant's *entire* history).
const RANGE_PRESETS: RangePreset[] = [
  { key: "1h", label: "1H", window: "5m", hoursAgo: 1 },
  { key: "24h", label: "24H", window: "1h", hoursAgo: 24 },
  { key: "7d", label: "7D", window: "6h", hoursAgo: 24 * 7 },
  { key: "30d", label: "30D", window: "1d", hoursAgo: 24 * 30 },
];

const AUTO_REFRESH_MS = 15_000;

function ChartSlot({ loading, empty, children }: { loading: boolean; empty: boolean; children: ReactNode }) {
  if (loading) {
    return (
      <Card className="flex h-64 items-center justify-center">
        <Spinner />
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <EmptyState title="No traffic yet" description="Proxy a request through one of your routes to see it here." />
      </Card>
    );
  }
  return <>{children}</>;
}

export function OverviewPage() {
  const [rangeKey, setRangeKey] = useState("24h");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const preset = RANGE_PRESETS.find((p) => p.key === rangeKey) ?? RANGE_PRESETS[1]!;
  // Computed fresh on every render (Date.now()) would otherwise change the
  // query key by a few milliseconds each time, so React Query never sees a
  // stable key to settle on — an unintentional infinite refetch loop that
  // looks like "stuck loading" with stale zeroed-out stat tiles. Recompute
  // only when the selected range actually changes; the manual refresh button
  // and auto-refresh interval both re-fetch the *existing* query directly,
  // they don't need a new `from` to do that.
  const from = useMemo(
    () => new Date(Date.now() - preset.hoursAgo * 60 * 60 * 1000).toISOString(),
    [preset.hoursAgo],
  );
  const refetchInterval = autoRefresh ? AUTO_REFRESH_MS : false;

  const seriesQuery = useAggregateOverTime(preset.window, from, refetchInterval);
  const routesAggQuery = useAggregateTopRoutes(from, refetchInterval);
  const routesQuery = useRoutes();
  const apiKeysQuery = useApiKeys();

  const series = seriesQuery.data?.series ?? [];
  const totalRequests = series.reduce((sum, p) => sum + p.total, 0);
  const totalErrors = series.reduce((sum, p) => sum + p.errors, 0);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  const requestsData = series.map((p) => ({ bucket: p.bucket, value: p.total }));
  const errorRateData = series.map((p) => ({ bucket: p.bucket, value: Math.round(p.errorRate * 1000) / 10 }));
  const topRoutes = (routesAggQuery.data?.routes ?? []).slice(0, 10).map((r) => ({ route: r.route, count: r.count }));
  const activeApiKeys = (apiKeysQuery.data ?? []).filter((k) => k.revokedAt === null).length;

  function handleRefresh() {
    void seriesQuery.refetch();
    void routesAggQuery.refetch();
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Traffic and error trends across your tenant."
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setRangeKey(p.key)}
                  className={clsx(
                    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    p.key === rangeKey ? "bg-brand text-white" : "text-ink-secondary hover:bg-page",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              variant={autoRefresh ? "primary" : "secondary"}
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? "Auto-refresh on (every 15s)" : "Auto-refresh off"}
            >
              <Zap size={16} />
            </Button>
            <Button variant="secondary" onClick={handleRefresh} title="Refresh now">
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Requests" value={totalRequests.toLocaleString()} icon={Activity} />
        <StatTile
          label="Error rate"
          value={`${errorRate.toFixed(1)}%`}
          icon={AlertTriangle}
          tone={errorRate > 5 ? "critical" : "default"}
        />
        <StatTile label="Routes configured" value={String(routesQuery.data?.length ?? 0)} icon={RouteIcon} />
        <StatTile label="Active API keys" value={String(activeApiKeys)} icon={KeyRound} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartSlot loading={seriesQuery.isLoading} empty={requestsData.length === 0}>
          <TimeSeriesChart title="Requests over time" data={requestsData} color="brand" variant="area" />
        </ChartSlot>
        <ChartSlot loading={seriesQuery.isLoading} empty={errorRateData.length === 0}>
          <TimeSeriesChart
            title="Error rate over time"
            data={errorRateData}
            color="error"
            variant="line"
            valueFormatter={(v) => `${v}%`}
          />
        </ChartSlot>
      </div>

      <ChartSlot loading={routesAggQuery.isLoading} empty={topRoutes.length === 0}>
        <TopRoutesChart data={topRoutes} />
      </ChartSlot>
    </div>
  );
}
