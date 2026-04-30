import { Environment, Prisma } from "@prisma/client";
import prisma from "../prisma/client";

const DEFAULT_ENVIRONMENTS: { name: string; chainOrder: number; basePortOffset: number }[] = [
  { name: "Development", chainOrder: 0, basePortOffset: 400 },
  { name: "Staging", chainOrder: 1, basePortOffset: 200 },
  { name: "Production", chainOrder: 2, basePortOffset: 0 },
];

export class EnvironmentRepository {
  async createDefaultsForProject(
    projectId: string,
    branch: string,
    appPort: number,
    prodBasePort: number
  ): Promise<void> {
    const rows: Prisma.EnvironmentCreateManyInput[] = DEFAULT_ENVIRONMENTS.map((d) => ({
      projectId,
      name: d.name,
      chainOrder: d.chainOrder,
      branch,
      serverHost: "",
      basePort: prodBasePort + d.basePortOffset,
      appPort,
    }));
    await prisma.environment.createMany({ data: rows });
  }

  async listByProject(projectId: string): Promise<Environment[]> {
    return prisma.environment.findMany({
      where: { projectId },
      orderBy: { chainOrder: "asc" },
    });
  }

  async findById(id: string): Promise<Environment | null> {
    return prisma.environment.findUnique({ where: { id } });
  }

  /** Highest chain order = production (receives public traffic). */
  async findProductionForProject(projectId: string): Promise<Environment | null> {
    return prisma.environment.findFirst({
      where: { projectId },
      orderBy: { chainOrder: "desc" },
    });
  }

  async findDevelopmentForProject(projectId: string): Promise<Environment | null> {
    return prisma.environment.findFirst({
      where: { projectId },
      orderBy: { chainOrder: "asc" },
    });
  }

  async findUpstream(env: Environment): Promise<Environment | null> {
    if (env.chainOrder <= 0) return null;
    return prisma.environment.findFirst({
      where: { projectId: env.projectId, chainOrder: env.chainOrder - 1 },
    });
  }
}
