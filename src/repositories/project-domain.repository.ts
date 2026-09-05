import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client";
import { projectDomains, ProjectDomainSelect } from "../db/schema";

export type ProjectDomainSslStatusType =
  | "pending_dns"
  | "http"
  | "issued"
  | "failed";

export class ProjectDomainRepository {
  async findById(id: string): Promise<ProjectDomainSelect | null> {
    const db = getDb();
    const [row] = await db.select().from(projectDomains).where(eq(projectDomains.id, id)).limit(1);
    return row ?? null;
  }

  async findByHostname(hostname: string): Promise<ProjectDomainSelect | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(projectDomains)
      .where(eq(projectDomains.hostname, hostname.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findAllForProject(projectId: string): Promise<ProjectDomainSelect[]> {
    const db = getDb();
    return db
      .select()
      .from(projectDomains)
      .where(eq(projectDomains.projectId, projectId))
      .orderBy(projectDomains.createdAt);
  }

  async findForProjectEnvironment(
    projectId: string,
    environmentName: string
  ): Promise<ProjectDomainSelect[]> {
    const db = getDb();
    return db
      .select()
      .from(projectDomains)
      .where(
        and(
          eq(projectDomains.projectId, projectId),
          eq(projectDomains.environmentName, environmentName)
        )
      );
  }

  async create(data: {
    projectId: string;
    hostname: string;
    environmentName: string;
    sslStatus?: ProjectDomainSslStatusType;
  }): Promise<ProjectDomainSelect> {
    const db = getDb();
    const now = new Date();
    const [created] = await db
      .insert(projectDomains)
      .values({
        projectId: data.projectId,
        hostname: data.hostname.toLowerCase(),
        environmentName: data.environmentName,
        sslStatus: data.sslStatus ?? "pending_dns",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  async updateSslStatus(
    id: string,
    sslStatus: ProjectDomainSslStatusType,
    lastError?: string | null
  ): Promise<ProjectDomainSelect | null> {
    const db = getDb();
    const [updated] = await db
      .update(projectDomains)
      .set({
        sslStatus,
        lastError: lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projectDomains.id, id))
      .returning();
    return updated ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db.delete(projectDomains).where(eq(projectDomains.id, id)).returning();
    return deleted.length > 0;
  }

  async deleteAllForProject(projectId: string): Promise<number> {
    const db = getDb();
    const deleted = await db
      .delete(projectDomains)
      .where(eq(projectDomains.projectId, projectId))
      .returning();
    return deleted.length;
  }
}
