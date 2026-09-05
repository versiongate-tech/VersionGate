import fs from "fs/promises";
import { existsSync } from "fs";
import { execFileSync } from "child_process";
import dns from "dns/promises";
import { ProjectDomainRepository } from "../repositories/project-domain.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository, DEFAULT_ENVIRONMENT_NAME } from "../repositories/environment.repository";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { isValidHostname, isValidIpv4Address } from "../utils/domain-validation";
import {
  appServerConfPath,
  appUpstreamConfPath,
  generateAppServerConf,
  generateAppUpstreamConf,
} from "../utils/nginx-app-domain";
import { writeNginxConfigFile } from "../utils/nginx-writer";
import { reloadNginxBestEffort } from "../utils/nginx-reload";
import { findCertbotExecutablePath } from "../utils/certbot-path";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { readEnvKeyFromFile } from "../utils/env-read";

/** Latest ACTIVE production deployment port, or null when nothing is live. */
export async function resolveProductionPort(projectId: string): Promise<number | null> {
  const envRepo = new EnvironmentRepository();
  const deploymentRepo = new DeploymentRepository();
  const prodEnv = await envRepo.findByProjectAndName(projectId, DEFAULT_ENVIRONMENT_NAME);
  if (!prodEnv) return null;
  const active = await deploymentRepo.findActiveForEnvironment(prodEnv.id);
  if (!active || active.port <= 0) return null;
  return active.port;
}

export async function lookupDnsA(hostname: string): Promise<string[]> {
  try {
    return await dns.resolve4(hostname);
  } catch {
    return [];
  }
}

export function inferExpectedServerIpv4(): string | null {
  const fromEnv = (process.env.SERVER_PUBLIC_IPV4 ?? "").trim();
  if (fromEnv && isValidIpv4Address(fromEnv)) return fromEnv;
  const publicDomain = (readEnvKeyFromFile("PUBLIC_DOMAIN") ?? process.env.PUBLIC_DOMAIN ?? "")
    .trim()
    .toLowerCase();
  if (publicDomain && isValidIpv4Address(publicDomain)) return publicDomain;
  return null;
}

export class ProjectDomainService {
  private readonly domainRepo = new ProjectDomainRepository();
  private readonly projectRepo = new ProjectRepository();

  async writeUpstreamForProject(projectName: string, port: number | null): Promise<void> {
    const path = appUpstreamConfPath(projectName);
    const content = generateAppUpstreamConf(projectName, port);
    await writeNginxConfigFile(path, content);
    logger.info({ path, port, projectName }, "Wrote project domain upstream config");
  }

  async writeServerForHostname(projectName: string, hostname: string): Promise<void> {
    const path = appServerConfPath(projectName, hostname);
    if (existsSync(path)) {
      logger.debug({ path }, "Project domain server config already exists — skipping rewrite (preserve Certbot)");
      return;
    }
    const content = generateAppServerConf(projectName, hostname);
    await writeNginxConfigFile(path, content);
    logger.info({ path, hostname, projectName }, "Wrote project domain server config");
  }

  async removeNginxFilesForHostname(projectName: string, hostname: string): Promise<void> {
    const serverPath = appServerConfPath(projectName, hostname);
    await fs.unlink(serverPath).catch(() => null);
  }

  async removeAllNginxFilesForProject(projectName: string, hostnames: string[]): Promise<void> {
    for (const hostname of hostnames) {
      await this.removeNginxFilesForHostname(projectName, hostname);
    }
    const upstreamPath = appUpstreamConfPath(projectName);
    await fs.unlink(upstreamPath).catch(() => null);
  }

  /**
   * After production traffic switch — upstream only (preserves Certbot SSL on server files).
   */
  async syncProductionUpstream(projectName: string, port: number): Promise<void> {
    const project = await this.projectRepo.findByName(projectName);
    if (!project) return;

    const domains = await this.domainRepo.findForProjectEnvironment(
      project.id,
      DEFAULT_ENVIRONMENT_NAME
    );
    if (domains.length === 0) return;

    await this.writeUpstreamForProject(project.name, port);
    reloadNginxBestEffort();
    logger.info({ projectName, port, domainCount: domains.length }, "Synced custom domain upstream");
  }

  async provisionDomain(
    projectId: string,
    hostnameRaw: string,
    environmentName: string
  ): Promise<{ domain: Awaited<ReturnType<ProjectDomainRepository["create"]>>; resolvedPort: number | null }> {
    const hostname = hostnameRaw.trim().toLowerCase();
    if (!hostname || !isValidHostname(hostname)) {
      throw new BadRequestError("hostname must be a valid DNS name (not a raw IP)");
    }
    if (isValidIpv4Address(hostname)) {
      throw new BadRequestError("hostname must be a DNS name, not an IPv4 address");
    }
    if (environmentName !== DEFAULT_ENVIRONMENT_NAME) {
      throw new BadRequestError(`Only "${DEFAULT_ENVIRONMENT_NAME}" custom domains are supported in v1`);
    }

    const publicDomain = (readEnvKeyFromFile("PUBLIC_DOMAIN") ?? "").trim().toLowerCase();
    if (publicDomain && hostname === publicDomain) {
      throw new BadRequestError("hostname cannot be the same as PUBLIC_DOMAIN (dashboard hostname)");
    }

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError("Project");
    }

    const existing = await this.domainRepo.findByHostname(hostname);
    if (existing && existing.projectId !== projectId) {
      throw new BadRequestError("hostname is already used by another project");
    }
    if (existing && existing.projectId === projectId) {
      throw new BadRequestError("hostname is already attached to this project");
    }

    const resolvedPort = await resolveProductionPort(projectId);
    const domain = await this.domainRepo.create({
      projectId,
      hostname,
      environmentName,
      sslStatus: "pending_dns",
    });

    await this.writeUpstreamForProject(project.name, resolvedPort);
    await this.writeServerForHostname(project.name, hostname);
    reloadNginxBestEffort();

    return { domain, resolvedPort };
  }

  async removeDomain(projectId: string, domainId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) throw new NotFoundError("Project");

    const row = await this.domainRepo.findById(domainId);
    if (!row || row.projectId !== projectId) {
      throw new NotFoundError("Domain");
    }

    await this.domainRepo.deleteById(domainId);
    await this.removeNginxFilesForHostname(project.name, row.hostname);

    const remaining = await this.domainRepo.findAllForProject(projectId);
    if (remaining.length === 0) {
      await fs.unlink(appUpstreamConfPath(project.name)).catch(() => null);
    } else {
      const port = await resolveProductionPort(projectId);
      await this.writeUpstreamForProject(project.name, port);
    }
    reloadNginxBestEffort();
  }

  async cleanupProjectDomains(projectId: string, projectName: string): Promise<void> {
    const rows = await this.domainRepo.findAllForProject(projectId);
    if (rows.length === 0) return;
    await this.removeAllNginxFilesForProject(
      projectName,
      rows.map((r) => r.hostname)
    );
    await this.domainRepo.deleteAllForProject(projectId);
    reloadNginxBestEffort();
  }

  runCertbotForHostname(hostname: string, email: string): void {
    const args = [
      "--nginx",
      "-d",
      hostname,
      "--non-interactive",
      "--agree-tos",
      "--email",
      email,
      "--redirect",
    ];
    const explicit = findCertbotExecutablePath();
    if (explicit) {
      try {
        execFileSync(explicit, args, { stdio: "pipe", timeout: 240_000 });
        return;
      } catch (directErr) {
        logger.debug({ err: directErr }, "certbot failed as current user — trying sudo");
        execFileSync("sudo", ["-n", explicit, ...args], { stdio: "pipe", timeout: 240_000 });
        return;
      }
    }
    execFileSync("certbot", args, { stdio: "pipe", timeout: 240_000 });
  }
}

const sharedDomainService = new ProjectDomainService();

/** Called after production nginx upstream switch — rewrites per-project custom domain upstream files. */
export async function syncCustomDomainUpstream(projectName: string, port: number): Promise<void> {
  await sharedDomainService.syncProductionUpstream(projectName, port);
}
