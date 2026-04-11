import { useCallback, useRef, useState } from "react";
import type { ServerStats } from "@/lib/api";

export const MAX_METRIC_POINTS = 96;

export type MetricPoint = {
  time: string;
  cpu: number;
  mem: number;
  disk: number;
  netUp: number;
  netDown: number;
};

export function useServerMetricHistory() {
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const lastNet = useRef<{ s: number; r: number } | null>(null);

  const push = useCallback((stats: ServerStats) => {
    const t = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    let netUp = 0;
    let netDown = 0;
    if (lastNet.current) {
      netUp = Math.max(0, stats.network_sent - lastNet.current.s);
      netDown = Math.max(0, stats.network_recv - lastNet.current.r);
    }
    lastNet.current = { s: stats.network_sent, r: stats.network_recv };

    setHistory((prev) => {
      const next = [
        ...prev,
        {
          time: t,
          cpu: stats.cpu_percent,
          mem: stats.memory_percent,
          disk: stats.disk_percent,
          netUp,
          netDown,
        },
      ];
      if (next.length > MAX_METRIC_POINTS) {
        return next.slice(-MAX_METRIC_POINTS);
      }
      return next;
    });
  }, []);

  return { history, push };
}
