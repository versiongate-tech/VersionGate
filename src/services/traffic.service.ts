import fs from "fs/promises";
import { execFileAsync } from "../utils/exec";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { DeploymentError } from "../utils/errors";

export class TrafficService {
  /**
   * Updates the Nginx upstream config to point at the given port, then
   * reloads Nginx. Backs up the existing config before overwriting and
   * restores it automatically if nginx -s reload fails.
   */
  async switchTrafficTo(port: number): Promise<void> {
    const configPath = config.nginxConfigPath;
    const backupPath = `${configPath}.bak`;
    const tmpPath = `${configPath}.tmp`;

    logger.info({ port, configPath }, "Switching Nginx traffic");

    const newContent = this.buildNginxUpstream(port);

    // Write to temp file first
    await fs.writeFile(tmpPath, newContent, "utf-8");

    // Backup existing config if it exists
    let hasBackup = false;
    try {
      await fs.copyFile(configPath, backupPath);
      hasBackup = true;
      logger.debug({ backupPath }, "Nginx config backed up");
    } catch {
      // No existing config to back up — first run
    }

    // Atomically move tmp → config
    await fs.rename(tmpPath, configPath);

    // Reload Nginx; restore backup on failure.
    // Master often runs as root while the worker runs as a normal user — try passwordless sudo.
    try {
      await this.reloadNginx();
      logger.info({ port }, "Nginx reloaded — traffic switched");
    } catch (err) {
      logger.error({ err }, "Nginx reload failed — restoring backup");

      if (hasBackup) {
        try {
          await fs.copyFile(backupPath, configPath);
          logger.info({ backupPath }, "Nginx config restored from backup");
        } catch (restoreErr) {
          logger.error({ restoreErr }, "Failed to restore Nginx backup");
        }
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new DeploymentError(`Nginx reload failed: ${message}`);
    }
  }

  private buildNginxUpstream(port: number): string {
    return [
      "upstream versiongate_backend {",
      `  server 127.0.0.1:${port};`,
      "}",
    ].join("\n") + "\n";
  }

  private async reloadNginx(): Promise<void> {
    try {
      await execFileAsync("nginx", ["-s", "reload"]);
      return;
    } catch (directErr) {
      logger.debug({ err: directErr }, "nginx reload as current user failed — trying sudo -n");
    }
    await execFileAsync("sudo", ["-n", "/usr/sbin/nginx", "-s", "reload"]);
  }
}
