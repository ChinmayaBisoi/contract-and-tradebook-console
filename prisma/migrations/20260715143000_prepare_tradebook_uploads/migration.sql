ALTER TYPE "UploadStatus" ADD VALUE 'PENDING' BEFORE 'UPLOADED';

ALTER TABLE "Upload"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "uploadedAt" TIMESTAMP(3),
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "processedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "failureMessage" TEXT;

ALTER TABLE "TradebookImport"
  ADD COLUMN "selectedSourceOrganisationId" TEXT,
  ADD COLUMN "reviewPatches" JSONB,
  ADD COLUMN "discardedRows" JSONB,
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "importedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "failureMessage" TEXT;

CREATE INDEX "Upload_organisationId_uploadedByClerkUserId_createdAt_idx"
  ON "Upload"("organisationId", "uploadedByClerkUserId", "createdAt");
