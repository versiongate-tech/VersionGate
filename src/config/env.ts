import dotenv from "dotenv";
import { envFilePath } from "../utils/paths";

dotenv.config({ path: envFilePath });

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
} as const;
