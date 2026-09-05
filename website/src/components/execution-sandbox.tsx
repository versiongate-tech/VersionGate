"use client";

import { useState } from "react";

export type Scenario = "deploy" | "rollback" | "tokens";

export function ExecutionSandbox() {
  const [activeScenario, setActiveScenario] = useState<Scenario>("deploy");

  const scenarios: Record<Scenario, { title: string; logs: string[]; jsonResponse: object }> = {
    deploy: {
      title: "Deploy job log stream",
      logs: [
        "Starting deployment pipeline for project web-app (proj_abc), env production (env_prod)",
        "Step 1: Preparing source code (branch main)",
        "Step 2: Determining blue/green target",
        "Target: color=GREEN, hostPort=3101, container=web-app-production-green, image=versiongate-web-app:1710000000000, version=14",
        "Step 3: Creating DEPLOYING deployment record",
        "Step 4: Building Docker image",
        "Step 5: Starting container",
        "Step 6: Health check http://localhost:3101/health",
        "Step 7: Switching traffic to port 3101",
        "Step 8: Activating deployment and retiring previous slot",
        "Stopping old container: web-app-production-blue",
        "Deployment successful — web-app-production-green is live on port 3101",
        "Deploy lock released",
      ],
      jsonResponse: {
        jobId: "job_4912",
        status: "PENDING",
        environmentId: "env_prod",
      },
    },
    rollback: {
      title: "Rollback job log stream",
      logs: [
        "Initiating rollback for project web-app (proj_abc), env production (env_prod)",
        "Rolling back from web-app-production-green (v14) to web-app-production-blue (v13)",
        "[WARM-SWAP] Found cached Docker image versiongate-web-app:1710000000000. Spinning up instant container…",
        "Validating health at http://localhost:3100/health",
        "Switching traffic to port 3100",
        "Stopping current container: web-app-production-green",
        "Rollback completed: Rolled back from v14 to v13",
        "Deploy lock released",
      ],
      jsonResponse: {
        rolledBackFrom: { version: 14, status: "ROLLED_BACK" },
        restoredTo: { version: 13, status: "ACTIVE" },
        message: "Rolled back from v14 to v13",
      },
    },
    tokens: {
      title: "Bearer token flow",
      logs: [
        "POST /api/v1/auth/tokens — createApiToken() stores SHA-256 hash, returns vg_live_... once",
        "POST /api/v1/deploy — Authorization: Bearer vg_live_...",
        "requireApiAuth → getUserFromApiToken() → enqueueJob(DEPLOY)",
      ],
      jsonResponse: {
        token: "vg_live_8f92a1c4b7e6d5a3f1e2d4c5b6a798877665544332211009988776655",
        tokenPrefix: "vg_live_8f92a1...",
        name: "CI deploy",
      },
    },
  };

  const current = scenarios[activeScenario];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        {(Object.keys(scenarios) as Scenario[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveScenario(key)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] transition ${
              activeScenario === key
                ? "bg-[#3effa8] font-semibold text-black"
                : "border border-white/15 text-white/55 hover:border-white/30 hover:text-white"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 border border-white/10 bg-black p-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-mono text-xs font-semibold text-white">{current.title}</span>
            <span className="font-mono text-[10px] text-white/40">[ job log lines ]</span>
          </div>

          <div className="min-h-[220px] space-y-2 overflow-x-auto border border-white/10 bg-white/[0.03] p-3 font-mono text-xs">
            {current.logs.map((line, idx) => (
              <div key={idx} className="leading-relaxed text-white/70">
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 border border-white/10 bg-black p-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-mono text-xs font-semibold text-white">Typical API response</span>
            <span className="font-mono text-[10px] text-[#3effa8]">[ JSON ]</span>
          </div>

          <pre className="min-h-[220px] overflow-x-auto border border-white/10 bg-white/[0.03] p-3 font-mono text-xs text-white/70">
            {JSON.stringify(current.jsonResponse, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
