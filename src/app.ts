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
  await app.register(deploymentRoutes, { prefix: "/api/v1" });
  await app.register(projectRoutes, { prefix: "/api/v1" });
  await app.register(systemRoutes, { prefix: "/api/v1" });
  await app.register(metricsRoutes, { prefix: "/api/v1" });
  await app.register(webhookRoutes, { prefix: "/api/v1" });
  await app.register(setupRoutes, { prefix: "/api/v1" });

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

  // ── SPA fallback ────────────────────────────────────────────────────────────
  // Next.js App Router static export pre-renders only __placeholder__ for the
  // dynamic /projects/[id] route.  When the client navigates to a real project
  // ID, Next fetches its RSC payload (index.txt) and the HTML shell.  We
  // intercept those requests and serve the __placeholder__ versions so the
  // client-side router can hydrate with the real ID from useParams().
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not Found", message: `${req.method} ${req.url} not found` });
    }

    // RSC payload requests: /projects/:id/index.txt?_rsc=...
    if (/^\/projects\/[^/]+\/index\.txt/.test(req.url)) {
      const txt = join(dashboardOutDir, "projects", "__placeholder__", "index.txt");
      if (existsSync(txt)) {
        return reply.type("text/x-component").sendFile("projects/__placeholder__/index.txt");
      }
    }

    // Project detail HTML: /projects/:id or /projects/:id/
    if (/^\/projects\/[^/]+(\/)?(\?.*)?$/.test(req.url)) {
      const html = join(dashboardOutDir, "projects", "__placeholder__", "index.html");
      if (existsSync(html)) {
        return reply.type("text/html").sendFile("projects/__placeholder__/index.html");
      }
    }

    // Default: serve root index.html as SPA shell
    const indexPath = join(dashboardOutDir, "index.html");
    if (existsSync(indexPath)) {
      return reply.type("text/html").sendFile("index.html");
    }

    return reply.code(404).send({ error: "Not Found", message: `${req.method} ${req.url} not found` });
  });

  return app;
}
