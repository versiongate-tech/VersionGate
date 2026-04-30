import { DeploymentColor, DeploymentStatus, Environment, Job, Project } from "@prisma/client";
import { config } from "../../config/env";
import { parseProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { ProjectRepository } from "../../repositories/project.repository";
import { EnvironmentRepository } from "../../repositories/environment.repository";
import { runContainer, stopContainer, removeContainer, freeHostPort } from "../../utils/docker";
import { DeploymentError } from "../../utils/errors";
import { TrafficService } from "../../services/traffic.service";
import { ValidationService } from "../../services/validation.service";
import { completeJob, failJob } from "../../services/job-queue";
import { humanizeDeployFailure } from "../../utils/deploy-errors";
import { logEmitter } from "../../events/log-emitter";
import prisma from "../../prisma/client";
import type { LogFn } from "./deploy.handler";

const repo = new DeploymentRepository();
const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();
const traffic = new TrafficService();
const validation = new ValidationService();

function containerBaseName(projectName: string, env: Environment): string {
  const slug = env.name.toLowerCase().replace(/\s+/g, "-");
  return `${projectName}-${slug}`;
}

async function updateJobDeploymentId(jobId: string, deploymentId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { deploymentId },
  });
}

/**
 * Promotes the upstream environment's ACTIVE image to this environment (build once, promote artifact).
 */
export async function runPromoteJob(job: Job & { project: Project }, log: LogFn): Promise<void> {
  const { projectId, id: jobId } = job;
  const project = job.project;
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const targetEnvironmentId =
    typeof payload.targetEnvironmentId === "string" ? payload.targetEnvironmentId.trim() : "";

  const acquired = await projectRepo.acquireDeployLock(projectId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for project ${projectId}`);
    await log(`Deploy lock already held — rejecting promote`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  let deploymentId: string | undefined;

  try {
    if (!targetEnvironmentId) {
      throw new DeploymentError("Missing targetEnvironmentId in job payload");
    }

    const targetEnv = await envRepo.findById(targetEnvironmentId);
    if (!targetEnv || targetEnv.projectId !== projectId) {
      throw new DeploymentError("Invalid promote target environment");
    }

    if (targetEnv.chainOrder === 0) {
      throw new DeploymentError("Cannot promote into the first environment in the chain");
    }

    const upstream = await envRepo.findUpstream(targetEnv);
    if (!upstream) {
      throw new DeploymentError("No upstream environment");
    }

    const sourceDeployment = await repo.findActiveForEnvironment(upstream.id);
    if (!sourceDeployment || sourceDeployment.status !== DeploymentStatus.ACTIVE) {
      throw new DeploymentError(
        `Upstream environment "${upstream.name}" has no successful ACTIVE deployment to promote`
      );
    }

    await log(
      `Promoting image ${sourceDeployment.imageTag} from ${upstream.name} → ${targetEnv.name}`
    );

    const prodEnv = await envRepo.findProductionForProject(projectId);
    const switchPublicTraffic = prodEnv?.id === targetEnv.id;

    const activeOnTarget = await repo.findActiveForEnvironment(targetEnv.id);
    const newColor =
      activeOnTarget?.color === DeploymentColor.BLUE ? DeploymentColor.GREEN : DeploymentColor.BLUE;
    const hostPort = newColor === DeploymentColor.BLUE ? targetEnv.basePort : targetEnv.basePort + 1;
    const containerName = `${containerBaseName(project.name, targetEnv)}-${newColor.toLowerCase()}`;
    const imageTag = sourceDeployment.imageTag;
    const version = await repo.getNextVersionForProject(projectId);

    const deployment = await repo.create({
      version,
      imageTag,
      containerName,
      port: hostPort,
      color: newColor,
      status: DeploymentStatus.DEPLOYING,
      project: { connect: { id: projectId } },
      environment: { connect: { id: targetEnv.id } },
      promotedFrom: { connect: { id: sourceDeployment.id } },
    });
    deploymentId = deployment.id;
    await updateJobDeploymentId(jobId, deploymentId);

    await log(`Starting container from promoted image (no rebuild)`);
    await stopContainer(containerName).catch(() => null);
    await removeContainer(containerName).catch(() => null);
    await freeHostPort(hostPort);
    const projectEnv = parseProjectEnv(project.env);
    await runContainer(
      containerName,
      imageTag,
      hostPort,
      targetEnv.appPort,
      config.dockerNetwork,
      projectEnv
    );

    await log(`Health check http://localhost:${hostPort}${project.healthPath}`);
    const health = await validation.validate(
      `http://localhost:${hostPort}`,
      project.healthPath,
      containerName
    );
    if (!health.success) {
      throw new DeploymentError(health.error ?? "Health check failed");
    }

    if (switchPublicTraffic) {
      await log(`Switching Nginx traffic to port ${hostPort}`);
      await traffic.switchTrafficTo(hostPort);
    } else {
      await log(`Skipping Nginx switch (non-production environment)`);
    }

    await repo.updateStatus(deployment.id, DeploymentStatus.ACTIVE);

    if (activeOnTarget) {
      await log(`Stopping previous slot: ${activeOnTarget.containerName}`);
      await stopContainer(activeOnTarget.containerName).catch(() => null);
      await removeContainer(activeOnTarget.containerName).catch(() => null);
      await repo.updateStatus(activeOnTarget.id, DeploymentStatus.ROLLED_BACK);
    }

    await log(`Promotion successful — ${containerName} on port ${hostPort}`);

    await completeJob(jobId, {
      deployment: { ...deployment, status: DeploymentStatus.ACTIVE },
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
    await projectRepo.releaseDeployLock(projectId);
    await log(`Deploy lock released`);
  }
}
