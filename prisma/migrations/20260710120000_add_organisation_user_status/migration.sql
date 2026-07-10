-- CreateEnum
CREATE TYPE "OrganisationUserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REMOVED');

-- AlterTable
ALTER TABLE "OrganisationUser" ADD COLUMN "status" "OrganisationUserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "OrganisationUser" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
