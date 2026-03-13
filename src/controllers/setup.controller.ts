import { FastifyRequest, FastifyReply } from "fastify";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { logger } from "../utils/logger";
import { envFilePath, projectRoot } from "../utils/paths";

interface SetupApplyBody {
  domain: string;
  databaseUrl: string;
  geminiApiKey?: string;
}

const NGINX_CONF_PATH = "/etc/nginx/conf.d/versiongate.conf";
const DB_URL_REGEX = /^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m;
const ENCRYPTION_KEY_REGEX = /^ENCRYPTION_KEY\s*=\s*"?([0-9a-fA-F]{64})"?\s*$/m;

function getEnvPath(): string {
  return envFilePath;
}

function readDatabaseUrl(): string | null {
  const envPath = getEnvPath();
  if (!existsSync(envPath)) return null;

  const content = readFileSync(envPath, "utf-8");
  const match = content.match(DB_URL_REGEX);
  return match ? match[1] : null;
}

function isConfigured(): boolean {
  const dbUrl = readDatabaseUrl();
  return !!dbUrl && dbUrl.length > 0;
}

function readExistingEncryptionKey(): string | null {
  const envPath = getEnvPath();
  if (!existsSync(envPath)) return null;

  const content = readFileSync(envPath, "utf-8");
  const match = content.match(ENCRYPTION_KEY_REGEX);
  return match ? match[1] : null;
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

export async function getSetupStatusHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const configured = isConfigured();

  let dbConnected = false;
  if (configured) {
    const dbUrl = readDatabaseUrl();
    if (dbUrl) {
      dbConnected = await canConnectToDatabase(dbUrl);
    }
  }

  return reply.code(200).send({ configured, dbConnected });
}

export async function applySetupHandler(
  req: FastifyRequest<{ Body: SetupApplyBody }>,
  reply: FastifyReply
): Promise<void> {
  const { domain, databaseUrl, geminiApiKey } = req.body;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    return reply.code(400).send({ error: "BadRequest", message: "databaseUrl is required" });
  }

  if (!domain || domain.trim().length === 0) {
    return reply.code(400).send({ error: "BadRequest", message: "domain is required" });
  }

  // 1. Validate database connection
  logger.info("Setup: validating database connection…");
  const dbOk = await canConnectToDatabase(databaseUrl);
  if (!dbOk) {
    return reply.code(422).send({
      error: "SetupError",
      message: "Cannot connect to the database. Please check your DATABASE_URL.",
    });
  }

  // 2. Write .env file
  const envPath = getEnvPath();
  logger.info({ envPath }, "Setup: writing .env file…");
  const encryptionKey = readExistingEncryptionKey() ?? randomBytes(32).toString("hex");

  let envContent = `DATABASE_URL="${databaseUrl}"
PORT=9090
NODE_ENV=production
DOCKER_NETWORK="versiongate-net"
NGINX_CONFIG_PATH="${NGINX_CONF_PATH}"
PROJECTS_ROOT_PATH="/var/versiongate/projects"
ENCRYPTION_KEY="${encryptionKey}"
`;

  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    envContent += `GEMINI_API_KEY="${geminiApiKey.trim()}"\n`;
  }

  writeFileSync(envPath, envContent, "utf-8");
  logger.info("Setup: .env written successfully");

  // 3. Generate Prisma client and push the schema so setup stays fully UI-driven.
  logger.info("Setup: generating Prisma client…");
  try {
    execSync("bunx prisma generate", {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, ENCRYPTION_KEY: encryptionKey },
      stdio: "pipe",
      timeout: 60_000,
    });
    logger.info("Setup: Prisma client generated");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Setup: prisma generate failed");
    return reply.code(500).send({
      error: "SetupError",
      message: "Prisma client generation failed: " + msg,
    });
  }

  logger.info("Setup: running database migrations…");
  try {
    execSync("bunx prisma db push --accept-data-loss", {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, ENCRYPTION_KEY: encryptionKey },
      stdio: "pipe",
      timeout: 60_000,
    });
    logger.info("Setup: database migrations complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Setup: database migration failed");
    return reply.code(500).send({
      error: "SetupError",
      message: "Database migration failed: " + msg,
    });
  }

  // 4. Write Nginx config (best-effort — may not have permissions)
  try {
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(domain.trim());
    const serverName = isIp ? "_" : domain.trim();
    const listenDirective = isIp ? "listen 80 default_server;" : "listen 80;";

    const nginxConf = `server {
    ${listenDirective}
    server_name ${serverName};

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
    writeFileSync(NGINX_CONF_PATH, nginxConf, "utf-8");

    try {
      execSync("nginx -t && nginx -s reload", { stdio: "pipe", timeout: 10_000 });
      logger.info("Setup: Nginx configuration applied and reloaded");
    } catch {
      logger.warn("Setup: Nginx config written but reload failed (may need manual reload)");
    }
  } catch {
    logger.warn("Setup: Could not write Nginx config (permission denied — configure manually)");
  }

  return reply.code(200).send({ configured: true });
}
