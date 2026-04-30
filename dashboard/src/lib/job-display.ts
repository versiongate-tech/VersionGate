import type { JobRecord } from "@/lib/api";

export function jobDurationLabel(job: JobRecord): string {
  if (!job.startedAt) return "—";
  const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(job.startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/** Short fingerprint for UI when git SHA is not stored on the job. */
export function jobArtifactLabel(job: JobRecord): string {
  const payload = job.payload;
  if (payload && typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    const sha = p.commit ?? p.sha ?? p.ref;
    if (typeof sha === "string" && sha.length >= 7) return sha.slice(0, 7);
  }
  for (const line of job.logs) {
    const m = line.match(/\b([a-f0-9]{7,40})\b/i);
    if (m) return m[1].slice(0, 7);
  }
  if (job.deploymentId) return job.deploymentId.slice(0, 8);
  return job.id.slice(0, 8);
}
