/**
 * Turn raw deploy/rollback errors into UI-friendly messages (disk full, truncation).
 */
const DISK_FULL_HINT = `

---
Disk or inode exhaustion detected (ENOSPC / "no space left on device").
1. Check space: \`df -h\` and \`docker system df\`
2. Free Docker data: \`docker system prune -af\` (removes unused images/containers — destructive)
3. Clear apt cache: \`sudo apt clean\`
4. On small VPS: add disk or move Docker data to a larger volume.
`;

const MAX_ERROR_LEN = 12_000;

export function humanizeDeployFailure(raw: string): string {
  let m = raw.trim();
  if (m.length > MAX_ERROR_LEN) {
    m = `${m.slice(0, MAX_ERROR_LEN)}\n\n… (truncated — see worker logs for full Docker output)`;
  }
  const lower = m.toLowerCase();
  if (
    (lower.includes("enospc") || lower.includes("no space left on device")) &&
    !m.includes("Disk or inode exhaustion")
  ) {
    m += DISK_FULL_HINT;
  }
  return m;
}
