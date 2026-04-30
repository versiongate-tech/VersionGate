/** Light UI chart strokes and fills */
export const CHART = {
  linePrimary: "oklch(0.48 0.2 255)",
  lineSecondary: "oklch(0.55 0.14 195)",
  lineTertiary: "oklch(0.52 0.12 145)",
  netUp: "oklch(0.5 0.18 255)",
  netDown: "oklch(0.55 0.14 300)",
  grid: "oklch(0.88 0.01 250)",
  axis: "oklch(0.5 0.02 260)",
} as const;

/** Recharts tooltip on light cards */
export const CHART_TOOLTIP_STYLE = {
  background: "oklch(0.99 0.005 250)",
  border: "1px solid oklch(0.88 0.01 250)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "oklch(0.25 0.03 260)",
} as const;

export const PIE_COLORS = [
  "oklch(0.48 0.2 255)",
  "oklch(0.55 0.14 195)",
  "oklch(0.58 0.14 145)",
  "oklch(0.58 0.16 300)",
  "oklch(0.65 0.02 260)",
  "oklch(0.75 0.02 260)",
] as const;
