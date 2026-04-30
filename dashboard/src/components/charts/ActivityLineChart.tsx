import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, CHART_TOOLTIP_STYLE } from "./chart-palette";

export type ActivityDayPoint = { day: string; deploy: number; rollback: number; other: number };

export function ActivityLineChart({
  data,
  highlight,
}: {
  data: ActivityDayPoint[];
  highlight: "all" | "deploy" | "rollback";
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
        Not enough history yet
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} width={28} />
          <Tooltip contentStyle={{ ...CHART_TOOLTIP_STYLE }} />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {(highlight === "all" || highlight === "deploy") && (
            <Line type="monotone" dataKey="deploy" name="Deploy" stroke={CHART.linePrimary} strokeWidth={2} dot={false} />
          )}
          {(highlight === "all" || highlight === "rollback") && (
            <Line
              type="monotone"
              dataKey="rollback"
              name="Rollback"
              stroke={CHART.lineSecondary}
              strokeWidth={2}
              dot={false}
            />
          )}
          {highlight === "all" && (
            <Line type="monotone" dataKey="other" name="Other" stroke={CHART.lineTertiary} strokeWidth={1.5} dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
