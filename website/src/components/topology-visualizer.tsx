"use client";

import { useState } from "react";

export function TopologyVisualizer() {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps = [
    {
      title: "01 // Webhook or API trigger",
      desc: "Git push hits POST /api/v1/webhooks/:secret (branch-matched environments) or POST /api/webhooks/github (GitHub App with X-Hub-Signature-256). Manual deploys use POST /api/v1/deploy with Bearer token or session.",
      payload: 'enqueueJob("DEPLOY", projectId, {}, environmentId)',
    },
    {
      title: "02 // Deploy lock",
      desc: "acquireDeployLock() sets a Redis key env:{id} when Redis is available, then updates environments.lockedAt in PostgreSQL. Rejects concurrent deploys for the same environment.",
      payload: "Redis SET env:{id} NX + UPDATE environments SET lockedAt",
    },
    {
      title: "03 // Single-container build",
      desc: "git.prepareSource(), ensureDockerfile(), docker build one image tag, docker run on idle BLUE or GREEN host port (basePort / basePort+1).",
      payload: "docker build -t versiongate-{project}:{timestamp} .",
    },
    {
      title: "04 // Health verification",
      desc: "ValidationService GETs project.healthPath on http://localhost:{idlePort} with retries. Failure marks deployment FAILED and does not switch traffic.",
      payload: "GET http://localhost:3101/health → 2xx required",
    },
    {
      title: "05 // Nginx reload",
      desc: "TrafficService writes upstream config and runs nginx -s reload. Runs only when environment name is production; other stages use /p/:project/:env proxy paths.",
      payload: "nginx -s reload",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => setActiveStep(idx)}
            className={`border p-3 text-left font-mono text-xs transition ${
              activeStep === idx
                ? "border-[#3effa8] bg-[#3effa8] font-semibold text-black"
                : "border-white/15 bg-black text-white/50 hover:border-white/30 hover:text-white"
            }`}
          >
            <div>{step.title}</div>
          </button>
        ))}
      </div>

      <div className="space-y-4 border border-white/10 bg-black p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="font-mono text-sm font-bold text-white">{steps[activeStep].title}</span>
          <span className="font-mono text-[10px] text-white/40">
            Step {activeStep + 1} of {steps.length}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-white/55">{steps[activeStep].desc}</p>

        <div className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Implementation reference
          </span>
          <pre className="overflow-x-auto border border-white/10 bg-white/[0.03] p-3 font-mono text-xs text-white/80">
            {steps[activeStep].payload}
          </pre>
        </div>
      </div>
    </div>
  );
}
