import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config/env";
import { envFilePath, projectRoot } from "../utils/paths";
import { mergeIntoDotenv, writeEnvWithBackup } from "../utils/env-file";
import { logger } from "../utils/logger";

const DB_URL_REGEX = /^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m;

function readDatabaseUrlFromFile(): string | null {
  if (!existsSync(envFilePath)) return null;
  const content = readFileSync(envFilePath, "utf-8");
  const match = content.match(DB_URL_REGEX);
  return match?.[1] ?? null;
}

async function canConnectToDatabase(databaseUrl: string): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const testClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await testClient.$connect();
    await testClient.$disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe, read-only instance metadata for the dashboard Settings page.
 * Does not expose secret values.
 */
export async function getInstanceSettingsHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  let engineVersion = "0.0.0";
  try {
    const raw = readFileSync(join(projectRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) engineVersion = pkg.version;
  } catch {
    /* ignore */
  }

  const dbFromFile = readDatabaseUrlFromFile();
  const databaseUrlInEnvFile = Boolean(dbFromFile && dbFromFile.length > 0);
  const databaseUrlLoaded = Boolean(config.databaseUrl && config.databaseUrl.trim().length > 0);

  let databaseReachable = false;
  const urlToPing = databaseUrlLoaded ? config.databaseUrl : dbFromFile;
  if (urlToPing) {
    databaseReachable = await canConnectToDatabase(urlToPing);
  }

  const needsRestart = databaseUrlInEnvFile && !databaseUrlLoaded;

  const encryptionKeyConfigured = Boolean(process.env.ENCRYPTION_KEY?.trim());
  const geminiConfigured = Boolean(config.geminiApiKey?.trim());

  return reply.code(200).send({
    engineVersion,
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiPort: config.port,
    dockerNetwork: config.dockerNetwork,
    projectsRootPath: config.projectsRootPath,
    nginxConfigPath: config.nginxConfigPath,
    prismaSchemaSync: config.prismaSchemaSync,
    databaseUrlInEnvFile,
    databaseUrlLoaded,
    databaseReachable,
    needsRestart,
    encryptionKeyConfigured,
    geminiConfigured,
  });
}

/** Keys permitted to merge into the server `.env` file from the dashboard. */
const PATCHABLE_ENV_KEYS = new Set([
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "DOCKER_NETWORK",
  "NGINX_CONFIG_PATH",
  "PROJECTS_ROOT_PATH",
  "PRISMA_SCHEMA_SYNC",
  "LOG_LEVEL",
  "PORT",
  "MONIX_PATH",
  "MONIX_PORT",
]);

interface PatchEnvBody {
  env: Record<string, string>;
}

/**
 * Merges non-empty string values into `.env` on disk (with `.env.bak` backup).
 * Does not restart the process — operator must restart API/worker for changes to apply.
 */
export async function patchInstanceEnvHandler(
  req: FastifyRequest<{ Body: PatchEnvBody }>,
  reply: FastifyReply
): Promise<void> {
  const raw = req.body?.env;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reply.code(400).send({ error: "ValidationError", message: 'Body must include an object "env"' });
  }

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === "") continue;
    if (typeof value !== "string") {
      return reply.code(400).send({ error: "ValidationError", message: `env.${key} must be a string` });
    }
    if (!PATCHABLE_ENV_KEYS.has(key)) {
      return reply.code(400).send({ error: "ValidationError", message: `Key is not allowed: ${key}` });
    }
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return reply.code(400).send({
      error: "ValidationError",
      message: "Provide at least one non-empty env value",
    });
  }

  if (updates.PRISMA_SCHEMA_SYNC !== undefined) {
    const v = updates.PRISMA_SCHEMA_SYNC.toLowerCase();
    if (v !== "migrate" && v !== "push") {
      return reply.code(400).send({
        error: "ValidationError",
        message: "PRISMA_SCHEMA_SYNC must be migrate or push",
      });
    }
    updates.PRISMA_SCHEMA_SYNC = v;
  }

  if (updates.PORT !== undefined && !/^\d+$/.test(updates.PORT.trim())) {
    return reply.code(400).send({ error: "ValidationError", message: "PORT must be a positive integer" });
  }
  if (updates.MONIX_PORT !== undefined && !/^\d+$/.test(updates.MONIX_PORT.trim())) {
    return reply.code(400).send({ error: "ValidationError", message: "MONIX_PORT must be a positive integer" });
  }

  try {
    const next = mergeIntoDotenv(updates);
    writeEnvWithBackup(next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "patchInstanceEnv: write failed");
    return reply.code(500).send({ error: "WriteError", message: msg });
  }

  return reply.code(200).send({
    message: "Environment file updated. Restart the API and worker to apply changes.",
    keysWritten: Object.keys(updates),
  });
}
