import { Deployment, DeploymentColor, DeploymentStatus } from "@prisma/client";
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

export interface DeployOptions {
  projectId: string;
  environmentId: string;
}

export interface DeployResult {
  deployment: Deployment;
  message: string;
}

export class DeploymentService {
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

  async deploy(opts: DeployOptions): Promise<DeployResult> {
    const { projectId, environmentId } = opts;

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project ${projectId}`);
    }

    const envRow = await this.envRepo.findById(environmentId);
    if (!envRow || envRow.projectId !== projectId) {
      throw new NotFoundError(`Environment ${environmentId}`);
    }

    if (!(await this.acquireLock(environmentId))) {
      throw new ConflictError(`Deployment already in progress for environment ${environmentId}`);
    }

    let deploymentId: string | undefined;

    try {
      logger.info({ projectId, environmentId, name: project.name }, "Starting deployment pipeline");

      logger.info({ projectId, environmentId, step: 1 }, "Preparing source code");
      await this.git.prepareSource(project);
      this.checkCancelled(environmentId);
      const repoRoot = this.git.projectPath(project);
      const buildContextPath = await ensureDockerfile(
        this.git.buildContextPath(project),
        envRow.appPort,
        repoRoot
      );

      const activeDeployment = await this.repo.findActiveForEnvironment(environmentId);
      const newColor =
        activeDeployment?.color === DeploymentColor.BLUE
          ? DeploymentColor.GREEN
          : DeploymentColor.BLUE;
      const hostPort = newColor === DeploymentColor.BLUE ? envRow.basePort : envRow.basePort + 1;
      const containerName = `${project.name}-${envRow.name}-${newColor.toLowerCase()}`;
      const imageTag = `versiongate-${project.name}:${Date.now()}`;
      const version = await this.repo.getNextVersionForEnvironment(environmentId);

      logger.info(
        { projectId, environmentId, step: 2, newColor, hostPort, containerName, imageTag },
        "Determined deployment target"
      );

      const deployment = await this.repo.create({
        version,
        imageTag,
        containerName,
        port: hostPort,
        color: newColor,
        status: DeploymentStatus.DEPLOYING,
        environment: { connect: { id: environmentId } },
      });
      deploymentId = deployment.id;

      logger.info({ projectId, environmentId, step: 4, imageTag, buildContextPath }, "Building Docker image");
      await buildImage(imageTag, buildContextPath);
      this.checkCancelled(environmentId);

      logger.info({ projectId, environmentId, step: 5, containerName, hostPort }, "Starting container");
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
        envRow.appPort,
        config.dockerNetwork,
        projectEnv
      );
      this.checkCancelled(environmentId);

      logger.info({ projectId, environmentId, step: 6, hostPort }, "Switching traffic");
      await this.traffic.switchTrafficTo(hostPort);

      await this.repo.updateStatus(deployment.id, DeploymentStatus.ACTIVE);

      if (activeDeployment) {
        logger.info(
          { projectId, environmentId, step: 7, oldContainer: activeDeployment.containerName },
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
        { projectId, environmentId, deploymentId: deployment.id, containerName },
        "Deployment successful"
      );

      return {
        deployment: { ...deployment, status: DeploymentStatus.ACTIVE },
        message: `Deployment successful — ${containerName} is live on port ${hostPort}`,
      };
    } catch (err) {
      if (deploymentId) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.repo
          .updateStatus(deploymentId, DeploymentStatus.FAILED, errMsg)
          .catch(() => null);
      }
      throw err;
    } finally {
      DeploymentService.cancelRequests.delete(environmentId);
      await this.releaseLock(environmentId);
    }
  }

  async cancelDeploy(projectId: string): Promise<{ cancelled: boolean }> {
    const defaultEnv = await this.envRepo.findDefaultForProject(projectId);
    if (!defaultEnv) {
      throw new NotFoundError(`No default environment for project ${projectId}`);
    }

    const deploying = await this.repo.findDeployingForEnvironment(defaultEnv.id);

    if (!deploying) {
      throw new NotFoundError(`No in-progress deployment found for project ${projectId}`);
    }

    DeploymentService.cancelRequests.add(defaultEnv.id);

    if (deploying.containerName) {
      await stopContainer(deploying.containerName).catch(() => null);
      await removeContainer(deploying.containerName).catch(() => null);
    }

    await this.repo.updateStatus(deploying.id, DeploymentStatus.FAILED, "Cancelled by user").catch(() => null);

    await this.releaseLock(defaultEnv.id);
    DeploymentService.cancelRequests.delete(defaultEnv.id);

    logger.info({ projectId, environmentId: defaultEnv.id, deploymentId: deploying.id }, "Deployment cancelled");
    return { cancelled: true };
  }

  async getActiveDeployment(projectId?: string): Promise<Deployment | null> {
    if (projectId) {
      const env = await this.envRepo.findDefaultForProject(projectId);
      if (!env) return null;
      return this.repo.findActiveForEnvironment(env.id);
    }
    return this.repo.findAll().then((all) => all.find((d) => d.status === DeploymentStatus.ACTIVE) ?? null);
  }

  async getAllDeployments(projectId?: string): Promise<Deployment[]> {
    if (projectId) {
      return this.repo.findAllForProject(projectId);
    }
    return this.repo.findAll();
  }

  private checkCancelled(environmentId: string): void {
    if (DeploymentService.cancelRequests.has(environmentId)) {
      throw new DeploymentError("Cancelled by user");
    }
  }

  private async acquireLock(environmentId: string): Promise<boolean> {
    const acquired = await this.envRepo.acquireDeployLock(environmentId);

    if (!acquired) {
      logger.warn({ environmentId }, "Deploy lock already held — rejecting concurrent deploy");
      return false;
    }

    logger.info({ environmentId }, "Deploy lock acquired");
    return true;
  }

  private async releaseLock(environmentId: string): Promise<void> {
    await this.envRepo.releaseDeployLock(environmentId);
    logger.info({ environmentId }, "Deploy lock released");
  }
}
