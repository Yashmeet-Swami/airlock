import { useState, type ReactNode } from "react";
import { Activity, AlertTriangle, KeyRound, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "../components/layout/index.js";
import { StatTile, TimeSeriesChart, TopRoutesChart } from "../components/charts/index.js";
import { Card, EmptyState, Select, Spinner } from "../components/ui/index.js";
import { useAggregateOverTime, useAggregateTopRoutes } from "../api/analytics.js";
import { useRoutes } from "../api/routes.js";
import { useApiKeys } from "../api/apiKeys.js";

const WINDOW_OPTIONS = [
  { value: "1h", label: "Hourly buckets" },
  { value: "1d", label: "Daily buckets" },
];

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
  const [window, setWindow] = useState("1h");
  const seriesQuery = useAggregateOverTime(window);
  const routesAggQuery = useAggregateTopRoutes();
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

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Traffic and error trends across your tenant."
        action={
          <Select value={window} onChange={(e) => setWindow(e.target.value)} className="w-48">
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
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
