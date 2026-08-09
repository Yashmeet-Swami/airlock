// Recharts needs raw color values (SVG stroke/fill), not Tailwind classes —
// mirrors the same dataviz-skill palette tokens defined in styles/index.css.
export const CHART_COLORS = {
  brand: "#2a78d6",
  error: "#e34948",
  good: "#0ca30c",
  grid: "#e1e0d9",
  axis: "#898781",
  surface: "#fcfcfb",
} as const;
