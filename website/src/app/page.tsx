"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CapabilityGrid } from "@/components/capability-grid";
import { ExecutionSandbox } from "@/components/execution-sandbox";
import { TopologyVisualizer } from "@/components/topology-visualizer";
import { CommunityQnA } from "@/components/community-qna";
import { HeroDeployVisual } from "@/components/hero-deploy-visual";

const GITHUB_REPO = "https://github.com/dineshkorukonda/VersionGate";
const INSTALL_CMD = "curl -fsSL https://versiongate.tech/install.sh | sudo bash";

const LOOP = [
  {
    step: "01",
    label: "Build",
    title: "Idle slot image build",
    body: "Pull the environment branch, run ensureDockerfile(), docker build one image, docker run on the idle BLUE or GREEN host port.",
  },
  {
    step: "02",
    label: "Prove",
    title: "HTTP health check",
    body: "GET project.healthPath on http://localhost:{idlePort}. Failure aborts the deploy; the active slot keeps serving traffic.",
  },
  {
    step: "03",
    label: "Swap",
    title: "Nginx upstream reload",
    body: "Write upstream config and nginx -s reload for the production environment. Non-production stages use /p/:project/:env proxy routes instead.",
  },
  {
    step: "04",
    label: "Recover",
    title: "Warm-swap rollback",
    body: "Re-run the previous deployment's local Docker image tag, validate health, reload Nginx, stop the current container.",
  },
] as const;

export default function Home() {
  return (
    <div className="landing-shell min-h-screen">
      <div className="border-b border-[#3effa8] bg-[#3effa8]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-black">
            Single-container Docker deploys — one image per project environment, blue/green host ports
          </p>
          <Link
            href="/docs/quick-start"
            className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.12em] text-black underline-offset-2 hover:underline"
          >
            QUICK START →
          </Link>
        </div>
      </div>

      <SiteHeader />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <HeroDeployVisual />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent lg:via-black/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 lg:hidden" />

        <div className="relative mx-auto flex min-h-[100vh] max-w-7xl items-center px-4 pb-28 pt-28 sm:px-6 lg:pb-24 lg:pt-32">
          <div className="max-w-xl landing-fade-up lg:max-w-[34rem]">
            <p className="font-display text-[clamp(3.2rem,8.5vw,6.25rem)] font-bold uppercase leading-[0.88] tracking-[-0.06em] text-white">
              VersionGate
            </p>
            <h1 className="mt-8 max-w-lg font-display text-[clamp(1.35rem,2.6vw,1.85rem)] font-medium uppercase leading-[1.15] tracking-[-0.02em] text-white">
              Blue/green deploys for one container per environment.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
              Self-hosted engine: git pull, single Dockerfile build, health check on the idle slot, Nginx reload for production, rollback from cached image tags. No docker-compose.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/docs"
                className="bg-[#3effa8] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Read documentation
              </Link>
              <Link
                href={GITHUB_REPO}
                target="_blank"
                rel="noreferrer"
                className="border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
              >
                GitHub repository
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className="landing-eyebrow">Scope</p>
          <h2 className="landing-headline mt-6 text-[clamp(2rem,5vw,3.4rem)] text-white">
            One container.
            <br />
            One Dockerfile.
          </h2>
          <div className="landing-prose mt-10 space-y-6">
            <p>
              VersionGate deploys a single Docker container per project per environment. Each environment uses two host ports (BLUE at basePort, GREEN at basePort + 1) to run the next revision before switching traffic.
            </p>
            <p>
              There is no docker-compose support in the engine. A project with separate frontend, API, and database services must be packaged into one container (or supply its own Dockerfile that runs what you need in one process tree).
            </p>
            <p className="emphasis">
              Auto-generated Dockerfiles detect Node (package.json), Python (requirements.txt), Go (go.mod), or static HTML (index.html) — first match per scanned directory.
            </p>
          </div>
        </div>
      </section>

      <section id="architecture-loop" className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Architecture</p>
            <h2 className="landing-headline mt-6 text-[clamp(2rem,4.5vw,3.1rem)] text-white">
              Deploy pipeline
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              Worker job steps from deploy.handler.ts: source prep, single-image build, health gate, optional Nginx switch, retire previous slot.
            </p>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((item) => (
              <article key={item.step} className="bg-black p-7 sm:p-8">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-[#3effa8]">{item.step} //</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {item.label}
                  </span>
                </div>
                <h3 className="mt-8 font-display text-lg font-semibold uppercase tracking-[-0.02em] text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p className="landing-eyebrow">Rollback</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Re-run the previous image tag.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              rollback.handler restores the prior deployment record. When imageExists() finds the tag locally, it skips git pull and docker build before health check and traffic switch.
            </p>
          </div>
          <div className="border border-white/10 bg-[#050505] p-5 sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 font-mono text-[11px]">
              <span className="text-white/45">rollback job log</span>
              <span className="text-[#3effa8]">rollback.handler</span>
            </div>
            <div className="mt-4 space-y-2 font-mono text-[12px] leading-relaxed text-white/65">
              <p>Rolling back from web-app-production-green (v14) to web-app-production-blue (v13)</p>
              <p>[WARM-SWAP] Found cached Docker image versiongate-web-app:1710000000000. Spinning up instant container…</p>
              <p>Validating health at http://localhost:3100/health</p>
              <p>Switching traffic to port 3100</p>
              <p className="text-[#3effa8]">Rollback completed: Rolled back from v14 to v13</p>
            </div>
          </div>
        </div>
      </section>

      <section id="sandbox" className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Log format</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Job stream lines from deploy and rollback handlers.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              Plain-text lines emitted via logEmitter during worker jobs — not pino JSON and not a versiongate CLI.
            </p>
          </div>
          <ExecutionSandbox />
        </div>
      </section>

      <section id="capabilities" className="border-t border-white/10 bg-white/[0.02] py-28 sm:py-36">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Capabilities</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Engine features verified against src/.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              API routes and host scripts only — no fictional versiongate CLI commands.
            </p>
          </div>
          <CapabilityGrid />
        </div>
      </section>

      <section id="architecture" className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Pipeline</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Webhook to Nginx reload.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              Lock, single-container build, validation, and traffic switch as implemented in src/worker/handlers/deploy.handler.ts.
            </p>
          </div>
          <TopologyVisualizer />
        </div>
      </section>

      <section id="install" className="border-t border-white/10 py-28 sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Install</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Host bootstrap and CI deploy.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              install.sh sets up the host. Deploys use POST /api/v1/deploy with projectId (not project name).
            </p>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-2">
            <div className="border border-white/10 bg-[#050505] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <span className="font-mono text-xs text-white/45">install.sh</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#3effa8]">
                  Step 1
                </span>
              </div>
              <pre className="mt-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-white/85">
                <code>{INSTALL_CMD}</code>
              </pre>
            </div>

            <div className="border border-white/10 bg-[#050505] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <span className="font-mono text-xs text-white/45">deploy API</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#3effa8]">
                  Step 2
                </span>
              </div>
              <pre className="mt-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-white/85">
                <code>{`curl -X POST "$VG_URL/api/v1/deploy" \\
  -H "Authorization: Bearer $VG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"proj_abc","environmentId":"env_prod"}'`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section id="qna" className="border-t border-white/10 bg-white/[0.02] py-28 sm:py-36">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="landing-eyebrow">Reference</p>
            <h2 className="landing-headline mt-6 text-[clamp(1.8rem,3.8vw,2.7rem)] text-white">
              Common questions with source-aligned snippets.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/55">
              Code excerpts match current src/ implementations — traffic.service.ts, rollback.handler.ts, deploy.handler.ts, docker.ts.
            </p>
          </div>
          <CommunityQnA />
        </div>
      </section>

      <section className="border-t border-white/10 py-28 sm:py-40">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="landing-eyebrow">Get started</p>
          <h2 className="landing-headline mt-6 text-[clamp(1.9rem,4vw,3rem)] text-white">
            One container per environment.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/55">
            Install on a VPS, connect a GitHub repo, deploy a single-service app with blue/green host ports.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs/quick-start"
              className="bg-[#3effa8] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Quick start
            </Link>
            <Link
              href="/changelog"
              className="border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
            >
              Changelog
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
