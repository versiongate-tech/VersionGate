import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createWebSocket, getJobStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

type LineKind = "info" | "success" | "error" | "step";

function classifyLine(line: string): LineKind {
  const lower = line.toLowerCase();
  if (/^step \d+/i.test(line.trim()) || /^\[.*\]/.test(line.trim())) return "step";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("fatal")) return "error";
  if (lower.includes("successful") || lower.includes("complete") || lower.includes("done")) return "success";
  return "info";
}

const POLL_MS = 2000;
const STUCK_PENDING_MS = 8000;

export function DeployLog() {
  const { id: projectId, jobId } = useParams<{ id: string; jobId: string }>();
  const [lines, setLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("RUNNING");
  const [jobError, setJobError] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [copied, setCopied] = useState(false);
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
        /* polling still updates */
      };
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      ws?.close();
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
      ? "text-emerald-400"
      : jobStatus === "FAILED" || jobStatus === "CANCELLED"
        ? "text-red-400"
        : jobStatus === "RUNNING"
          ? "text-cyan-400"
          : "text-amber-400";

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

  const isTerminal = jobStatus === "COMPLETE" || jobStatus === "FAILED" || jobStatus === "CANCELLED";

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          {projectId && (
            <Link
              to={`/projects/${projectId}`}
              className="inline-flex min-w-[2.25rem] items-center justify-center rounded-lg border border-border/50 bg-card/60 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Back
            </Link>
          )}
          <PageHeader
            title="Deploy log"
            description={`Streaming build output${jobId ? ` — job id prefix ${jobId.slice(0, 8)}` : ""}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isTerminal && (
            <span className="relative mr-1 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-cyan-500" />
            </span>
          )}
          <Badge variant={badgeVariant} className={cn("shrink-0 font-mono text-xs", statusColor)}>
            {jobStatus}
          </Badge>
        </div>
      </div>

      {showWorkerHint && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
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

      <Card className="overflow-hidden border-border/50 bg-card/40 ring-1 ring-border/30">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/40 py-3">
          <CardTitle className="font-mono text-xs font-normal uppercase tracking-wider text-muted-foreground">
            Output
            {lines.length > 0 && (
              <span className="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{lines.length} lines</span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              title="Toggle line numbers"
            >
              {showLineNumbers ? "Hide lines" : "Line numbers"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={copyLogs}
              disabled={lines.length === 0}
              title="Copy logs"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={downloadLogs}
              disabled={lines.length === 0}
              title="Download logs"
            >
              Download
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <pre
            className="min-h-[50vh] max-h-[min(75vh,720px)] w-full overflow-auto bg-[#0a0a0f] p-4 font-mono text-xs leading-relaxed md:p-6 md:text-sm"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {lines.length === 0 ? (
              <span className="text-muted-foreground">
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
  );
}
