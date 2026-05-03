import { createAppAuth } from "@octokit/auth-app";
import { config } from "../config/env";

export interface InstallationAccessToken {
  token: string;
  /** GitHub installation token TTL (~1h); ISO string when provided by auth-app. */
  expiresAt?: string;
}

function appAuthOptions() {
  const appId = Number(config.githubAppId);
  if (!Number.isFinite(appId) || appId <= 0) {
    throw new Error("Invalid GITHUB_APP_ID");
  }
  if (!config.githubAppPrivateKey?.trim()) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not set");
  }
  return {
    appId,
    privateKey: config.githubAppPrivateKey,
  };
}

/**
 * Creates a GitHub App JWT, exchanges it for a short-lived installation access token (~1 hour).
 */
export async function getInstallationAccessToken(
  installationId: bigint | number | string
): Promise<InstallationAccessToken> {
  const auth = createAppAuth(appAuthOptions());
  const id =
    typeof installationId === "bigint"
      ? Number(installationId)
      : typeof installationId === "string"
        ? Number(installationId)
        : installationId;
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid installation id");
  }
  const result = await auth({ type: "installation", installationId: id });
  return {
    token: result.token,
    expiresAt: "expiresAt" in result && typeof result.expiresAt === "string" ? result.expiresAt : undefined,
  };
}
