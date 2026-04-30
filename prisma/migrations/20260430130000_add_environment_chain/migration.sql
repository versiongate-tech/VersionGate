-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chainOrder" INTEGER NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "serverHost" TEXT NOT NULL DEFAULT '',
    "basePort" INTEGER NOT NULL,
    "appPort" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Environment_projectId_chainOrder_key" ON "Environment"("projectId", "chainOrder");

CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");

ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Deployment" ADD COLUMN "environmentId" TEXT,
ADD COLUMN "promotedFromId" TEXT;

DO $$
DECLARE
  proj RECORD;
  id_dev TEXT;
  id_staging TEXT;
  id_prod TEXT;
BEGIN
  FOR proj IN SELECT id, branch, "basePort", "appPort" FROM "Project"
  LOOP
    id_dev := gen_random_uuid()::TEXT;
    id_staging := gen_random_uuid()::TEXT;
    id_prod := gen_random_uuid()::TEXT;

    INSERT INTO "Environment" ("id","projectId","name","chainOrder","branch","serverHost","basePort","appPort","createdAt","updatedAt")
    VALUES (id_dev, proj.id, 'Development', 0, proj.branch, '', proj."basePort" + 400, proj."appPort", NOW(), NOW());

    INSERT INTO "Environment" ("id","projectId","name","chainOrder","branch","serverHost","basePort","appPort","createdAt","updatedAt")
    VALUES (id_staging, proj.id, 'Staging', 1, proj.branch, '', proj."basePort" + 200, proj."appPort", NOW(), NOW());

    INSERT INTO "Environment" ("id","projectId","name","chainOrder","branch","serverHost","basePort","appPort","createdAt","updatedAt")
    VALUES (id_prod, proj.id, 'Production', 2, proj.branch, '', proj."basePort", proj."appPort", NOW(), NOW());

    UPDATE "Deployment" SET "environmentId" = id_prod WHERE "projectId" = proj.id;
  END LOOP;
END $$;

ALTER TABLE "Deployment" ALTER COLUMN "environmentId" SET NOT NULL;

ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_promotedFromId_fkey" FOREIGN KEY ("promotedFromId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
