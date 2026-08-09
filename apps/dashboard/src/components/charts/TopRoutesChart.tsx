import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui/Card.js";
import { getChartColors } from "./chartColors.js";
import { useTheme } from "../../lib/theme.js";

export interface TopRoute {
  route: string;
  count: number;
}

// Horizontal bars — long path-pattern labels (e.g. "/v1/payments/refunds")
// read better than vertical columns with rotated ticks.
export function TopRoutesChart({ data }: { data: TopRoute[] }) {
  const { resolvedTheme } = useTheme();
  const colors = getChartColors(resolvedTheme === "dark");

  return (
    <Card>
      <p className="mb-4 text-sm font-medium text-ink">Top routes by volume</p>
      <div style={{ height: Math.max(160, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid stroke={colors.grid} horizontal={false} />
            <XAxis type="number" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="route"
              stroke={colors.axis}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${colors.grid}`,
                background: colors.surface,
                color: colors.ink,
                fontSize: 13,
              }}
            />
            <Bar dataKey="count" fill={colors.brand} radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
