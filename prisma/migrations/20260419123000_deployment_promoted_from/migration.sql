-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN "promotedFromId" TEXT;

-- CreateIndex
CREATE INDEX "Deployment_promotedFromId_idx" ON "Deployment"("promotedFromId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_promotedFromId_fkey" FOREIGN KEY ("promotedFromId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
