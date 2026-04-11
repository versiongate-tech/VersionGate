import { buildApp } from "./app";
import { config } from "./config/env";
import { logger } from "./utils/logger";
import { runPrismaSchemaSync } from "./utils/prisma-schema-sync";
import { disconnectPrisma } from "./prisma/client";
import { ReconciliationService } from "./services/reconciliation.service";
import { ContainerMonitorService } from "./services/container-monitor.service";
import { registerAfterSetup } from "./services/post-setup-hooks";
import { systemMetrics } from "./controllers/system.controller";
import { kickSelfUpdatePoll, stopSelfUpdatePoll } from "./services/self-update-poll";

function databaseUrlLive(): string {
  return process.env.DATABASE_URL?.trim() ?? "";
}

async function start(): Promise<void> {
  const app = await buildApp();
  const monitor = new ContainerMonitorService();

  registerAfterSetup(() => {
    if (!databaseUrlLive()) return;
    monitor.start();
    void (async () => {
      try {
        const reconciliation = new ReconciliationService();
        const report = await reconciliation.reconcile();
        logger.info(report, "Post-setup reconciliation complete");
      } catch (err) {
        logger.warn({ err }, "Post-setup reconciliation failed");
      }
    })();
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    stopSelfUpdatePoll();
    systemMetrics.stop();
    monitor.stop();
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const PORT = config.port || 9090;

    // Run reconciliation before accepting requests — cleans up any crashed deploys
    // Skip if database is not configured (setup wizard not completed yet)
    if (databaseUrlLive()) {
      try {
        logger.info("Applying database migrations…");
        runPrismaSchemaSync({ mode: config.prismaSchemaSync });
      } catch (err) {
        logger.fatal({ err }, "Database migration failed — check DATABASE_URL and migration files");
        await disconnectPrisma();
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

    if (databaseUrlLive()) {
      monitor.start();
    } else {
      logger.warn("DATABASE_URL not set — container monitor disabled until database is configured");
    }
    systemMetrics.start();

    if (!databaseUrlLive()) {
      logger.info("Setup wizard available at http://0.0.0.0:" + PORT + "/setup");
    }

    kickSelfUpdatePoll();
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    await disconnectPrisma();
    process.exit(1);
  }
}

start();
