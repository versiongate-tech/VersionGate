import { buildApp } from "./app";
import { config } from "./config/env";
import { logger } from "./utils/logger";
import { runPrismaSchemaSync } from "./utils/prisma-schema-sync";
import prisma from "./prisma/client";
import { ReconciliationService } from "./services/reconciliation.service";
import { ContainerMonitorService } from "./services/container-monitor.service";
import { systemMetrics } from "./controllers/system.controller";

async function start(): Promise<void> {
  const app = await buildApp();
  const monitor = new ContainerMonitorService();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    systemMetrics.stop();
    monitor.stop();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const PORT = config.port || 9090;

    // Run reconciliation before accepting requests — cleans up any crashed deploys
    // Skip if database is not configured (setup wizard not completed yet)
    if (config.databaseUrl) {
      try {
        logger.info("Applying database migrations…");
        runPrismaSchemaSync({ mode: config.prismaSchemaSync });
      } catch (err) {
        logger.fatal({ err }, "Database migration failed — check DATABASE_URL and migration files");
        await prisma.$disconnect();
        process.exit(1);
      }

      try {
        const reconciliation = new ReconciliationService();
        const report = await reconciliation.reconcile();
        logger.info(report, "Startup reconciliation complete");
      } catch (err) {
        logger.warn({ err }, "Startup reconciliation failed (database may not be ready)");
      }
    } else {
      logger.warn("DATABASE_URL not set — skipping startup reconciliation. Complete setup at /setup");
    }

    await app.listen({ port: PORT, host: "0.0.0.0" });
    logger.info(
      {
        port: PORT,
        dockerNetwork: config.dockerNetwork,
        nginxConfigPath: config.nginxConfigPath,
        projectsRootPath: config.projectsRootPath,
      },
      "VersionGate Engine is running"
    );

    if (config.databaseUrl) {
      monitor.start();
    } else {
      logger.warn("DATABASE_URL not set — container monitor disabled until database is configured");
    }
    systemMetrics.start();

    if (!config.databaseUrl) {
      logger.info("Setup wizard available at http://0.0.0.0:" + PORT + "/setup");
    }

    if (config.selfUpdateSecret && config.selfUpdatePollMs > 0) {
      const pollMs = config.selfUpdatePollMs;
      logger.info(
        { pollMs, autoApply: config.selfUpdateAutoApply, branch: config.selfUpdateGitBranch },
        "Self-update polling enabled"
      );
      setInterval(() => {
        void (async () => {
          try {
            const { getSelfUpdateStatus, applySelfUpdate } = await import("./services/self-update.service");
            const s = await getSelfUpdateStatus(config.selfUpdateGitBranch);
            if (!s.isGitRepo || s.message || !s.behind) return;
            if (config.selfUpdateAutoApply) {
              logger.info({ branch: config.selfUpdateGitBranch }, "Self-update poll: applying (auto)");
              const r = await applySelfUpdate(config.selfUpdateGitBranch);
              if (!r.ok) logger.warn({ err: r.error }, "Self-update poll: apply failed");
            } else {
              logger.info(
                { branch: config.selfUpdateGitBranch, local: s.currentCommit, remote: s.remoteCommit },
                "Self-update: origin is ahead — set SELF_UPDATE_AUTO_APPLY=true or POST /api/v1/system/update/apply"
              );
            }
          } catch (err) {
            logger.warn({ err }, "Self-update poll error");
          }
        })();
      }, pollMs);
    }
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
