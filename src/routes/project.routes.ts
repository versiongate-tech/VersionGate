import { FastifyInstance } from "fastify";
import {
  createProjectHandler,
  listProjectsHandler,
  getProjectHandler,
  deleteProjectHandler,
  rollbackProjectHandler,
  updateProjectHandler,
  updateProjectEnvHandler,
  generatePipelineHandler,
} from "../controllers/project.controller";

const envSchema = {
  type: "object",
  additionalProperties: { type: "string" },
};

const projectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    repoUrl: { type: "string" },
    branch: { type: "string" },
    localPath: { type: "string" },
    buildContext: { type: "string" },
    appPort: { type: "number" },
    healthPath: { type: "string" },
    basePort: { type: "number" },
    webhookSecret: { type: "string", nullable: true },
    env: envSchema,
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
};

const createBodySchema = {
  type: "object",
  required: ["name", "repoUrl", "appPort"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z0-9-]+$" },
    repoUrl: { type: "string", minLength: 1 },
    branch: { type: "string", minLength: 1 },
    buildContext: { type: "string", minLength: 1 },
    appPort: { type: "integer", minimum: 1, maximum: 65535 },
    healthPath: { type: "string", minLength: 1 },
    env: envSchema,
  },
  additionalProperties: false,
};

const updateEnvBodySchema = {
  type: "object",
  required: ["env"],
  properties: {
    env: envSchema,
  },
  additionalProperties: false,
};

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.post("/projects", {
    schema: {
      body: createBodySchema,
      response: {
        201: {
          type: "object",
          properties: { project: projectSchema },
        },
      },
    },
    handler: createProjectHandler,
  });

  app.get("/projects", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: { projects: { type: "array", items: projectSchema } },
        },
      },
    },
    handler: listProjectsHandler,
  });

  app.get("/projects/:id", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: { project: projectSchema },
        },
      },
    },
    handler: getProjectHandler,
  });

  app.delete("/projects/:id", {
    schema: {},
    handler: deleteProjectHandler,
  });

  app.patch("/projects/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          branch:       { type: "string", minLength: 1 },
          buildContext: { type: "string", minLength: 1 },
          appPort:      { type: "integer", minimum: 1, maximum: 65535 },
          healthPath:   { type: "string", minLength: 1 },
          basePort:     { type: "integer", minimum: 1024, maximum: 65534 },
        },
        additionalProperties: false,
      },
      response: { 200: { type: "object", properties: { project: projectSchema } } },
    },
    handler: updateProjectHandler,
  });

  app.patch("/projects/:id/env", {
    schema: {
      body: updateEnvBodySchema,
      response: {
        200: {
          type: "object",
          properties: { project: projectSchema },
        },
      },
    },
    handler: updateProjectEnvHandler,
  });

  app.post("/projects/:id/generate-pipeline", {
    schema: {
      body: {
        type: "object",
        required: ["webhookUrl"],
        properties: { webhookUrl: { type: "string" } },
        additionalProperties: false,
      },
      response: {
        200: {
          type: "object",
          properties: { yaml: { type: "string" } },
        },
      },
    },
    handler: generatePipelineHandler,
  });

  app.post("/projects/:id/rollback", {
    schema: {
      response: {
        202: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            status: { type: "string" },
          },
        },
      },
    },
    handler: rollbackProjectHandler,
  });
}
