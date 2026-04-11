import { FastifyRequest, FastifyReply } from "fastify";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { config } from "../config/env";
import { envFilePath, projectRoot } from "../utils/paths";
import { runPrismaSchemaSync } from "../utils/prisma-schema-sync";
import { reconnectPrismaAfterSetup } from "../prisma/client";
import { notifySetupApplied } from "../services/post-setup-hooks";
import {
  AUTH_MIN_PASSWORD_LENGTH,
  createSessionWithClient,
  hashPassword,
  isValidEmail,
  SESSION_MAX_AGE_SEC,
} from "../services/auth.service";
import { buildSetSessionCookie } from "../utils/cookie";

interface SetupApplyBody {
  domain: string;
  databaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  geminiApiKey?: string;
}

const NGINX_CONF_PATH = "/etc/nginx/conf.d/versiongate.conf";
const DB_URL_REGEX = /^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m;
const ENCRYPTION_KEY_REGEX = /^ENCRYPTION_KEY\s*=\s*"?([0-9a-fA-F]{64})"?\s*$/m;
const HOSTNAME_LABEL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

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

function isValidIpv4Address(value: string): boolean {
  const octets = value.split(".");
  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }
    const parsed = Number.parseInt(octet, 10);
    return parsed >= 0 && parsed <= 255;
  });
}

function isValidHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253 || value.startsWith(".") || value.endsWith(".")) {
    return false;
  }

  const labels = value.split(".");
  return labels.every((label) => HOSTNAME_LABEL_REGEX.test(label));
}

function escapeEnvValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
}

function resolveProjectsRootPath(): string {
  const preferredPath = "/var/versiongate/projects";
  try {
    mkdirSync(preferredPath, { recursive: true });
    accessSync(preferredPath, constants.W_OK);
    return preferredPath;
  } catch {
    const fallbackPath = join(projectRoot, "projects");
    mkdirSync(fallbackPath, { recursive: true });
    return fallbackPath;
  }
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

  /** `.env` exists but this process has no DATABASE_URL (e.g. not applied in-process yet). */
  const needsRestart = configured && !process.env.DATABASE_URL?.trim();

  return reply.code(200).send({ configured, dbConnected, needsRestart });
}

export async function applySetupHandler(
  req: FastifyRequest<{ Body: SetupApplyBody }>,
  reply: FastifyReply
): Promise<void> {
  const { domain, databaseUrl, adminEmail, adminPassword, geminiApiKey } = req.body;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    return reply.code(400).send({ error: "BadRequest", message: "databaseUrl is required" });
  }

  if (!domain || domain.trim().length === 0) {
    return reply.code(400).send({ error: "BadRequest", message: "domain is required" });
  }

  const email =
    typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";
  const password = typeof adminPassword === "string" ? adminPassword : "";
  if (!isValidEmail(email)) {
    return reply.code(400).send({ error: "BadRequest", message: "Invalid admin email" });
  }
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    return reply.code(400).send({
      error: "BadRequest",
      message: `Admin password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters`,
    });
  }

  const normalizedDomain = domain.trim().toLowerCase();
  const domainIsIp = isValidIpv4Address(normalizedDomain);
  const domainIsHostname = isValidHostname(normalizedDomain);
  if (!domainIsIp && !domainIsHostname) {
    return reply.code(400).send({
      error: "BadRequest",
      message: "domain must be a valid domain name or IPv4 address",
    });
  }

  const existingDatabaseUrl = readDatabaseUrl();
  if (existingDatabaseUrl) {
    const existingDbConnected = await canConnectToDatabase(existingDatabaseUrl);
    if (existingDbConnected) {
      return reply.code(409).send({
        error: "SetupError",
        message: "Setup is already complete. Update configuration manually if needed.",
      });
    }
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
  const projectsRootPath = resolveProjectsRootPath();

  let envContent = `DATABASE_URL="${escapeEnvValue(databaseUrl)}"
PORT=9090
NODE_ENV=production
DOCKER_NETWORK="versiongate-net"
NGINX_CONFIG_PATH="${NGINX_CONF_PATH}"
PROJECTS_ROOT_PATH="${escapeEnvValue(projectsRootPath)}"
ENCRYPTION_KEY="${encryptionKey}"
`;

  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    envContent += `GEMINI_API_KEY="${escapeEnvValue(geminiApiKey.trim())}"\n`;
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
  const setupEnv = { ...process.env, DATABASE_URL: databaseUrl, ENCRYPTION_KEY: encryptionKey };
  try {
    runPrismaSchemaSync({
      cwd: projectRoot,
      env: setupEnv,
      timeoutMs: 120_000,
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

  // 3b. Create first admin and session (dedicated client — global Prisma not wired yet)
  const setupPrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let sessionToken: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await setupPrisma.user.create({
      data: { email, passwordHash },
    });
    sessionToken = await createSessionWithClient(setupPrisma, user.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Setup: failed to create admin user");
    await setupPrisma.$disconnect().catch(() => {});
    return reply.code(500).send({
      error: "SetupError",
      message: "Failed to create admin account: " + msg,
    });
  }
  await setupPrisma.$disconnect().catch(() => {});

  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = encryptionKey;
  await reconnectPrismaAfterSetup();
  notifySetupApplied();

  reply.header(
    "Set-Cookie",
    buildSetSessionCookie(sessionToken, SESSION_MAX_AGE_SEC, config.cookieSecure)
  );

  // 4. Write Nginx config (best-effort — may not have permissions)
  try {
    const serverName = domainIsIp ? "_" : normalizedDomain;
    const listenDirective = domainIsIp ? "listen 80 default_server;" : "listen 80;";

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
