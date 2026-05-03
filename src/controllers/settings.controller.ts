import { randomBytes } from "crypto";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { FastifyRequest, FastifyReply } from "fastify";
import {
  config,
  selfUpdateAutoApplyLive,
  selfUpdateBranchLive,
  selfUpdatePollMsLive,
  selfUpdateSecretLive,
} from "../config/env";
import { envFilePath, projectRoot } from "../utils/paths";
import { mergeIntoDotenv, writeEnvWithBackup } from "../utils/env-file";
import { logger } from "../utils/logger";
import { applySelfUpdate, getSelfUpdateStatus } from "../services/self-update.service";
import { kickSelfUpdatePoll } from "../services/self-update-poll";
import { isValidHostname, isValidIpv4Address } from "../utils/domain-validation";
import { generateVersionGateNginxConf, normalizePublicBasePath } from "../utils/nginx-versiongate-site";

const DB_URL_REGEX = /^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m;

function readDatabaseUrlFromFile(): string | null {
  if (!existsSync(envFilePath)) return null;
  const content = readFileSync(envFilePath, "utf-8");
  const match = content.match(DB_URL_REGEX);
  return match?.[1] ?? null;
}

/** Reads a simple `KEY=value` from `.env` (quoted values stripped). */
function readEnvKeyFromFile(key: string): string | null {
  if (!existsSync(envFilePath)) return null;
  const content = readFileSync(envFilePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== key) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
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
  const databaseUrlLoaded = Boolean(process.env.DATABASE_URL?.trim());

  let databaseReachable = false;
  const urlToPing = databaseUrlLoaded ? process.env.DATABASE_URL!.trim() : dbFromFile;
  if (urlToPing) {
    databaseReachable = await canConnectToDatabase(urlToPing);
  }

  const needsRestart = databaseUrlInEnvFile && !databaseUrlLoaded;

  const encryptionKeyConfigured = Boolean(process.env.ENCRYPTION_KEY?.trim());
  const geminiConfigured = Boolean(config.geminiApiKey?.trim());

  const publicDomain = readEnvKeyFromFile("PUBLIC_DOMAIN") ?? "";
  const publicBasePath = normalizePublicBasePath(readEnvKeyFromFile("PUBLIC_BASE_PATH") ?? "/");
  const certbotEmail = readEnvKeyFromFile("CERTBOT_EMAIL") ?? "";

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
    publicDomain,
    publicBasePath,
    certbotEmail,
    selfUpdateConfigured: Boolean(selfUpdateSecretLive()),
    selfUpdateGitBranch: selfUpdateBranchLive(),
    selfUpdatePollMs: selfUpdatePollMsLive(),
    selfUpdateAutoApply: selfUpdateAutoApplyLive(),
  });
}

/** Keys permitted to merge into the server `.env` file from the dashboard. */
const PATCHABLE_ENV_KEYS = new Set([
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
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
  "SELF_UPDATE_SECRET",
  "SELF_UPDATE_GIT_BRANCH",
  "SELF_UPDATE_POLL_MS",
  "SELF_UPDATE_AUTO_APPLY",
  "PUBLIC_DOMAIN",
  "PUBLIC_BASE_PATH",
  "CERTBOT_EMAIL",
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

  if (updates.SELF_UPDATE_POLL_MS !== undefined) {
    const t = updates.SELF_UPDATE_POLL_MS.trim();
    if (!/^\d+$/.test(t)) {
      return reply.code(400).send({ error: "ValidationError", message: "SELF_UPDATE_POLL_MS must be a non-negative integer" });
    }
    updates.SELF_UPDATE_POLL_MS = t;
  }

  if (updates.SELF_UPDATE_AUTO_APPLY !== undefined) {
    const v = updates.SELF_UPDATE_AUTO_APPLY.toLowerCase();
    if (!["true", "false", "1", "0"].includes(v)) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "SELF_UPDATE_AUTO_APPLY must be true, false, 1, or 0",
      });
    }
    updates.SELF_UPDATE_AUTO_APPLY = v === "true" || v === "1" ? "true" : "false";
  }

  if (updates.SELF_UPDATE_GIT_BRANCH !== undefined) {
    const b = updates.SELF_UPDATE_GIT_BRANCH.trim();
    if (!b || !/^[a-zA-Z0-9/._-]+$/.test(b)) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "SELF_UPDATE_GIT_BRANCH must be a non-empty branch name",
      });
    }
    updates.SELF_UPDATE_GIT_BRANCH = b;
  }

  if (updates.PUBLIC_DOMAIN !== undefined) {
    const d = updates.PUBLIC_DOMAIN.trim().toLowerCase();
    if (d && !isValidIpv4Address(d) && !isValidHostname(d)) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "PUBLIC_DOMAIN must be a valid hostname or IPv4 address",
      });
    }
    updates.PUBLIC_DOMAIN = d;
  }

  if (updates.PUBLIC_BASE_PATH !== undefined) {
    updates.PUBLIC_BASE_PATH = normalizePublicBasePath(updates.PUBLIC_BASE_PATH);
  }

  if (updates.CERTBOT_EMAIL !== undefined) {
    const em = updates.CERTBOT_EMAIL.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "CERTBOT_EMAIL must be a valid email address",
      });
    }
    updates.CERTBOT_EMAIL = em;
  }

  try {
    const next = mergeIntoDotenv(updates);
    writeEnvWithBackup(next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "patchInstanceEnv: write failed");
    return reply.code(500).send({ error: "WriteError", message: msg });
  }

  const selfKeys = [
    "SELF_UPDATE_SECRET",
    "SELF_UPDATE_GIT_BRANCH",
    "SELF_UPDATE_POLL_MS",
    "SELF_UPDATE_AUTO_APPLY",
  ] as const;
  let touchedSelf = false;
  for (const k of selfKeys) {
    if (updates[k] !== undefined) {
      process.env[k] = updates[k];
      touchedSelf = true;
    }
  }
  if (touchedSelf) {
    kickSelfUpdatePoll();
  }

  return reply.code(200).send({
    message: "Environment file updated. Restart the API and worker to apply changes.",
    keysWritten: Object.keys(updates),
  });
}

export async function getSelfUpdateSettingsHandler(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const branch = selfUpdateBranchLive();
  let git: Awaited<ReturnType<typeof getSelfUpdateStatus>> | null = null;
  if (selfUpdateSecretLive()) {
    try {
      git = await getSelfUpdateStatus(branch);
    } catch {
      git = null;
    }
  }
  reply.code(200).send({
    configured: Boolean(selfUpdateSecretLive()),
    branch,
    pollMs: selfUpdatePollMsLive(),
    autoApply: selfUpdateAutoApplyLive(),
    git,
  });
}

export async function postSelfUpdateEnableHandler(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (selfUpdateSecretLive()) {
    return reply.code(400).send({
      error: "AlreadyEnabled",
      message:
        "SELF_UPDATE_SECRET is already set. Remove it from .env to regenerate, or paste a new secret using the env editor.",
    });
  }
  const secret = randomBytes(32).toString("hex");
  try {
    const next = mergeIntoDotenv({ SELF_UPDATE_SECRET: secret });
    writeEnvWithBackup(next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "postSelfUpdateEnable: write failed");
    return reply.code(500).send({ error: "WriteError", message: msg });
  }
  process.env.SELF_UPDATE_SECRET = secret;
  kickSelfUpdatePoll();
  logger.info("Self-update enabled from Settings (secret written to .env, not logged)");
  reply.code(200).send({
    message:
      "Self-update enabled. The secret was saved to .env and is not shown again. Use “Check for updates” below, or call the webhook with that token.",
  });
}

export async function postSelfUpdateCheckHandler(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!selfUpdateSecretLive()) {
    return reply.code(400).send({
      error: "NotConfigured",
      message: "Enable self-update first, or set SELF_UPDATE_SECRET in .env",
    });
  }
  const status = await getSelfUpdateStatus(selfUpdateBranchLive());
  reply.code(200).send(status);
}

export async function postSelfUpdateApplyHandler(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!selfUpdateSecretLive()) {
    return reply.code(400).send({
      error: "NotConfigured",
      message: "Enable self-update first, or set SELF_UPDATE_SECRET in .env",
    });
  }
  const result = await applySelfUpdate(selfUpdateBranchLive());
  /** Always 200: outcome is in `result.ok` / `result.error` (avoids generic client treating merge/build failure as an HTTP exception). */
  reply.code(200).send(result);
}

function reloadNginxBestEffort(): void {
  try {
    execFileSync("nginx", ["-t"], { stdio: "pipe" });
    execFileSync("nginx", ["-s", "reload"], { stdio: "pipe" });
    return;
  } catch (err) {
    logger.debug({ err }, "nginx reload as current user failed — trying sudo");
  }
  execFileSync("sudo", ["-n", "/usr/sbin/nginx", "-t"], { stdio: "pipe" });
  execFileSync("sudo", ["-n", "/usr/sbin/nginx", "-s", "reload"], { stdio: "pipe" });
}

interface ApplyNginxBody {
  publicDomain?: string;
  publicBasePath?: string;
}

/** Writes HTTP reverse-proxy config for VersionGate and reloads nginx. */
export async function postNginxApplySiteHandler(
  req: FastifyRequest<{ Body: ApplyNginxBody }>,
  reply: FastifyReply
): Promise<void> {
  const body = req.body ?? {};
  let domainRaw = (typeof body.publicDomain === "string" ? body.publicDomain : "").trim().toLowerCase();
  if (!domainRaw) domainRaw = (readEnvKeyFromFile("PUBLIC_DOMAIN") ?? "").trim().toLowerCase();

  const basePath = normalizePublicBasePath(
    typeof body.publicBasePath === "string"
      ? body.publicBasePath
      : readEnvKeyFromFile("PUBLIC_BASE_PATH") ?? "/"
  );

  if (!domainRaw) {
    return reply.code(400).send({
      error: "BadRequest",
      message: "Set Public hostname below or PUBLIC_DOMAIN in .env before applying nginx.",
    });
  }

  const domainIsIp = isValidIpv4Address(domainRaw);
  const domainIsHostname = isValidHostname(domainRaw);
  if (!domainIsIp && !domainIsHostname) {
    return reply.code(400).send({ error: "BadRequest", message: "Invalid public hostname or IP address." });
  }

  const conf = generateVersionGateNginxConf({
    serverName: domainIsIp ? "_" : domainRaw,
    defaultServer: domainIsIp,
    upstreamHost: "127.0.0.1",
    upstreamPort: config.port,
    basePath,
  });

  const outPath = config.nginxConfigPath;
  try {
    writeFileSync(outPath, conf, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "postNginxApplySite: write failed");
    return reply.code(500).send({ error: "WriteError", message: msg });
  }

  try {
    reloadNginxBestEffort();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "postNginxApplySite: nginx reload failed");
    return reply.code(500).send({
      error: "NginxReloadFailed",
      message:
        "The config file was written but nginx reload failed (often requires root). Path: " +
        outPath +
        ". Try: sudo nginx -t && sudo nginx -s reload",
      detail: msg,
    });
  }

  try {
    const next = mergeIntoDotenv({
      PUBLIC_DOMAIN: domainRaw,
      PUBLIC_BASE_PATH: basePath === "/" ? "/" : basePath,
    });
    writeEnvWithBackup(next);
  } catch (err) {
    logger.warn({ err }, "postNginxApplySite: could not persist PUBLIC_DOMAIN / PUBLIC_BASE_PATH to .env");
  }

  reply.code(200).send({
    ok: true,
    message: "Nginx configuration applied and nginx reloaded.",
    path: outPath,
    publicDomain: domainRaw,
    publicBasePath: basePath,
  });
}

interface CertbotBody {
  email?: string;
}

/** Runs non-interactive Certbot nginx installer for PUBLIC_DOMAIN (hostname only). */
export async function postCertbotSslHandler(
  req: FastifyRequest<{ Body: CertbotBody }>,
  reply: FastifyReply
): Promise<void> {
  const domain = (readEnvKeyFromFile("PUBLIC_DOMAIN") ?? "").trim().toLowerCase();
  if (!domain || !isValidHostname(domain)) {
    return reply.code(400).send({
      error: "BadRequest",
      message:
        "PUBLIC_DOMAIN must be a DNS hostname (not a raw IP) for Let's Encrypt. Save it under Public URL first, then update DNS.",
    });
  }

  const emailRaw =
    (typeof req.body?.email === "string" ? req.body.email.trim() : "") ||
    (readEnvKeyFromFile("CERTBOT_EMAIL") ?? "").trim();
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return reply.code(400).send({
      error: "BadRequest",
      message: "Provide a Let's Encrypt contact email (form field or CERTBOT_EMAIL in .env).",
    });
  }

  const args = [
    "--nginx",
    "-d",
    domain,
    "--non-interactive",
    "--agree-tos",
    "--email",
    emailRaw,
    "--redirect",
  ];

  try {
    try {
      execFileSync("certbot", args, { stdio: "pipe", timeout: 240_000 });
    } catch (directErr) {
      logger.debug({ err: directErr }, "certbot as current user failed — trying sudo -n");
      execFileSync("sudo", ["-n", "certbot", ...args], { stdio: "pipe", timeout: 240_000 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "certbot failed");
    return reply.code(500).send({
      error: "CertbotFailed",
      message:
        "Certbot could not obtain or install a certificate. Ensure DNS points to this server, ports 80/443 are reachable, certbot is installed, and nginx is healthy.",
      detail: msg.slice(0, 1200),
    });
  }

  reply.code(200).send({
    ok: true,
    message: "Certbot completed. Reload the site over HTTPS and consider COOKIE_SECURE=true if you serve only HTTPS.",
  });
}
