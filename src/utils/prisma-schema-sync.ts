import { execSync } from "child_process";
import { projectRoot } from "./paths";
import { logger } from "./logger";

export type PrismaSchemaSyncMode = "migrate" | "push";

const DEFAULT_TIMEOUT_MS = 120_000;

/** Prisma Migrate needs a real DB session for advisory locks — Neon pooler URLs often hit P1002. */
function envForMigrateDeploy(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const direct = base.DIRECT_DATABASE_URL?.trim();
  if (!direct) return base;
  return { ...base, DATABASE_URL: direct };
}

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

  const migrateEnv = envForMigrateDeploy(env);
  if (env.DIRECT_DATABASE_URL?.trim()) {
    logger.info("prisma migrate deploy: using DIRECT_DATABASE_URL as DATABASE_URL (avoids pooler advisory-lock timeouts)");
  }

  try {
    execSync("bunx prisma migrate deploy", {
      cwd,
      env: migrateEnv,
      stdio: "pipe",
      timeout,
    });
    logger.info("Database migrations applied (prisma migrate deploy)");
  } catch (firstErr: unknown) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (strict) {
      throw firstErr;
    }
    // P3005 = DB never baselined for Migrate; push would emit wrong one-shot DDL (e.g. NOT NULL
    // without the backfill steps in versioned migrations). Do not fall back to db push.
    // P1001/P1002 = connectivity / advisory lock (Neon pooler) — push is the wrong recovery; use DIRECT_DATABASE_URL.
    const noPushFallback =
      /\bP3005\b/i.test(msg) ||
      /\bP3009\b/i.test(msg) ||
      /\bP1001\b/i.test(msg) ||
      /\bP1002\b/i.test(msg) ||
      /baseline an existing production database/i.test(msg) ||
      /advisory lock/i.test(msg);
    if (noPushFallback) {
      logger.error(
        { err: msg },
        "prisma migrate deploy failed (baseline / migration history / DB reachability / advisory lock). Not using db push fallback — fix DATABASE_URL connectivity, set DIRECT_DATABASE_URL (Neon unpooled) for migrate, or baseline the DB (see docs/database-migrations.md)."
      );
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
