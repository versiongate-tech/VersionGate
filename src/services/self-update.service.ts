import { createHash, timingSafeEqual } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { execFileAsync } from "../utils/exec";
import { projectRoot } from "../utils/paths";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { runPrismaSchemaSync } from "../utils/prisma-schema-sync";

let applyBusy = false;

export interface SelfUpdateStatus {
  branch: string;
  isGitRepo: boolean;
  currentCommit: string;
  remoteCommit: string | null;
  behind: boolean;
  message?: string;
}

export interface SelfUpdateApplyResult {
  ok: boolean;
  steps: string[];
  error?: string;
}

/** Constant-time string compare (length-independent via SHA-256). */
export function selfUpdateTokensMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function ecosystemPath(): string {
  return join(projectRoot, "ecosystem.config.cjs");
}

function schedulePm2Reload(): void {
  const child = spawn("pm2", ["reload", ecosystemPath(), "--update-env"], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

/**
 * Compare local HEAD to origin/{branch} after `git fetch origin {branch}`.
 */
export async function getSelfUpdateStatus(branch: string): Promise<SelfUpdateStatus> {
  const gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) {
    return {
      branch,
      isGitRepo: false,
      currentCommit: "",
      remoteCommit: null,
      behind: false,
      message: "This install is not a git clone — use your package or image pipeline to update.",
    };
  }

  try {
    const headOut = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
    const head = headOut.stdout.trim();
    await execFileAsync("git", ["fetch", "origin", branch], { cwd: projectRoot });
    const remoteOut = await execFileAsync("git", ["rev-parse", `origin/${branch}`], { cwd: projectRoot });
    const remote = remoteOut.stdout.trim();
    return {
      branch,
      isGitRepo: true,
      currentCommit: head,
      remoteCommit: remote,
      behind: head !== remote,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: msg, branch }, "Self-update: status check failed");
    return {
      branch,
      isGitRepo: true,
      currentCommit: "",
      remoteCommit: null,
      behind: false,
      message: msg,
    };
  }
}

/**
 * Fast-forward merge from origin, install deps, prisma generate + migrate, build dashboard, then PM2 reload (detached).
 */
export async function applySelfUpdate(branch: string): Promise<SelfUpdateApplyResult> {
  const gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) {
    return { ok: false, steps: [], error: "Not a git repository" };
  }
  if (applyBusy) {
    return { ok: false, steps: [], error: "Update already in progress" };
  }

  applyBusy = true;
  const steps: string[] = [];

  try {
    await execFileAsync("git", ["fetch", "origin", branch], { cwd: projectRoot });
    steps.push(`git fetch origin ${branch}`);

    await execFileAsync("git", ["merge", "--ff-only", `origin/${branch}`], { cwd: projectRoot });
    steps.push(`git merge --ff-only origin/${branch}`);

    await execFileAsync("bun", ["install"], { cwd: projectRoot });
    steps.push("bun install");

    await execFileAsync("bunx", ["prisma", "generate"], { cwd: projectRoot });
    steps.push("prisma generate");

    if (process.env.DATABASE_URL?.trim()) {
      runPrismaSchemaSync({ mode: config.prismaSchemaSync });
      steps.push(`prisma schema sync (${config.prismaSchemaSync})`);
    } else {
      steps.push("prisma schema sync (skipped — no DATABASE_URL)");
    }

    await execFileAsync("bun", ["run", "build"], { cwd: projectRoot });
    steps.push("bun run build");

    schedulePm2Reload();
    steps.push("pm2 reload (detached)");

    logger.info({ branch, steps }, "Self-update completed — PM2 reload scheduled");
    return { ok: true, steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ err: msg, branch, steps }, "Self-update failed");
    return { ok: false, steps, error: msg };
  } finally {
    applyBusy = false;
  }
}
