import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import prisma from "../prisma/client";
import {
  AUTH_MIN_PASSWORD_LENGTH,
  SESSION_MAX_AGE_SEC,
  createSession,
  deleteSessionByRawToken,
  getUserFromSessionToken,
  hashPassword,
  isValidEmail,
  verifyPassword,
} from "../services/auth.service";
import {
  buildClearSessionCookie,
  buildSetSessionCookie,
  getSessionTokenFromRequest,
} from "../utils/cookie";

export async function authStatusHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    reply.code(200).send({
      databaseReady: false,
      hasUsers: false,
      authenticated: false,
    });
    return;
  }

  try {
    const hasUsers = (await prisma.user.count()) > 0;
    const raw = getSessionTokenFromRequest(req.headers.cookie);
    const user = await getUserFromSessionToken(raw);
    reply.code(200).send({
      databaseReady: true,
      hasUsers,
      authenticated: !!user,
      user: user ?? undefined,
    });
  } catch (err) {
    logger.warn({ err }, "authStatus: database error");
    reply.code(200).send({
      databaseReady: true,
      hasUsers: false,
      authenticated: false,
    });
  }
}

interface AuthBody {
  email: string;
  password: string;
}

export async function authRegisterHandler(
  req: FastifyRequest<{ Body: AuthBody }>,
  reply: FastifyReply
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    reply.code(503).send({ error: "ServiceUnavailable", message: "Database not configured" });
    return;
  }

  const count = await prisma.user.count();
  if (count > 0) {
    reply.code(403).send({ error: "Forbidden", message: "An admin account already exists" });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!isValidEmail(email)) {
    reply.code(400).send({ error: "ValidationError", message: "Invalid email" });
    return;
  }
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    reply.code(400).send({
      error: "ValidationError",
      message: `Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters`,
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = await createSession(user.id);
  reply.header("Set-Cookie", buildSetSessionCookie(token, SESSION_MAX_AGE_SEC, config.cookieSecure));
  reply.code(201).send({ user: { id: user.id, email: user.email } });
}

export async function authLoginHandler(
  req: FastifyRequest<{ Body: AuthBody }>,
  reply: FastifyReply
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    reply.code(503).send({ error: "ServiceUnavailable", message: "Database not configured" });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    reply.code(401).send({ error: "Unauthorized", message: "Invalid email or password" });
    return;
  }

  const token = await createSession(user.id);
  reply.header("Set-Cookie", buildSetSessionCookie(token, SESSION_MAX_AGE_SEC, config.cookieSecure));
  reply.code(200).send({ user: { id: user.id, email: user.email } });
}

export async function authLogoutHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = getSessionTokenFromRequest(req.headers.cookie);
  await deleteSessionByRawToken(raw);
  reply.header("Set-Cookie", buildClearSessionCookie(config.cookieSecure));
  reply.code(200).send({ ok: true });
}

export async function authMeHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = getSessionTokenFromRequest(req.headers.cookie);
  const user = await getUserFromSessionToken(raw);
  if (!user) {
    reply.code(401).send({ authenticated: false });
    return;
  }
  reply.code(200).send({ authenticated: true, user });
}
