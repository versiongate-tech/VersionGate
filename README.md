# VersionGate

Self-hosted deployment engine for **one Docker container per project per environment**. Each deploy uses a single build context, a single Dockerfile, and runs on a BLUE/GREEN host port pair (`basePort` / `basePort + 1`). There is no docker-compose or multi-service orchestration.

Push to GitHub (or call the API), VersionGate builds the container on the idle slot, runs HTTP health checks, reloads Nginx upstream for production, and can roll back by re-running a previously built image tag.

---

## Quick install (Ubuntu / Debian / RHEL)

```bash
curl -fsSL https://versiongate.tech/install.sh | sudo bash
```

With a domain and automatic TLS:

```bash
DOMAIN=versiongate.tech curl -fsSL https://versiongate.tech/install.sh | sudo bash
```

Open the setup wizard at `http://your-server-ip/` or `https://your-domain/` when `DOMAIN` is set.

> **Azure VM:** Allow inbound TCP ports `80`, `443`, and `9090` in the VM NSG if the dashboard/API must be reachable from outside.

> **Domain not opening while VersionGate says working:** PM2 online and preflight DNS are measured on the VPS. They do not prove your laptop can resolve the hostname. Do not `curl` the public IP from the VPS (hairpin NAT hangs on Proxmox / NAT hosts). Use [Domain troubleshooting](https://versiongate.tech/docs/troubleshooting).

---

## Core capabilities

- **Single-container blue/green deploys** — one Docker image and one container per environment; idle slot on `basePort` or `basePort + 1`.
- **Health-gated traffic switch** — HTTP GET on `project.healthPath` before Nginx reload; failed deploys stop the new container and leave the active slot serving traffic.
- **Nginx upstream reload** — `nginx -s reload` after writing upstream config; production environment only (`name === "production"`).
- **Warm-swap rollback** — reuses a local Docker image tag when present; skips git pull and rebuild when starting the previous container record.
- **Stage path proxy** — Fastify routes `/p/:projectName/:envName/*` to the active container port for non-production access without exposing host ports.
- **Bearer API tokens** — `vg_live_...` tokens stored as SHA-256 hashes; `Authorization: Bearer` on `/api/v1/*`.
- **Per-environment env overrides** — `{ ...projectEnv, ...stageEnv }` merged at container start.
- **GitHub integration** — per-project webhook URL (`/api/v1/webhooks/:secret`) or GitHub App with HMAC verification (`/api/webhooks/github`) and optional central relay.
- **Background health monitor** — 30s interval: PostgreSQL latency, Redis availability, container inspect, CPU/RAM/disk (`GET /api/v1/system/engine-health`).
- **Auto Dockerfile generation** — detects, in order: `package.json` (Node), `requirements.txt` (Python), `go.mod` (Go), `index.html` (static nginx); first match per scanned directory.
- **Job worker** — PostgreSQL `SKIP LOCKED` job claims; optional in-process worker (`IN_PROCESS_WORKER=true`) or separate PM2 worker process.

---

## License

MIT License. Created by Dinesh Korukonda.
