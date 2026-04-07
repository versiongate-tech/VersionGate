import { useEffect, useState } from "react";
import { getServerStats, type ServerStats } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { Separator } from "@/components/ui/separator";

export function Server() {
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await getServerStats();
        if (!cancelled) setStats(s);
      } catch {
        if (!cancelled) setStats(null);
      }
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!stats) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  const fmt = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n)} B`;

  const loadAvg = stats.load_avg?.map((x) => x.toFixed(2)).join(" / ") ?? "—";

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Host metrics"
        description="CPU, memory, disk, and network for the machine running Docker and the VersionGate API. Values refresh every five seconds. Low free disk space will cause image builds and npm installs to fail with ENOSPC."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums">{stats.cpu_percent.toFixed(1)}%</div>
            <Progress value={Math.min(100, stats.cpu_percent)} className="h-2" />
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums">{stats.memory_percent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {fmt(stats.memory_used)} / {fmt(stats.memory_total)}
            </p>
            <Progress value={Math.min(100, stats.memory_percent)} className="h-2" />
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums">{stats.disk_percent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {fmt(stats.disk_used)} / {fmt(stats.disk_total)}
            </p>
            <Progress value={Math.min(100, stats.disk_percent)} className="h-2" />
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              Sent: <span className="font-mono tabular-nums text-foreground">{fmt(stats.network_sent)}</span>
            </div>
            <div>
              Recv: <span className="font-mono tabular-nums text-foreground">{fmt(stats.network_recv)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
        <CardHeader>
          <CardTitle className="text-base">System</CardTitle>
          <CardDescription>Load averages (1, 5, and 15 minutes) and running process count.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Load average</p>
            <p className="font-mono text-lg tabular-nums">{loadAvg}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Processes</p>
            <p className="font-mono text-lg tabular-nums">{stats.process_count}</p>
          </div>
          <Separator className="sm:col-span-2" />
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground sm:col-span-2">
            <span>
              Collector status: <span className="font-mono text-foreground">{stats.status}</span>
            </span>
            <span>
              Uptime: <span className="font-mono text-foreground">{Math.floor(stats.uptime)}s</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
