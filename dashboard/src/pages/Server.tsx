import { useEffect, useState } from "react";
import { Cpu, HardDrive, Network, Timer } from "lucide-react";
import { getServerStats, type ServerStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";

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
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  const fmt = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n)} B`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Server" description="Host resource usage from the VersionGate engine." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU</CardTitle>
            <Cpu className="size-4 text-primary/80" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums">{stats.cpu_percent.toFixed(1)}%</div>
            <Progress value={Math.min(100, stats.cpu_percent)} className="h-2" />
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
            <HardDrive className="size-4 text-primary/80" />
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disk</CardTitle>
            <HardDrive className="size-4 text-muted-foreground" />
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Network</CardTitle>
            <Network className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              Sent: <span className="font-mono tabular-nums text-foreground">{fmt(stats.network_sent)}</span>
            </div>
            <div>
              Recv: <span className="font-mono tabular-nums text-foreground">{fmt(stats.network_recv)}</span>
            </div>
            <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
              <Timer className="size-3.5" />
              Uptime: {Math.floor(stats.uptime)}s
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
