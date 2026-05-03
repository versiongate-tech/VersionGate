-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "githubAccountLogin" TEXT NOT NULL,
    "githubAccountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE INDEX "GitHubInstallation_userId_idx" ON "GitHubInstallation"("userId");

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
