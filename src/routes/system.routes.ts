import { FastifyInstance } from "fastify";
import { reconcileHandler, getServerStatsHandler, getServerDashboardHandler } from "../controllers/system.controller";
import { preflightHandler } from "../controllers/preflight.controller";
import {
  selfUpdateApplyHandler,
  selfUpdateStatusHandler,
  selfUpdateWebhookHandler,
} from "../controllers/self-update.controller";
import { requireDatabaseConfigured } from "../middleware/require-database";
import { config } from "../config/env";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  /** Host compatibility (Docker, Git, network, …) — no database required. */
  app.get("/system/preflight", { handler: preflightHandler });

  app.get("/server/stats", { handler: getServerStatsHandler });
  app.get("/system/server-stats", { handler: getServerStatsHandler });
  app.get("/system/server-dashboard", { handler: getServerDashboardHandler });

  if (config.selfUpdateSecret) {
    app.get("/system/update/status", { handler: selfUpdateStatusHandler });
    app.post("/system/update/apply", { handler: selfUpdateApplyHandler });
    app.post("/system/update/webhook", { handler: selfUpdateWebhookHandler });
  }

  app.post("/system/reconcile", {
    preHandler: requireDatabaseConfigured,
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            report: {
              type: "object",
              properties: {
                deployingFixed: { type: "number" },
                activeInvalidated: { type: "number" },
              },
            },
          },
        },
      },
    },
    handler: reconcileHandler,
  });
}
