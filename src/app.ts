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
import { settingsRoutes } from "./routes/settings.routes";
import { logsRoutes } from "./routes/logs.route";
import { jobRoutes } from "./routes/job.routes";
import { requireDatabaseConfigured } from "./middleware/require-database";
import { requireApiAuth } from "./middleware/require-api-auth";
import { authRoutes } from "./routes/auth.routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    disableRequestLogging: true, // manual logging below — API only
  });

  // ── API access log: skip noisy dashboard polling (successful GETs only) ─────
  const pathOnly = (url: string): string => {
    const i = url.indexOf("?");
    return i === -1 ? url : url.slice(0, i);
  };

  /** Successful GETs matching these paths are not access-logged. */
  const QUIET_SUCCESSFUL_GET: RegExp[] = [
    /^\/health$/,
    /^\/api\/v1\/server\/stats$/,
    /^\/api\/v1\/system\/server-stats$/,
    /^\/api\/v1\/system\/server-dashboard$/,
    /^\/api\/v1\/setup\/status$/,
    /^\/api\/v1\/auth\/status$/,
    /^\/api\/v1\/settings\/instance$/,
    /^\/api\/v1\/projects$/,
    /^\/api\/v1\/deployments$/,
    /^\/api\/v1\/jobs$/,
    /^\/api\/v1\/jobs\/[^/]+$/,
    /^\/api\/v1\/projects\/[^/]+$/,
    /^\/api\/v1\/projects\/[^/]+\/deployments$/,
    /^\/api\/v1\/projects\/[^/]+\/environments$/,
    /^\/api\/v1\/projects\/[^/]+\/jobs$/,
    /^\/api\/v1\/projects\/[^/]+\/metrics$/,
  ];

  const isQuietSuccessfulPoll = (pathname: string, method: string, status: number): boolean => {
    if (status >= 400 || method !== "GET") return false;
    if (QUIET_SUCCESSFUL_GET.some((r) => r.test(pathname))) return true;
    // Metrics / container logs HTTP endpoints (not WebSocket job stream)
    if (/\/metrics$/.test(pathname) || /\/logs$/.test(pathname)) return true;
    return false;
  };

  app.addHook("preHandler", requireApiAuth);

  app.addHook("onResponse", async (req, reply) => {
    const pathname = pathOnly(req.url);
    if (!pathname.startsWith("/api/") && pathname !== "/health") return;
    if (isQuietSuccessfulPoll(pathname, req.method, reply.statusCode)) return;
    req.log.info(
      {
        method: req.method,
        path: pathname,
        statusCode: reply.statusCode,
        ms: reply.elapsedTime.toFixed(1),
      },
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
  await app.register(authRoutes, { prefix: "/api/v1" });

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
  await app.register(settingsRoutes, { prefix: "/api/v1" });

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
