import type { FastifyRequest } from "fastify";
import { config } from "../config/env";
import { isValidHostname, isValidIpv4Address } from "./domain-validation";

function firstHeader(req: FastifyRequest, name: string): string {
  const v = req.headers[name];
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return String(v ?? "").trim();
}

/**
 * Public browser origin for this deployment (scheme + host, no path).
 * Used for HTTP redirects (e.g. GitHub App install callback → dashboard).
 */
export function inferOriginFromRequest(req: FastifyRequest): string {
  const xfHost = firstHeader(req, "x-forwarded-host") || firstHeader(req, "host");
  if (!xfHost) return "";
  const xfProtoRaw = firstHeader(req, "x-forwarded-proto");
  const proto = (xfProtoRaw.split(",")[0]?.trim() || (req as { protocol?: string }).protocol || "https").replace(
    /:$/,
    ""
  );
  return `${proto}://${xfHost.split(",")[0].trim()}`;
}

/**
 * Canonical public origin: `PUBLIC_APP_URL` → request Host → `https://` + `PUBLIC_DOMAIN`.
 */
export function resolvePublicAppOrigin(req: FastifyRequest): string {
  const fromEnv = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  const inferred = inferOriginFromRequest(req);
  if (inferred) return inferred;

  const d = (process.env.PUBLIC_DOMAIN ?? "").trim().toLowerCase();
  if (d && isValidHostname(d)) return `https://${d}`;
  if (d && isValidIpv4Address(d)) {
    const port = config.port;
    return `http://${d}:${port}`;
  }
  return "";
}

/** Absolute URL to the dashboard Integrations page (or relative path if origin unknown). */
export function dashboardIntegrationsAbsoluteUrl(req: FastifyRequest, search: Record<string, string>): string {
  const base = resolvePublicAppOrigin(req);
  const q = new URLSearchParams(search).toString();
  const path = `/dashboard/integrations${q ? `?${q}` : ""}`;
  if (!base) return path;
  return `${base}${path}`;
}
