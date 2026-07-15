-- Preserve the existing contract history while broadening it into an organisation ledger.
ALTER TYPE "ContractEventType" RENAME TO "AuditAction";
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ROLE_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCEPT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DECLINE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANCEL';

CREATE TYPE "AuditEntityType" AS ENUM (
    'CONTRACT',
    'LINE_ITEM',
    'UPLOAD',
    'TRADEBOOK_IMPORT',
    'ORGANISATION_USER',
    'INVITATION'
);

ALTER TABLE "LineItem" ADD COLUMN "organisationId" TEXT;

UPDATE "LineItem" AS line_item SET "organisationId" = contract."organisationId"
FROM "Contract" AS contract
WHERE line_item."contractId" = contract."id";

ALTER TABLE "LineItem" ALTER COLUMN "organisationId" SET NOT NULL;

ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LineItem_organisationId_updatedAt_idx" ON "LineItem"("organisationId", "updatedAt");
CREATE INDEX "LineItem_organisationId_description_idx" ON "LineItem"("organisationId", "description");

ALTER TABLE "ContractEvent" RENAME TO "AuditEvent";
ALTER INDEX "ContractEvent_pkey" RENAME TO "AuditEvent_pkey";
ALTER TABLE "AuditEvent" RENAME COLUMN "eventType" TO "action";
ALTER TABLE "AuditEvent" RENAME COLUMN "payload" TO "metadata";
ALTER TABLE "AuditEvent" RENAME COLUMN "createdAt" TO "occurredAt";

ALTER INDEX "ContractEvent_contractId_createdAt_idx" RENAME TO "AuditEvent_contractId_occurredAt_idx";
ALTER INDEX "ContractEvent_organisationId_createdAt_idx" RENAME TO "AuditEvent_organisationId_occurredAt_idx";

ALTER TABLE "AuditEvent" DROP CONSTRAINT "ContractEvent_contractId_fkey";
ALTER TABLE "AuditEvent" DROP CONSTRAINT "ContractEvent_organisationId_fkey";
ALTER TABLE "AuditEvent" ALTER COLUMN "contractId" DROP NOT NULL;

ALTER TABLE "AuditEvent"
    ADD COLUMN "actorName" TEXT,
    ADD COLUMN "actorEmail" TEXT,
    ADD COLUMN "actorRole" "OrganisationUserRole",
    ADD COLUMN "entityType" "AuditEntityType" NOT NULL DEFAULT 'CONTRACT',
    ADD COLUMN "entityId" TEXT,
    ADD COLUMN "entityLabel" TEXT,
    ADD COLUMN "beforeState" JSONB,
    ADD COLUMN "afterState" JSONB,
    ADD COLUMN "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "lineItemId" TEXT,
    ADD COLUMN "uploadId" TEXT,
    ADD COLUMN "tradebookImportId" TEXT,
    ADD COLUMN "organisationUserId" TEXT,
    ADD COLUMN "invitationId" TEXT;

UPDATE "AuditEvent" SET "entityId" = "contractId" WHERE "entityId" IS NULL;
ALTER TABLE "AuditEvent" ALTER COLUMN "entityId" SET NOT NULL;
ALTER TABLE "AuditEvent" ALTER COLUMN "entityType" DROP DEFAULT;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_lineItemId_fkey"
FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_uploadId_fkey"
FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tradebookImportId_fkey"
FOREIGN KEY ("tradebookImportId") REFERENCES "TradebookImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationUserId_fkey"
FOREIGN KEY ("organisationUserId") REFERENCES "OrganisationUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_invitationId_fkey"
FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AuditEvent_organisationId_action_occurredAt_idx" ON "AuditEvent"("organisationId", "action", "occurredAt");
CREATE INDEX "AuditEvent_organisationId_entityType_occurredAt_idx" ON "AuditEvent"("organisationId", "entityType", "occurredAt");
CREATE INDEX "AuditEvent_actorClerkUserId_occurredAt_idx" ON "AuditEvent"("actorClerkUserId", "occurredAt");
CREATE INDEX "AuditEvent_lineItemId_occurredAt_idx" ON "AuditEvent"("lineItemId", "occurredAt");
CREATE INDEX "AuditEvent_uploadId_occurredAt_idx" ON "AuditEvent"("uploadId", "occurredAt");
CREATE INDEX "AuditEvent_tradebookImportId_occurredAt_idx" ON "AuditEvent"("tradebookImportId", "occurredAt");
CREATE INDEX "AuditEvent_organisationUserId_occurredAt_idx" ON "AuditEvent"("organisationUserId", "occurredAt");
CREATE INDEX "AuditEvent_invitationId_occurredAt_idx" ON "AuditEvent"("invitationId", "occurredAt");
