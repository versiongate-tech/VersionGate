import { FastifyInstance } from "fastify";
import { getInstanceSettingsHandler } from "../controllers/settings.controller";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/instance", { handler: getInstanceSettingsHandler });
}
