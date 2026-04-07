import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createWebSocket, getJobStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";

type LineKind = "info" | "success" | "error";

function classifyLine(line: string): LineKind {
  const lower = line.toLowerCase();
  if (lower.includes("failed") || lower.includes("error") || lower.includes("fatal")) return "error";
  if (lower.includes("successful") || lower.includes("complete") || lower.includes("✓")) return "success";
  return "info";
}

export function DeployLog() {
  const { id: projectId, jobId } = useParams<{ id: string; jobId: string }>();
  const [lines, setLines] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("RUNNING");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => {
    if (!jobId) return;

    let ws: WebSocket | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const initial = await getJobStatus(jobId);
        if (cancelled) return;
        const logs = Array.isArray(initial.job.logs) ? (initial.job.logs as string[]) : [];
        setLines(logs);
        setJobStatus(initial.job.status);
      } catch {
        setJobStatus("FAILED");
      }

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
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        setJobStatus((s) => (s === "PENDING" || s === "RUNNING" ? s : s));
      };
    })();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [jobId]);

  const badgeVariant =
    jobStatus === "COMPLETE"
      ? "default"
      : jobStatus === "FAILED"
        ? "destructive"
        : "secondary";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Deploy log" description="Live output from the deployment job." />
        <Badge variant={badgeVariant} className="shrink-0 font-mono text-xs">
          {jobStatus}
        </Badge>
      </div>
      {projectId && (
        <Link to={`/projects/${projectId}`} className="inline-block text-sm text-muted-foreground hover:text-primary">
          ← Back to project
        </Link>
      )}
      <Card className="overflow-hidden border-border/50 bg-card/40 ring-1 ring-border/30">
        <CardHeader className="border-b border-border/40 py-3">
          <CardTitle className="font-mono text-xs font-normal uppercase tracking-wider text-muted-foreground">
            Output
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <pre
            className="max-h-[min(70vh,560px)] overflow-auto bg-black/50 p-4 font-mono text-xs leading-relaxed"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {lines.map((line, i) => {
              const kind = classifyLine(line);
              return (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className={cn(
                    kind === "success" && "text-emerald-400",
                    kind === "error" && "text-red-400",
                    kind === "info" && "text-zinc-400"
                  )}
                >
                  {line}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
