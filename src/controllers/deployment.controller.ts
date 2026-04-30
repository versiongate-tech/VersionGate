import { FastifyRequest, FastifyReply } from "fastify";
import { DeploymentService } from "../services/deployment.service";
import { enqueueJob } from "../services/job-queue";
import { logger } from "../utils/logger";
import { EnvironmentRepository, DEFAULT_ENVIRONMENT_NAME } from "../repositories/environment.repository";

const deploymentService = new DeploymentService();
const envRepo = new EnvironmentRepository();

interface DeployBody {
  projectId: string;
  environmentId?: string;
}

async function resolveEnvironmentId(projectId: string, environmentId?: string): Promise<string | null> {
  if (environmentId) {
    const env = await envRepo.findById(environmentId);
    if (!env || env.projectId !== projectId) return null;
    return env.id;
  }
  const def = await envRepo.findDefaultForProject(projectId);
  return def?.id ?? null;
}

export async function deployHandler(
  req: FastifyRequest<{ Body: DeployBody }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId, environmentId: bodyEnvId } = req.body;
  const resolved = await resolveEnvironmentId(projectId, bodyEnvId);
  if (!resolved) {
    return reply.code(400).send({
      error: "ValidationError",
      message: bodyEnvId
        ? `Environment not found or does not belong to project`
        : `Project has no "${DEFAULT_ENVIRONMENT_NAME}" environment`,
    });
  }
  const jobId = await enqueueJob("DEPLOY", projectId, {}, resolved);
  logger.info({ projectId, environmentId: resolved, jobId }, "API: deploy enqueued");
  reply.code(202).send({ jobId, status: "PENDING", environmentId: resolved });
}

export async function listDeploymentsHandler(
  req: FastifyRequest<{ Params: { id?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const projectId = req.params?.id;
  const deployments = await deploymentService.getAllDeployments(projectId);
  reply.code(200).send({ deployments });
}

export async function statusHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const active = await deploymentService.getActiveDeployment();
  reply.code(200).send({
    status: active ? "active" : "idle",
    activeDeployment: active ?? null,
  });
}

export async function cancelDeployHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const result = await deploymentService.cancelDeploy(req.params.id);
  reply.code(200).send(result);
}
