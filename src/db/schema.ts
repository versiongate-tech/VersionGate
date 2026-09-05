import {
  pgTable,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Enums
export const deploymentStatusEnum = pgEnum("DeploymentStatus", [
  "PENDING",
  "DEPLOYING",
  "ACTIVE",
  "FAILED",
  "ROLLED_BACK",
]);

export const deploymentColorEnum = pgEnum("DeploymentColor", [
  "BLUE",
  "GREEN",
]);

export const projectDomainSslStatusEnum = pgEnum("ProjectDomainSslStatus", [
  "pending_dns",
  "http",
  "issued",
  "failed",
]);

// Users
export const users = pgTable("User", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

// Sessions
export const sessions = pgTable(
  "Session",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tokenHash: text("tokenHash").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("Session_userId_idx").on(table.userId)]
);

// API Tokens (for CI/CD pipelines & external automation)
export const apiTokens = pgTable(
  "ApiToken",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    tokenHash: text("tokenHash").notNull().unique(),
    tokenPrefix: text("tokenPrefix").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ApiToken_userId_idx").on(table.userId),
    index("ApiToken_tokenHash_idx").on(table.tokenHash),
  ]
);

// GitHub Installations
export const githubInstallations = pgTable(
  "GitHubInstallation",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: bigint("installationId", { mode: "bigint" }).notNull().unique(),
    githubAccountLogin: text("githubAccountLogin").notNull(),
    githubAccountType: text("githubAccountType").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("GitHubInstallation_userId_idx").on(table.userId)]
);

// Projects
export const projects = pgTable(
  "Project",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(),
    repoUrl: text("repoUrl").notNull(),
    branch: text("branch").default("main").notNull(),
    localPath: text("localPath").notNull(),
    appPort: integer("appPort").notNull(),
    healthPath: text("healthPath").default("/health").notNull(),
    basePort: integer("basePort").notNull(),
    buildContext: text("buildContext").default(".").notNull(),
    webhookSecret: text("webhookSecret").unique(),
    env: jsonb("env").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("Project_name_idx").on(table.name)]
);

// Custom production hostnames routed to a project's active container
export const projectDomains = pgTable(
  "ProjectDomain",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    environmentName: text("environmentName").default("production").notNull(),
    sslStatus: projectDomainSslStatusEnum("sslStatus").default("pending_dns").notNull(),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("ProjectDomain_projectId_idx").on(table.projectId)]
);

// Environments
export const environments = pgTable(
  "Environment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    branch: text("branch").notNull(),
    serverHost: text("serverHost").default("localhost").notNull(),
    basePort: integer("basePort").notNull(),
    appPort: integer("appPort").notNull(),
    env: jsonb("env").default(sql`'{}'::jsonb`).notNull(),
    lockedAt: timestamp("lockedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("Environment_projectId_name_key").on(table.projectId, table.name),
    index("Environment_projectId_idx").on(table.projectId),
  ]
);

// Jobs
export const jobs = pgTable(
  "Job",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(),
    status: text("status").default("PENDING").notNull(),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: text("environmentId").references(() => environments.id, {
      onDelete: "set null",
    }),
    deploymentId: text("deploymentId"),
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    logs: jsonb("logs").default(sql`'[]'::jsonb`).notNull(),
    error: text("error"),
    startedAt: timestamp("startedAt", { mode: "date" }),
    completedAt: timestamp("completedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("Job_projectId_idx").on(table.projectId),
    index("Job_environmentId_idx").on(table.environmentId),
    index("Job_status_idx").on(table.status),
  ]
);

// Deployments
export const deployments = pgTable(
  "Deployment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    version: integer("version").notNull(),
    imageTag: text("imageTag").notNull(),
    containerName: text("containerName").notNull(),
    port: integer("port").notNull(),
    color: deploymentColorEnum("color").notNull(),
    status: deploymentStatusEnum("status").default("PENDING").notNull(),
    errorMessage: text("errorMessage"),
    environmentId: text("environmentId")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    promotedFromId: text("promotedFromId"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("Deployment_status_idx").on(table.status),
    index("Deployment_createdAt_idx").on(table.createdAt),
    index("Deployment_environmentId_idx").on(table.environmentId),
    index("Deployment_promotedFromId_idx").on(table.promotedFromId),
    foreignKey({
      columns: [table.promotedFromId],
      foreignColumns: [table.id],
      name: "Deployment_promotedFromId_fkey",
    }).onDelete("set null"),
  ]
);

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  apiTokens: many(apiTokens),
  githubInstallations: many(githubInstallations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

export const githubInstallationsRelations = relations(
  githubInstallations,
  ({ one }) => ({
    user: one(users, {
      fields: [githubInstallations.userId],
      references: [users.id],
    }),
  })
);

export const projectsRelations = relations(projects, ({ many }) => ({
  environments: many(environments),
  jobs: many(jobs),
  domains: many(projectDomains),
}));

export const projectDomainsRelations = relations(projectDomains, ({ one }) => ({
  project: one(projects, {
    fields: [projectDomains.projectId],
    references: [projects.id],
  }),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  deployments: many(deployments),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  project: one(projects, {
    fields: [jobs.projectId],
    references: [projects.id],
  }),
  environment: one(environments, {
    fields: [jobs.environmentId],
    references: [environments.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  environment: one(environments, {
    fields: [deployments.environmentId],
    references: [environments.id],
  }),
  promotedFrom: one(deployments, {
    fields: [deployments.promotedFromId],
    references: [deployments.id],
    relationName: "PromotionChain",
  }),
  promotedInto: many(deployments, {
    relationName: "PromotionChain",
  }),
}));

// Export inferred types for convenience across repositories
export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type SessionSelect = typeof sessions.$inferSelect;
export type ApiTokenSelect = typeof apiTokens.$inferSelect;
export type ApiTokenInsert = typeof apiTokens.$inferInsert;
export type ProjectSelect = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;
export type ProjectDomainSelect = typeof projectDomains.$inferSelect;
export type ProjectDomainInsert = typeof projectDomains.$inferInsert;
export type EnvironmentSelect = typeof environments.$inferSelect;
export type EnvironmentInsert = typeof environments.$inferInsert;
export type JobSelect = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
export type DeploymentSelect = typeof deployments.$inferSelect;
export type DeploymentInsert = typeof deployments.$inferInsert;
