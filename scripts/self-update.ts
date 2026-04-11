#!/usr/bin/env bun
/**
 * On-host upgrade (same steps as POST /api/v1/system/update/apply).
 * Run from repo root: `bun run self-update`
 */
import { config } from "../src/config/env";
import { applySelfUpdate } from "../src/services/self-update.service";

const brIdx = process.argv.indexOf("--branch");
const branch =
  brIdx >= 0 && process.argv[brIdx + 1] ? process.argv[brIdx + 1]! : config.selfUpdateGitBranch;

const result = await applySelfUpdate(branch);
if (result.ok) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
console.error(JSON.stringify(result, null, 2));
process.exit(1);
