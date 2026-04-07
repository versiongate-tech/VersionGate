import { logger } from "../utils/logger";
import { config } from "../config/env";
import prisma from "../prisma/client";
import { appendLog, claimNextJob, failJob, recoverStuckJobs } from "../services/job-queue";
import { runDeployJob } from "./handlers/deploy.handler";
import { runRollbackJob } from "./handlers/rollback.handler";
import { logEmitter } from "../events/log-emitter";

const POLL_MS = 2000;

let shuttingDown = false;
let inFlight: Promise<void> | null = null;

function makeLogFn(jobId: string): (line: string) => Promise<void> {
  return async (line: string) => {
    await appendLog(jobId, line);
    logEmitter.emitLog(jobId, line);
  };
}

async function sleepInterruptible(ms: number): Promise<void> {
  const step = 100;
  let elapsed = 0;
  while (elapsed < ms && !shuttingDown) {
    await new Promise((r) => setTimeout(r, Math.min(step, ms - elapsed)));
    elapsed += step;
  }
}

async function processNextJob(): Promise<void> {
  if (shuttingDown) return;

  const job = await claimNextJob();
  if (!job) return;

  const log = makeLogFn(job.id);
  await log(`[job ${job.id}] type=${job.type} status=RUNNING`);

  if (job.type === "DEPLOY") {
    await runDeployJob(job, log);
  } else if (job.type === "ROLLBACK") {
    await runRollbackJob(job, log);
  } else {
    await log(`Unknown job type: ${job.type}`);
    await failJob(job.id, `Unknown job type: ${job.type}`);
    logEmitter.emitStatus(job.id, "FAILED");
  }
}

async function loop(): Promise<void> {
  while (!shuttingDown) {
    try {
      inFlight = processNextJob();
      await inFlight;
    } catch (err) {
      logger.error({ err }, "Worker: processNextJob error");
    } finally {
      inFlight = null;
    }
    if (shuttingDown) break;
    await sleepInterruptible(POLL_MS);
  }
}

async function main(): Promise<void> {
  logger.info("VersionGate Worker started");
  try {
    const n = await recoverStuckJobs();
    if (n > 0) {
      logger.warn({ count: n }, "Recovered stuck RUNNING jobs as FAILED");
    }
  } catch (err) {
    logger.error({ err }, "Worker: recoverStuckJobs failed — DB may be unreachable; will retry in loop");
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Worker: shutdown — draining current job");
    shuttingDown = true;
    if (inFlight) {
      await inFlight.catch(() => null);
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await loop();
}

if (!config.databaseUrl?.trim()) {
  logger.warn(
    "DATABASE_URL not set — worker idle. Complete setup at /setup, then restart the worker (e.g. pm2 restart versiongate-worker)."
  );
  setInterval(() => {
    /* keep process alive for process managers */
  }, 86_400_000);
} else {
  main().catch((err) => {
    logger.fatal({ err }, "Worker fatal");
    process.exit(1);
  });
}
