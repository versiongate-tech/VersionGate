"use client";

import { useState } from "react";

const DEPLOY_LOG = [
  "Starting deployment pipeline for project web-app (proj_abc), env production (env_prod)",
  "Step 1: Preparing source code (branch main)",
  "Step 2: Determining blue/green target",
  "Target: color=GREEN, hostPort=3101, container=web-app-production-green, image=versiongate-web-app:1710000000000, version=14",
  "Step 4: Building Docker image",
  "Step 5: Starting container",
  "Step 6: Health check http://localhost:3101/health",
  "Step 7: Switching traffic to port 3101",
  "Deployment successful — web-app-production-green is live on port 3101",
  "Deploy lock released",
];

const ROLLBACK_LOG = [
  "Initiating rollback for project web-app (proj_abc), env production (env_prod)",
  "Rolling back from web-app-production-green (v14) to web-app-production-blue (v13)",
  "[WARM-SWAP] Found cached Docker image versiongate-web-app:1710000000000. Spinning up instant container…",
  "Validating health at http://localhost:3100/health",
  "Switching traffic to port 3100",
  "Rollback completed: Rolled back from v14 to v13",
  "Deploy lock released",
];

export function ExecutionSandbox() {
  const [mode, setMode] = useState<"deploy" | "rollback">("deploy");
  const lines = mode === "deploy" ? DEPLOY_LOG : ROLLBACK_LOG;

  return (
    <div className="border border-white/10 bg-[#050505]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="font-mono text-[11px] text-white/45">
          Example worker log · deploy.handler.ts / rollback.handler.ts
        </span>
        <div className="flex gap-2">
          {(["deploy", "rollback"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${
                mode === key
                  ? "bg-[#3effa8] font-semibold text-black"
                  : "border border-white/15 text-white/50 hover:text-white"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      <pre className="max-h-72 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-white/70">
        {lines.join("\n")}
      </pre>
    </div>
  );
}
