import { execSync } from "child_process";
import { projectRoot } from "./paths";
import { logger } from "./logger";

export type PrismaSchemaSyncMode = "migrate" | "push";

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Applies Prisma schema changes: prefer `migrate deploy` (versioned migrations in repo),
 * with optional fallback to `db push` for databases that predate migration history.
 */
export function runPrismaSchemaSync(options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  mode?: PrismaSchemaSyncMode;
  timeoutMs?: number;
  /** When true, do not fall back to db push if migrate deploy fails */
  strictMigrate?: boolean;
}): void {
  const cwd = options.cwd ?? projectRoot;
  const env = options.env ?? process.env;
  const mode = options.mode ?? "migrate";
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const strict = options.strictMigrate ?? false;

  if (mode === "push") {
    logger.info("Database schema sync: prisma db push (PRISMA_SCHEMA_SYNC=push)");
    execSync("bunx prisma db push --accept-data-loss", {
      cwd,
      env,
      stdio: "pipe",
      timeout,
    });
    return;
  }

  try {
    execSync("bunx prisma migrate deploy", {
      cwd,
      env,
      stdio: "pipe",
      timeout,
    });
    logger.info("Database migrations applied (prisma migrate deploy)");
  } catch (firstErr: unknown) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (strict) {
      throw firstErr;
    }
    logger.warn(
      { err: msg },
      "prisma migrate deploy failed — falling back to prisma db push (legacy or drifted database)"
    );
    execSync("bunx prisma db push --accept-data-loss", {
      cwd,
      env,
      stdio: "pipe",
      timeout,
    });
    logger.warn("Database schema synced via prisma db push fallback");
  }
}
