import { FastifyInstance } from "fastify";
import { getSetupStatusHandler, applySetupHandler } from "../controllers/setup.controller";

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/setup/status", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            configured: { type: "boolean" },
            dbConnected: { type: "boolean" },
            needsRestart: { type: "boolean" },
          },
        },
      },
    },
    handler: getSetupStatusHandler,
  });

  app.post("/setup/apply", {
    schema: {
      body: {
        type: "object",
        required: ["domain", "databaseUrl"],
        properties: {
          domain: { type: "string", minLength: 1 },
          databaseUrl: { type: "string", minLength: 1 },
          geminiApiKey: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            configured: { type: "boolean" },
          },
        },
      },
    },
    handler: applySetupHandler,
  });
}
