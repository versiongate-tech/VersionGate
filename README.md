# VersionGate

Self-hosted zero-downtime deployment engine. Push to GitHub → VersionGate pulls the source, builds a Docker image, spins up the new container, switches Nginx traffic, and tears down the old one — all without a single second of downtime.

Built for single-server (KVM/VPS) setups where you want Vercel-style deployments on your own hardware.

---

## What It Does

- **Blue-green deployments** — every project gets two container slots (blue/green). Deploys always target the idle slot; live traffic is never touched until the new container is confirmed healthy.
- **Webhook auto-deploy** — add your project's webhook URL to GitHub and every push to the configured branch triggers a deploy automatically.
- **One-click rollback** — restore the previous deployment instantly via the dashboard or API.
- **Crash recovery** — on restart, stale `DEPLOYING` records are marked `FAILED` and orphaned containers are cleaned up automatically.
- **AI CI pipeline generation** — generate a GitHub Actions workflow for any project with a single API call (requires Gemini API key).

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.x + TypeScript |
| API server | Fastify |
| Database | PostgreSQL via Prisma (Neon serverless supported) |
| Containers | Docker CLI |
| Proxy | Nginx upstream config management |
| Process manager | PM2 |
| Dashboard | Next.js (static export, served by Fastify) |

---

## Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Docker (running)
- Nginx (installed)
- PostgreSQL — local or [Neon](https://neon.tech) free tier
- PM2 — `npm i -g pm2`

### 1. Clone and install

```bash
git clone https://github.com/dinexh/VersionGate
cd VersionGate
bun install
cd dashboard && bun install && bun run build && cd ..
```

### 2. Start the engine

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### 3. Complete setup in the UI

Navigate to `http://your-server-ip:9090/setup` in your browser.

Enter:

- Your **PostgreSQL connection string**
- Your **domain or server IP**
- Optional **Gemini API key**

The setup wizard will then:

- Write the `.env` file
- Set `PROJECTS_ROOT_PATH`
- Generate and persist `ENCRYPTION_KEY`
- Run `bunx prisma generate`
- Run `bunx prisma migrate deploy` (falls back to `db push` only if the database has no migration history)
- Write and reload Nginx config when permissions allow

After setup finishes, open the dashboard and start adding projects.

No manual `.env` edits or Prisma commands are required after opening `/setup`.

---

## Docs

- [Setup & API](docs/SETUP.md) — detailed setup, environment variables, full API reference
- [Architecture](docs/ARCHITECTURE.md) — deployment pipeline, blue-green state diagrams, rollback flow, crash recovery
