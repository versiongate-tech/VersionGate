import { FastifyInstance } from "fastify";
import { getInstanceSettingsHandler, patchInstanceEnvHandler } from "../controllers/settings.controller";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/instance", { handler: getInstanceSettingsHandler });
  app.patch("/settings/env", {
    schema: {
      body: {
        type: "object",
        required: ["env"],
        properties: {
          env: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
    },
    handler: patchInstanceEnvHandler,
  });
}
