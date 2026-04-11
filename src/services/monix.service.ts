import { spawn, type ChildProcess } from "child_process";
import { logger } from "../utils/logger";
import { config } from "../config/env";

const RESTART_DELAY_MS = 5_000;
const MAX_RESTARTS     = 5;

export class MonixService {
  private proc: ChildProcess | null = null;
  private restarts = 0;
  private stopping = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    this.spawn_();
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.proc) {
      logger.info("Monix: stopping");
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }

  private spawn_(): void {
    logger.info("Monix: starting (monix-cli --watch)");

    this.proc = spawn("monix-cli", ["--watch"], {
      cwd:   config.monixPath,
      env:   { ...process.env, PORT: String(config.monixPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) logger.debug({ src: "monix" }, line);
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) logger.debug({ src: "monix" }, line);
    });

    this.proc.on("exit", (code, signal) => {
      this.proc = null;
      if (this.stopping) return;

      logger.warn({ code, signal }, "Monix: process exited unexpectedly");

      if (this.restarts >= MAX_RESTARTS) {
        logger.error({ restarts: this.restarts }, "Monix: max restarts reached — giving up");
        return;
      }

      this.restarts++;
      logger.info({ attempt: this.restarts, delayMs: RESTART_DELAY_MS }, "Monix: restarting");
      this.restartTimer = setTimeout(() => this.spawn_(), RESTART_DELAY_MS);
    });

    this.proc.on("error", (err) => {
      logger.warn({ err: err.message }, "Monix: failed to start (python3 not found?)");
    });
  }
}
