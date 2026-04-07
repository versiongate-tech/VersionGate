import { DeploymentStatus, Job, Project } from "@prisma/client";
import { parseProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { ProjectRepository } from "../../repositories/project.repository";
import { TrafficService } from "../../services/traffic.service";
import { ValidationService } from "../../services/validation.service";
import { runContainer, stopContainer, removeContainer } from "../../utils/docker";
import { config } from "../../config/env";
import { DeploymentError, BadRequestError } from "../../utils/errors";
import { completeJob, failJob } from "../../services/job-queue";
import { humanizeDeployFailure } from "../../utils/deploy-errors";
import { logEmitter } from "../../events/log-emitter";

const repo = new DeploymentRepository();
const projectRepo = new ProjectRepository();
const traffic = new TrafficService();
const validation = new ValidationService();

export type LogFn = (line: string) => void | Promise<void>;

export async function runRollbackJob(job: Job & { project: Project }, log: LogFn): Promise<void> {
  const { projectId, id: jobId } = job;
  const project = job.project;

  const acquired = await projectRepo.acquireDeployLock(projectId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for project ${projectId}`);
    await log(`Deploy lock already held — cannot rollback`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  try {
    await log(`Initiating rollback for project ${project.name} (${projectId})`);

    const current = await repo.findActiveForProject(projectId);
    if (!current) {
      throw new BadRequestError("No active deployment to roll back from");
    }

    const previous = await repo.findPreviousForProject(projectId, current.version);
    if (!previous) {
      throw new BadRequestError("No previous deployment available for rollback");
    }

    if (previous.version === current.version) {
      throw new BadRequestError("Already at the earliest available deployment");
    }

    await log(`Rolling back from ${current.containerName} (v${current.version}) to ${previous.containerName} (v${previous.version})`);

    await log(`Restarting previous container: ${previous.containerName}`);
    const projectEnv = parseProjectEnv(project.env);
    const envKeys = Object.keys(projectEnv);
    if (envKeys.length > 0) {
      await log(`Injecting env keys: ${envKeys.join(", ")}`);
    }
    await runContainer(
      previous.containerName,
      previous.imageTag,
      previous.port,
      project.appPort,
      config.dockerNetwork,
      projectEnv
    );

    await log(`Validating health at http://localhost:${previous.port}${project.healthPath}`);
    const result = await validation.validate(
      `http://localhost:${previous.port}`,
      project.healthPath,
      previous.containerName
    );

    if (!result.success) {
      await stopContainer(previous.containerName).catch(() => null);
      await removeContainer(previous.containerName).catch(() => null);
      throw new DeploymentError(
        `Rollback failed — previous container unhealthy: ${result.error ?? "unknown error"}`
      );
    }

    await log(`Switching traffic to port ${previous.port}`);
    await traffic.switchTrafficTo(previous.port);

    await log(`Stopping current container: ${current.containerName}`);
    await stopContainer(current.containerName).catch(async (err) => {
      await log(`Warning: failed to stop current container: ${err instanceof Error ? err.message : String(err)}`);
    });
    await removeContainer(current.containerName).catch(async (err) => {
      await log(`Warning: failed to remove current container: ${err instanceof Error ? err.message : String(err)}`);
    });

    await repo.updateStatus(current.id, DeploymentStatus.ROLLED_BACK);
    await repo.updateStatus(previous.id, DeploymentStatus.ACTIVE);

    const message = `Rolled back from v${current.version} to v${previous.version}`;
    await log(`Rollback completed: ${message}`);

    await completeJob(jobId, {
      rolledBackFrom: { ...current, status: DeploymentStatus.ROLLED_BACK },
      restoredTo: { ...previous, status: DeploymentStatus.ACTIVE },
      message,
    });
    logEmitter.emitStatus(jobId, "COMPLETE");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const friendly = humanizeDeployFailure(errMsg);
    await failJob(jobId, friendly);
    await log(`FAILED: ${friendly}`);
    logEmitter.emitStatus(jobId, "FAILED");
  } finally {
    await projectRepo.releaseDeployLock(projectId);
    await log(`Deploy lock released`);
  }
}
