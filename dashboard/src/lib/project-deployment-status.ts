import type { Deployment } from "@/lib/api";

/** Derives a single rollout state for a project from its deployment rows. */
export function projectDeploymentStatus(projectId: string, deployments: Deployment[]): string {
  const mine = deployments.filter((d) => d.projectId === projectId);
  const active = mine.find((d) => d.status === "ACTIVE");
  if (mine.some((d) => d.status === "DEPLOYING")) return "DEPLOYING";
  if (active) return "ACTIVE";
  const last = mine.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (last?.status === "FAILED") return "FAILED";
  if (last?.status === "ROLLED_BACK") return "ROLLED_BACK";
  return "PENDING";
}
