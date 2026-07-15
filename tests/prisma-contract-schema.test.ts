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
      /EXCEL[\s\S]*JSON[\s\S]*AI_EXTRACT/,
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
    expect(readBlock(schema, "enum", "ContractEventType")).toMatch(
      /CREATE[\s\S]*UPDATE[\s\S]*STATUS_CHANGE[\s\S]*DELETE[\s\S]*IMPORT/,
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
    expect(upload).toMatch(/status\s+UploadStatus\s+@default\(UPLOADED\)/);
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

  it("records organisation-scoped contract audit events", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const organisation = readBlock(schema, "model", "Organisation");
    const contract = readBlock(schema, "model", "Contract");
    const event = readBlock(schema, "model", "ContractEvent");

    expect(organisation).toMatch(/contractEvents\s+ContractEvent\[\]/);
    expect(contract).toMatch(/events\s+ContractEvent\[\]/);
    expect(event).toMatch(/actorClerkUserId\s+String\?/);
    expect(event).toMatch(/eventType\s+ContractEventType/);
    expect(event).toMatch(/payload\s+Json\?/);
    expect(event).toMatch(
      /contract\s+Contract\s+@relation\(fields: \[contractId\], references: \[id\], onDelete: Cascade, onUpdate: Cascade\)/,
    );
    expect(event).toContain("@@index([contractId, createdAt])");
    expect(event).toContain("@@index([organisationId, createdAt])");
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
});
