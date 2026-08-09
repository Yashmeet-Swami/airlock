import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../ui/Card.js";
import { CHART_COLORS } from "./chartColors.js";

export interface TimeSeriesPoint {
  bucket: string;
  value: number;
}

// One series, one hue — "requests over time" (area) and "error rate over
// time" (line) render as two separate single-axis charts rather than one
// dual-axis chart (dataviz skill non-negotiable: never two y-scales).
export function TimeSeriesChart({
  title,
  data,
  color,
  variant = "area",
  valueFormatter = (v: number) => String(v),
}: {
  title: string;
  data: TimeSeriesPoint[];
  color: string;
  variant?: "area" | "line";
  valueFormatter?: (value: number) => string;
}) {
  const gradientId = `fill-${title.replace(/\s+/g, "-")}`;

  return (
    <Card>
      <p className="mb-4 text-sm font-medium text-ink">{title}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {variant === "area" ? (
            <AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="bucket" stroke={CHART_COLORS.axis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke={CHART_COLORS.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={valueFormatter}
              />
              <Tooltip
                formatter={(value) => valueFormatter(Number(value))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 13 }}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="bucket" stroke={CHART_COLORS.axis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke={CHART_COLORS.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={valueFormatter}
              />
              <Tooltip
                formatter={(value) => valueFormatter(Number(value))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.grid}`, fontSize: 13 }}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
