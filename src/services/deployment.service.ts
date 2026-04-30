import { Deployment, DeploymentColor, DeploymentStatus, Environment } from "@prisma/client";
import { config } from "../config/env";
import { parseProjectEnv } from "../utils/env";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { buildImage, runContainer, stopContainer, removeContainer, freeHostPort } from "../utils/docker";
import { ensureDockerfile } from "../utils/dockerfile";
import { logger } from "../utils/logger";
import { ConflictError, DeploymentError, NotFoundError } from "../utils/errors";
import { TrafficService } from "./traffic.service";
import { GitService } from "./git.service";

function containerBaseName(projectName: string, env: Environment): string {
  const slug = env.name.toLowerCase().replace(/\s+/g, "-");
  return `${projectName}-${slug}`;
}

export interface DeployOptions {
  projectId: string;
}

export interface DeployResult {
  deployment: Deployment;
  message: string;
}

export class DeploymentService {
  // Projects for which a cancel has been requested mid-deploy
  private static readonly cancelRequests = new Set<string>();

  private readonly repo: DeploymentRepository;
  private readonly projectRepo: ProjectRepository;
  private readonly envRepo: EnvironmentRepository;
  private readonly traffic: TrafficService;
  private readonly git: GitService;

  constructor() {
    this.repo = new DeploymentRepository();
    this.projectRepo = new ProjectRepository();
    this.envRepo = new EnvironmentRepository();
    this.traffic = new TrafficService();
    this.git = new GitService();
  }

  /**
   * Full blue-green deployment pipeline:
   * 1. Acquire per-project lock
   * 2. Fetch project config
   * 3. Clone/pull source via Git
   * 4. Build Docker image from source
   * 5. Determine color (BLUE/GREEN) and port
   * 6. Start new container
   * 7. Switch Nginx traffic
   * 8. Mark new ACTIVE, retire old
   * 9. Release lock (always — via finally)
   */
  async deploy(opts: DeployOptions): Promise<DeployResult> {
    const { projectId } = opts;

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project ${projectId}`);
    }

    if (!(await this.acquireLock(projectId))) {
      throw new ConflictError(`Deployment already in progress for project ${projectId}`);
    }

    let deploymentId: string | undefined;

    try {
      logger.info({ projectId, name: project.name }, "Starting deployment pipeline");

      const prodEnv = await this.envRepo.findProductionForProject(projectId);
      if (!prodEnv) {
        throw new DeploymentError("No Production environment — run DB migrations");
      }

      // ── Step 1: Prepare source ─────────────────────────────────────────────
      logger.info({ projectId, step: 1 }, "Preparing source code");
      await this.git.prepareSource(project, prodEnv.branch);
      this.checkCancelled(projectId);
      const repoRoot = this.git.projectPath(project);
      const buildContextPath = await ensureDockerfile(
        this.git.buildContextPath(project),
        prodEnv.appPort,
        repoRoot
      );

      // ── Step 2: Determine color and port ───────────────────────────────────
      const activeDeployment = await this.repo.findActiveForEnvironment(prodEnv.id);
      const newColor =
        activeDeployment?.color === DeploymentColor.BLUE
          ? DeploymentColor.GREEN
          : DeploymentColor.BLUE;
      const hostPort =
        newColor === DeploymentColor.BLUE ? prodEnv.basePort : prodEnv.basePort + 1;
      const containerName = `${containerBaseName(project.name, prodEnv)}-${newColor.toLowerCase()}`;
      const imageTag = `versiongate-${project.name}:${Date.now()}`;
      const version = await this.repo.getNextVersionForProject(projectId);

      logger.info(
        { projectId, step: 2, newColor, hostPort, containerName, imageTag },
        "Determined deployment target"
      );

      // ── Step 3: Create DEPLOYING record ───────────────────────────────────
      const deployment = await this.repo.create({
        version,
        imageTag,
        containerName,
        port: hostPort,
        color: newColor,
        status: DeploymentStatus.DEPLOYING,
        project: { connect: { id: projectId } },
        environment: { connect: { id: prodEnv.id } },
      });
      deploymentId = deployment.id;

      // ── Step 4: Build image ────────────────────────────────────────────────
      logger.info({ projectId, step: 4, imageTag, buildContextPath }, "Building Docker image");
      await buildImage(imageTag, buildContextPath);
      this.checkCancelled(projectId);

      // ── Step 5: Start container ────────────────────────────────────────────
      logger.info({ projectId, step: 5, containerName, hostPort }, "Starting container");
      // Pre-cleanup: remove any stale container with the same name AND free the
      // target port so we never hit "port already allocated".
      await stopContainer(containerName).catch(() => null);
      await removeContainer(containerName).catch(() => null);
      await freeHostPort(hostPort);
      const projectEnv = parseProjectEnv(project.env);
      const envKeys = Object.keys(projectEnv);
      if (envKeys.length > 0) {
        logger.info({ projectId, envKeys }, "Injecting env keys");
      }
      await runContainer(
        containerName,
        imageTag,
        hostPort,
        prodEnv.appPort,
        config.dockerNetwork,
        projectEnv
      );
      this.checkCancelled(projectId);

      // ── Step 6: Switch traffic ─────────────────────────────────────────────
      logger.info({ projectId, step: 6, hostPort }, "Switching traffic");
      await this.traffic.switchTrafficTo(hostPort);

      // ── Step 7: Activate new, retire old ──────────────────────────────────
      await this.repo.updateStatus(deployment.id, DeploymentStatus.ACTIVE);

      if (activeDeployment) {
        logger.info(
          { projectId, step: 7, oldContainer: activeDeployment.containerName },
          "Stopping old container"
        );
        await stopContainer(activeDeployment.containerName).catch((err) => {
          logger.warn({ err, containerName: activeDeployment.containerName }, "Failed to stop old container");
        });
        await removeContainer(activeDeployment.containerName).catch((err) => {
          logger.warn({ err, containerName: activeDeployment.containerName }, "Failed to remove old container");
        });
        await this.repo.updateStatus(activeDeployment.id, DeploymentStatus.ROLLED_BACK);
      }

      logger.info(
        { projectId, deploymentId: deployment.id, containerName },
        "Deployment successful"
      );

      return {
        deployment: { ...deployment, status: DeploymentStatus.ACTIVE },
        message: `Deployment successful — ${containerName} is live on port ${hostPort}`,
      };
    } catch (err) {
      // Mark FAILED with the error message so the dashboard can display it
      if (deploymentId) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.repo
          .updateStatus(deploymentId, DeploymentStatus.FAILED, errMsg)
          .catch(() => null);
      }
      throw err;
    } finally {
      DeploymentService.cancelRequests.delete(projectId);
      await this.releaseLock(projectId);
    }
  }

  /**
   * Requests cancellation of the in-progress deployment for a project.
   * Marks the flag (so the pipeline throws on the next checkpoint) and
   * stops the container immediately so health-check retries exit fast.
   */
  async cancelDeploy(projectId: string): Promise<{ cancelled: boolean }> {
    const deploying = await this.repo.findDeployingForProject(projectId);

    if (!deploying) {
      throw new NotFoundError(`No in-progress deployment found for project ${projectId}`);
    }

    // Signal the running pipeline to stop if this process is handling it.
    DeploymentService.cancelRequests.add(projectId);

    // Stop + remove the container regardless (handles stale DEPLOYING records too)
    if (deploying.containerName) {
      await stopContainer(deploying.containerName).catch(() => null);
      await removeContainer(deploying.containerName).catch(() => null);
    }

    // Mark the deployment as FAILED so the UI unblocks
    await this.repo.updateStatus(deploying.id, DeploymentStatus.FAILED, "Cancelled by user").catch(() => null);

    // Release the persisted lock so a fresh deploy can start.
    await this.releaseLock(projectId);
    DeploymentService.cancelRequests.delete(projectId);

    logger.info({ projectId, deploymentId: deploying.id }, "Deployment cancelled");
    return { cancelled: true };
  }

  async getActiveDeployment(projectId?: string): Promise<Deployment | null> {
    if (projectId) {
      return this.repo.findActiveForProject(projectId);
    }
    return this.repo.findAll().then((all) => all.find((d) => d.status === DeploymentStatus.ACTIVE) ?? null);
  }

  async getAllDeployments(projectId?: string): Promise<Deployment[]> {
    if (projectId) {
      return this.repo.findAllForProject(projectId);
    }
    return this.repo.findAll();
  }

  private checkCancelled(projectId: string): void {
    if (DeploymentService.cancelRequests.has(projectId)) {
      throw new DeploymentError("Cancelled by user");
    }
  }

  private async acquireLock(projectId: string): Promise<boolean> {
    const acquired = await this.projectRepo.acquireDeployLock(projectId);

    if (!acquired) {
      logger.warn({ projectId }, "Deploy lock already held — rejecting concurrent deploy");
      return false;
    }

    logger.info({ projectId }, "Deploy lock acquired");
    return true;
  }

  private async releaseLock(projectId: string): Promise<void> {
    await this.projectRepo.releaseDeployLock(projectId);
    logger.info({ projectId }, "Deploy lock released");
  }
}
