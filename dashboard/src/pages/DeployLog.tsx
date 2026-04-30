import { useEffect, useMemo, useRef, useState } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { Link, useNavigate, useParams } from "react-router-dom";
import { cancelJob, createWebSocket, getJobStatus, getServerStats, type ServerStats } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Download, StopCircle } from "lucide-react";

type LineKind = "info" | "success" | "error" | "step";

function classifyLine(line: string): LineKind {
  const lower = line.toLowerCase();
  if (/^step \d+/i.test(line.trim()) || /^\[.*\]/.test(line.trim())) return "step";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("fatal")) return "error";
  if (lower.includes("successful") || lower.includes("complete") || lower.includes("done")) return "success";
  return "info";
}

function fmtBytes(n: number) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n)} B`;
}

const POLL_MS = 2000;
const STUCK_PENDING_MS = 8000;

export function DeployLog() {
  const navigate = useNavigate();
  const { id: projectId, jobId } = useParams<{ id: string; jobId: string }>();
  const [lines, setLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("RUNNING");
  const [jobError, setJobError] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [hostStats, setHostStats] = useState<ServerStats | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jobStatus !== "PENDING" || pendingSince == null) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [jobStatus, pendingSince]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getServerStats();
        if (!cancelled) setHostStats(s);
      } catch {
        if (!cancelled) setHostStats(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!jobId) return;

    let ws: WebSocket | null = null;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      try {
        const initial = await getJobStatus(jobId);
        if (cancelled) return;
        const logs = Array.isArray(initial.job.logs) ? (initial.job.logs as string[]) : [];
        setLines(logs);
        setJobStatus(initial.job.status);
        setJobError(initial.job.error ?? null);
        if (initial.job.status === "PENDING") {
          setPendingSince(Date.now());
        }
      } catch {
        setJobStatus("FAILED");
      }

      const refresh = async () => {
        try {
          const j = await getJobStatus(jobId);
          if (cancelled) return;
          setJobStatus(j.job.status);
          setJobError(j.job.error ?? null);
          const logs = Array.isArray(j.job.logs) ? (j.job.logs as string[]) : [];
          setLines((prev) => (logs.length > prev.length ? logs : prev));
          if (j.job.status === "PENDING") {
            setPendingSince((t) => t ?? Date.now());
          } else {
            setPendingSince(null);
          }
        } catch {
          /* keep polling */
        }
      };

      pollTimer = setInterval(() => {
        void refresh();
      }, POLL_MS);

      ws = createWebSocket(jobId);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type?: string;
            line?: string;
            status?: string;
          };
          if (msg.type === "log" && msg.line) {
            setLines((prev) => [...prev, msg.line!]);
          }
          if (msg.type === "status" && msg.status) {
            setJobStatus(msg.status);
            if (msg.status !== "PENDING") setPendingSince(null);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        setWsConnected(false);
      };
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      ws?.close();
      setWsConnected(false);
    };
  }, [jobId]);

  const showWorkerHint =
    jobStatus === "PENDING" && pendingSince != null && clock - pendingSince > STUCK_PENDING_MS;

  const badgeVariant =
    jobStatus === "COMPLETE"
      ? "default"
      : jobStatus === "FAILED" || jobStatus === "CANCELLED"
        ? "destructive"
        : "secondary";

  const statusColor =
    jobStatus === "COMPLETE"
      ? "text-emerald-600"
      : jobStatus === "FAILED" || jobStatus === "CANCELLED"
        ? "text-red-600"
        : jobStatus === "RUNNING"
          ? "text-sky-700"
          : "text-amber-700";

  const copyLogs = () => {
    const text = lines.join("\n");
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success("Logs copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Failed to copy logs")
    );
  };

  const downloadLogs = () => {
    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deploy-${jobId?.slice(0, 8) ?? "log"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Log file downloaded");
  };

  const onCancelJob = async () => {
    if (!jobId || jobStatus !== "PENDING") return;
    setCancelBusy(true);
    try {
      await cancelJob(jobId);
      toast.success("Job cancelled");
      setJobStatus("CANCELLED");
      if (projectId) navigate(`/projects/${projectId}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel job");
    } finally {
      setCancelBusy(false);
    }
  };

  const logLineMix = useMemo(() => {
    let step = 0;
    let info = 0;
    let success = 0;
    let err = 0;
    for (const line of lines) {
      const k = classifyLine(line);
      if (k === "step") step++;
      else if (k === "success") success++;
      else if (k === "error") err++;
      else info++;
    }
    return [
      { name: "Steps", value: step },
      { name: "Info", value: info },
      { name: "Success hints", value: success },
      { name: "Errors", value: err },
    ];
  }, [lines]);

  const jobTitle = jobId ? `Job #${jobId.slice(0, 8)}` : "Deploy log";

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-start gap-3">
          {projectId && (
            <Link
              to={`/projects/${projectId}`}
              className="mt-1 inline-flex min-w-[2.25rem] items-center justify-center rounded-lg border border-border/60 bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Back
            </Link>
          )}
          <PageHeader
            title={jobTitle}
            description="Streaming pipeline output with WebSocket updates when available."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", wsConnected ? "bg-emerald-500" : "bg-amber-500")} />
            {wsConnected ? "WS connected" : "WS reconnecting…"}
          </span>
          <Badge variant={badgeVariant} className={cn("shrink-0 font-mono text-xs", statusColor)}>
            {jobStatus}
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={downloadLogs} disabled={lines.length === 0}>
            <Download className="size-3.5" />
            Export logs
          </Button>
          {jobStatus === "PENDING" && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={cancelBusy}
              onClick={() => void onCancelJob()}
            >
              <StopCircle className="size-3.5" />
              {cancelBusy ? "Cancelling…" : "Cancel job"}
            </Button>
          )}
        </div>
      </div>

      {showWorkerHint && (
        <Alert className="border-amber-500/40 bg-amber-50">
          <AlertTitle>Job still queued</AlertTitle>
          <AlertDescription>
            Nothing has started yet. On the server run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">pm2 list</code> and ensure{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">versiongate-worker</code> is online.
          </AlertDescription>
        </Alert>
      )}

      {jobError && (
        <Alert variant="destructive">
          <AlertTitle>Job error</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap font-mono text-xs">{jobError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_min(100%,320px)]">
        <div className="min-w-0 space-y-4">
          {lines.length > 0 ? (
            <Card className="border-border/80 bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Log line mix</CardTitle>
                <p className="text-sm text-muted-foreground">Heuristic grouping of streamed lines.</p>
              </CardHeader>
              <CardContent>
                <DonutChart data={logLineMix} />
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden border-border/80 bg-card shadow-md">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
              <span className="flex gap-1" aria-hidden>
                <span className="size-2.5 rounded-full bg-red-400/90" />
                <span className="size-2.5 rounded-full bg-amber-400/90" />
                <span className="size-2.5 rounded-full bg-emerald-400/90" />
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">deploy-pipeline — live</span>
              <div className="ml-auto flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowLineNumbers(!showLineNumbers)}
                >
                  {showLineNumbers ? "Hide #" : "Line #"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={copyLogs}
                  disabled={lines.length === 0}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              <pre
                className="min-h-[48vh] max-h-[min(72vh,680px)] w-full overflow-auto bg-[#0a0a0f] p-4 font-mono text-xs leading-relaxed md:p-6 md:text-sm"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {lines.length === 0 ? (
                  <span className="text-zinc-500">
                    {jobStatus === "PENDING"
                      ? "Waiting for worker to pick up this job…"
                      : jobStatus === "RUNNING"
                        ? "Starting…"
                        : "No log lines yet."}
                  </span>
                ) : null}
                {lines.map((line, i) => {
                  const kind = classifyLine(line);
                  return (
                    <div
                      key={`${i}-${line.slice(0, 24)}`}
                      className={cn(
                        "group/line flex hover:bg-white/[0.02]",
                        kind === "success" && "text-emerald-400",
                        kind === "error" && "text-red-400",
                        kind === "step" && "mt-1 font-medium text-cyan-300",
                        kind === "info" && "text-zinc-300"
                      )}
                    >
                      {showLineNumbers && (
                        <span className="mr-4 inline-block w-8 select-none text-right tabular-nums text-zinc-600">
                          {i + 1}
                        </span>
                      )}
                      <span className="flex-1">{line}</span>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </pre>
            </CardContent>
          </Card>

          {projectId && (
            <div className="flex flex-wrap gap-4 text-sm">
              <Link to={`/projects/${projectId}`} className="text-muted-foreground transition-colors hover:text-primary">
                Project detail
              </Link>
              <Link to="/activity" className="text-muted-foreground transition-colors hover:text-primary">
                All activity
              </Link>
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Host resources</CardTitle>
              <CardDescription>Live host snapshot (not per-job cgroup).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hostStats ? (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">CPU</p>
                    <p className="text-2xl font-semibold tabular-nums">{hostStats.cpu_percent.toFixed(1)}%</p>
                    <Progress value={Math.min(100, hostStats.cpu_percent)} className="mt-1 h-1.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Memory</p>
                    <p className="text-2xl font-semibold tabular-nums">{hostStats.memory_percent.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtBytes(hostStats.memory_used)} / {fmtBytes(hostStats.memory_total)}
                    </p>
                    <Progress value={Math.min(100, hostStats.memory_percent)} className="mt-1 h-1.5" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Loading host metrics…</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Network</CardTitle>
              <CardDescription>Host interface totals (approximate).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Internal</span>
                <span className="font-mono text-[11px]">127.0.0.1</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Node</span>
                <span className="truncate font-mono text-[11px]">{typeof window !== "undefined" ? window.location.hostname : "—"}</span>
              </div>
              {hostStats ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Traffic Δ</span>
                  <span className="font-mono text-[11px]">
                    ↑{fmtBytes(hostStats.network_sent_rate ?? 0)}/s · ↓{fmtBytes(hostStats.network_recv_rate ?? 0)}/s
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {projectId ? (
            <Card className="border-primary/25 bg-primary text-primary-foreground shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-primary-foreground">Rollback</CardTitle>
                <CardDescription className="text-primary-foreground/85">
                  Swap traffic to the previous healthy deployment from the project page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full bg-white text-primary hover:bg-white/90"
                  onClick={() => navigate(`/projects/${projectId}`)}
                >
                  Open project
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
