import { createHmac, timingSafeEqual } from "crypto";

const INSTALL_STATE_MAX_AGE_MS = 60 * 60 * 1000;

export function createInstallState(userId: string, secret: string): string {
  const ts = Date.now();
  const payload = `${userId}.${ts}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`, "utf8").toString("base64url");
}

export function parseInstallState(state: string | undefined, secret: string): string | null {
  if (!state || !secret) return null;
  try {
    const raw = Buffer.from(state, "base64url").toString("utf8");
    const lastDot = raw.lastIndexOf(".");
    const secondLast = raw.lastIndexOf(".", lastDot - 1);
    if (secondLast <= 0 || lastDot <= secondLast) return null;
    const userId = raw.slice(0, secondLast);
    const tsStr = raw.slice(secondLast + 1, lastDot);
    const sig = raw.slice(lastDot + 1);
    const payload = `${userId}.${tsStr}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const ts = parseInt(tsStr, 10);
    if (!Number.isFinite(ts) || Date.now() - ts > INSTALL_STATE_MAX_AGE_MS) return null;
    return userId;
  } catch {
    return null;
  }
}
