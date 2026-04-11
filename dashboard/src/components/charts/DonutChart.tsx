import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PIE_COLORS } from "./chart-palette";

export type DonutDatum = { name: string; value: number };

export function DonutChart({
  data,
  title,
  emptyLabel = "No data",
}: {
  data: DonutDatum[];
  title?: string;
  emptyLabel?: string;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-border/40 bg-muted/20 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title ? <p className="text-xs font-medium text-muted-foreground">{title}</p> : null}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
            >
              {filtered.map((entry, i) => (
                <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "oklch(0.12 0 0)",
                border: "1px solid oklch(1 0 0 / 0.12)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
