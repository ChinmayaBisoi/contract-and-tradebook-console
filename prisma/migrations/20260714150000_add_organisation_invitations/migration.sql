-- RenameEnumValue
ALTER TYPE "OrganisationUserRole" RENAME VALUE 'MANAGER' TO 'ADMIN';

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" "OrganisationUserRole" NOT NULL,
    "inviterClerkUserId" TEXT NOT NULL,
    "inviterName" TEXT NOT NULL,
    "inviterEmail" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invitation_email_status_createdAt_idx" ON "Invitation"("email", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Invitation_organisationId_status_createdAt_idx" ON "Invitation"("organisationId", "status", "createdAt");

-- A pending invitation is unique while terminal invitations remain historical.
CREATE UNIQUE INDEX "Invitation_pending_organisation_email_key"
ON "Invitation"("organisationId", "email")
WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
