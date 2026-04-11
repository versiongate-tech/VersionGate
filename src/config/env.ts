import { existsSync } from "fs";
import dotenv from "dotenv";
import { envFilePath } from "../utils/paths";

dotenv.config({ path: envFilePath });

/** Docker CLI path: explicit `DOCKER_BIN`, else first existing common path, else `docker` (relies on PATH). */
function resolveDockerBin(): string {
  const fromEnv = process.env.DOCKER_BIN?.trim();
  if (fromEnv) return fromEnv;
  for (const p of ["/usr/bin/docker", "/usr/local/bin/docker", "/snap/bin/docker"]) {
    if (existsSync(p)) return p;
  }
  return "docker";
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const prismaSchemaSyncRaw = optionalEnv("PRISMA_SCHEMA_SYNC", "migrate").toLowerCase();
const prismaSchemaSync: "migrate" | "push" =
  prismaSchemaSyncRaw === "push" ? "push" : "migrate";

export const config = {
  port: parseInt(optionalEnv("PORT", "9090"), 10) || 9090,
  logLevel: optionalEnv("LOG_LEVEL", "info"),
  databaseUrl: optionalEnv("DATABASE_URL", ""),
  /** migrate: `prisma migrate deploy` (with db push fallback); push: `prisma db push` only */
  prismaSchemaSync,
  dockerBin: resolveDockerBin(),
  dockerNetwork: optionalEnv("DOCKER_NETWORK", "versiongate-net"),
  nginxConfigPath: optionalEnv("NGINX_CONFIG_PATH", "/etc/nginx/conf.d/upstream.conf"),
  projectsRootPath: optionalEnv("PROJECTS_ROOT_PATH", "/var/versiongate/projects"),
  monixPath: optionalEnv("MONIX_PATH", "/opt/monix"),
  monixPort: parseInt(optionalEnv("MONIX_PORT", "3030"), 10),
  geminiApiKey: optionalEnv("GEMINI_API_KEY", ""),
  geminiModel: optionalEnv("GEMINI_MODEL", "gemini-2.5-pro"),
  validation: {
    healthTimeoutMs: 5000,
    retryDelayMs: 2000,
    maxLatencyMs: 2000,
    maxRetries: 15, // 30 seconds total — accommodates slow-booting apps
  },
  /** Long random string. Enables GET/POST `/api/v1/system/update/*` (Bearer auth). */
  selfUpdateSecret: optionalEnv("SELF_UPDATE_SECRET", "").trim(),
  /** Tracked branch for git fetch/merge (must match your deploy remote). */
  selfUpdateGitBranch: optionalEnv("SELF_UPDATE_GIT_BRANCH", "main"),
  /** If > 0, periodically fetch origin and log or auto-apply (see SELF_UPDATE_AUTO_APPLY). */
  selfUpdatePollMs: Math.max(0, parseInt(optionalEnv("SELF_UPDATE_POLL_MS", "0"), 10) || 0),
  /** When true with SELF_UPDATE_POLL_MS, runs apply when origin is ahead (fast-forward only). */
  selfUpdateAutoApply:
    optionalEnv("SELF_UPDATE_AUTO_APPLY", "").toLowerCase() === "true" ||
    optionalEnv("SELF_UPDATE_AUTO_APPLY", "") === "1",
} as const;
