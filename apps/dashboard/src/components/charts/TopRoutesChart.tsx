import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui/Card.js";
import { CHART_COLORS } from "./chartColors.js";

export interface TopRoute {
  route: string;
  count: number;
}

// Horizontal bars — long path-pattern labels (e.g. "/v1/payments/refunds")
// read better than vertical columns with rotated ticks.
export function TopRoutesChart({ data }: { data: TopRoute[] }) {
  return (
    <Card>
      <p className="mb-4 text-sm font-medium text-ink">Top routes by volume</p>
      <div style={{ height: Math.max(160, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis type="number" stroke={CHART_COLORS.axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="route"
              stroke={CHART_COLORS.axis}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 13 }} />
            <Bar dataKey="count" fill={CHART_COLORS.brand} radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
