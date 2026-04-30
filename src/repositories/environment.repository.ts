import { Environment, DeploymentStatus } from "@prisma/client";
import prisma from "../prisma/client";

const DEFAULT_ENV_NAME = "production";

export const DEFAULT_ENVIRONMENT_NAME = DEFAULT_ENV_NAME;

export class EnvironmentRepository {
  async findById(id: string): Promise<Environment | null> {
    return prisma.environment.findUnique({ where: { id } });
  }

  async findDefaultForProject(projectId: string): Promise<Environment | null> {
    return prisma.environment.findFirst({
      where: { projectId, name: DEFAULT_ENV_NAME },
    });
  }

  async findByProjectAndName(projectId: string, name: string): Promise<Environment | null> {
    return prisma.environment.findUnique({
      where: { projectId_name: { projectId, name } },
    });
  }

  async findAllForProject(projectId: string): Promise<Environment[]> {
    return prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
  }

  async acquireDeployLock(id: string): Promise<boolean> {
    const { count } = await prisma.environment.updateMany({
      where: { id, lockedAt: null },
      data: { lockedAt: new Date() },
    });
    return count === 1;
  }

  async releaseDeployLock(id: string): Promise<void> {
    await prisma.environment.updateMany({
      where: { id },
      data: { lockedAt: null },
    });
  }

  async clearStaleDeployLocks(): Promise<number> {
    const { count } = await prisma.environment.updateMany({
      where: {
        lockedAt: { not: null },
        deployments: {
          none: { status: DeploymentStatus.DEPLOYING },
        },
      },
      data: { lockedAt: null },
    });
    return count;
  }
}
