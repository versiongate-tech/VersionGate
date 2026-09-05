"use client";

import { useState } from "react";
import { DEPLOY_LOG } from "@/lib/engine-spec";

const ROLLBACK_LOG = [
  "Initiating rollback for project my-app (proj_abc), env production (env_prod)",
  "[WARM-SWAP] Found cached Docker image versiongate-my-app:1710000000000. Spinning up instant container…",
  "Validating health at http://localhost:3100/health",
  "Switching traffic to port 3100",
  "Rollback completed: Rolled back from v14 to v13",
];

export function JobLogPanel() {
  const [mode, setMode] = useState<"deploy" | "rollback">("deploy");
  const lines = mode === "deploy" ? DEPLOY_LOG : ROLLBACK_LOG;

  return (
    <div className="vg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 vg-rule px-4 py-2">
        <span className="font-mono text-[10px] text-[var(--vg-muted)]">worker log</span>
        <div className="flex gap-4">
          {(["deploy", "rollback"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`font-mono text-[10px] uppercase tracking-[0.1em] pb-0.5 ${
                mode === m
                  ? "border-b-2 border-[var(--vg-accent)] text-[var(--vg-text)]"
                  : "text-[var(--vg-muted)] hover:text-[var(--vg-text)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <pre className="max-h-64 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-[var(--vg-muted)]">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
