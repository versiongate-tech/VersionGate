import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

function createPrisma(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  client.$on("error", (e) => {
    logger.error({ msg: e.message, target: e.target }, "Prisma error");
  });

  client.$on("warn", (e) => {
    logger.warn({ msg: e.message, target: e.target }, "Prisma warning");
  });

  return client;
}

let _client: PrismaClient | null = null;

function ensureClient(): PrismaClient {
  if (!_client) {
    _client = createPrisma();
  }
  return _client;
}

/** Call after first-time setup writes DATABASE_URL so this process uses the new connection. */
export async function reconnectPrismaAfterSetup(): Promise<void> {
  if (_client) {
    await _client.$disconnect().catch(() => {});
    _client = null;
  }
}

export async function disconnectPrisma(): Promise<void> {
  await reconnectPrismaAfterSetup();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (prop === "then") return undefined;
    const c = ensureClient();
    const v = (c as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof v === "function") {
      return (v as (...args: unknown[]) => unknown).bind(c);
    }
    return v;
  },
}) as PrismaClient;

export default prisma;
