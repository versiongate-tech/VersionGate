import { DeploymentColor, DeploymentStatus, Environment, Job, Project } from "@prisma/client";
import { config } from "../../config/env";
import { parseProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { EnvironmentRepository } from "../../repositories/environment.repository";
import { runContainer, stopContainer, removeContainer, freeHostPort } from "../../utils/docker";
import { DeploymentError } from "../../utils/errors";
import { TrafficService } from "../../services/traffic.service";
import { ValidationService } from "../../services/validation.service";
import { completeJob, failJob } from "../../services/job-queue";
import { humanizeDeployFailure } from "../../utils/deploy-errors";
import { logEmitter } from "../../events/log-emitter";
import prisma from "../../prisma/client";

const repo = new DeploymentRepository();
const envRepo = new EnvironmentRepository();
const traffic = new TrafficService();
const validation = new ValidationService();

export type LogFn = (line: string) => void | Promise<void>;

async function checkCancelled(deploymentId: string | undefined, log: LogFn): Promise<void> {
  if (!deploymentId) return;
  const d = await repo.findById(deploymentId);
  if (d && d.status !== DeploymentStatus.DEPLOYING) {
    await log(`[cancel] Deployment status is ${d.status} — aborting pipeline`);
    throw new DeploymentError("Cancelled by user");
  }
}

async function updateJobDeploymentId(jobId: string, deploymentId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { deploymentId },
  });
}

interface PromotePayload {
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
}

export async function runPromoteJob(
  job: Job & { project: Project; environment: Environment | null },
  log: LogFn
): Promise<void> {
  const { projectId, id: jobId, payload } = job;
  const project = job.project;

  const p = payload as unknown as PromotePayload;
  const sourceEnvironmentId = p?.sourceEnvironmentId;
  const targetEnvironmentId = p?.targetEnvironmentId ?? job.environmentId ?? undefined;

  if (!sourceEnvironmentId || !targetEnvironmentId) {
    await failJob(jobId, "Promote job missing sourceEnvironmentId or targetEnvironmentId");
    await log(`Invalid promote payload`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  if (sourceEnvironmentId === targetEnvironmentId) {
    await failJob(jobId, "Source and target environment must differ");
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  const sourceEnv = await envRepo.findById(sourceEnvironmentId);
  const targetEnv = await envRepo.findById(targetEnvironmentId);

  if (!sourceEnv || sourceEnv.projectId !== projectId) {
    await failJob(jobId, `Source environment not found for project ${projectId}`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }
  if (!targetEnv || targetEnv.projectId !== projectId) {
    await failJob(jobId, `Target environment not found for project ${projectId}`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  const sourceActive = await repo.findActiveForEnvironment(sourceEnvironmentId);
  if (!sourceActive) {
    await failJob(jobId, "No ACTIVE deployment in source environment — nothing to promote");
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  const imageTag = sourceActive.imageTag;

  const acquired = await envRepo.acquireDeployLock(targetEnvironmentId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for target environment ${targetEnvironmentId}`);
    await log(`Deploy lock already held on target — rejecting promote`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  let deploymentId: string | undefined;

  try {
    await log(
      `Promoting image ${imageTag} from ${sourceEnv.name} (${sourceEnvironmentId}) → ${targetEnv.name} (${targetEnvironmentId})`
    );

    const activeDeployment = await repo.findActiveForEnvironment(targetEnvironmentId);
    const newColor =
      activeDeployment?.color === DeploymentColor.BLUE ? DeploymentColor.GREEN : DeploymentColor.BLUE;
    const hostPort = newColor === DeploymentColor.BLUE ? targetEnv.basePort : targetEnv.basePort + 1;
    const containerName = `${project.name}-${targetEnv.name}-${newColor.toLowerCase()}`;
    const version = await repo.getNextVersionForEnvironment(targetEnvironmentId);

    await log(
      `Target slot: color=${newColor}, hostPort=${hostPort}, container=${containerName}, version=${version} (reusing image, no build)`
    );

    await log(`Creating DEPLOYING deployment record (promotedFrom=${sourceActive.id})`);
    const deployment = await repo.create({
      version,
      imageTag,
      containerName,
      port: hostPort,
      color: newColor,
      status: DeploymentStatus.DEPLOYING,
      promotedFrom: { connect: { id: sourceActive.id } },
      environment: { connect: { id: targetEnvironmentId } },
    });
    deploymentId = deployment.id;

    await updateJobDeploymentId(jobId, deploymentId);

    await log(`Starting container from existing image (no build)`);
    await stopContainer(containerName).catch(() => null);
    await removeContainer(containerName).catch(() => null);
    await freeHostPort(hostPort);
    const projectEnv = parseProjectEnv(project.env);
    const envKeys = Object.keys(projectEnv);
    if (envKeys.length > 0) {
      await log(`Injecting env keys: ${envKeys.join(", ")}`);
    }
    await runContainer(
      containerName,
      imageTag,
      hostPort,
      targetEnv.appPort,
      config.dockerNetwork,
      projectEnv
    );
    await checkCancelled(deploymentId, log);

    await log(`Health check http://localhost:${hostPort}${project.healthPath}`);
    const health = await validation.validate(
      `http://localhost:${hostPort}`,
      project.healthPath,
      containerName
    );
    if (!health.success) {
      throw new DeploymentError(health.error ?? "Health check failed");
    }
    await checkCancelled(deploymentId, log);

    await log(`Switching traffic to port ${hostPort}`);
    await traffic.switchTrafficTo(hostPort);

    await log(`Activating deployment and retiring previous slot on target`);
    await repo.updateStatus(deployment.id, DeploymentStatus.ACTIVE);

    if (activeDeployment) {
      await log(`Stopping old container: ${activeDeployment.containerName}`);
      await stopContainer(activeDeployment.containerName).catch(async (err) => {
        await log(`Warning: failed to stop old container: ${err instanceof Error ? err.message : String(err)}`);
      });
      await removeContainer(activeDeployment.containerName).catch(async (err) => {
        await log(`Warning: failed to remove old container: ${err instanceof Error ? err.message : String(err)}`);
      });
      await repo.updateStatus(activeDeployment.id, DeploymentStatus.ROLLED_BACK);
    }

    await log(`Promotion successful — ${containerName} is live on port ${hostPort}`);

    await completeJob(jobId, {
      deployment: { ...deployment, status: DeploymentStatus.ACTIVE },
      promotedFromDeploymentId: sourceActive.id,
      message: `Promoted ${imageTag} to ${targetEnv.name}`,
    });
    logEmitter.emitStatus(jobId, "COMPLETE");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const friendly = humanizeDeployFailure(errMsg);
    if (deploymentId) {
      await repo.updateStatus(deploymentId, DeploymentStatus.FAILED, friendly).catch(() => null);
    }
    await failJob(jobId, friendly);
    await log(`FAILED: ${friendly}`);
    logEmitter.emitStatus(jobId, "FAILED");
  } finally {
    await envRepo.releaseDeployLock(targetEnvironmentId);
    await log(`Deploy lock released on target environment`);
  }
}
