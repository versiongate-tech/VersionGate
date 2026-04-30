import { useEffect, useState } from "react";
import { listAllJobs } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Polls recent jobs and renders the latest log line per job (newest jobs first),
 * similar to a lightweight “cluster log” preview in the mocks.
 */
export function AggregateJobLogStream({
  className,
  title = "Live system log stream",
  pollMs = 6000,
}: {
  className?: string;
  title?: string;
  pollMs?: number;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [pollOk, setPollOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await listAllJobs({ limit: 20 });
        if (cancelled) return;
        const next: string[] = [];
        const stamp = () => new Date().toISOString().slice(11, 19);
        for (const j of r.jobs) {
          const tail = j.logs.length ? j.logs[j.logs.length - 1]! : "—";
          const proj = j.project?.name ?? j.projectId.slice(0, 8);
          next.push(`${stamp()} [JOB] ${proj} · ${j.type} · ${j.status} — ${tail}`);
        }
        setLines(next.slice(0, 40));
        setPollOk(true);
      } catch {
        if (!cancelled) {
          setPollOk(false);
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/80 bg-[#0c1222] shadow-inner", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
          <span className={cn("size-1.5 rounded-full", pollOk ? "bg-emerald-400" : "bg-amber-400")} />
          {pollOk ? "POLLING" : "DEGRADED"}
        </span>
      </div>
      <pre
        className="max-h-64 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-200"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {lines.length === 0 ? <span className="text-zinc-500">Waiting for job activity…</span> : lines.join("\n")}
      </pre>
    </div>
  );
}
