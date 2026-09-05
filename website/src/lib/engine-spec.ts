export interface SpecItem {
  id: string;
  name: string;
  summary: string;
  mechanism?: string;
  api?: string;
  source: string;
  limit?: string;
}

export interface SpecSection {
  id: string;
  title: string;
  blurb: string;
  items: SpecItem[];
}

export const STACK = [
  { name: "Bun", role: "Runtime + API server (:9090)" },
  { name: "Fastify", role: "HTTP API, WebSocket job logs, stage proxy" },
  { name: "PostgreSQL", role: "Projects, deployments, jobs, auth" },
  { name: "Redis", role: "Optional deploy locks + log pub/sub" },
  { name: "Docker", role: "Single container per environment" },
  { name: "Nginx", role: "Production upstream reload" },
  { name: "Drizzle ORM", role: "Schema sync on boot" },
] as const;

export const PIPELINE_STEPS = [
  { n: "1", label: "enqueue", detail: "POST /deploy or webhook → DEPLOY job (SKIP LOCKED claim)" },
  { n: "2", label: "source", detail: "git pull branch → ensureDockerfile() → docker build" },
  { n: "3", label: "slot", detail: "Idle BLUE/GREEN on basePort or basePort+1" },
  { n: "4", label: "health", detail: "GET healthPath (+ /, /index.html fallbacks)" },
  { n: "5", label: "traffic", detail: "nginx -s reload when env name is production" },
  { n: "6", label: "retire", detail: "Stop previous slot container; mark ROLLED_BACK" },
] as const;

export const SPEC_SECTIONS: SpecSection[] = [
  {
    id: "deploy",
    title: "Deploy pipeline",
    blurb: "Blue/green single-container deploys. One image build per job.",
    items: [
      {
        id: "bluegreen",
        name: "Blue/green slot deploy",
        summary: "Alternates BLUE and GREEN host ports per environment.",
        mechanism:
          "deploy.handler picks opposite color from ACTIVE record, builds versiongate-{project}:{timestamp}, runs container, validates HTTP health, switches Nginx for production only.",
        api: "POST /api/v1/deploy",
        source: "worker/handlers/deploy.handler.ts",
        limit: "One concurrent deploy per environment (Redis + DB lock). No docker-compose.",
      },
      {
        id: "dockerfile",
        name: "Auto Dockerfile",
        summary: "Generates Dockerfile when missing; respects user Dockerfiles without auto marker.",
        mechanism:
          "Detection order: package.json (npm/yarn/pnpm/bun), requirements.txt, go.mod, index.html. Scans build context, repo root, subdirs.",
        source: "utils/dockerfile.ts",
        limit: "Python CMD defaults to python app.py. Throws if type undetectable.",
      },
      {
        id: "health",
        name: "Pre-traffic validation",
        summary: "HTTP probes before Nginx reload.",
        mechanism:
          "ValidationService: primary healthPath, fallbacks / and /index.html, crash-loop via restart count, container log excerpt on failure.",
        source: "services/validation.service.ts",
        limit: "15 retries, 5s timeout, 2s delay (config.validation).",
      },
      {
        id: "cancel",
        name: "Cancel deploy",
        summary: "Aborts in-flight DEPLOYING on default environment.",
        mechanism: "Stops container, marks FAILED, releases deploy lock.",
        api: "POST /api/v1/projects/:id/cancel-deploy",
        source: "services/deployment.service.ts",
        limit: "Default (production) env only; does not cancel PENDING queue jobs.",
      },
    ],
  },
  {
    id: "rollback-promote",
    title: "Rollback & promote",
    blurb: "Reuse local images. Promote between stages without rebuild.",
    items: [
      {
        id: "rollback",
        name: "Warm-swap rollback",
        summary: "Restore previous deployment record.",
        mechanism:
          "imageExists() → skip git/build → runContainer(previous.imageTag) → validate → switchTrafficTo. Logs [WARM-SWAP] when cached.",
        api: "POST /api/v1/projects/:id/rollback · POST .../environments/:envId/rollback",
        source: "worker/handlers/rollback.handler.ts",
        limit: "Needs ≥2 deployment records. Always switches traffic (all env names).",
      },
      {
        id: "promote",
        name: "Stage promotion",
        summary: "Copy ACTIVE image from source env to target without rebuild.",
        mechanism: "promote.handler runs container on target blue/green slot; records promotedFromId.",
        api: "POST /api/v1/projects/:id/environments/:envId/promote",
        source: "worker/handlers/promote.handler.ts",
        limit: "Source must be ACTIVE. Target env vars apply, not source's.",
      },
    ],
  },
  {
    id: "github",
    title: "GitHub integrations",
    blurb: "Per-project webhooks, GitHub App, and optional central relay.",
    items: [
      {
        id: "webhook-secret",
        name: "Secret URL webhook",
        summary: "Push → branch-matched environments → DEPLOY jobs.",
        mechanism: "webhook.controller filters environments by refs/heads/{branch}.",
        api: "POST /api/v1/webhooks/:secret",
        source: "controllers/webhook.controller.ts",
        limit: "No HMAC — secret is the URL path. Push events only.",
      },
      {
        id: "github-app",
        name: "GitHub App webhooks",
        summary: "Install flow + signed push delivery.",
        mechanism: "verifyGithubWebhookSignature (X-Hub-Signature-256). Matches repo URL to projects.",
        api: "POST /api/webhooks/github · GET /api/auth/github/install",
        source: "controllers/github-app.controller.ts",
        limit: "Requires GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET.",
      },
      {
        id: "relay",
        name: "Central relay fan-out",
        summary: "versiongate.tech forwards webhooks to self-hosted instances.",
        mechanism: "verifyRelayHopSignature (X-VG-Relay-Signature). registerInstallationWithRelay on install.",
        api: "POST /api/webhooks/github/relay",
        source: "utils/github/github-relay.ts",
        limit: "Shared GITHUB_STATE_SECRET with relay. For NAT/self-hosted without direct GitHub delivery.",
      },
      {
        id: "repos",
        name: "Repo & branch discovery",
        summary: "List repos/branches via Octokit or relay fallback.",
        mechanism: "Direct Octokit with installation token; fetchReposFromRelay / fetchBranchesFromRelay on fallback.",
        api: "GET /api/github/repos · GET /api/github/repos/:owner/:repo/branches",
        source: "controllers/github-app.controller.ts",
      },
      {
        id: "pipeline-gen",
        name: "CI YAML generation",
        summary: "Gemini-generated GitHub Actions workflow for a project.",
        mechanism: "Calls Google Gemini API with project context; returns workflow YAML for webhookUrl.",
        api: "POST /api/v1/projects/:id/generate-pipeline",
        source: "controllers/project.controller.ts",
        limit: "Requires GEMINI_API_KEY on server.",
      },
    ],
  },
  {
    id: "network",
    title: "Networking & proxy",
    blurb: "Nginx for production traffic; Fastify for stage paths.",
    items: [
      {
        id: "nginx",
        name: "Nginx upstream switch",
        summary: "Atomic production traffic move.",
        mechanism: "TrafficService writes upstream, backup .bak, nginx -s reload, restore on failure.",
        source: "services/traffic.service.ts",
        limit: "NGINX_CONFIG_PATH default /etc/nginx/conf.d/upstream.conf. sudo -n fallback.",
      },
      {
        id: "stage-proxy",
        name: "Stage path proxy",
        summary: "HTTP access to non-production deploys without exposing host ports.",
        mechanism:
          "ProxyService resolves ACTIVE deployment → /p/:project/:env/*. Rewrites Next.js, Vite, /static/ asset paths.",
        api: "ALL /p/:projectName/:envName/*",
        source: "services/proxy.service.ts · routes/proxy.routes.ts",
        limit: "No auth. 127.0.0.1:{hostPort} only.",
      },
      {
        id: "certbot",
        name: "Certbot TLS",
        summary: "Let's Encrypt via nginx plugin from Settings.",
        api: "POST /api/v1/settings/ssl/certbot",
        source: "controllers/settings.controller.ts · utils/certbot-path.ts",
        limit: "Domain required (not raw IP). Port 80 reachable.",
      },
      {
        id: "project-domain",
        name: "Project custom domains",
        summary: "Production hostname per project with isolated nginx files.",
        mechanism:
          "project-domain.service writes vg-app-{project}.upstream.conf and per-host server blocks. syncCustomDomainUpstream runs after switchTrafficTo. Certbot uses CERTBOT_EMAIL without modifying PUBLIC_DOMAIN.",
        api: "GET/POST /api/v1/projects/:id/domains · POST .../domains/:domainId/ssl",
        source: "services/project-domain.service.ts · utils/nginx-app-domain.ts",
        limit: "Production only in v1. One hostname per project. Staging domains later.",
      },
      {
        id: "domain-diag",
        name: "Public domain diagnosis",
        summary: "Engine healthy is not the same as the hostname opening in a browser.",
        mechanism:
          "Layered checks: 127.0.0.1:9090, nginx loopback, Host header, TLS via --resolve, then dig on the VPS vs 8.8.8.8 vs the laptop resolver.",
        source: "website/src/app/docs/troubleshooting/page.tsx",
        limit:
          "Hairpin NAT hangs curl to the public IP from the VPS. NGINX_CONFIG_PATH defaults to upstream.conf. Nested Cloudflare subdomains can NXDOMAIN on some resolvers.",
      },
    ],
  },
  {
    id: "auth",
    title: "Auth & API access",
    blurb: "Session cookies for dashboard; Bearer tokens for CI.",
    items: [
      {
        id: "session",
        name: "Session auth",
        summary: "Scrypt passwords, 7-day cookie sessions.",
        api: "POST /api/v1/auth/login · POST /api/v1/auth/register",
        source: "services/auth.service.ts",
        limit: "Min password 10 chars. COOKIE_SECURE for HTTPS-only cookies.",
      },
      {
        id: "tokens",
        name: "Bearer API tokens",
        summary: "vg_live_* tokens, SHA-256 stored.",
        api: "POST /api/v1/auth/tokens · Authorization: Bearer on /api/v1/*",
        source: "middleware/require-api-auth.ts",
        limit: "Raw token shown once at creation.",
      },
      {
        id: "env-crypto",
        name: "Encrypted env vars",
        summary: "Project + per-environment overrides merged at deploy.",
        api: "PATCH /api/v1/projects/:id/env · PATCH .../environments/:envId/env",
        source: "utils/env.ts · utils/crypto.ts",
        limit: "ENCRYPTION_KEY required. Applied on next deploy, not live reload.",
      },
    ],
  },
  {
    id: "queue",
    title: "Job queue & worker",
    blurb: "PostgreSQL queue with optional in-process or PM2 worker.",
    items: [
      {
        id: "jobs",
        name: "Job types",
        summary: "DEPLOY, ROLLBACK, PROMOTE — JSONB log append on jobs row.",
        api: "GET /api/v1/jobs/:id · DELETE /api/v1/jobs/:id (PENDING only)",
        source: "services/job-queue.service.ts",
        limit: "FOR UPDATE SKIP LOCKED claims. Cannot cancel RUNNING via job API.",
      },
      {
        id: "worker",
        name: "Worker modes",
        summary: "IN_PROCESS_WORKER=true polls inside API; false = separate process.",
        source: "worker/in-process.ts · worker/index.ts",
        limit: "PM2: set IN_PROCESS_WORKER=false on API, run versiongate-worker separately.",
      },
      {
        id: "ws-logs",
        name: "WebSocket job logs",
        summary: "Live log stream during worker jobs.",
        api: "WS /api/v1/logs/:jobId",
        source: "routes/logs.routes.ts · events/log-emitter.ts",
        limit: "Redis pub/sub when available.",
      },
      {
        id: "redis",
        name: "Redis (optional)",
        summary: "Deploy lock keys env:{id} + log pub/sub.",
        source: "services/redis.service.ts · repositories/environment.repository.ts",
        limit: "Degrades to PostgreSQL lockedAt only if Redis down.",
      },
    ],
  },
  {
    id: "ops",
    title: "Operations & monitoring",
    blurb: "Host checks, health audits, reconciliation, self-update.",
    items: [
      {
        id: "preflight",
        name: "Host preflight",
        summary: "Bun, Git, Docker, nginx, certbot, DNS, firewall checks.",
        api: "GET /api/v1/system/preflight",
        source: "services/preflight.service.ts",
        limit: "Public, no DB required.",
      },
      {
        id: "engine-health",
        name: "Engine health monitor",
        summary: "30s tick: DB latency, Redis, container inspect, CPU/RAM/disk alerts.",
        api: "GET /api/v1/system/engine-health",
        source: "services/engine-monitor.service.ts",
      },
      {
        id: "container-mon",
        name: "Container monitor",
        summary: "60s tick marks ACTIVE deployments FAILED if container gone.",
        source: "services/container-monitor.service.ts",
        limit: "Does not auto-restart failed containers.",
      },
      {
        id: "reconcile",
        name: "Reconciliation",
        summary: "Boot recovery: stuck DEPLOYING, stale locks, orphaned RUNNING jobs.",
        api: "POST /api/v1/system/reconcile",
        source: "services/reconciliation.service.ts",
      },
      {
        id: "metrics",
        name: "Project metrics & logs",
        summary: "Docker stats + last 200 log lines for active production deploy.",
        api: "GET /api/v1/projects/:id/metrics · GET /api/v1/projects/:id/logs",
        source: "controllers/metrics.controller.ts",
      },
      {
        id: "self-update",
        name: "Git self-update",
        summary: "git pull, bun install, schema sync, dashboard build, PM2 reload.",
        api: "POST /api/v1/settings/self-update/apply · GET .../progress",
        source: "services/self-update.service.ts",
        limit: "Git clone installs only. SELF_UPDATE_SECRET for system endpoints.",
      },
      {
        id: "setup",
        name: "Setup wizard",
        summary: "First-run .env, DB sync, admin user, nginx vhost, post-setup hooks.",
        api: "GET /api/v1/setup/status · POST /api/v1/setup/apply",
        source: "controllers/setup.controller.ts",
        limit: "409 if DATABASE_URL already set.",
      },
    ],
  },
  {
    id: "data",
    title: "Data model",
    blurb: "Three default environments per project at creation.",
    items: [
      {
        id: "envs",
        name: "Environments",
        summary: "development (+400 port offset), staging (+200), production (basePort).",
        api: "GET /api/v1/projects/:id/environments",
        source: "repositories/project.repository.ts",
        limit: "Fixed at project create — no add/delete env API.",
      },
      {
        id: "deployments",
        name: "Deployment records",
        summary: "Versioned BLUE/GREEN slots: PENDING, DEPLOYING, ACTIVE, FAILED, ROLLED_BACK.",
        mechanism: "One ACTIVE record per environment; version increments per deploy.",
        source: "db/schema.ts · repositories/deployment.repository.ts",
      },
    ],
  },
];

export const API_GROUPS = [
  {
    group: "Deploy & jobs",
    routes: [
      "POST /api/v1/deploy",
      "GET /api/v1/deployments",
      "GET /api/v1/jobs · GET /api/v1/jobs/:id",
      "POST /api/v1/projects/:id/rollback",
      "POST /api/v1/projects/:id/environments/:envId/rollback",
      "POST /api/v1/projects/:id/environments/:envId/promote",
    ],
  },
  {
    group: "Projects",
    routes: [
      "POST|GET /api/v1/projects",
      "GET|PATCH|DELETE /api/v1/projects/:id",
      "PATCH /api/v1/projects/:id/env",
      "POST /api/v1/projects/:id/generate-pipeline",
    ],
  },
  {
    group: "Public / unauthenticated",
    routes: [
      "GET /health",
      "GET|POST /api/v1/setup/*",
      "POST /api/v1/auth/*",
      "POST /api/v1/webhooks/:secret",
      "POST /api/webhooks/github · /relay",
      "GET /api/v1/system/preflight",
      "ALL /p/:project/:env/*",
    ],
  },
] as const;

export const DEPLOY_LOG = [
  "Starting deployment pipeline for project my-app (proj_abc), env production (env_prod)",
  "Step 1: Preparing source code (branch main)",
  "Step 2: Determining blue/green target",
  "Target: color=GREEN, hostPort=3101, container=my-app-production-green, image=versiongate-my-app:1710000000000",
  "Step 4: Building Docker image",
  "Step 5: Starting container",
  "Step 6: Health check http://localhost:3101/health",
  "Step 7: Switching traffic to port 3101",
  "Deployment successful — my-app-production-green is live on port 3101",
  "Deploy lock released",
];
