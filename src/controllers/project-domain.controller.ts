import { FastifyRequest, FastifyReply } from "fastify";
import { ProjectRepository } from "../repositories/project.repository";
import { ProjectDomainRepository } from "../repositories/project-domain.repository";
import {
  ProjectDomainService,
  resolveProductionPort,
  lookupDnsA,
  inferExpectedServerIpv4,
} from "../services/project-domain.service";
import { readEnvKeyFromFile } from "../utils/env-read";
import { logger } from "../utils/logger";
import { reloadNginxBestEffort } from "../utils/nginx-reload";
import { DEFAULT_ENVIRONMENT_NAME } from "../repositories/environment.repository";

const projectRepo = new ProjectRepository();
const domainRepo = new ProjectDomainRepository();
const domainService = new ProjectDomainService();

interface ProjectParams {
  id: string;
}

interface DomainParams extends ProjectParams {
  domainId: string;
}

interface CreateDomainBody {
  hostname: string;
  environmentName?: string;
}

export async function listProjectDomainsHandler(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const domains = await domainRepo.findAllForProject(project.id);
  const resolvedPort = await resolveProductionPort(project.id);
  const expectedIpv4 = inferExpectedServerIpv4();

  const rows = await Promise.all(
    domains.map(async (d) => {
      const dnsA = await lookupDnsA(d.hostname);
      return {
        id: d.id,
        hostname: d.hostname,
        environmentName: d.environmentName,
        sslStatus: d.sslStatus,
        lastError: d.lastError,
        dnsA,
        dnsOk: expectedIpv4 ? dnsA.includes(expectedIpv4) : dnsA.length > 0,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    })
  );

  reply.code(200).send({
    domains: rows,
    resolvedPort,
    expectedIpv4,
  });
}

export async function createProjectDomainHandler(
  req: FastifyRequest<{ Params: ProjectParams; Body: CreateDomainBody }>,
  reply: FastifyReply
): Promise<void> {
  const environmentName = (req.body.environmentName ?? DEFAULT_ENVIRONMENT_NAME).toLowerCase();
  try {
    const { domain, resolvedPort } = await domainService.provisionDomain(
      req.params.id,
      req.body.hostname,
      environmentName
    );
    logger.info({ projectId: req.params.id, hostname: domain.hostname }, "API: project domain attached");
    reply.code(201).send({ domain, resolvedPort });
  } catch (err) {
    if (err instanceof Error && "statusCode" in err) {
      const code = (err as { statusCode: number }).statusCode;
      return reply.code(code).send({ error: err.name, message: err.message });
    }
    throw err;
  }
}

export async function deleteProjectDomainHandler(
  req: FastifyRequest<{ Params: DomainParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    await domainService.removeDomain(req.params.id, req.params.domainId);
    reply.code(204).send();
  } catch (err) {
    if (err instanceof Error && "statusCode" in err) {
      const code = (err as { statusCode: number }).statusCode;
      return reply.code(code).send({ error: err.name, message: err.message });
    }
    throw err;
  }
}

export async function issueProjectDomainSslHandler(
  req: FastifyRequest<{ Params: DomainParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const row = await domainRepo.findById(req.params.domainId);
  if (!row || row.projectId !== project.id) {
    return reply.code(404).send({ error: "NotFound", message: "Domain not found for this project" });
  }

  const email =
    (readEnvKeyFromFile("CERTBOT_EMAIL") ?? "").trim() ||
    (process.env.CERTBOT_EMAIL ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply.code(400).send({
      error: "BadRequest",
      message: "Set CERTBOT_EMAIL in .env (or Settings) before obtaining SSL for a project domain.",
    });
  }

  const expectedIpv4 = inferExpectedServerIpv4();
  const dnsA = await lookupDnsA(row.hostname);
  if (expectedIpv4 && !dnsA.includes(expectedIpv4)) {
    await domainRepo.updateSslStatus(
      row.id,
      "failed",
      `DNS A for ${row.hostname} does not include ${expectedIpv4} (resolved: ${dnsA.join(", ") || "none"})`
    );
    return reply.code(400).send({
      error: "BadRequest",
      message: `DNS must point ${row.hostname} to this server (${expectedIpv4}) before Certbot can run.`,
      dnsA,
      expectedIpv4,
    });
  }

  try {
    domainService.runCertbotForHostname(row.hostname, email);
    await domainRepo.updateSslStatus(row.id, "issued", null);
    reloadNginxBestEffort();
    reply.code(200).send({
      ok: true,
      message: `TLS certificate issued for ${row.hostname}`,
      sslStatus: "issued",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await domainRepo.updateSslStatus(row.id, "failed", msg.slice(0, 500));
    logger.error({ err, hostname: row.hostname }, "postProjectDomainSsl: certbot failed");
    return reply.code(500).send({
      error: "CertbotFailed",
      message:
        "Certbot could not obtain a certificate. Ensure DNS points here and ports 80/443 are reachable.",
      detail: msg.slice(0, 1200),
    });
  }
}
