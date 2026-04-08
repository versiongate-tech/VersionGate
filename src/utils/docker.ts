import { execFileAsync } from "./exec";
import { logger } from "./logger";

/**
 * Builds a Docker image from a local build context.
 */
export async function buildImage(imageTag: string, contextPath: string): Promise<void> {
  logger.info({ imageTag, contextPath }, "Building Docker image");
  // BuildKit enables Dockerfile # syntax= and RUN --mount=type=cache (smaller layers, less host disk churn).
  await execFileAsync("docker", ["build", "-t", imageTag, contextPath], {
    env: { DOCKER_BUILDKIT: "1", BUILDKIT_PROGRESS: "plain" },
  });
}

/**
 * Starts a Docker container in detached mode.
 * Maps hostPort on the host to containerPort inside the container.
 * This means apps with hardcoded ports work fine — the app listens on its
 * native containerPort, and the host exposes it on hostPort for blue/green routing.
 */
export async function runContainer(
  name: string,
  imageTag: string,
  hostPort: number,
  containerPort: number,
  network: string,
  env: Record<string, string> = {}
): Promise<void> {
  logger.info({ name, imageTag, hostPort, containerPort, network }, "Starting Docker container");
  const envArgs = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  await execFileAsync("docker", [
    "run",
    "-d",
    "--name", name,
    "--network", network,
    "--add-host=host.docker.internal:host-gateway",
    "-p", `${hostPort}:${containerPort}`,
    "--restart", "unless-stopped",
    ...envArgs,
    imageTag,
  ]);
}

/**
 * Gracefully stops a running container.
 */
export async function stopContainer(name: string): Promise<void> {
  logger.info({ name }, "Stopping Docker container");
  await execFileAsync("docker", ["stop", name]);
}

/**
 * Force-removes a container (stopped or running).
 */
export async function removeContainer(name: string): Promise<void> {
  logger.info({ name }, "Removing Docker container");
  await execFileAsync("docker", ["rm", "-f", name]);
}

/**
 * Kills and removes any containers currently bound to the given host port.
 * This prevents "port already allocated" errors when a previous container
 * (possibly with a different name) is still holding the port.
 */
export async function freeHostPort(hostPort: number): Promise<void> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "ps", "-q", "--filter", `publish=${hostPort}`,
    ]);
    const ids = stdout.trim().split("\n").filter(Boolean);
    for (const id of ids) {
      logger.warn({ hostPort, id }, "Freeing port — killing container holding it");
      await execFileAsync("docker", ["rm", "-f", id]).catch(() => null);
    }
  } catch {
    // no containers on that port
  }
}

/**
 * True when `docker inspect` failed because the container/image ref does not exist.
 * Other failures (daemon down, permission denied, timeout) must not be treated as "stopped".
 */
export function isDockerResourceNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /No such object|No such container|does not exist|no such id:/i.test(msg);
}

/**
 * Returns true if the container exists and is in a running state.
 * Throws if Docker cannot be queried (so callers can skip health checks rather than mark deployments failed).
 */
export async function inspectContainer(name: string): Promise<boolean> {
  logger.debug({ name }, "Inspecting Docker container");
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      name,
    ]);
    return stdout.trim() === "true";
  } catch (err) {
    if (isDockerResourceNotFound(err)) {
      return false;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Returns the number of times Docker has restarted this container.
 * A non-zero value means the app inside is crash-looping.
 */
export async function getContainerRestartCount(name: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect", "-f", "{{.RestartCount}}", name,
    ]);
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export interface RawContainerStats {
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
  NetIO: string;
  BlockIO: string;
  PIDs: string;
  Name: string;
}

/**
 * Returns a single live stats snapshot for a container.
 * Returns null if the container is not running or does not exist.
 */
export async function getContainerStats(name: string): Promise<RawContainerStats | null> {
  logger.debug({ name }, "Fetching container stats");
  try {
    const { stdout } = await execFileAsync("docker", [
      "stats", "--no-stream", "--format", "{{json .}}", name,
    ]);
    const line = stdout.trim();
    if (!line) return null;
    return JSON.parse(line) as RawContainerStats;
  } catch {
    return null;
  }
}

/**
 * Returns the last N log lines from a container (stdout + stderr combined).
 * Returns an empty array if the container does not exist or has no logs.
 */
export async function getContainerLogs(name: string, tail = 200): Promise<string[]> {
  logger.debug({ name, tail }, "Fetching container logs");
  try {
    const { stdout, stderr } = await execFileAsync("docker", [
      "logs", "--tail", String(tail), "--timestamps", name,
    ]);
    return (stdout + "\n" + stderr)
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(-tail);
  } catch {
    return [];
  }
}
