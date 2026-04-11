import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "./chart-palette";

export type BarDatum = { name: string; value: number };

export function SimpleBarChart({ data, title }: { data: BarDatum[]; title?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-border/40 bg-muted/20 text-sm text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title ? <p className="text-xs font-medium text-muted-foreground">{title}</p> : null}
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} width={32} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.1 0 0)",
                border: "1px solid oklch(1 0 0 / 0.12)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="value" name="Count" fill="oklch(0.92 0 0)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
