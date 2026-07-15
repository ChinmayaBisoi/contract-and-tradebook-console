-- CreateEnum
CREATE TYPE "UploadSourceType" AS ENUM ('EXCEL', 'JSON', 'AI_EXTRACT');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "TradebookImportStatus" AS ENUM ('PENDING', 'MAPPED', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractEventType" AS ENUM ('CREATE', 'UPDATE', 'STATUS_CHANGE', 'DELETE', 'IMPORT');

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "uploadedByClerkUserId" TEXT NOT NULL,
    "sourceType" "UploadSourceType" NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "storageKey" TEXT,
    "blobUrl" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradebookImport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" "TradebookImportStatus" NOT NULL DEFAULT 'PENDING',
    "sheetNames" JSONB NOT NULL,
    "workbookSnapshot" JSONB,
    "formulaSnapshot" JSONB,
    "mappingConfig" JSONB,
    "validationErrors" JSONB,
    "importedContractCount" INTEGER NOT NULL DEFAULT 0,
    "importedLineItemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradebookImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "uploadId" TEXT,
    "tradebookImportId" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "UploadSourceType" NOT NULL,
    "clientName" TEXT NOT NULL,
    "poRefNo" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "fieldData" JSONB NOT NULL,
    "createdByClerkUserId" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "uploadId" TEXT,
    "tradebookImportId" TEXT,
    "sourceRowRef" JSONB,
    "workbookItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "quantityUnit" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "pricingUnit" TEXT,
    "total" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "actorClerkUserId" TEXT,
    "eventType" "ContractEventType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_organisationId_createdAt_idx" ON "Upload"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "Upload_organisationId_status_createdAt_idx" ON "Upload"("organisationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Upload_checksum_idx" ON "Upload"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "TradebookImport_uploadId_key" ON "TradebookImport"("uploadId");

-- CreateIndex
CREATE INDEX "TradebookImport_organisationId_createdAt_idx" ON "TradebookImport"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "TradebookImport_organisationId_status_createdAt_idx" ON "TradebookImport"("organisationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_organisationId_status_createdAt_idx" ON "Contract"("organisationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Contract_organisationId_clientName_idx" ON "Contract"("organisationId", "clientName");

-- CreateIndex
CREATE INDEX "Contract_uploadId_idx" ON "Contract"("uploadId");

-- CreateIndex
CREATE INDEX "Contract_tradebookImportId_idx" ON "Contract"("tradebookImportId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organisationId_poRefNo_key" ON "Contract"("organisationId", "poRefNo");

-- CreateIndex
CREATE INDEX "LineItem_contractId_sortOrder_idx" ON "LineItem"("contractId", "sortOrder");

-- CreateIndex
CREATE INDEX "LineItem_uploadId_idx" ON "LineItem"("uploadId");

-- CreateIndex
CREATE INDEX "LineItem_tradebookImportId_idx" ON "LineItem"("tradebookImportId");

-- CreateIndex
CREATE INDEX "ContractEvent_contractId_createdAt_idx" ON "ContractEvent"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractEvent_organisationId_createdAt_idx" ON "ContractEvent"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradebookImport" ADD CONSTRAINT "TradebookImport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradebookImport" ADD CONSTRAINT "TradebookImport_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tradebookImportId_fkey" FOREIGN KEY ("tradebookImportId") REFERENCES "TradebookImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_tradebookImportId_fkey" FOREIGN KEY ("tradebookImportId") REFERENCES "TradebookImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
