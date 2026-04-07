import Fastify, { FastifyInstance } from "fastify";
import { existsSync } from "fs";
import { join } from "path";
import { config } from "./config/env";
import { logger } from "./utils/logger";
import { AppError } from "./utils/errors";
import { dashboardOutDir } from "./utils/paths";
import { deploymentRoutes } from "./routes/deployment.routes";
import { projectRoutes } from "./routes/project.routes";
import { systemRoutes } from "./routes/system.routes";
import { metricsRoutes } from "./routes/metrics.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { setupRoutes } from "./routes/setup.routes";
import { logsRoutes } from "./routes/logs.route";
import { jobRoutes } from "./routes/job.routes";
import { requireDatabaseConfigured } from "./middleware/require-database";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    disableRequestLogging: true, // manual logging below — API only
  });

  // ── Log only API requests; suppress high-frequency polling endpoints ────────
  const SILENT_PATTERNS = [/\/metrics$/, /\/logs$/];
  const isSilent = (url: string) => SILENT_PATTERNS.some((r) => r.test(url.split("?")[0]));

  app.addHook("onResponse", async (req, reply) => {
    const url = req.url;
    if (!url.startsWith("/api/") && url !== "/health") return;
    if (isSilent(url) && reply.statusCode < 400) return; // suppress successful polls
    req.log.info(
      { method: req.method, url, statusCode: reply.statusCode, ms: reply.elapsedTime.toFixed(1) },
      "api"
    );
  });

  // ── Global error handler ────────────────────────────────────────────────────
  app.setErrorHandler(async (error, _req, reply) => {
    if (error instanceof AppError) {
      logger.warn({ code: error.code, msg: error.message }, "Application error");
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
        code: error.code,
      });
    }

    if (error.validation) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "Request validation failed",
        details: error.validation,
      });
    }

    logger.error({ err: error }, "Unhandled error");
    return reply.code(500).send({
      error: "InternalServerError",
      message: "An unexpected error occurred",
    });
  });

  // ── Health endpoint ─────────────────────────────────────────────────────────
  app.get("/health", async (_req, reply) => {
    return reply.code(200).send({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── API Routes (registered before static — order matters) ──────────────────
  const dbRoutes = async (instance: FastifyInstance): Promise<void> => {
    instance.addHook("preHandler", requireDatabaseConfigured);
  };

  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await deploymentRoutes(instance);
  }, { prefix: "/api/v1" });
  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await projectRoutes(instance);
  }, { prefix: "/api/v1" });
  await app.register(systemRoutes, { prefix: "/api/v1" });
  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await metricsRoutes(instance);
  }, { prefix: "/api/v1" });
  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await webhookRoutes(instance);
  }, { prefix: "/api/v1" });
  await app.register(setupRoutes, { prefix: "/api/v1" });

  await app.register(import("@fastify/websocket"));
  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await logsRoutes(instance);
  }, { prefix: "/api/v1" });
  await app.register(async (instance) => {
    await instance.register(dbRoutes);
    await jobRoutes(instance);
  }, { prefix: "/api/v1" });

  // ── Dashboard static serving ────────────────────────────────────────────────
  if (existsSync(dashboardOutDir)) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, {
      root: dashboardOutDir,
      wildcard: false,
      index: "index.html",
    });
    logger.info({ dashboardPath: dashboardOutDir }, "Dashboard static files registered");
  } else {
    logger.warn("Dashboard not built — run: cd dashboard && bun install && bun run build");
  }

  // ── SPA fallback (Vite + React Router) ─────────────────────────────────────
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not Found", message: `${req.method} ${req.url} not found` });
    }

    const indexPath = join(dashboardOutDir, "index.html");
    if (existsSync(indexPath)) {
      return reply.type("text/html").sendFile("index.html");
    }

    return reply.code(404).send({ error: "Not Found", message: `${req.method} ${req.url} not found` });
  });

  return app;
}
