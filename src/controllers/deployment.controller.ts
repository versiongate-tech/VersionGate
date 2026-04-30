import { FastifyRequest, FastifyReply } from "fastify";
import { DeploymentService } from "../services/deployment.service";
import { enqueueJob } from "../services/job-queue";
import { logger } from "../utils/logger";

const deploymentService = new DeploymentService();

interface DeployBody {
  projectId: string;
  environmentId?: string;
}

export async function deployHandler(
  req: FastifyRequest<{ Body: DeployBody }>,
  reply: FastifyReply
): Promise<void> {
  const { projectId, environmentId } = req.body;
  const payload = environmentId ? { environmentId } : {};
  const jobId = await enqueueJob("DEPLOY", projectId, payload);
  logger.info({ projectId, jobId }, "API: deploy enqueued");
  reply.code(202).send({ jobId, status: "PENDING" });
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
