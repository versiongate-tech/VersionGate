import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPreflight,
  getServerDashboard,
  type PreflightReport,
  type SystemDashboardResponse,
  type ServerStats,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useServerMetricHistory } from "@/hooks/use-server-metric-history";
import { DonutChart } from "@/components/charts/DonutChart";
import { ServerNetworkLineChart, ServerResourceLineChart } from "@/components/charts/ServerLineCharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function fmtBytes(n: number) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n)} B`;
}

export function SystemHealth() {
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [dashboard, setDashboard] = useState<SystemDashboardResponse | null>(null);
  const { history, push } = useServerMetricHistory();

  const loadPreflight = useCallback(async () => {
    setPreflightBusy(true);
    try {
      const r = await getPreflight();
      setPreflight(r);
    } catch {
      setPreflight(null);
    } finally {
      setPreflightBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadPreflight();
  }, [loadPreflight]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await getServerDashboard();
        if (!cancelled) {
          setDashboard(d);
          push(d.system_stats as ServerStats);
        }
      } catch {
        if (!cancelled) setDashboard(null);
      }
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [push]);

  const stats = dashboard?.system_stats ?? null;

  const securityItems = useMemo(() => {
    const items: { severity: "high" | "medium" | "low"; source: string; message: string }[] = [];
    if (preflight) {
      for (const c of preflight.checks) {
        if (c.ok) continue;
        if (c.severity === "required") items.push({ severity: "high", source: c.label, message: c.message });
        else if (c.severity === "recommended")
          items.push({ severity: "medium", source: c.label, message: c.message });
        else items.push({ severity: "low", source: c.label, message: c.message });
      }
    }
    if (dashboard?.alerts?.length) {
      for (const a of dashboard.alerts) {
        items.push({ severity: a.severity, source: a.type, message: a.message });
      }
    }
    return items;
  }, [preflight, dashboard]);

  if (!stats) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  const loadAvg = stats.load_avg?.map((x) => x.toFixed(2)).join(" / ") ?? "—";
  const diskFree = Math.max(0, 100 - stats.disk_percent);
  const memFree = Math.max(0, 100 - stats.memory_percent);
  const ports = dashboard?.listening_ports ?? [];
  const connections = dashboard?.connections ?? [];

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="System health"
        description="Host compatibility checks, resource usage, listening ports, and alerts for the machine running VersionGate and Docker."
        actions={
          <Button type="button" variant="outline" size="sm" disabled={preflightBusy} onClick={() => void loadPreflight()}>
            {preflightBusy ? "Checking…" : "Re-run checks"}
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Server checks</h2>
        {preflight ? (
          <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Preflight</CardTitle>
                <Badge variant="outline" className={preflight.ok ? "border-emerald-500/40 text-emerald-600" : "border-red-500/40 text-red-600"}>
                  {preflight.ok ? "Required checks OK" : "Action needed"}
                </Badge>
                <span className="text-xs text-muted-foreground">{new Date(preflight.checkedAt).toLocaleString()}</span>
              </div>
              <CardDescription>Bun, Docker, Git, projects directory, and optional PM2 / Nginx.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[200px]">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preflight.checks.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{c.severity}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.ok ? "border-emerald-500/30" : "border-amber-500/40"}>
                          {c.ok ? "OK" : "Issue"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">{c.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Alert>
            <AlertTitle>Could not load preflight</AlertTitle>
            <AlertDescription>Is the API running? Try Re-run checks.</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Security and resource alerts</h2>
        {securityItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open issues from preflight or live metrics.</p>
        ) : (
          <ul className="space-y-2">
            {securityItems.map((item, i) => (
              <Alert
                key={`${item.source}-${i}`}
                variant={item.severity === "high" ? "destructive" : "default"}
                className={
                  item.severity === "medium"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : item.severity === "low"
                      ? "border-border/60 bg-muted/30"
                      : undefined
                }
              >
                <AlertTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{item.source}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {item.severity}
                  </Badge>
                </AlertTitle>
                <AlertDescription>{item.message}</AlertDescription>
              </Alert>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Listening TCP ports</h2>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ports (LISTEN)</CardTitle>
            <CardDescription>From <code className="text-xs">ss -tln</code> on the host. Public bindings (0.0.0.0 / ::) are highlighted.</CardDescription>
          </CardHeader>
          <CardContent>
            {ports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No listening sockets reported (or collector unavailable on this OS).</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Port</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ports.map((p, i) => {
                    const pub = p.address === "*" || p.address === "0.0.0.0" || p.address === "[::]" || p.address === "::";
                    return (
                      <TableRow key={`${p.address}-${p.port}-${i}`}>
                        <TableCell className="font-mono text-xs">{p.address}</TableCell>
                        <TableCell>
                          <span className="font-mono tabular-nums">{p.port}</span>
                          {pub ? (
                            <Badge variant="outline" className="ml-2 border-cyan-500/40 text-[10px] text-cyan-700 dark:text-cyan-400">
                              exposed
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Established connections</h2>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">TCP established</CardTitle>
            <CardDescription>Sample of active connections (newest collector snapshot).</CardDescription>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">None reported.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Local</TableHead>
                    <TableHead>Remote</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.slice(0, 80).map((c, i) => (
                    <TableRow key={`${c.local_address}-${c.remote_address}-${i}`}>
                      <TableCell className="font-mono text-xs">{c.local_address}</TableCell>
                      <TableCell className="font-mono text-xs">{c.remote_address}</TableCell>
                      <TableCell>{c.state}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {connections.length > 80 ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing 80 of {connections.length}.</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Server metrics</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/50 bg-card/60 ring-1 ring-border/30 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Resource usage over time</CardTitle>
              <CardDescription>CPU, memory, and disk utilization (percent).</CardDescription>
            </CardHeader>
            <CardContent>
              <ServerResourceLineChart data={history} />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
            <CardHeader>
              <CardTitle className="text-base">Disk headroom</CardTitle>
              <CardDescription>Used vs free (derived from disk percent).</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={[
                  { name: "Used", value: stats.disk_percent },
                  { name: "Free", value: diskFree },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader>
            <CardTitle className="text-base">Network throughput (delta per interval)</CardTitle>
            <CardDescription>Bytes sent and received since the previous sample.</CardDescription>
          </CardHeader>
          <CardContent>
            <ServerNetworkLineChart data={history} />
          </CardContent>
        </Card>

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
                {fmtBytes(stats.memory_used)} / {fmtBytes(stats.memory_total)}
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
                {fmtBytes(stats.disk_used)} / {fmtBytes(stats.disk_total)}
              </p>
              <Progress value={Math.min(100, stats.disk_percent)} className="h-2" />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Memory headroom</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={[
                  { name: "Used", value: stats.memory_percent },
                  { name: "Free", value: memFree },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader>
              <CardTitle className="text-base">Network totals</CardTitle>
              <CardDescription>Cumulative since boot (collector).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                Sent: <span className="font-mono tabular-nums text-foreground">{fmtBytes(stats.network_sent)}</span>
              </div>
              <div>
                Recv: <span className="font-mono tabular-nums text-foreground">{fmtBytes(stats.network_recv)}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader>
              <CardTitle className="text-base">System</CardTitle>
              <CardDescription>Load averages and process count.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
                  Collector: <span className="font-mono text-foreground">{stats.status}</span>
                </span>
                <span>
                  Uptime: <span className="font-mono text-foreground">{Math.floor(stats.uptime)}s</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
