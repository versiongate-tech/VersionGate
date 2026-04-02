# VersionGate — Setup Guide

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- Docker (running)
- Nginx (installed)
- PostgreSQL — local, or [Neon](https://neon.tech) (free tier works)
- PM2 — `npm i -g pm2`
- Git

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/dinexh/VersionGate
cd VersionGate
bun install
```

### 2. Build the dashboard

```bash
cd dashboard && bun install && bun run build && cd ..
```

This produces `dashboard/out/` — a static export served by the engine.

### 3. Start the engine

**Production (PM2):**
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

**Development (watch mode):**
```bash
bun --watch src/server.ts
```

### 4. Complete setup via the wizard

Open `http://your-server-ip:9090/setup` in your browser.

Fill in:

| Field | Example |
|-------|---------|
| Domain | `engine.example.com` |
| PostgreSQL URL | `postgresql://user:pass@host:5432/db` |
| Gemini API key | `AIza...` (optional) |

Click **Apply & Start Engine**. The wizard will:

1. Write `.env` to the repo root
2. Run `bunx prisma migrate deploy` (applies versioned migrations; falls back to `db push` for legacy databases)
3. Write an Nginx reverse-proxy config and reload Nginx
4. Restart the engine via PM2 (autorestart)
5. Redirect you to `http://your-domain`

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `9090` | API + dashboard server port |
| `DOCKER_NETWORK` | No | `versiongate-net` | Docker network for containers |
| `NGINX_CONFIG_PATH` | No | `/etc/nginx/conf.d/upstream.conf` | Nginx upstream file path |
| `PROJECTS_ROOT_PATH` | No | `/var/versiongate/projects` | Root dir for cloned repos |
| `MONIX_PATH` | No | `/opt/monix` | Path to Monix binary (server stats) |
| `MONIX_PORT` | No | `3030` | Monix metrics port |
| `GEMINI_API_KEY` | No | — | Google AI Studio key for CI pipeline generation |
| `GEMINI_MODEL` | No | `gemini-2.5-pro` | Gemini model ID |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace` `debug` `info` `warn` `error`) |
| `PRISMA_SCHEMA_SYNC` | No | `migrate` | `migrate` = `prisma migrate deploy` (with `db push` fallback on failure); `push` = `db push` only (legacy / dev) |

---

## API Reference

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/projects` | Create project |
| `GET` | `/api/v1/projects` | List all projects |
| `GET` | `/api/v1/projects/:id` | Get project |
| `PATCH` | `/api/v1/projects/:id` | Update branch / port / buildContext |
| `PATCH` | `/api/v1/projects/:id/env` | Update env vars |
| `DELETE` | `/api/v1/projects/:id` | Delete project |
| `POST` | `/api/v1/projects/:id/rollback` | Rollback to previous deployment |
| `POST` | `/api/v1/projects/:id/cancel-deploy` | Cancel in-progress deployment |
| `POST` | `/api/v1/projects/:id/generate-pipeline` | AI-generate GitHub Actions CI YAML |

### Deployments

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/deploy` | Trigger deployment `{ projectId }` |
| `GET` | `/api/v1/deployments` | List all deployments |
| `GET` | `/api/v1/status` | Current active deployment |

### Webhooks & System

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/webhooks/:secret` | GitHub push webhook (auto-deploy) |
| `GET` | `/api/v1/system/server-stats` | Host CPU / memory / disk / network |
| `GET` | `/api/v1/system/server-dashboard` | Full server dashboard data |
| `POST` | `/api/v1/system/reconcile` | Manual crash recovery trigger |
| `GET` | `/health` | Engine health check |

### Setup

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/setup/status` | Returns `{ configured: boolean }` |
| `POST` | `/api/v1/setup/apply` | Apply initial config `{ domain, databaseUrl, geminiApiKey? }` |
