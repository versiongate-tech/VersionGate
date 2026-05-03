import type { FastifyInstance } from "fastify";
import { requireDatabaseConfigured } from "../middleware/require-database";
import {
  githubAppWebhookHandler,
  githubCallbackHandler,
  githubInstallHandler,
  githubReposHandler,
} from "../controllers/github-app.controller";

export async function githubAppRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireDatabaseConfigured);
  app.get("/auth/github/install", githubInstallHandler);
  app.get("/auth/github/callback", githubCallbackHandler);
  app.get("/github/repos", githubReposHandler);
  app.post("/webhooks/github", githubAppWebhookHandler);
}
