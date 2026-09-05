import { decryptProjectEnv } from "../utils/env";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository, DEFAULT_ENVIRONMENT_NAME } from "../repositories/environment.repository";
import { DeploymentSelect } from "../db/schema";
import { TrafficService } from "./traffic.service";
import { ValidationService } from "./validation.service";
import { runContainer, stopContainer, removeContainer } from "../utils/docker";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { NotFoundError, DeploymentError, BadRequestError } from "../utils/errors";
import { syncCustomDomainUpstream } from "./project-domain.service";

export interface RollbackResult {
  rolledBackFrom: DeploymentSelect;
  restoredTo: DeploymentSelect;
  message: string;
}

export class RollbackService {
  private readonly repo: DeploymentRepository;
  private readonly projectRepo: ProjectRepository;
  private readonly envRepo: EnvironmentRepository;
  private readonly traffic: TrafficService;
  private readonly validation: ValidationService;

  constructor() {
    this.repo = new DeploymentRepository();
    this.projectRepo = new ProjectRepository();
    this.envRepo = new EnvironmentRepository();
    this.traffic = new TrafficService();
    this.validation = new ValidationService();
  }

  async rollback(projectId: string, environmentId: string): Promise<RollbackResult> {
    logger.info({ projectId, environmentId }, "Initiating rollback");

    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project ${projectId}`);
    }

    const envRow = await this.envRepo.findById(environmentId);
    if (!envRow || envRow.projectId !== projectId) {
      throw new NotFoundError(`Environment ${environmentId}`);
    }

    const current = await this.repo.findActiveForEnvironment(environmentId);
    if (!current) {
      throw new BadRequestError("No active deployment to roll back from");
    }

    const previous = await this.repo.findPreviousForEnvironment(environmentId, current.version);
    if (!previous) {
      throw new BadRequestError("No previous deployment available for rollback");
    }

    if (previous.version === current.version) {
      throw new BadRequestError("Already at the earliest available deployment");
    }

    logger.info(
      { projectId, environmentId, from: current.containerName, to: previous.containerName },
      "Rolling back"
    );

    const projectEnv = decryptProjectEnv(project.env);
    const stageEnv = decryptProjectEnv((envRow as typeof envRow & { env?: unknown }).env);
    const mergedEnv = { ...projectEnv, ...stageEnv };

    const { inspectContainer } = await import("../utils/docker");
    let isAlreadyRunning = false;
    try {
      isAlreadyRunning = await inspectContainer(previous.containerName);
    } catch {
      isAlreadyRunning = false;
    }

    if (!isAlreadyRunning) {
      await stopContainer(previous.containerName).catch(() => null);
      await removeContainer(previous.containerName).catch(() => null);

      await runContainer(
        previous.containerName,
        previous.imageTag,
        previous.port,
        envRow.appPort,
        config.dockerNetwork,
        mergedEnv
      );
    }

    const result = await this.validation.validate(
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

    await this.traffic.switchTrafficTo(previous.port);

    if (envRow.name === DEFAULT_ENVIRONMENT_NAME) {
      await syncCustomDomainUpstream(project.name, previous.port);
    }

    await stopContainer(current.containerName).catch((err) => {
      logger.warn({ err, containerName: current.containerName }, "Failed to stop current container during rollback");
    });
    await removeContainer(current.containerName).catch((err) => {
      logger.warn({ err, containerName: current.containerName }, "Failed to remove current container during rollback");
    });

    await this.repo.updateStatus(current.id, "ROLLED_BACK");
    await this.repo.updateStatus(previous.id, "ACTIVE");

    logger.info(
      { projectId, environmentId, from: current.containerName, to: previous.containerName },
      "Rollback completed"
    );

    return {
      rolledBackFrom: { ...current, status: "ROLLED_BACK" },
      restoredTo: { ...previous, status: "ACTIVE" },
      message: `Rolled back from v${current.version} to v${previous.version}`,
    };
  }
}
