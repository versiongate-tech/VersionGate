import { DeploymentStatus, Project, Prisma } from "@prisma/client";
import prisma from "../prisma/client";
import { encrypt } from "../utils/crypto";
import { decryptProjectEnv, parseProjectEnv } from "../utils/env";

export class ProjectRepository {
  async create(data: Prisma.ProjectCreateInput): Promise<Project> {
    const project = await prisma.project.create({ data: this.prepareCreateData(data) });
    return this.hydrateProject(project);
  }

  async findById(id: string): Promise<Project | null> {
    const project = await prisma.project.findUnique({ where: { id } });
    return project ? this.hydrateProject(project) : null;
  }

  async findByName(name: string): Promise<Project | null> {
    const project = await prisma.project.findUnique({ where: { name } });
    return project ? this.hydrateProject(project) : null;
  }

  async findByWebhookSecret(secret: string): Promise<Project | null> {
    const project = await prisma.project.findUnique({ where: { webhookSecret: secret } });
    return project ? this.hydrateProject(project) : null;
  }

  async findAll(): Promise<Project[]> {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
    });
    return projects.map((project) => this.hydrateProject(project));
  }

  async update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    const project = await prisma.project.update({
      where: { id },
      data: this.prepareUpdateData(data),
    });
    return this.hydrateProject(project);
  }

  /**
   * Returns the next available base port for a new project.
   * Each project uses Production at basePort, Staging at basePort+200, Development at basePort+400
   * (each stage uses two consecutive host ports for blue/green).
   * Spacing between projects is 500 to avoid overlap with sibling env port ranges.
   */
  async getNextBasePort(startPort = 3100): Promise<number> {
    const projects = await prisma.project.findMany({ select: { basePort: true } });
    if (projects.length === 0) return startPort;
    const max = Math.max(...projects.map((p) => p.basePort));
    return max + 500;
  }

  async delete(id: string): Promise<Project> {
    await prisma.job.deleteMany({ where: { projectId: id } });
    await prisma.deployment.deleteMany({ where: { projectId: id } });
    const project = await prisma.project.delete({ where: { id } });
    return this.hydrateProject(project);
  }

  async acquireDeployLock(id: string): Promise<boolean> {
    const { count } = await prisma.project.updateMany({
      where: { id, lockedAt: null } as Prisma.ProjectWhereInput,
      data: { lockedAt: new Date() } as Prisma.ProjectUpdateManyMutationInput,
    });

    return count === 1;
  }

  async releaseDeployLock(id: string): Promise<void> {
    await prisma.project.updateMany({
      where: { id },
      data: { lockedAt: null } as Prisma.ProjectUpdateManyMutationInput,
    });
  }

  async clearStaleDeployLocks(): Promise<number> {
    const { count } = await prisma.project.updateMany({
      where: {
        lockedAt: { not: null },
        deployments: {
          none: { status: DeploymentStatus.DEPLOYING },
        },
      } as Prisma.ProjectWhereInput,
      data: { lockedAt: null } as Prisma.ProjectUpdateManyMutationInput,
    });

    return count;
  }

  private prepareCreateData(data: Prisma.ProjectCreateInput): Prisma.ProjectCreateInput {
    if (data.env === undefined) {
      return data;
    }

    return {
      ...data,
      env: this.encryptEnvValue(data.env),
    };
  }

  private prepareUpdateData(data: Prisma.ProjectUpdateInput): Prisma.ProjectUpdateInput {
    if (data.env === undefined) {
      return data;
    }

    return {
      ...data,
      env: this.encryptEnvValue(data.env),
    };
  }

  private hydrateProject(project: Project): Project {
    return {
      ...project,
      env: decryptProjectEnv(project.env),
    };
  }

  private encryptEnvValue(raw: unknown): Prisma.InputJsonObject {
    const parsed = parseProjectEnv(raw);
    const encryptedEntries = Object.entries(parsed).map(([key, value]) => [key, encrypt(value)]);
    return Object.fromEntries(encryptedEntries);
  }
}
