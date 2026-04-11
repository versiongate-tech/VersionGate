import { logger } from "../utils/logger";

const callbacks: (() => void)[] = [];

/** Register once from server bootstrap — runs when first-time setup finishes in-process. */
export function registerAfterSetup(cb: () => void): void {
  callbacks.push(cb);
}

export function notifySetupApplied(): void {
  for (const cb of callbacks) {
    try {
      cb();
    } catch (err) {
      logger.error({ err }, "post-setup hook failed");
    }
  }
}
