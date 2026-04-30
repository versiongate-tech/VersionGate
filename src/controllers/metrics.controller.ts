import { FastifyRequest, FastifyReply } from "fastify";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";
import { getContainerStats, getContainerLogs } from "../utils/docker";
import { logger } from "../utils/logger";

const deploymentRepo = new DeploymentRepository();
const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();

interface ProjectParams {
  id: string;
}

function parsePercent(s: string): number {
  return parseFloat(s.replace("%", "")) || 0;
}

function parseBytes(s: string): number {
  const match = s.trim().match(/^([\d.]+)\s*([A-Za-z]+)?$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2] ?? "B";
  const units: Record<string, number> = {
    B: 1,
    KB: 1_000,       KiB: 1_024,
    MB: 1_000_000,   MiB: 1_048_576,
    GB: 1_000_000_000, GiB: 1_073_741_824,
    TB: 1_000_000_000_000, TiB: 1_099_511_627_776,
  };
  return value * (units[unit] ?? 1);
}

// Parse "1.23MB / 456kB" style strings (NetIO, BlockIO)
function parseIoPair(s: string): { rx: number; tx: number } {
  const [a, b] = s.split("/").map((x) => x.trim());
  return { rx: parseBytes(a ?? "0"), tx: parseBytes(b ?? "0") };
}

const EMPTY_METRICS = {
  running: false,
  cpu: 0,
  memoryUsed: 0,
  memoryLimit: 0,
  memoryPercent: 0,
  netIn: 0,
  netOut: 0,
  blockIn: 0,
  blockOut: 0,
  pids: 0,
};

export async function getProjectMetricsHandler(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const defaultEnv = await envRepo.findDefaultForProject(req.params.id);
  const active = defaultEnv ? await deploymentRepo.findActiveForEnvironment(defaultEnv.id) : null;
  if (!active) {
    return reply.code(200).send({ ...EMPTY_METRICS, timestamp: new Date().toISOString() });
  }

  const stats = await getContainerStats(active.containerName);
  if (!stats) {
    logger.warn({ containerName: active.containerName }, "Metrics: docker stats returned null");
    return reply.code(200).send({ ...EMPTY_METRICS, timestamp: new Date().toISOString() });
  }

  const [usedStr, limitStr] = stats.MemUsage.split(" / ");
  const memoryUsed  = parseBytes(usedStr ?? "0");
  const memoryLimit = parseBytes(limitStr ?? "0");
  const net   = parseIoPair(stats.NetIO   ?? "0B / 0B");
  const block = parseIoPair(stats.BlockIO ?? "0B / 0B");

  reply.code(200).send({
    running: true,
    cpu: parsePercent(stats.CPUPerc),
    memoryUsed,
    memoryLimit,
    memoryPercent: parsePercent(stats.MemPerc),
    netIn:    net.rx,
    netOut:   net.tx,
    blockIn:  block.rx,
    blockOut: block.tx,
    pids: parseInt(stats.PIDs ?? "0", 10) || 0,
    timestamp: new Date().toISOString(),
  });
}

export async function getProjectLogsHandler(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  // Prefer the active deployment; fall back to the most recent one of any
  // status so failed container logs are still visible in the dashboard.
  const defaultEnv = await envRepo.findDefaultForProject(req.params.id);
  const active = defaultEnv ? await deploymentRepo.findActiveForEnvironment(defaultEnv.id) : null;
  const target =
    active ??
    (defaultEnv ? (await deploymentRepo.findAllForEnvironment(defaultEnv.id))[0] : null) ??
    null;

  if (!target) {
    return reply.code(200).send({ lines: [], containerName: null });
  }

  const lines = await getContainerLogs(target.containerName, 200);
  reply.code(200).send({ lines, containerName: target.containerName });
}
