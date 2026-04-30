import { FastifyRequest, FastifyReply } from "fastify";
import { ProjectRepository } from "../repositories/project.repository";
import { EnvironmentRepository } from "../repositories/environment.repository";

const projectRepo = new ProjectRepository();
const envRepo = new EnvironmentRepository();

interface ProjectParams {
  id: string;
}

export async function listEnvironmentsHandler(
  req: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply
): Promise<void> {
  const project = await projectRepo.findById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "NotFound", message: "Project not found" });
  }

  const environments = await envRepo.findAllForProject(req.params.id);
  reply.code(200).send({ environments });
}
