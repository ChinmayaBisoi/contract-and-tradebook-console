import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "prisma/schema.prisma");
const migrationPath = path.join(
  projectRoot,
  "prisma/migrations/20260715123000_add_contract_upload_domain/migration.sql",
);

function readBlock(schema: string, blockType: "enum" | "model", name: string) {
  const match = schema.match(
    new RegExp(`${blockType} ${name} \\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) {
    throw new Error(
      `${blockType} ${name} was not found in prisma/schema.prisma`,
    );
  }

  return match[1];
}

describe("contract domain Prisma schema", () => {
  it("defines upload, import, contract, and audit lifecycles", () => {
    const schema = readFileSync(schemaPath, "utf8");

    expect(readBlock(schema, "enum", "UploadSourceType")).toMatch(
      /EXCEL[\s\S]*JSON[\s\S]*AI_EXTRACT[\s\S]*MANUAL/,
    );
    expect(readBlock(schema, "enum", "UploadStatus")).toMatch(
      /UPLOADED[\s\S]*PROCESSING[\s\S]*PROCESSED[\s\S]*FAILED/,
    );
    expect(readBlock(schema, "enum", "TradebookImportStatus")).toMatch(
      /PENDING[\s\S]*MAPPED[\s\S]*IMPORTED[\s\S]*FAILED/,
    );
    expect(readBlock(schema, "enum", "ContractStatus")).toMatch(
      /DRAFT[\s\S]*FINALIZED[\s\S]*ARCHIVED/,
    );
    expect(readBlock(schema, "enum", "AuditAction")).toMatch(
      /CREATE[\s\S]*UPDATE[\s\S]*STATUS_CHANGE[\s\S]*DELETE[\s\S]*IMPORT[\s\S]*ROLE_CHANGE[\s\S]*INVITE[\s\S]*ACCEPT[\s\S]*DECLINE[\s\S]*CANCEL/,
    );
    expect(readBlock(schema, "enum", "AuditEntityType")).toMatch(
      /CONTRACT[\s\S]*LINE_ITEM[\s\S]*UPLOAD[\s\S]*TRADEBOOK_IMPORT[\s\S]*ORGANISATION_USER[\s\S]*INVITATION/,
    );
  });

  it("stores upload artifacts before a single workbook import", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const organisation = readBlock(schema, "model", "Organisation");
    const upload = readBlock(schema, "model", "Upload");
    const tradebookImport = readBlock(schema, "model", "TradebookImport");

    expect(organisation).toMatch(/uploads\s+Upload\[\]/);
    expect(organisation).toMatch(/tradebookImports\s+TradebookImport\[\]/);
    expect(upload).toMatch(/uploadedByClerkUserId\s+String/);
    expect(upload).toMatch(/sourceType\s+UploadSourceType/);
    expect(upload).toMatch(/status\s+UploadStatus\s+@default\(PENDING\)/);
    expect(upload).toMatch(/storageKey\s+String\?/);
    expect(upload).toMatch(/blobUrl\s+String\?/);
    expect(upload).toMatch(/tradebookImport\s+TradebookImport\?/);
    expect(tradebookImport).toMatch(/uploadId\s+String\s+@unique/);
    expect(tradebookImport).toMatch(
      /upload\s+Upload\s+@relation\(fields: \[uploadId\], references: \[id\], onDelete: Cascade, onUpdate: Cascade\)/,
    );
    expect(tradebookImport).toMatch(/sheetNames\s+Json/);
    expect(tradebookImport).toMatch(/workbookSnapshot\s+Json\?/);
    expect(tradebookImport).toMatch(/formulaSnapshot\s+Json\?/);
    expect(tradebookImport).toMatch(/validationErrors\s+Json\?/);
  });

  it("normalizes contracts and line items while retaining provenance", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const organisation = readBlock(schema, "model", "Organisation");
    const contract = readBlock(schema, "model", "Contract");
    const lineItem = readBlock(schema, "model", "LineItem");

    expect(organisation).toMatch(/contracts\s+Contract\[\]/);
    expect(contract).toMatch(/status\s+ContractStatus\s+@default\(DRAFT\)/);
    expect(contract).toMatch(/clientName\s+String/);
    expect(contract).toMatch(/poRefNo\s+String/);
    expect(contract).toMatch(/poDate\s+DateTime/);
    expect(contract).toMatch(/total\s+Decimal\s+@default\(0\)/);
    expect(contract).toMatch(/fieldData\s+Json/);
    expect(contract).toMatch(/lineItems\s+LineItem\[\]/);
    expect(contract).toContain("@@unique([organisationId, poRefNo])");
    expect(contract).toMatch(
      /upload\s+Upload\?\s+@relation\(fields: \[uploadId\], references: \[id\], onDelete: SetNull, onUpdate: Cascade\)/,
    );
    expect(contract).toMatch(
      /tradebookImport\s+TradebookImport\?\s+@relation\(fields: \[tradebookImportId\], references: \[id\], onDelete: SetNull, onUpdate: Cascade\)/,
    );
    expect(lineItem).toMatch(
      /contract\s+Contract\s+@relation\(fields: \[contractId\], references: \[id\], onDelete: Cascade, onUpdate: Cascade\)/,
    );
    expect(lineItem).toMatch(/quantity\s+Decimal/);
    expect(lineItem).toMatch(/unitPrice\s+Decimal/);
    expect(lineItem).toMatch(/total\s+Decimal\?/);
    expect(lineItem).toMatch(/sourceRowRef\s+Json\?/);
    expect(lineItem).toMatch(/workbookItemId\s+String\?/);
    expect(lineItem).toMatch(/sortOrder\s+Int\s+@default\(0\)/);
    expect(lineItem).toMatch(/uploadId\s+String\?/);
    expect(lineItem).toMatch(/tradebookImportId\s+String\?/);
  });

  it("records organisation-scoped audit events with actor snapshots", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const organisation = readBlock(schema, "model", "Organisation");
    const contract = readBlock(schema, "model", "Contract");
    const lineItem = readBlock(schema, "model", "LineItem");
    const event = readBlock(schema, "model", "AuditEvent");

    expect(organisation).toMatch(/lineItems\s+LineItem\[\]/);
    expect(organisation).toMatch(/auditEvents\s+AuditEvent\[\]/);
    expect(contract).toMatch(/auditEvents\s+AuditEvent\[\]/);
    expect(lineItem).toMatch(/organisationId\s+String/);
    expect(lineItem).toMatch(
      /organisation\s+Organisation\s+@relation\(fields: \[organisationId\], references: \[id\], onDelete: Cascade, onUpdate: Cascade\)/,
    );
    expect(event).toMatch(/actorClerkUserId\s+String\?/);
    expect(event).toMatch(/actorName\s+String\?/);
    expect(event).toMatch(/actorEmail\s+String\?/);
    expect(event).toMatch(/actorRole\s+OrganisationUserRole\?/);
    expect(event).toMatch(/action\s+AuditAction/);
    expect(event).toMatch(/entityType\s+AuditEntityType/);
    expect(event).toMatch(/entityId\s+String/);
    expect(event).toMatch(/entityLabel\s+String\?/);
    expect(event).toMatch(/beforeState\s+Json\?/);
    expect(event).toMatch(/afterState\s+Json\?/);
    expect(event).toMatch(/changedFields\s+String\[\]/);
    expect(event).toMatch(/metadata\s+Json\?/);
    expect(event).toMatch(
      /contract\s+Contract\?\s+@relation\(fields: \[contractId\], references: \[id\], onDelete: SetNull, onUpdate: Cascade\)/,
    );
    expect(event).toMatch(/lineItemId\s+String\?/);
    expect(event).toMatch(/uploadId\s+String\?/);
    expect(event).toMatch(/tradebookImportId\s+String\?/);
    expect(event).toMatch(/organisationUserId\s+String\?/);
    expect(event).toMatch(/invitationId\s+String\?/);
    expect(event).toContain("@@index([organisationId, occurredAt])");
    expect(event).toContain("@@index([organisationId, action, occurredAt])");
    expect(event).toContain(
      "@@index([organisationId, entityType, occurredAt])",
    );
  });

  it("includes a deployable migration for the contract domain", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('CREATE TYPE "UploadSourceType"');
    expect(migration).toContain('CREATE TYPE "UploadStatus"');
    expect(migration).toContain('CREATE TYPE "TradebookImportStatus"');
    expect(migration).toContain('CREATE TYPE "ContractStatus"');
    expect(migration).toContain('CREATE TYPE "ContractEventType"');
    expect(migration).toContain('CREATE TABLE "Upload"');
    expect(migration).toContain('CREATE TABLE "TradebookImport"');
    expect(migration).toContain('CREATE TABLE "Contract"');
    expect(migration).toContain('CREATE TABLE "LineItem"');
    expect(migration).toContain('CREATE TABLE "ContractEvent"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TradebookImport_uploadId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Contract_organisationId_poRefNo_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });

  it("includes a deployable migration for MANUAL source type", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260716050000_add_manual_source_type/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      `ALTER TYPE "UploadSourceType" ADD VALUE 'MANUAL'`,
    );
  });

  it("migrates contract events into the organisation audit ledger", () => {
    const migration = readFileSync(
      path.join(
        projectRoot,
        "prisma/migrations/20260715133000_add_organisation_operations/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'ALTER TABLE "ContractEvent" RENAME TO "AuditEvent"',
    );
    expect(migration).toContain(
      'ALTER TYPE "ContractEventType" RENAME TO "AuditAction"',
    );
    expect(migration).toContain(
      'UPDATE "LineItem" AS line_item SET "organisationId" = contract."organisationId"',
    );
    expect(migration).toContain('ALTER COLUMN "organisationId" SET NOT NULL');
    expect(migration).toContain(
      'FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
  });
});
