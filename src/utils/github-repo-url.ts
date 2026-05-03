/**
 * Normalize GitHub repository URLs for comparison (HTTPS, SSH, optional .git).
 */
export function normalizeGithubRepoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const noGit = trimmed.replace(/\.git$/i, "");
  const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(noGit);
  if (ssh) {
    return `https://github.com/${ssh[1]}/${ssh[2]}`.toLowerCase();
  }

  try {
    const withProto = /^https?:\/\//i.test(noGit) ? noGit : `https://${noGit}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host !== "github.com") {
      return noGit.toLowerCase();
    }
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return `https://github.com/${path}`.toLowerCase();
  } catch {
    return noGit.toLowerCase();
  }
}
