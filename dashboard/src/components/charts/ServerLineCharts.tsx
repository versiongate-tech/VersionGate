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
import type { MetricPoint } from "@/hooks/use-server-metric-history";
import { CHART } from "./chart-palette";

export function ServerResourceLineChart({ data }: { data: MetricPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
        Collecting samples…
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: CHART.axis, fontSize: 10 }}
            tickLine={false}
            width={36}
            label={{ value: "%", position: "insideTopLeft", fill: CHART.axis, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.1 0 0)",
              border: "1px solid oklch(1 0 0 / 0.12)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Line type="monotone" dataKey="cpu" name="CPU" stroke={CHART.linePrimary} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="mem" name="Memory" stroke={CHART.lineSecondary} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="disk" name="Disk" stroke={CHART.lineTertiary} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ServerNetworkLineChart({ data }: { data: MetricPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
        Need two samples for network deltas…
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 10 }} tickLine={false} width={44} />
          <Tooltip
            contentStyle={{
              background: "oklch(0.1 0 0)",
              border: "1px solid oklch(1 0 0 / 0.12)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Line type="monotone" dataKey="netUp" name="Δ sent / interval" stroke={CHART.netUp} strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="netDown"
            name="Δ recv / interval"
            stroke={CHART.netDown}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
