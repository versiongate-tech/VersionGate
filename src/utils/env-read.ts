import { existsSync, readFileSync } from "fs";
import { envFilePath } from "./paths";

/** Reads a single KEY from the project `.env` file (unquoted value). */
export function readEnvKeyFromFile(key: string): string | null {
  if (!existsSync(envFilePath)) return null;
  const content = readFileSync(envFilePath, "utf-8");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escapedKey}\\s*=\\s*"?([^"\\n\\r]*)"?\\s*$`, "m");
  const match = content.match(re);
  return match ? match[1].trim() : null;
}
