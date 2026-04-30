import { DeploymentColor, DeploymentStatus, Environment, Job, Project } from "@prisma/client";
import { config } from "../../config/env";
import { parseProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { EnvironmentRepository, DEFAULT_ENVIRONMENT_NAME } from "../../repositories/environment.repository";
import { buildImage, runContainer, stopContainer, removeContainer, freeHostPort } from "../../utils/docker";
import { ensureDockerfile } from "../../utils/dockerfile";
import { DeploymentError } from "../../utils/errors";
import { TrafficService } from "../../services/traffic.service";
import { GitService } from "../../services/git.service";
import { ValidationService } from "../../services/validation.service";
import { completeJob, failJob } from "../../services/job-queue";
import { humanizeDeployFailure } from "../../utils/deploy-errors";
import { logEmitter } from "../../events/log-emitter";
import prisma from "../../prisma/client";

const repo = new DeploymentRepository();
const envRepo = new EnvironmentRepository();
const traffic = new TrafficService();
const git = new GitService();
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

export async function runDeployJob(
  job: Job & { project: Project; environment: Environment | null },
  log: LogFn
): Promise<void> {
  const { projectId, id: jobId } = job;
  const project = job.project;

  const environment =
    job.environment ?? (await envRepo.findDefaultForProject(projectId));
  if (!environment) {
    await failJob(jobId, `No environment for project ${projectId}`);
    await log(`No default environment — cannot deploy`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  const environmentId = environment.id;

  const acquired = await envRepo.acquireDeployLock(environmentId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for environment ${environmentId}`);
    await log(`Deploy lock already held — rejecting job`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  let deploymentId: string | undefined;

  try {
    await log(
      `Starting deployment pipeline for project ${project.name} (${projectId}), env ${environment.name} (${environmentId})`
    );

    await log(`Step 1: Preparing source code (branch ${environment.branch})`);
    await git.prepareSource(project, environment.branch);
    await checkCancelled(undefined, log);

    const repoRoot = git.projectPath(project);
    const buildContextPath = await ensureDockerfile(
      git.buildContextPath(project),
      environment.appPort,
      repoRoot
    );

    await log(`Step 2: Determining blue/green target`);
    const activeDeployment = await repo.findActiveForEnvironment(environmentId);
    const newColor =
      activeDeployment?.color === DeploymentColor.BLUE ? DeploymentColor.GREEN : DeploymentColor.BLUE;
    const hostPort = newColor === DeploymentColor.BLUE ? environment.basePort : environment.basePort + 1;
    const containerName = `${project.name}-${environment.name}-${newColor.toLowerCase()}`;
    const imageTag = `versiongate-${project.name}:${Date.now()}`;
    const version = await repo.getNextVersionForEnvironment(environmentId);

    await log(
      `Target: color=${newColor}, hostPort=${hostPort}, container=${containerName}, image=${imageTag}, version=${version}`
    );

    await log(`Step 3: Creating DEPLOYING deployment record`);
    const deployment = await repo.create({
      version,
      imageTag,
      containerName,
      port: hostPort,
      color: newColor,
      status: DeploymentStatus.DEPLOYING,
      environment: { connect: { id: environmentId } },
    });
    deploymentId = deployment.id;

    await updateJobDeploymentId(jobId, deploymentId);

    await log(`Step 4: Building Docker image`);
    await buildImage(imageTag, buildContextPath);
    await checkCancelled(deploymentId, log);

    await log(`Step 5: Starting container`);
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
      environment.appPort,
      config.dockerNetwork,
      projectEnv
    );
    await checkCancelled(deploymentId, log);

    await log(`Step 6: Health check http://localhost:${hostPort}${project.healthPath}`);
    const health = await validation.validate(
      `http://localhost:${hostPort}`,
      project.healthPath,
      containerName
    );
    if (!health.success) {
      throw new DeploymentError(health.error ?? "Health check failed");
    }
    await checkCancelled(deploymentId, log);

    const switchPublicTraffic = environment.name === DEFAULT_ENVIRONMENT_NAME;
    if (switchPublicTraffic) {
      await log(`Step 7: Switching traffic to port ${hostPort}`);
      await traffic.switchTrafficTo(hostPort);
    } else {
      await log(`Step 7: Skipping traffic switch (non-production environment)`);
    }

    await log(`Step 8: Activating deployment and retiring previous slot`);
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

    await log(`Deployment successful — ${containerName} is live on port ${hostPort}`);

    await completeJob(jobId, {
      deployment: { ...deployment, status: DeploymentStatus.ACTIVE },
      message: `Deployment successful — ${containerName} is live on port ${hostPort}`,
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
    await envRepo.releaseDeployLock(environmentId);
    await log(`Deploy lock released`);
  }
}
