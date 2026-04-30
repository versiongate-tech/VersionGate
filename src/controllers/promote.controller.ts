import { FastifyRequest, FastifyReply } from "fastify";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { enqueueJob } from "../services/job-queue";
import { logger } from "../utils/logger";
import { LockedError } from "../utils/errors";

const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();
const deploymentRepo = new DeploymentRepository();

interface PromoteParams {
  id: string;
  envId: string;
}

interface PromoteBody {
  sourceEnvironmentId: string;
}

export async function promoteEnvironmentHandler(
  req: FastifyRequest<{ Params: PromoteParams; Body: PromoteBody }>,
  reply: FastifyReply
): Promise<void> {
  const { id: projectId, envId: targetEnvironmentId } = req.params;
  const { sourceEnvironmentId } = req.body;

  if (!sourceEnvironmentId || typeof sourceEnvironmentId !== "string") {
    return reply.code(400).send({
      error: "ValidationError",
      message: "sourceEnvironmentId is required",
    });
  }

  const project = await projectRepo.findById(projectId);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const targetEnv = await envRepo.findById(targetEnvironmentId);
  if (!targetEnv || targetEnv.projectId !== projectId) {
    return reply.code(404).send({ error: "NotFound", message: "Environment not found" });
  }

  const sourceEnv = await envRepo.findById(sourceEnvironmentId);
  if (!sourceEnv || sourceEnv.projectId !== projectId) {
    return reply.code(404).send({ error: "NotFound", message: "Source environment not found" });
  }

  if (sourceEnvironmentId === targetEnvironmentId) {
    return reply.code(400).send({
      error: "ValidationError",
      message: "sourceEnvironmentId must differ from the target environment",
    });
  }

  const sourceActive = await deploymentRepo.findActiveForEnvironment(sourceEnvironmentId);
  if (!sourceActive) {
    return reply.code(409).send({
      error: "Conflict",
      message: "Source environment has no ACTIVE deployment to promote",
      code: "NO_ACTIVE_DEPLOYMENT",
    });
  }

  if (targetEnv.lockedAt != null) {
    throw new LockedError("Target environment has a deployment in progress");
  }

  const jobId = await enqueueJob(
    "PROMOTE",
    projectId,
    { sourceEnvironmentId, targetEnvironmentId },
    targetEnvironmentId
  );

  logger.info(
    { projectId, sourceEnvironmentId, targetEnvironmentId, jobId, imageTag: sourceActive.imageTag },
    "API: promote enqueued"
  );

  reply.code(202).send({
    jobId,
    status: "PENDING",
    environmentId: targetEnvironmentId,
    sourceEnvironmentId,
    imageTag: sourceActive.imageTag,
  });
}
