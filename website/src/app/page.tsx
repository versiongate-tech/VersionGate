import Link from "next/link";
import { SPEC_SECTIONS } from "@/lib/engine-spec";
import { ApiSurface } from "@/components/landing/api-surface";
import { FeatureReference } from "@/components/landing/feature-reference";
import { JobLogPanel } from "@/components/landing/job-log-panel";
import { LandingFooter, LandingShellHeader } from "@/components/landing/landing-chrome";
import {
  LandingHeroDiagram,
  LandingPipeline,
  LandingStack,
} from "@/components/landing/landing-diagrams";

const GITHUB = "https://github.com/dineshkorukonda/VersionGate";
const INSTALL = "curl -fsSL https://versiongate.tech/install.sh | sudo bash";

export default function Home() {
  return (
    <div className="vg-landing min-h-screen">
      <LandingShellHeader />

      <main className="mx-auto max-w-2xl px-6 py-14 space-y-16">
        <section id="overview" className="scroll-mt-24">
          <p className="vg-kicker">self-hosted deploy engine</p>
          <h1 className="mt-4 font-mono text-2xl font-semibold leading-snug tracking-tight text-[var(--vg-text)] sm:text-[1.65rem]">
            Blue/green Docker deploys — one container per environment.
          </h1>
          <p className="mt-6 font-mono text-[13px] leading-relaxed text-[var(--vg-muted)]">
            I built VersionGate to run my own apps on a VPS: git push builds on an idle host port, a health check
            gates the Nginx reload, rollback reuses a cached image tag. Dashboard, HTTP API, and webhooks — no CLI
            binary, no hosted service.
          </p>

          <div className="mt-8 vg-callout">
            One Docker container per project per environment. No docker-compose in src/. Pack multi-service apps into
            one container or supply your own Dockerfile.
          </div>

          <div className="mt-8 flex flex-wrap gap-6">
            <Link href="#run" className="vg-btn">
              Install
            </Link>
            <Link href={GITHUB} target="_blank" rel="noreferrer" className="vg-btn">
              Source
            </Link>
            <Link href="/docs" className="vg-link-muted">
              documentation
            </Link>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="vg-kicker">stack</p>
              <div className="mt-4">
                <LandingStack />
              </div>
            </div>
            <LandingHeroDiagram />
          </div>
        </section>

        <section id="pipeline" className="scroll-mt-24">
          <h2 className="vg-heading">Deploy pipeline</h2>
          <p className="mt-3 font-mono text-[11px] text-[var(--vg-muted)]">
            Worker steps in deploy.handler.ts
          </p>
          <div className="mt-6">
            <LandingPipeline />
          </div>
          <div className="mt-6">
            <JobLogPanel />
          </div>
        </section>

        <section id="spec" className="scroll-mt-24">
          <h2 className="vg-heading">Engine spec</h2>
          <p className="mt-3 font-mono text-[11px] text-[var(--vg-muted)]">
            Features in src/ — endpoints, mechanisms, limits
          </p>
          <div className="mt-6">
            <FeatureReference sections={SPEC_SECTIONS} />
          </div>
        </section>

        <section id="api" className="scroll-mt-24">
          <h2 className="vg-heading">HTTP surface</h2>
          <p className="mt-3 font-mono text-[11px] text-[var(--vg-muted)]">
            Session cookie or Authorization: Bearer vg_live_*
          </p>
          <div className="mt-6">
            <ApiSurface />
          </div>
        </section>

        <section id="run" className="scroll-mt-24">
          <h2 className="vg-heading">Run it</h2>
          <p className="mt-3 font-mono text-[11px] text-[var(--vg-muted)]">
            install.sh on the host, then dashboard or curl
          </p>

          <div className="mt-6 space-y-8">
            <div>
              <p className="vg-kicker">install</p>
              <pre className="mt-3 overflow-x-auto font-mono text-[12px] text-[var(--vg-text)] vg-rule pb-4">
                <code>{INSTALL}</code>
              </pre>
            </div>

            <div>
              <p className="vg-kicker">ci deploy</p>
              <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-[var(--vg-text)] vg-rule pb-4">
                <code>{`curl -X POST "$VG_URL/api/v1/deploy" \\
  -H "Authorization: Bearer $VG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"...","environmentId":"..."}'`}</code>
              </pre>
            </div>

            <ul className="space-y-2 font-mono text-[11px] text-[var(--vg-muted)]">
              <li className="vg-rule pb-2">
                <span className="text-[var(--vg-text)]">rollback</span> POST /api/v1/projects/:id/rollback
              </li>
              <li className="vg-rule pb-2">
                <span className="text-[var(--vg-text)]">promote</span> POST
                /api/v1/projects/:id/environments/:envId/promote
              </li>
              <li className="vg-rule pb-2">
                <span className="text-[var(--vg-text)]">logs</span> WS /api/v1/logs/:jobId
              </li>
              <li className="vg-rule pb-2">
                <span className="text-[var(--vg-text)]">stage</span> GET /p/:project/:env/
              </li>
            </ul>

            <p className="font-mono text-[11px]">
              <Link href="/docs/quick-start" className="vg-link">
                quick-start docs
              </Link>
              <span className="text-[var(--vg-muted)]"> / </span>
              <Link href="/docs/troubleshooting" className="vg-link">
                domain troubleshooting
              </Link>
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
