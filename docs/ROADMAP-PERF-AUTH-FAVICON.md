# Roadmap: dashboard performance, caching, authentication, favicon

This document captures findings from production logs (April 2026) and a phased plan. It is intentionally high-level; implement in focused PRs.

---

## 1. What you are seeing

### 1.1 Slow “open project” and overview

From API logs on a small droplet (`512MB`, heavy parallel traffic):

- `GET /api/v1/setup/status` often **~1.7–1.8s**
- `GET /api/v1/jobs` (limit 5) **~2.5–4s**
- `GET /api/v1/deployments` **~1.1–2.7s**
- Per-project `GET .../jobs?limit=1` **~1.1–1.7s** each (Overview fires **one per project** in parallel)

The dashboard loads many endpoints at once; each waits on Postgres + Node. Under memory and disk pressure, latency multiplies.

### 1.2 Host constraints (critical)

MOTD showed **`/` at 99% of 8.65GB**. That alone causes:

- Slow writes (logs, Docker layers, npm, Prisma)
- Risk of `ENOSPC` during builds
- Higher DB and process latency

**Action before or in parallel with code changes:** free disk (clean Docker `docker system prune`, old images, logs, apt cache), resize volume or droplet if needed.

### 1.3 Worker / DB

Worker log showed **`PrismaClientKnownRequestError` `P2028`** — *Unable to start a transaction in the given time.* That indicates DB overload, lock contention, or disk I/O starvation—not something client-side caching fixes by itself.

---

## 2. Favicon not showing

### Cause

Vite only copies static files from **`dashboard/public/`** into the build output root (`dashboard/out/`). The backend serves `dashboard/out` as static files; `index.html` references `/favicon.svg`.

If `favicon.svg` lives only beside `index.html` in source **or only on the server** but not under `public/`, it **will not** appear in `out/` after `bun run build`, so `/favicon.svg` 404s or falls through to SPA `index.html`.

### Fix (operator + repo)

1. Put the asset at **`dashboard/public/favicon.svg`** (this branch adds a **placeholder** you can replace with your own artwork).
2. Rebuild: `cd dashboard && bun install && bun run build` — confirm **`dashboard/out/favicon.svg`** exists.
3. Restart / redeploy the API so it serves the new `out/` tree.
4. Hard-refresh the browser (cache).

Optional: add `public/favicon.ico` for older clients; keep `<link rel="icon" ...>` in `index.html` pointing at files that exist in `out/`.

---

## 3. Caching and performance plan (phased)

### Phase A — Quick wins (low risk)

| Item | Description |
|------|-------------|
| **Reduce parallel fan-out** | Overview currently loads `listProjectJobs` per project; replace with **one** endpoint e.g. `GET /api/v1/jobs/latest-per-project` or batch query server-side. |
| **Client SWR / React Query** | Dedupe in-flight requests, `staleTime` for lists (e.g. 5–15s), background refresh. Cuts duplicate work when navigating. |
| **HTTP headers** | For read-only JSON `GET`s, add `Cache-Control: private, max-age=0, must-revalidate` **or** short `max-age` where safe; add **ETag** from hash of payload or `updatedAt` max for conditional `304`. |
| **Prisma** | Review indexes on `Job`, `Deployment`, `Project` for list/sort paths; ensure connection pool size suits the droplet (avoid opening too many concurrent queries). |

### Phase B — Server-side cache (medium effort)

| Item | Description |
|------|-------------|
| **In-memory TTL cache** | Small LRU or key-value with TTL (e.g. 5–10s) for heavy read handlers: `list projects`, `list deployments`, `list jobs` with same query params. **Invalidate** on POST/PATCH/DELETE that affect that data. |
| **Separate read replicas** | Only if DB becomes the bottleneck at scale; not required for a single small VM if disk/RAM are fixed. |

### Phase C — Dashboard UX

- Skeletons already help; add **prefetch** on hover for project rows (optional).
- Debounce or stagger polls on Host metrics if multiple tabs open.

---

## 4. Authentication plan (dashboard + API)

Today the dashboard and `/api/v1` are effectively **open** on the same origin as long as something proxies to the API. For a self-hosted control plane, pick one or combine:

### Option 1 — Reverse proxy auth (fastest)

- Put **Caddy / Nginx / Traefik** in front with **basic auth** or **OAuth2 proxy** (Google/GitHub).
- Pros: no app code. Cons: coarse-grained; WebSockets need same auth pass-through.

### Option 2 — API keys or Bearer tokens

- Add `Authorization: Bearer <token>` (or `X-API-Key`) checked in Fastify `onRequest` for `/api/v1/*`, allowlist `/health`, `/api/v1/setup/*` when not configured.
- Store hashed tokens in DB or env `VERSIONGATE_ADMIN_TOKEN`.
- Dashboard: login form stores token in `sessionStorage` or httpOnly cookie set by a small login route.

### Option 3 — Session login (full product)

- User table + bcrypt + signed cookie or JWT refresh.
- Roles later (`viewer` vs `admin`).

### Suggested order

1. **Single admin token** in env + Bearer check (minimal code, big security win).
2. **Login page** that sets cookie / storage.
3. Optional: **OAuth** if you need SSO.

Document env vars and rotation in `AGENTS.md` / operator docs when implemented.

---

## 5. Suggested implementation order (PRs)

1. **Ops:** disk + Docker cleanup; confirm Postgres and PM2 stable.
2. **Favicon:** `dashboard/public/favicon.svg` + rebuild verification.
3. **API:** batch or combined endpoint for Overview job summaries; reduce N+1.
4. **Dashboard:** TanStack Query (or SWR) with sane `staleTime`.
5. **API:** optional short TTL cache + invalidation for list endpoints.
6. **Auth:** Bearer token middleware + dashboard login shell.

---

## 6. References in this repo

- Static dashboard: `src/app.ts` — `@fastify/static` root `dashboard/out`.
- SPA fallback: non-`/api/` GETs serve `index.html` — wrong `favicon` path without a real file in `out/`.
- Dashboard build: `dashboard/vite.config.ts` — `outDir: 'out'`; default `public/` → output root.

---

*Branch: `plan/perf-cache-auth-favicon` — planning doc only unless follow-up commits add code.*
