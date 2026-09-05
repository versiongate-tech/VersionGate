import { decryptProjectEnv } from "../../utils/env";
import { DeploymentRepository } from "../../repositories/deployment.repository";
import { EnvironmentRepository } from "../../repositories/environment.repository";
import { JobSelect, ProjectSelect, EnvironmentSelect } from "../../db/schema";
import { TrafficService } from "../../services/traffic.service";
import { ValidationService } from "../../services/validation.service";
import { runContainer, stopContainer, removeContainer } from "../../utils/docker";
import { config } from "../../config/env";
import { DeploymentError, BadRequestError } from "../../utils/errors";
import { completeJob, failJob } from "../../services/job-queue.service";
import { humanizeDeployFailure } from "../../utils/deploy-errors";
import { logEmitter } from "../../events/log-emitter";
import { DEFAULT_ENVIRONMENT_NAME } from "../../repositories/environment.repository";
import { syncCustomDomainUpstream } from "../../services/project-domain.service";

const repo = new DeploymentRepository();
const envRepo = new EnvironmentRepository();
const traffic = new TrafficService();
const validation = new ValidationService();

export type LogFn = (line: string) => void | Promise<void>;

export async function runRollbackJob(
  job: JobSelect & { project: ProjectSelect; environment: EnvironmentSelect | null },
  log: LogFn
): Promise<void> {
  const { projectId, id: jobId } = job;
  const project = job.project;

  const environment =
    job.environment ?? (await envRepo.findDefaultForProject(projectId));
  if (!environment) {
    await failJob(jobId, `No environment for project ${projectId}`);
    await log(`No default environment — cannot rollback`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  const environmentId = environment.id;

  const acquired = await envRepo.acquireDeployLock(environmentId);
  if (!acquired) {
    await failJob(jobId, `Deployment already in progress for environment ${environmentId}`);
    await log(`Deploy lock already held — cannot rollback`);
    logEmitter.emitStatus(jobId, "FAILED");
    return;
  }

  try {
    await log(
      `Initiating rollback for project ${project.name} (${projectId}), env ${environment.name} (${environmentId})`
    );

    const current = await repo.findActiveForEnvironment(environmentId);
    if (!current) {
      throw new BadRequestError("No active deployment to roll back from");
    }

    const previous = await repo.findPreviousForEnvironment(environmentId, current.version);
    if (!previous) {
      throw new BadRequestError("No previous deployment available for rollback");
    }

    if (previous.version === current.version) {
      throw new BadRequestError("Already at the earliest available deployment");
    }

    await log(
      `Rolling back from ${current.containerName} (v${current.version}) to ${previous.containerName} (v${previous.version})`
    );

    const projectEnv = decryptProjectEnv(project.env);
    const stageEnv = decryptProjectEnv((environment as typeof environment & { env?: unknown }).env);
    const mergedEnv = { ...projectEnv, ...stageEnv };
    const envKeys = Object.keys(mergedEnv);

    const { inspectContainer, imageExists } = await import("../../utils/docker");
    let isAlreadyRunning = false;
    try {
      isAlreadyRunning = await inspectContainer(previous.containerName);
    } catch {
      isAlreadyRunning = false;
    }

    if (isAlreadyRunning) {
      await log(`[WARM-SWAP] Previous container ${previous.containerName} is already running. Verifying health…`);
    } else {
      const isCached = await imageExists(previous.imageTag);
      if (isCached) {
        await log(`[WARM-SWAP] Found cached Docker image ${previous.imageTag}. Spinning up instant container…`);
      } else {
        await log(`Starting container for image ${previous.imageTag}…`);
      }

      await stopContainer(previous.containerName).catch(() => null);
      await removeContainer(previous.containerName).catch(() => null);

      if (envKeys.length > 0) {
        await log(`Injecting env keys: ${envKeys.join(", ")}`);
      }
      await runContainer(
        previous.containerName,
        previous.imageTag,
        previous.port,
        environment.appPort,
        config.dockerNetwork,
        mergedEnv
      );
    }

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
    await traffic.switchTrafficTo(previous.port, {
      projectName: project.name,
      environmentName: environment.name,
    });
    if (environment.name === DEFAULT_ENVIRONMENT_NAME) {
      await syncCustomDomainUpstream(project.name, previous.port);
    }

    await log(`Stopping current container: ${current.containerName}`);
    await stopContainer(current.containerName).catch(async (err) => {
      await log(`Warning: failed to stop current container: ${err instanceof Error ? err.message : String(err)}`);
    });
    await removeContainer(current.containerName).catch(async (err) => {
      await log(`Warning: failed to remove current container: ${err instanceof Error ? err.message : String(err)}`);
    });

    await repo.updateStatus(current.id, "ROLLED_BACK");
    await repo.updateStatus(previous.id, "ACTIVE");

    const message = `Rolled back from v${current.version} to v${previous.version}`;
    await log(`Rollback completed: ${message}`);

    await completeJob(jobId, {
      rolledBackFrom: { ...current, status: "ROLLED_BACK" },
      restoredTo: { ...previous, status: "ACTIVE" },
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
    await envRepo.releaseDeployLock(environmentId);
    await log(`Deploy lock released`);
  }
}
