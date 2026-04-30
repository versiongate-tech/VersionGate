import { FastifyRequest, FastifyReply } from "fastify";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { enqueueJob } from "../services/job-queue";
import { logger } from "../utils/logger";

const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();

interface WebhookParams {
  secret: string;
}

// Minimal shape we care about from a GitHub push event
interface GitHubPushPayload {
  ref?: string;                                // e.g. "refs/heads/main"
  repository?: { clone_url?: string; html_url?: string };
}

export async function githubWebhookHandler(
  req: FastifyRequest<{ Params: WebhookParams; Body: GitHubPushPayload }>,
  reply: FastifyReply
): Promise<void> {
  const { secret } = req.params;

  // Look up the project by its webhook secret
  const project = await projectRepo.findByWebhookSecret(secret);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "No project found for this webhook URL" });
  }

  // Only handle push events (GitHub also sends ping, etc.)
  const event = req.headers["x-github-event"] as string | undefined;
  if (event && event !== "push") {
    return reply.code(200).send({ skipped: true, reason: `Ignoring event: ${event}` });
  }

  // Only deploy when pushed to the configured branch
  const ref = req.body?.ref ?? "";
  const pushedBranch = ref.replace("refs/heads/", "");
  const defaultEnv = await envRepo.findDefaultForProject(project.id);
  if (!defaultEnv) {
    logger.error({ projectId: project.id }, "Webhook: no default environment — skipping deploy");
    return reply.code(500).send({ error: "Misconfigured", message: "Project has no default environment" });
  }

  if (pushedBranch && pushedBranch !== defaultEnv.branch) {
    logger.info(
      { projectId: project.id, pushedBranch, configuredBranch: defaultEnv.branch },
      "Webhook: branch mismatch — skipping"
    );
    return reply.code(200).send({
      skipped: true,
      reason: `Push to '${pushedBranch}', environment tracks '${defaultEnv.branch}'`,
    });
  }

  logger.info(
    { projectId: project.id, projectName: project.name, environmentId: defaultEnv.id, ref },
    "Webhook: triggering auto-deploy"
  );

  enqueueJob("DEPLOY", project.id, {}, defaultEnv.id).catch((err) => {
    logger.error({ projectId: project.id, err }, "Webhook: failed to enqueue deploy job");
  });

  return reply.code(200).send({ triggered: true, project: project.name });
}
