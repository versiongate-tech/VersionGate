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
import { AggregateJobLogStream } from "@/components/AggregateJobLogStream";
import { extractVersionFromPreflightMessage, preflightStatusLabel } from "@/lib/preflight-display";
import { serviceLabelForPort } from "@/lib/port-labels";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, CHART_TOOLTIP_STYLE } from "@/components/charts/chart-palette";

function fmtBytes(n: number) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n)} B`;
}

function hostnameHint(): string {
  if (typeof window === "undefined") return "this host";
  return window.location.hostname || "this host";
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

  const cpuBars = useMemo(() => {
    const slice = history.slice(-18);
    return slice.map((p, i) => ({ t: String(i + 1), cpu: p.cpu }));
  }, [history]);

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
  const processes = dashboard?.top_processes ?? [];
  const sentRate = stats.network_sent_rate ?? 0;
  const recvRate = stats.network_recv_rate ?? 0;

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="System health"
        description={`Real-time resource allocation and process oversight for VersionGate on ${hostnameHint()} (single-node control plane).`}
        actions={
          <Button type="button" variant="outline" size="sm" disabled={preflightBusy} onClick={() => void loadPreflight()}>
            {preflightBusy ? "Checking…" : "Re-run checks"}
          </Button>
        }
      />

      {/* Top metrics row (mock-aligned) */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CPU usage</CardTitle>
            <CardDescription>Recent samples (~{Math.max(1, cpuBars.length) * 5}s window)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tabular-nums text-primary">{stats.cpu_percent.toFixed(1)}%</div>
            <div className="h-36 w-full">
              {cpuBars.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cpuBars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 9 }} width={28} />
                    <Tooltip
                      contentStyle={{ ...CHART_TOOLTIP_STYLE }}
                      formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, "CPU"]}
                    />
                    <Bar dataKey="cpu" fill="oklch(0.48 0.2 255)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Collecting…</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Memory</CardTitle>
            <CardDescription>Host RAM from collector</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-lg font-semibold tabular-nums">
              {fmtBytes(stats.memory_used)} / {fmtBytes(stats.memory_total)}
            </div>
            <Progress value={Math.min(100, stats.memory_percent)} className="h-2" />
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Swap</p>
                <p>—</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Cached</p>
                <p>—</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Buffers</p>
                <p>—</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Extended memory breakdown requires host agent access not exposed in this build.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Disk volume</CardTitle>
            <CardDescription>Utilization from collector</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={[
                { name: "Used", value: stats.disk_percent },
                { name: "Free", value: diskFree },
              ]}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Read/write IOPS are not collected — chart shows space headroom only.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Preflight (mock-style columns) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Preflight checks</h2>
          {preflight ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              Last run: {new Date(preflight.checkedAt).toLocaleString()}
            </Badge>
          ) : null}
        </div>
        {preflight ? (
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Dependencies</CardTitle>
                <Badge variant="outline" className={preflight.ok ? "border-emerald-500/40 text-emerald-700" : "border-amber-500/50 text-amber-800"}>
                  {preflight.ok ? "All required checks passed" : "Attention needed"}
                </Badge>
              </div>
              <CardDescription>Bun, Docker, Git, paths, and optional tooling on this machine.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Dependency</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead className="pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preflight.checks.map((c) => {
                    const ver = extractVersionFromPreflightMessage(c.message);
                    const st = preflightStatusLabel(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="pl-6 font-medium">{c.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{ver}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">This node</TableCell>
                        <TableCell className="pr-6">
                          <Badge
                            variant="outline"
                            className={
                              c.ok ? "border-sky-500/40 text-sky-800" : "border-amber-500/50 text-amber-900"
                            }
                          >
                            {st}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Listening ports + scan */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Listening ports</h2>
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base">Ports (LISTEN)</CardTitle>
              <CardDescription>
                From <code className="text-xs">ss -tln</code> on Linux hosts. Public bindings highlighted.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadPreflight()}>
              Scan interfaces
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            {ports.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No listening sockets reported.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Port</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Bind address</TableHead>
                    <TableHead className="pr-6">Exposure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ports.map((p, i) => {
                    const pub =
                      p.address === "*" ||
                      p.address === "0.0.0.0" ||
                      p.address === "[::]" ||
                      p.address === "::";
                    return (
                      <TableRow key={`${p.address}-${p.port}-${i}`}>
                        <TableCell className="pl-6 font-mono tabular-nums">{p.port}</TableCell>
                        <TableCell className="text-sm">{serviceLabelForPort(p.port)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.address}</TableCell>
                        <TableCell className="pr-6">
                          {pub ? (
                            <Badge variant="outline" className="border-sky-500/45 text-[10px] text-sky-800">
                              Exposed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Restricted
                            </Badge>
                          )}
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

      {/* Process manager */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Process manager</h2>
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base">Top processes</CardTitle>
              <CardDescription>Snapshot from the metrics collector (not a full service tree).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {processes.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No process sample available on this OS.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">PID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>CPU %</TableHead>
                    <TableHead className="pr-6">Mem %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processes.slice(0, 24).map((p) => (
                    <TableRow key={`${p.pid}-${p.name}`}>
                      <TableCell className="pl-6 font-mono text-xs tabular-nums">{p.pid}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">{p.name}</TableCell>
                      <TableCell className="tabular-nums">{p.cpu_percent.toFixed(1)}</TableCell>
                      <TableCell className="pr-6 tabular-nums">{p.memory_percent.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Aggregate job log stream */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Cluster log preview</h2>
        <AggregateJobLogStream title="Main cluster logs (job tail)" pollMs={6000} />
        <p className="text-xs text-muted-foreground">
          Streams are synthesized from recent deploy job logs. Host-level syslog forwarding is not bundled.
        </p>
      </section>

      {/* Node / regions decorative card */}
      <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-sky-50/80 via-card to-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Node infrastructure</CardTitle>
          <CardDescription>
            VersionGate targets a single-node VPS model. Multi-region orchestration is not active — this card is a
            layout placeholder aligned with control-plane mocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-xs">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-800">
            Primary: local
          </Badge>
          <Badge variant="outline" className="border-sky-500/40 text-sky-800">
            Edge: n/a
          </Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-900">
            DR: configure backups
          </Badge>
        </CardContent>
      </Card>

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
        <h2 className="text-sm font-medium text-muted-foreground">Established connections</h2>
        <Card className="border-border/80 bg-card shadow-sm">
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
          <Card className="border-border/80 bg-card shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Resource usage over time</CardTitle>
              <CardDescription>CPU, memory, and disk utilization (%).</CardDescription>
            </CardHeader>
            <CardContent>
              <ServerResourceLineChart data={history} />
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Memory headroom</CardTitle>
              <CardDescription>Used vs free (percent).</CardDescription>
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

        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Network throughput (delta per interval)</CardTitle>
            <CardDescription>Bytes sent and received since the previous sample.</CardDescription>
          </CardHeader>
          <CardContent>
            <ServerNetworkLineChart data={history} />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">CPU</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold tabular-nums">{stats.cpu_percent.toFixed(1)}%</div>
              <Progress value={Math.min(100, stats.cpu_percent)} className="h-2" />
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card shadow-sm">
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
          <Card className="border-border/80 bg-card shadow-sm">
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
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Network Δ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div>
                ↑ <span className="font-mono text-foreground">{fmtBytes(sentRate)}/s</span>
              </div>
              <div>
                ↓ <span className="font-mono text-foreground">{fmtBytes(recvRate)}/s</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80 bg-card shadow-sm">
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
          <Card className="border-border/80 bg-card shadow-sm">
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
