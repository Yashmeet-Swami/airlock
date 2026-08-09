export interface ChartColorSet {
  brand: string;
  error: string;
  good: string;
  grid: string;
  axis: string;
  surface: string;
  ink: string;
}

// Recharts needs raw color values (SVG stroke/fill), not Tailwind classes —
// mirrors the same dataviz-skill palette tokens defined in styles/index.css,
// light and dark steps both taken from references/palette.md.
export const LIGHT_CHART_COLORS: ChartColorSet = {
  brand: "#2a78d6",
  error: "#e34948",
  good: "#0ca30c",
  grid: "#e1e0d9",
  axis: "#898781",
  surface: "#fcfcfb",
  ink: "#0b0b0b",
};

export const DARK_CHART_COLORS: ChartColorSet = {
  brand: "#3987e5",
  error: "#e66767",
  good: "#0ca30c",
  grid: "#2c2c2a",
  axis: "#898781",
  surface: "#1a1a19",
  ink: "#ffffff",
};

export function getChartColors(isDark: boolean): ChartColorSet {
  return isDark ? DARK_CHART_COLORS : LIGHT_CHART_COLORS;
}
