import { DeploymentRepository } from "../repositories/deployment.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { stopContainer, removeContainer, inspectContainer } from "../utils/docker";
import { DeploymentStatus } from "@prisma/client";
import { logger } from "../utils/logger";

export interface ReconciliationReport {
  deployingFixed: number;
  activeInvalidated: number;
}

export class ReconciliationService {
  private readonly repo: DeploymentRepository;
  private readonly envRepo: EnvironmentRepository;

  constructor() {
    this.repo = new DeploymentRepository();
    this.envRepo = new EnvironmentRepository();
  }

  /**
   * Runs on server startup to recover from crashes and audit container state.
   *
   * Step 1 — Crash recovery:
   *   Any deployment left in DEPLOYING state means the process died mid-deploy.
   *   Stop and remove the associated container (ignore errors), then mark FAILED.
   *
   * Step 2 — Container health audit:
   *   For every ACTIVE deployment, inspect the Docker container.
   *   If the container is not running, mark the deployment FAILED.
   *   Traffic is NOT automatically switched — operator must redeploy.
   */
  async reconcile(): Promise<ReconciliationReport> {
    logger.info("Starting startup reconciliation");

    const deployingFixed = await this.fixDeployingDeployments();
    const staleLocksCleared = await this.envRepo.clearStaleDeployLocks();
    const activeInvalidated = await this.auditActiveDeployments();

    logger.info(
      { deployingFixed, staleLocksCleared, activeInvalidated },
      "Reconciliation complete"
    );
    return { deployingFixed, activeInvalidated };
  }

  private async fixDeployingDeployments(): Promise<number> {
    const deploying = await this.repo.findAllDeploying();
    if (deploying.length === 0) return 0;

    logger.warn({ count: deploying.length }, "Found DEPLOYING deployments — crash recovery");

    for (const d of deploying) {
      logger.warn(
        { deploymentId: d.id, containerName: d.containerName, environmentId: d.environmentId },
        "Recovering crashed deployment"
      );
      await stopContainer(d.containerName).catch(() => null);
      await removeContainer(d.containerName).catch(() => null);
      await this.repo.updateStatus(d.id, DeploymentStatus.FAILED).catch((err) => {
        logger.error({ err, deploymentId: d.id }, "Failed to mark crashed deployment as FAILED");
      });
    }

    return deploying.length;
  }

  private async auditActiveDeployments(): Promise<number> {
    const active = await this.repo.findAllActiveWithProjects();
    if (active.length === 0) return 0;

    let invalidated = 0;

    for (const d of active) {
      let running: boolean;
      try {
        running = await inspectContainer(d.containerName);
      } catch (err) {
        logger.warn(
          { err, deploymentId: d.id, containerName: d.containerName, environmentId: d.environmentId },
          "Reconciliation: docker inspect failed — skipping this deployment (will retry on next startup)"
        );
        continue;
      }
      if (!running) {
        logger.warn(
          { deploymentId: d.id, containerName: d.containerName, environmentId: d.environmentId },
          "ACTIVE deployment container is not running — marking FAILED"
        );
        await this.repo
          .updateStatus(
            d.id,
            DeploymentStatus.FAILED,
            "Container is not running (removed or exited)"
          )
          .catch((err) => {
            logger.error({ err, deploymentId: d.id }, "Failed to invalidate dead deployment");
          });
        invalidated++;
      }
    }

    return invalidated;
  }
}
