import { FastifyReply, FastifyRequest } from "fastify";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { enqueueJob } from "../services/job-queue";
import prisma from "../prisma/client";
import { logger } from "../utils/logger";

const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();
const deploymentRepo = new DeploymentRepository();

interface ProjectParams {
  id: string;
}

interface EnvParams extends ProjectParams {
  envId: string;
}

export async function listProjectEnvironmentsHandler(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const rows = await envRepo.listByProject(req.params.id);
  const environments = [];
  for (const e of rows) {
    const active = await deploymentRepo.findActiveForEnvironment(e.id);
    environments.push({
      id: e.id,
      name: e.name,
      chainOrder: e.chainOrder,
      branch: e.branch,
      basePort: e.basePort,
      appPort: e.appPort,
      activeDeployment: active
        ? {
            id: active.id,
            version: active.version,
            imageTag: active.imageTag,
            status: active.status,
            port: active.port,
            color: active.color,
          }
        : null,
    });
  }

  reply.code(200).send({ environments });
}

export async function promoteEnvironmentHandler(
  req: FastifyRequest<{ Params: EnvParams }>,
  reply: FastifyReply
): Promise<void> {
  const { id: projectId, envId } = req.params;

  const project = await projectRepo.findById(projectId);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const targetEnv = await envRepo.findById(envId);
  if (!targetEnv || targetEnv.projectId !== projectId) {
    return reply.code(404).send({ error: "NotFound", message: "Environment not found" });
  }

  if (targetEnv.chainOrder === 0) {
    return reply.code(400).send({
      error: "BadRequest",
      message: "Cannot promote into the first environment in the chain",
    });
  }

  const upstream = await envRepo.findUpstream(targetEnv);
  if (!upstream) {
    return reply.code(400).send({ error: "BadRequest", message: "No upstream environment" });
  }

  const upstreamActive = await deploymentRepo.findActiveForEnvironment(upstream.id);
  if (!upstreamActive || upstreamActive.status !== "ACTIVE") {
    return reply.code(409).send({
      error: "Conflict",
      message: `Upstream environment "${upstream.name}" must have an ACTIVE deployment before promoting`,
    });
  }

  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { lockedAt: true },
  });
  if (row?.lockedAt != null) {
    return reply.code(423).send({
      error: "Locked",
      message: "A deployment or promotion is already in progress for this project",
    });
  }

  const jobId = await enqueueJob("PROMOTE", projectId, { targetEnvironmentId: envId });
  logger.info({ projectId, envId, jobId }, "API: promote enqueued");
  reply.code(202).send({ jobId, status: "PENDING" });
}
