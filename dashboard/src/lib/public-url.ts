/** Matches backend `normalizePublicBasePath` (leading slash, no trailing slash except `/`). */
export function normalizePublicBasePath(raw: string): string {
  let p = raw.trim();
  if (!p || p === "/") return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function looksLikeIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host.trim());
}

/** Preview URL for the dashboard (scheme guessed: HTTP for raw IPv4, HTTPS for hostnames). */
export function formatPublicDashboardUrl(publicDomain: string, publicBasePath: string): string | null {
  const host = publicDomain.trim().toLowerCase();
  if (!host) return null;
  const path = normalizePublicBasePath(publicBasePath || "/");
  const proto = looksLikeIpv4(host) ? "http" : "https";
  const origin = `${proto}://${host}`;
  return path === "/" ? origin : `${origin}${path}`;
}
