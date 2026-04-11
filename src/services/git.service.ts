import fs from "fs/promises";
import path from "path";
import { Project } from "@prisma/client";
import { execFileAsync } from "../utils/exec";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { DeploymentError } from "../utils/errors";

export class GitService {
  /**
   * Returns the absolute path where the project's git repo lives on disk.
   */
  projectPath(project: Pick<Project, "id">): string {
    return path.join(config.projectsRootPath, project.id);
  }

  /**
   * Returns the Docker build context path — the repo root joined with
   * buildContext (e.g. "." keeps it at root, "server" points to a subdir).
   */
  buildContextPath(project: Pick<Project, "id" | "buildContext">): string {
    return path.join(config.projectsRootPath, project.id, project.buildContext ?? ".");
  }

  /**
   * Ensures the project directory exists, then clones or updates the repo.
   * If the directory already contains a git repo → fetch + hard reset to remote branch.
   * If not → clone fresh.
   */
  async prepareSource(project: Project): Promise<void> {
    logger.debug({ projectId: project.id, branch: project.branch }, "Preparing source");

    await this.ensureProjectDirectory(project);

    const repoDir = this.projectPath(project);
    const isExisting = await this.isGitRepo(repoDir);

    if (isExisting) {
      logger.debug({ projectId: project.id }, "Repo exists — fetching latest");
      await this.pullLatest(project, repoDir);
    } else {
      logger.debug({ projectId: project.id }, "Cloning repository");
      await this.cloneRepo(project, repoDir);
    }

    logger.info({ projectId: project.id, branch: project.branch }, "Source ready");
  }

  private async ensureProjectDirectory(project: Pick<Project, "id">): Promise<void> {
    const dir = path.join(config.projectsRootPath, project.id);
    await fs.mkdir(dir, { recursive: true });
  }

  private async cloneRepo(project: Project, repoDir: string): Promise<void> {
    const authUrl = this.buildAuthUrl(project.repoUrl);
    try {
      await execFileAsync("git", [
        "clone",
        "--branch", project.branch,
        "--single-branch",
        authUrl,
        repoDir,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new DeploymentError(`Git clone failed: ${message}`);
    }
  }

  private async pullLatest(project: Project, repoDir: string): Promise<void> {
    try {
      await execFileAsync("git", ["-C", repoDir, "fetch", "origin"]);
      await execFileAsync("git", [
        "-C", repoDir,
        "reset", "--hard", `origin/${project.branch}`,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new DeploymentError(`Git pull failed: ${message}`);
    }
  }

  /**
   * Validates that only HTTPS URLs are used (SSH/custom protocols are rejected).
   */
  private buildAuthUrl(repoUrl: string): string {
    if (!/^https?:\/\//i.test(repoUrl)) {
      throw new DeploymentError(
        "Only HTTPS repository URLs are supported. SSH URLs are not allowed."
      );
    }
    return repoUrl;
  }

  private async isGitRepo(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, ".git"));
      return true;
    } catch {
      return false;
    }
  }
}
