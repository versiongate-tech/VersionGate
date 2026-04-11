import { FastifyRequest, FastifyReply } from "fastify";
import prisma from "../prisma/client";
import { cancelPendingJob } from "../services/job-queue";
import { logger } from "../utils/logger";

export async function getJobHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    return reply.code(404).send({ error: "NotFound", message: "Job not found" });
  }
  reply.code(200).send({ job });
}

export async function listAllJobsHandler(
  req: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset ?? "0", 10) || 0, 0);

  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.job.count(),
  ]);

  reply.code(200).send({ jobs, total, limit, offset });
}

export async function listProjectJobsHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset ?? "0", 10) || 0, 0);

  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.job.count({ where: { projectId: req.params.id } }),
  ]);

  reply.code(200).send({ jobs, total, limit, offset });
}

export async function cancelJobHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const jobId = req.params.id;
  const ok = await cancelPendingJob(jobId);
  if (!ok) {
    return reply.code(400).send({ error: "BadRequest", message: "Job is not pending or not found" });
  }
  logger.info({ jobId }, "API: pending job cancelled");
  reply.code(200).send({ cancelled: true });
}
