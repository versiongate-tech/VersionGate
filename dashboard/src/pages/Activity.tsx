import { useCallback, useEffect, useMemo, useState } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { ActivityLineChart, type ActivityDayPoint } from "@/components/charts/ActivityLineChart";
import { Link } from "react-router-dom";
import { listAllJobs, type JobRecord } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AggregateJobLogStream } from "@/components/AggregateJobLogStream";
import { jobArtifactLabel } from "@/lib/job-display";
import { cn } from "@/lib/utils";

const POLL_MS = 8000;

function buildLast7DayBuckets(jobs: JobRecord[]): ActivityDayPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const keys: string[] = [];
  const labelByKey = new Map<string, string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    keys.push(key);
    labelByKey.set(
      key,
      d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    );
  }
  const counts = new Map<string, ActivityDayPoint>();
  for (const key of keys) {
    counts.set(key, { day: labelByKey.get(key) ?? key, deploy: 0, rollback: 0, other: 0 });
  }
  for (const j of jobs) {
    const key = j.createdAt.slice(0, 10);
    const row = counts.get(key);
    if (!row) continue;
    const t = j.type.toUpperCase();
    if (t.includes("ROLLBACK")) row.rollback += 1;
    else if (t.includes("DEPLOY") || t.includes("PROMOTE")) row.deploy += 1;
    else row.other += 1;
  }
  return keys.map((k) => counts.get(k)!);
}

function exportJobsCsv(jobs: JobRecord[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = ["createdAt", "projectId", "projectName", "type", "status", "artifactHint", "error"];
  const lines = [header.join(",")];
  for (const j of jobs) {
    lines.push(
      [
        esc(j.createdAt),
        esc(j.projectId),
        esc(j.project?.name ?? ""),
        esc(j.type),
        esc(j.status),
        esc(jobArtifactLabel(j)),
        esc(j.error ?? ""),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `versiongate-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Exported CSV");
}

export function Activity() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chartMode, setChartMode] = useState<"all" | "deploy" | "rollback">("all");

  const load = useCallback(async () => {
    try {
      const r = await listAllJobs({ limit: 200 });
      setJobs(r.jobs);
      setTotal(r.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return jobs;
    return jobs.filter((j) => j.status === statusFilter);
  }, [jobs, statusFilter]);

  const badgeFor = (status: string) => {
    if (status === "FAILED" || status === "CANCELLED") return "destructive" as const;
    if (status === "COMPLETE") return "default" as const;
    return "secondary" as const;
  };

  const jobsByStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) {
      m.set(j.status, (m.get(j.status) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [jobs]);

  const dayBuckets = useMemo(() => buildLast7DayBuckets(jobs), [jobs]);

  const peak = useMemo(() => {
    let max = 0;
    for (const d of dayBuckets) max = Math.max(max, d.deploy + d.rollback + d.other);
    return max;
  }, [dayBuckets]);

  const successRate = useMemo(() => {
    let ok = 0;
    let done = 0;
    for (const j of jobs) {
      if (j.status === "COMPLETE" || j.status === "FAILED" || j.status === "CANCELLED") {
        done++;
        if (j.status === "COMPLETE") ok++;
      }
    }
    if (done === 0) return null;
    return ((ok / done) * 100).toFixed(1);
  }, [jobs]);

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Global activity"
        description="Real-time monitoring of deployment jobs across all projects. Export or filter the loaded sample."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-input bg-card px-2 text-xs font-medium"
            >
              <option value="all">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETE">Complete</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button type="button" variant="outline" size="sm" onClick={() => exportJobsCsv(filteredJobs)}>
              Export CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {!loading && jobs.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Jobs by status</CardTitle>
              <CardDescription>Sample up to 200 loaded jobs · {total} total in database</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart data={jobsByStatus} />
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Jobs by type (7 days)</CardTitle>
                <CardDescription>
                  Peak volume: {peak} jobs/day · {successRate != null ? `Terminal success: ${successRate}%` : "No terminal jobs yet"}
                </CardDescription>
              </div>
              <div className="flex gap-1 rounded-lg border border-border/80 bg-muted/30 p-0.5">
                {(["all", "deploy", "rollback"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setChartMode(m)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                      chartMode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "all" ? "All" : m}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ActivityLineChart data={dayBuckets} highlight={chartMode} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle>Jobs history</CardTitle>
          <CardDescription>
            Open a row for streamed logs. Pending work requires{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">versiongate-worker</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pt-4">
          {loading && jobs.length === 0 ? (
            <div className="space-y-2 px-6 pb-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                      No jobs match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow key={job.id} className="border-border/40">
                      <TableCell className="pl-6 text-sm text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to={`/projects/${job.projectId}`} className="text-primary hover:underline">
                          {job.project?.name ?? "—"}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">commit: {jobArtifactLabel(job)}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{job.type}</TableCell>
                      <TableCell>
                        <Badge variant={badgeFor(job.status)} className="font-mono text-xs">
                          {job.status}
                        </Badge>
                        {job.error ? (
                          <p className="mt-1 max-w-md truncate text-xs text-red-700" title={job.error}>
                            {job.error}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Link
                          to={`/projects/${job.projectId}/deploy/${job.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View log
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {!loading && total > 0 ? (
            <p className="border-t border-border/40 px-6 py-3 text-xs text-muted-foreground">
              Showing {filteredJobs.length} of {total} jobs (filter applies to loaded sample)
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Live system log stream</h2>
        <AggregateJobLogStream title="Aggregate job tail" pollMs={6000} />
      </section>
    </div>
  );
}
