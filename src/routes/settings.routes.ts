import { FastifyInstance } from "fastify";
import {
  getInstanceSettingsHandler,
  patchInstanceEnvHandler,
  getSelfUpdateSettingsHandler,
  postSelfUpdateEnableHandler,
  postSelfUpdateCheckHandler,
  postSelfUpdateApplyHandler,
  postNginxApplySiteHandler,
  postCertbotSslHandler,
} from "../controllers/settings.controller";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/instance", { handler: getInstanceSettingsHandler });
  app.get("/settings/self-update", { handler: getSelfUpdateSettingsHandler });
  app.post("/settings/self-update/enable", { handler: postSelfUpdateEnableHandler });
  app.post("/settings/self-update/check", { handler: postSelfUpdateCheckHandler });
  app.post("/settings/self-update/apply", { handler: postSelfUpdateApplyHandler });
  app.post("/settings/nginx/apply", { handler: postNginxApplySiteHandler });
  app.post("/settings/ssl/certbot", { handler: postCertbotSslHandler });
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
