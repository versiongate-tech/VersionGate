import { createHmac, timingSafeEqual } from "crypto";

const RELAY_STATE_MAX_AGE_MS = 60 * 60 * 1000;

export interface RelayInstallPayload {
  instanceUrl: string;
  userId: string;
  ts: number;
}

function canonicalPayloadJson(p: RelayInstallPayload): string {
  return JSON.stringify({ instanceUrl: p.instanceUrl, userId: p.userId, ts: p.ts });
}

/**
 * Signed state for GitHub App install → versiongate.tech relay → this instance.
 * Relay verifies with the same secret and redirects to `instanceUrl/api/auth/github/callback`.
 */
export function createRelayInstallState(userId: string, instanceUrl: string, secret: string): string {
  const ts = Date.now();
  const payload: RelayInstallPayload = {
    instanceUrl: instanceUrl.trim().replace(/\/+$/, ""),
    userId,
    ts,
  };
  const body = canonicalPayloadJson(payload);
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const envelope = JSON.stringify({ p: payload, sig });
  return Buffer.from(envelope, "utf8").toString("base64url");
}

export function parseRelayInstallState(state: string | undefined, secret: string): RelayInstallPayload | null {
  if (!state || !secret) return null;
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const o = JSON.parse(raw) as { p?: RelayInstallPayload; sig?: string };
    if (!o.p || typeof o.sig !== "string") return null;
    const body = canonicalPayloadJson(o.p);
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const a = Buffer.from(o.sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() - o.p.ts > RELAY_STATE_MAX_AGE_MS) return null;
    return o.p;
  } catch {
    return null;
  }
}
