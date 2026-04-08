import axios from "axios";
import { inspectContainer, getContainerRestartCount, getContainerLogs } from "../utils/docker";
import { config } from "../config/env";
import { logger } from "../utils/logger";

export interface ValidationResult {
  success: boolean;
  latency: number;
  error?: string;
}

export class ValidationService {
  async validate(
    baseUrl: string,
    healthPath: string,
    containerName: string
  ): Promise<ValidationResult> {
    const healthUrl = `${baseUrl}${healthPath}`;
    const { maxRetries, retryDelayMs, healthTimeoutMs, maxLatencyMs } = config.validation;

    logger.info({ healthUrl, containerName }, "Starting validation");

    let running = true;
    try {
      running = await inspectContainer(containerName);
    } catch (err) {
      logger.warn(
        { err, containerName },
        "Docker inspect failed during validation — continuing with HTTP health checks"
      );
    }
    if (!running) {
      const logs = await getContainerLogs(containerName, 30);
      logger.error({ containerName, logs }, "Container is not running");
      return { success: false, latency: 0, error: this.formatError("Container failed to start", logs) };
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // After first attempt, check for crash loop — restart count > 0 means app keeps dying
      if (attempt > 1) {
        const restarts = await getContainerRestartCount(containerName);
        if (restarts > 0) {
          const logs = await getContainerLogs(containerName, 40);
          logger.error({ containerName, attempt, restarts, logs }, "Container is crash-looping");
          return { success: false, latency: 0, error: this.formatError(`App crashed (restarted ${restarts}x) — check your env vars and startup config`, logs) };
        }
      }

      const start = Date.now();
      try {
        const response = await axios.get(healthUrl, {
          timeout: healthTimeoutMs,
          validateStatus: () => true,
        });
        const latency = Date.now() - start;

        if (response.status >= 200 && response.status < 300) {
          if (latency > maxLatencyMs) {
            logger.warn({ healthUrl, attempt, latency }, `Latency ${latency}ms exceeded threshold (still passing)`);
          } else {
            logger.info({ healthUrl, attempt, latency }, "Validation passed");
          }
          return { success: true, latency };
        }

        logger.warn(
          { healthUrl, attempt, status: response.status },
          response.status === 404
            ? "Health URL returned 404 — add this route in your app or change the project's health path (e.g. / for Next.js)"
            : "Health URL returned non-2xx status"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ healthUrl, attempt, err: message }, "Validation attempt failed");
      }

      if (attempt < maxRetries) {
        await this.sleep(retryDelayMs);
      }
    }

    const logs = await getContainerLogs(containerName, 40);
    const error = `Health check failed after ${maxRetries} attempts`;
    logger.error({ healthUrl, containerName, logs }, error);
    return { success: false, latency: 0, error: this.formatError(error, logs) };
  }

  private formatError(reason: string, logs: string[]): string {
    if (logs.length === 0) return reason;
    // Strip ANSI colour codes and Docker timestamps for readability
    const clean = logs
      .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").replace(/^\S+Z\s+/, ""))
      .filter((l) => l.trim().length > 0)
      .slice(-20);
    return `${reason}\n\n--- Container output ---\n${clean.join("\n")}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
