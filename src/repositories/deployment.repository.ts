import { Deployment, DeploymentStatus, Prisma, Project } from "@prisma/client";
import prisma from "../prisma/client";

export class DeploymentRepository {
  async create(data: Prisma.DeploymentCreateInput): Promise<Deployment> {
    return prisma.deployment.create({ data });
  }

  async findById(id: string): Promise<Deployment | null> {
    return prisma.deployment.findUnique({ where: { id } });
  }

  // ── Environment-scoped queries ───────────────────────────────────────────

  async findActiveForEnvironment(environmentId: string): Promise<Deployment | null> {
    return prisma.deployment.findFirst({
      where: { environmentId, status: DeploymentStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
  }

  async findDeployingForEnvironment(environmentId: string): Promise<Deployment | null> {
    return prisma.deployment.findFirst({
      where: { environmentId, status: DeploymentStatus.DEPLOYING },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Finds the most recently ROLLED_BACK deployment for an environment whose version
   * is strictly lower than the current active version.
   */
  async findPreviousForEnvironment(
    environmentId: string,
    currentVersion: number
  ): Promise<Deployment | null> {
    return prisma.deployment.findFirst({
      where: {
        environmentId,
        status: DeploymentStatus.ROLLED_BACK,
        version: { lt: currentVersion },
      },
      orderBy: { version: "desc" },
    });
  }

  async findAllForEnvironment(environmentId: string): Promise<Deployment[]> {
    return prisma.deployment.findMany({
      where: { environmentId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** All deployments for a project (via environments). */
  async findAllForProject(projectId: string): Promise<(Deployment & { projectId: string })[]> {
    const rows = await prisma.deployment.findMany({
      where: { environment: { projectId } },
      include: { environment: { select: { projectId: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(({ environment, ...d }) => ({ ...d, projectId: environment.projectId }));
  }

  async getNextVersionForEnvironment(environmentId: string): Promise<number> {
    const latest = await prisma.deployment.findFirst({
      where: { environmentId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }

  // ── Reconciliation queries ─────────────────────────────────────────────────

  async findAllDeploying(): Promise<Deployment[]> {
    return prisma.deployment.findMany({ where: { status: DeploymentStatus.DEPLOYING } });
  }

  async findAllActiveWithProjects(): Promise<(Deployment & { project: Project })[]> {
    const rows = await prisma.deployment.findMany({
      where: { status: DeploymentStatus.ACTIVE },
      include: {
        environment: {
          include: { project: true },
        },
      },
    });
    return rows.map((d) => {
      const { environment, ...rest } = d;
      return { ...rest, project: environment.project };
    }) as (Deployment & { project: Project })[];
  }

  // ── Global queries (kept for status endpoint) ────────────────────────────

  async findAll(): Promise<(Deployment & { projectId: string })[]> {
    const rows = await prisma.deployment.findMany({
      include: { environment: { select: { projectId: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(({ environment, ...d }) => ({ ...d, projectId: environment.projectId }));
  }

  async updateStatus(
    id: string,
    status: DeploymentStatus,
    errorMessage?: string
  ): Promise<Deployment> {
    return prisma.deployment.update({
      where: { id },
      data: { status, ...(errorMessage !== undefined ? { errorMessage } : {}) },
    });
  }
}
