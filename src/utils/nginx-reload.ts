import { execFileSync } from "child_process";
import { logger } from "./logger";

/** Tests and reloads nginx; falls back to passwordless sudo when not root. */
export function reloadNginxBestEffort(): void {
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
