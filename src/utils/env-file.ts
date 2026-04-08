import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { envFilePath } from "./paths";

export function escapeEnvValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
}

/**
 * Merges KEY=value pairs into the project `.env` file, replacing existing keys or appending new lines.
 */
export function mergeIntoDotenv(updates: Record<string, string>): string {
  let content = existsSync(envFilePath) ? readFileSync(envFilePath, "utf-8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}="${escapeEnvValue(value)}"`;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escapedKey}\\s*=\\s*.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) {
        content += "\n";
      }
      content += `${line}\n`;
    }
  }
  return content;
}

export function writeEnvWithBackup(newContent: string): void {
  if (existsSync(envFilePath)) {
    copyFileSync(envFilePath, `${envFilePath}.bak`);
  }
  writeFileSync(envFilePath, newContent, "utf-8");
}
