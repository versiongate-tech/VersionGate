import { FastifyInstance } from "fastify";
import { reconcileHandler, getServerStatsHandler, getServerDashboardHandler } from "../controllers/system.controller";
import { requireDatabaseConfigured } from "../middleware/require-database";

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/server/stats", { handler: getServerStatsHandler });
  app.get("/system/server-stats", { handler: getServerStatsHandler });
  app.get("/system/server-dashboard", { handler: getServerDashboardHandler });

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
