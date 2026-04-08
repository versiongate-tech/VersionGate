import { Deployment, DeploymentStatus, Project } from "@prisma/client";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { inspectContainer } from "../utils/docker";
import { logger } from "../utils/logger";

const INTERVAL_MS = 60_000;

export class ContainerMonitorService {
  private readonly repo: DeploymentRepository;
  private timer: ReturnType<typeof setInterval> | undefined;
  private tickRunning = false;

  constructor() {
    this.repo = new DeploymentRepository();
  }

  /**
   * Starts the background monitor loop.
   * Uses setInterval with unref() so it never prevents clean process exit.
   * The first check fires after one full interval (reconciliation already
   * audits containers at startup).
   */
  start(): void {
    if (this.timer) return; // guard against double-start

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        // tick() is internally resilient — this only fires on truly unexpected throws
        logger.error({ err }, "ContainerMonitor: unexpected error in tick");
      });
    }, INTERVAL_MS);

    this.timer.unref();
    logger.info({ intervalMs: INTERVAL_MS }, "ContainerMonitor: started");
  }

  /**
   * Stops the monitor loop. Called during graceful shutdown.
   */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    logger.info("ContainerMonitor: stopped");
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * One monitor cycle. A tickRunning flag ensures that if inspection of many
   * containers takes longer than INTERVAL_MS, the next scheduled tick is
   * skipped rather than running concurrently.
   */
  private async tick(): Promise<void> {
    if (this.tickRunning) {
      logger.warn("ContainerMonitor: previous tick still running — skipping this interval");
      return;
    }

    this.tickRunning = true;
    try {
      await this.checkAllActive();
    } finally {
      this.tickRunning = false;
    }
  }

  /**
   * Fetches all ACTIVE deployments and inspects each one.
   * A failure to fetch from the DB is logged and the tick is aborted.
   * A failure on any individual container is isolated — others continue.
   */
  private async checkAllActive(): Promise<void> {
    let active: (Deployment & { project: Project })[];

    try {
      active = await this.repo.findAllActiveWithProjects();
    } catch (err) {
      logger.error({ err }, "ContainerMonitor: failed to fetch active deployments — skipping tick");
      return;
    }

    if (active.length === 0) return;

    logger.debug({ count: active.length }, "ContainerMonitor: inspecting active containers");

    for (const deployment of active) {
      await this.checkContainer(deployment);
    }
  }

  /**
   * Inspects one container. If docker inspect throws or returns not-running,
   * the deployment is marked FAILED. Errors at every step are caught locally
   * so the loop continues to the next project.
   */
  private async checkContainer(
    deployment: Deployment & { project: Project }
  ): Promise<void> {
    const { id: deploymentId, containerName, project } = deployment;

    let running: boolean;
    try {
      running = await inspectContainer(containerName);
    } catch (err) {
      logger.error(
        { err, containerName, projectName: project.name, deploymentId },
        "ContainerMonitor: docker inspect threw — skipping this container"
      );
      return;
    }

    if (running) return;

    logger.error(
      {
        projectName: project.name,
        containerName,
        deploymentId,
        projectId: project.id,
      },
      "ContainerMonitor: container is not running — marking deployment FAILED"
    );

    try {
      await this.repo.updateStatus(
        deploymentId,
        DeploymentStatus.FAILED,
        "Container is not running (removed or exited)"
      );
    } catch (err) {
      logger.error(
        { err, deploymentId, projectName: project.name },
        "ContainerMonitor: failed to persist FAILED status — will retry next interval"
      );
    }
  }
}
