import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import {
  applySelfUpdate,
  getSelfUpdateStatus,
  selfUpdateTokensMatch,
} from "../services/self-update.service";

function unauthorized(reply: FastifyReply): void {
  reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing credentials" });
}

function featureDisabled(reply: FastifyReply): void {
  reply.code(503)
    .send({ error: "NotConfigured", message: "Set SELF_UPDATE_SECRET in .env to enable self-update endpoints" });
}

function bearerToken(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return undefined;
  return h.slice("Bearer ".length).trim();
}

export async function selfUpdateStatusHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.selfUpdateSecret) {
    featureDisabled(reply);
    return;
  }
  const token = bearerToken(req);
  if (!token || !selfUpdateTokensMatch(token, config.selfUpdateSecret)) {
    unauthorized(reply);
    return;
  }
  const status = await getSelfUpdateStatus(config.selfUpdateGitBranch);
  reply.code(200).send(status);
}

export async function selfUpdateApplyHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.selfUpdateSecret) {
    featureDisabled(reply);
    return;
  }
  const token = bearerToken(req);
  if (!token || !selfUpdateTokensMatch(token, config.selfUpdateSecret)) {
    unauthorized(reply);
    return;
  }
  const result = await applySelfUpdate(config.selfUpdateGitBranch);
  if (!result.ok) {
    reply.code(500).send(result);
    return;
  }
  reply.code(200).send(result);
}

/** Fire-and-forget hook for CI or cron: `POST ?token=...` (same value as SELF_UPDATE_SECRET). */
export async function selfUpdateWebhookHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.selfUpdateSecret) {
    featureDisabled(reply);
    return;
  }
  const q = req.query as { token?: string };
  const token = typeof q.token === "string" ? q.token : "";
  if (!selfUpdateTokensMatch(token, config.selfUpdateSecret)) {
    unauthorized(reply);
    return;
  }

  const status = await getSelfUpdateStatus(config.selfUpdateGitBranch);
  if (!status.isGitRepo || status.message) {
    reply.code(200).send({ ok: false, skipped: true, reason: status.message ?? "Not a git repo" });
    return;
  }
  if (!status.behind) {
    reply.code(200).send({ ok: true, skipped: true, reason: "Already up to date" });
    return;
  }

  void applySelfUpdate(config.selfUpdateGitBranch).then((r) => {
    logger.info(r, "Self-update webhook apply finished");
  });

  reply.code(202).send({ ok: true, accepted: true, message: "Update started" });
}
