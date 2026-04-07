import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config/env";
import { envFilePath, projectRoot } from "../utils/paths";

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
