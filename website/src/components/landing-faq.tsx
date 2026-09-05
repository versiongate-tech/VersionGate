"use client";

import { useState } from "react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ: FaqItem[] = [
  {
    id: "scope",
    question: "Does it deploy docker-compose stacks or multiple services?",
    answer:
      "No. One build context, one Dockerfile, one container per project environment. If you need frontend + API + DB together, pack them into one container or bring your own Dockerfile.",
  },
  {
    id: "rollback",
    question: "How is rollback different from a normal deploy?",
    answer:
      "Rollback reuses the previous deployment record. If the Docker image tag is still on the host, the worker skips git pull and docker build, starts the old container, health-checks it, then reloads Nginx.",
  },
  {
    id: "failed",
    question: "What if the new container fails health checks?",
    answer:
      "The deploy job fails before Nginx is reloaded. Traffic stays on the slot that was already active.",
  },
  {
    id: "ci",
    question: "How do I trigger a deploy from CI?",
    answer:
      "Create a Bearer token in the dashboard (Settings), then POST /api/v1/deploy with Authorization: Bearer vg_live_... and a JSON body with projectId and environmentId.",
  },
  {
    id: "cli",
    question: "Is there a versiongate CLI?",
    answer:
      "No. Control is through the dashboard, the HTTP API, GitHub webhooks, and a few host scripts (bun run reset-password, install.sh).",
  },
  {
    id: "domain-working",
    question: "VersionGate says the domain is working but the browser cannot open it. Why?",
    answer:
      "PM2 online and preflight DNS only prove the engine and the VPS resolver. Your laptop may still get NXDOMAIN. Curling the public IP from the VPS often hangs (hairpin NAT on Proxmox / NAT hosts). install.sh, Settings, and Certbot also write three different nginx files that can fight on port 80. See /docs/troubleshooting.",
  },
];

export function LandingFaq() {
  const [openId, setOpenId] = useState<string | null>(FAQ[0]?.id ?? null);

  return (
    <div className="divide-y divide-white/10 border border-white/10">
      {FAQ.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
            >
              <span className="text-sm text-white/85">{item.question}</span>
              <span className="shrink-0 font-mono text-xs text-white/40">{open ? "−" : "+"}</span>
            </button>
            {open && (
              <div className="border-t border-white/10 px-5 pb-4 pt-1">
                <p className="text-sm leading-relaxed text-white/55">{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
