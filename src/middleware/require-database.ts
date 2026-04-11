import { FastifyReply, FastifyRequest } from "fastify";
/**
 * Ensures DATABASE_URL is set (loaded from .env into config).
 * Use on routes that call Prisma; setup and health endpoints stay available without a DB.
 */
export async function requireDatabaseConfigured(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (process.env.DATABASE_URL?.trim()) return;

  await reply.code(503).send({
    error: "ServiceUnavailable",
    message: "Database is not configured. Open /setup to finish installation, or set DATABASE_URL and restart.",
    code: "SETUP_REQUIRED",
  });
}
