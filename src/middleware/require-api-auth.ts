import type { FastifyReply, FastifyRequest } from "fastify";
import prisma from "../prisma/client";
import { getUserFromSessionToken } from "../services/auth.service";
import { getSessionTokenFromRequest } from "../utils/cookie";

function pathOnly(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

function isPublicApiPath(path: string): boolean {
  if (path.startsWith("/api/v1/setup/")) return true;
  if (path.startsWith("/api/v1/auth/")) return true;
  if (path.startsWith("/api/v1/webhooks/")) return true;
  if (
    path === "/api/v1/system/update/status" ||
    path === "/api/v1/system/update/apply" ||
    path === "/api/v1/system/update/webhook"
  ) {
    return true;
  }
  return false;
}

export type AuthedRequest = FastifyRequest & {
  authUser?: { id: string; email: string };
};

/**
 * Requires a valid session cookie once at least one dashboard user exists.
 * Before the first user is registered, all API routes stay open (bootstrap window).
 */
export async function requireApiAuth(req: AuthedRequest, reply: FastifyReply): Promise<void> {
  const path = pathOnly(req.url);
  if (!path.startsWith("/api/v1/")) return;
  if (isPublicApiPath(path)) return;

  if (!process.env.DATABASE_URL?.trim()) {
    return;
  }

  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      return;
    }
  } catch {
    await reply.code(503).send({
      error: "ServiceUnavailable",
      message: "Database unavailable for authentication.",
    });
    return;
  }

  const raw = getSessionTokenFromRequest(req.headers.cookie);
  const user = await getUserFromSessionToken(raw);
  if (!user) {
    await reply.code(401).send({
      error: "Unauthorized",
      message: "Sign in required",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  req.authUser = user;
}
