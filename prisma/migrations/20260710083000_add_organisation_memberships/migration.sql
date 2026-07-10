-- CreateEnum
CREATE TYPE "OrganisationUserRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationUser" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "clerkUserName" TEXT NOT NULL,
    "clerkUserEmail" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" "OrganisationUserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organisation_name_idx" ON "Organisation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationUser_clerkUserId_organisationId_key" ON "OrganisationUser"("clerkUserId", "organisationId");

-- CreateIndex
CREATE INDEX "OrganisationUser_organisationId_idx" ON "OrganisationUser"("organisationId");

-- AddForeignKey
ALTER TABLE "OrganisationUser" ADD CONSTRAINT "OrganisationUser_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
