# Project Custom Domains Design Spec

Date: 2026-09-05
Status: draft pending review
Scope: production hostnames on existing and new projects, any deploy state. Stage hostnames are deferred.

## Problem

VersionGate already has one dashboard hostname (`PUBLIC_DOMAIN`). Deployed apps are only reachable at `/p/<project>/<environment>`. A customer cannot point `myapp.com` at a project. `generateAppNginxConf` exists in tests only.

## Goals

- Any project can attach a production domain: just created, never deployed, ACTIVE, FAILED, DEPLOYING, or rolled back.
- New projects get the same control. No special migration for old rows beyond a new table (Drizzle schema sync on boot).
- DNS + nginx vhost first; Certbot HTTPS when the operator asks (same idea as dashboard SSL).
- Path URLs (`/p/...`) stay working.
- Stage-based domains are a later milestone. The schema must not block them.

## Non-goals (v1)

- Staging or development hostnames (API returns 400 if `environmentName` is not `production`).
- Wildcard certificates.
- Auto-Certbot on save (operator clicks Obtain SSL after DNS).
- Changing `PUBLIC_DOMAIN` or writing `/etc/nginx/conf.d/upstream.conf` / `sites-available/versiongate` / `conf.d/versiongate.conf`.

---

## 1. Data model

New table `ProjectDomain` (Drizzle, synced on boot):

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUID |
| projectId | text FK Project | cascade delete |
| hostname | text | unique globally, lowercase, `isValidHostname`, not equal to `PUBLIC_DOMAIN` |
| environmentName | text | v1 always `production` |
| sslStatus | text | `pending_dns` / `http` / `issued` / `failed` |
| lastError | text nullable | last DNS or certbot error (truncated) |
| createdAt / updatedAt | timestamptz | |

Indexes: unique `hostname`; index `projectId`.

v1 UI: one primary hostname per project is enough. The table allows more rows later (www + apex, then staging). API may accept a second production hostname in v1 if it is unique (apex + www). Reject a second row for the same project+hostname.

`projects` table is unchanged. Do not add a single `customDomain` column.

---

## 2. Port / state resolution

Domain attach does **not** require an ACTIVE deployment.

Resolve the upstream port for `production` as:

1. Latest `Deployment` with `status = ACTIVE` on the production environment → use `deployment.port`.
2. Else no live container → holding mode (HTTP 503), not the dashboard on 9090.

Do **not** point the customer hostname at:

- a DEPLOYING slot (idle blue/green) until health checks pass and `switchTrafficTo` runs
- `127.0.0.1:9090` (would show VersionGate login on the customer domain)
- a FAILED or ROLLED_BACK row when an ACTIVE row exists

| Project / production state | After domain attach | After later deploy |
|---|---|---|
| Never deployed | 503 holding vhost; SSL still allowed | First ACTIVE production deploy writes real upstream |
| ACTIVE | Proxy to current production port immediately | Blue/green rewrite upstream only |
| DEPLOYING, prior ACTIVE | Keep prior ACTIVE port | Switch on success |
| DEPLOYING, no prior ACTIVE | Stay 503 | Switch on success |
| Last deploy FAILED, prior ACTIVE remains | Proxy to remaining ACTIVE | Unchanged until next success |
| Last deploy FAILED, no ACTIVE | 503 | Switch on success |
| Rolled back to prior ACTIVE | Proxy to that ACTIVE port | Same as deploy |

On project delete: delete DB rows and remove both nginx files, then `nginx -t && reload`.

---

## 3. Nginx files

Per project (sanitize name like existing `sanitizeNginxIdentifier`):

```text
/etc/nginx/conf.d/vg-app-<project>.upstream.conf
/etc/nginx/conf.d/vg-app-<project>.conf
```

**Never write app vhosts to** `NGINX_CONFIG_PATH` (defaults to `upstream.conf`), the installer site, or the dashboard Certbot file.

Upstream file (rewritten on every production traffic switch and on attach when an ACTIVE port exists):

```nginx
upstream vg_app_<project> {
  server 127.0.0.1:<port>;
}
```

Server file (written once per hostname set; Certbot may add `listen 443 ssl` and a port-80 redirect):

- `listen 80;`
- `server_name <hostname>;` only — **do not** append `_`
- `location /.well-known/acme-challenge/` left for Certbot
- `location /` → `proxy_pass http://vg_app_<project>;` when a port exists
- holding mode: `return 503;` on `location /` (ACME path still available)

On traffic switch: rewrite **upstream file only**. Do not regenerate the server file (preserves Certbot lines).

If the project has multiple production hostnames, one server block can list them (`server_name a.com www.a.com;`) or one file per hostname. Prefer **one server file per hostname** so Certbot `-d` is isolated.

---

## 4. API

All routes session or Bearer auth. Nested under `/api/v1/projects/:id`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/domains` | List rows + `resolvedPort` (number or null) + `dnsA` (from this host) + `expectedIpv4` (server public IPv4 if known) |
| POST | `/domains` | Body `{ hostname }` (optional `environmentName`, must be `production` or omitted). Validate, insert, write nginx, reload. |
| DELETE | `/domains/:domainId` | Remove files for that hostname, delete row, reload. |
| POST | `/domains/:domainId/ssl` | `certbot --nginx -d hostname --email CERTBOT_EMAIL --redirect --non-interactive`. Must not write `PUBLIC_DOMAIN`. |

Validation failures (400):

- invalid hostname or raw IP
- hostname equals `PUBLIC_DOMAIN`
- hostname already used by another project
- `environmentName` not `production`

SSL (400/503): no `CERTBOT_EMAIL`; certbot missing; DNS A on this host does not include the server IPv4 (warn + fail closed for certbot). Hairpin: document that operators must not test via `curl http://$PUBLIC_IP` from the VPS.

---

## 5. Engine hooks

After a successful production `switchTrafficTo` in:

- `deploy.handler.ts`
- `promote.handler.ts`
- `rollback.handler.ts` / `rollback.service.ts`

call `syncProjectDomainUpstream(projectName, port)` if any `ProjectDomain` rows exist for that project + production. Missing files: recreate from DB (idempotent). Failure to reload nginx fails the traffic switch (same as today).

Attach on an already-live project: write upstream to the current ACTIVE port in the same request.

---

## 6. Dashboard

On `ProjectDetail` (every project, any state):

- Custom domain section: hostname input, Save, Remove, Obtain SSL
- Copy: add an A record to this server IPv4; Cloudflare grey-cloud until cert works
- Status: `pending_dns` / `http` / `issued` / `failed` plus last error
- Live / Open: `https://hostname` if `issued`, else `http://hostname` if vhost exists, else `/p/<project>/production`

Projects list and Overview Open Live App use the same preference.

---

## 7. Tests

- Hostname validation: reject IP, reject `PUBLIC_DOMAIN`, reject duplicate
- Port resolution: ACTIVE vs none vs FAILED-with-ACTIVE vs DEPLOYING
- Nginx: no `_` in `server_name`; upstream rewrite does not strip `ssl_certificate` from a fixture server file
- Certbot handler does not call `mergeIntoDotenv({ PUBLIC_DOMAIN })`
- API: non-production `environmentName` → 400
- Attach with no deployments succeeds and produces 503 server file

Cover loading / success / error / one edge (duplicate hostname) / one negative async (certbot fail).

---

## 8. Docs / changelog

Material feature: update `website/src/components/capability-grid.tsx`, `website/src/lib/engine-spec.ts`, `website/src/app/changelog/page.tsx`, Networking, Troubleshooting (app domain vs dashboard domain), README Live URL note. No emojis.

---

## 9. Later: stage domains

Same table (`environmentName` = `staging` | `development`). Separate nginx files `vg-app-<project>-<env>.*`. Traffic switch for non-production today skips nginx; stage domains would write/reload those files on ACTIVE for that env. v1 API keeps the 400.

---

## 10. Implementation order

1. Schema + repository + port resolver tests
2. Nginx writers (app server + app upstream) and unit tests
3. API routes + certbot that does not touch `PUBLIC_DOMAIN`
4. Hook production traffic switch
5. Dashboard ProjectDetail + Live URL
6. Docs / changelog / capability grid
7. Verification: `bun run typecheck`, `bun run build:dashboard`, `bun test --pass-with-no-tests`
