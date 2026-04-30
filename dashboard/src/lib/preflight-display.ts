import type { PreflightCheck } from "@/lib/api";

/** Best-effort version string from a preflight message (e.g. `Bun 1.2.3`, `git version 2.x`). */
export function extractVersionFromPreflightMessage(message: string): string {
  const semver = message.match(/\b(\d+\.\d+\.\d+(?:[-+.\w]+)?)\b/);
  if (semver) return semver[1];
  const v = message.match(/\b(v?\d+\.\d+(?:\.\d+)?)\b/i);
  if (v) return v[1].startsWith("v") ? v[1] : v[1];
  const client = message.match(/Client\s+([\d.]+)/i);
  if (client) return client[1];
  const firstToken = message.trim().split(/\s+/)[0];
  if (firstToken && firstToken.length <= 24 && !firstToken.includes("http")) return firstToken;
  return "—";
}

export function preflightStatusLabel(c: PreflightCheck): string {
  if (c.ok) return "Operational";
  if (c.severity === "required") return "Action required";
  return "Degraded";
}
