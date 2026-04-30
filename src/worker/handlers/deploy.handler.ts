import { DeploymentColor, DeploymentStatus, Environment, Job, Project } from "@prisma/client";
import { config } from "../../config/env";
import { parseProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { ProjectRepository } from "../../repositories/project.repository";
import { EnvironmentRepository } from "../../repositories/environment.repository";
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
const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();
const traffic = new TrafficService();
const git = new GitService();
const validation = new ValidationService();

function containerBaseName(projectName: string, env: Environment): string {
  const slug = env.name.toLowerCase().replace(/\s+/g, "-");
  return `${projectName}-${slug}`;
}

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

export async function runDeployJob(job: Job & { project: Project }, log: LogFn): Promise<void> {
  const { projectId, id: jobId } = job;
  const project = job.project;

  const acquired = await projectRepo.acquireDeployLock(projectId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for project ${projectId}`);
    await log(`Deploy lock already held — rejecting job`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  let deploymentId: string | undefined;

  try {
    await log(`Starting deployment pipeline for project ${project.name} (${projectId})`);

    const payload = (job.payload ?? {}) as Record<string, unknown>;
    let environmentId = typeof payload.environmentId === "string" ? payload.environmentId.trim() : "";
    if (!environmentId) {
      const prod = await envRepo.findProductionForProject(projectId);
      if (!prod) {
        await failJob(jobId, "No Production environment — run DB migrations");
        await log(`FAILED: missing Production environment`);
        logEmitter.emitStatus(jobId, "FAILED");
        return;
      }
      environmentId = prod.id;
    }

    const targetEnv = await envRepo.findById(environmentId);
    if (!targetEnv || targetEnv.projectId !== projectId) {
      await failJob(jobId, "Invalid or unknown environmentId for this project");
      await log(`FAILED: invalid environment`);
      logEmitter.emitStatus(jobId, "FAILED");
      return;
    }

    const prodEnv = await envRepo.findProductionForProject(projectId);
    const switchPublicTraffic = prodEnv?.id === targetEnv.id;

    await log(`Step 1: Preparing source code (branch ${targetEnv.branch})`);
    await git.prepareSource(project, targetEnv.branch);
    await checkCancelled(undefined, log);

    const repoRoot = git.projectPath(project);
    const buildContextPath = await ensureDockerfile(git.buildContextPath(project), targetEnv.appPort, repoRoot);

    await log(`Step 2: Determining blue/green target (${targetEnv.name})`);
    const activeDeployment = await repo.findActiveForEnvironment(targetEnv.id);
    const newColor =
      activeDeployment?.color === DeploymentColor.BLUE ? DeploymentColor.GREEN : DeploymentColor.BLUE;
    const hostPort = newColor === DeploymentColor.BLUE ? targetEnv.basePort : targetEnv.basePort + 1;
    const containerName = `${containerBaseName(project.name, targetEnv)}-${newColor.toLowerCase()}`;
    const imageTag = `versiongate-${project.name}:${Date.now()}`;
    const version = await repo.getNextVersionForProject(projectId);

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
      project: { connect: { id: projectId } },
      environment: { connect: { id: targetEnv.id } },
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
      targetEnv.appPort,
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

    if (switchPublicTraffic) {
      await log(`Step 7: Switching traffic to port ${hostPort}`);
      await traffic.switchTrafficTo(hostPort);
    } else {
      await log(`Step 7: Skipping Nginx switch (non-production environment)`);
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
    await projectRepo.releaseDeployLock(projectId);
    await log(`Deploy lock released`);
  }
}
