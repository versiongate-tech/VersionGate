import { Job, Prisma } from "@prisma/client";
import prisma from "../prisma/client";

export async function claimNextJob(): Promise<
  (Job & { project: import("@prisma/client").Project; environment: import("@prisma/client").Environment | null }) | null
> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.job.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    const updated = await tx.job.updateMany({
      where: { id: next.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (updated.count !== 1) return null;

    const job = await tx.job.findUnique({
      where: { id: next.id },
      include: { project: true, environment: true },
    });
    return job;
  });
}

export async function completeJob(jobId: string, result: unknown): Promise<Job> {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETE",
      completedAt: new Date(),
      result: result as Prisma.InputJsonValue,
    },
  });
}

export async function failJob(jobId: string, error: string): Promise<Job> {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error,
    },
  });
}

export async function appendLog(jobId: string, line: string): Promise<void> {
  const row = await prisma.job.findUnique({
    where: { id: jobId },
    select: { logs: true },
  });
  if (!row) return;
  const logs = Array.isArray(row.logs) ? [...(row.logs as string[])] : [];
  logs.push(line);
  await prisma.job.update({
    where: { id: jobId },
    data: { logs: logs as unknown as Prisma.InputJsonValue },
  });
}

export async function enqueueJob(
  type: string,
  projectId: string,
  payload: Record<string, unknown>,
  environmentId?: string
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type,
      projectId,
      ...(environmentId ? { environmentId } : {}),
      payload: payload as Prisma.InputJsonValue,
    },
  });
  return job.id;
}

export async function recoverStuckJobs(): Promise<number> {
  const res = await prisma.job.updateMany({
    where: { status: "RUNNING" },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error: "Worker restarted mid-job",
    },
  });
  return res.count;
}

export async function cancelPendingJob(jobId: string): Promise<boolean> {
  const r = await prisma.job.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  return r.count === 1;
}
