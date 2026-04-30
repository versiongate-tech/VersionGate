-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL DEFAULT 'localhost',
    "basePort" INTEGER NOT NULL,
    "appPort" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Environment_projectId_name_key" ON "Environment"("projectId", "name");
CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One default environment per project (production) — mirrors former project-level deploy target
INSERT INTO "Environment" ("id", "name", "projectId", "branch", "serverHost", "basePort", "appPort", "lockedAt", "createdAt", "updatedAt")
SELECT
  'env_prod_' || "id",
  'production',
  "id",
  "branch",
  'localhost',
  "basePort",
  "appPort",
  "lockedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project";

ALTER TABLE "Project" DROP COLUMN IF EXISTS "lockedAt";

-- Move deployments from Project to Environment
ALTER TABLE "Deployment" ADD COLUMN "environmentId" TEXT;

UPDATE "Deployment" AS d
SET "environmentId" = e.id
FROM "Environment" AS e
WHERE e."projectId" = d."projectId" AND e.name = 'production';

ALTER TABLE "Deployment" ALTER COLUMN "environmentId" SET NOT NULL;

ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_projectId_fkey";
DROP INDEX IF EXISTS "Deployment_projectId_idx";
ALTER TABLE "Deployment" DROP COLUMN "projectId";

CREATE INDEX "Deployment_environmentId_idx" ON "Deployment"("environmentId");
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional job → environment link (filled for new deploy/rollback jobs)
ALTER TABLE "Job" ADD COLUMN "environmentId" TEXT;
CREATE INDEX "Job_environmentId_idx" ON "Job"("environmentId");
ALTER TABLE "Job" ADD CONSTRAINT "Job_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
