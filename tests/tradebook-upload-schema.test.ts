import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function schemaBlock(kind: "enum" | "model", name: string) {
  const source = read("prisma/schema.prisma");
  const match = source.match(
    new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) throw new Error(`${kind} ${name} is missing`);
  return match[1];
}

describe("tradebook upload lifecycle schema", () => {
  it("creates upload records before private file transfer begins", () => {
    expect(schemaBlock("enum", "UploadStatus")).toMatch(
      /PENDING[\s\S]*UPLOADED[\s\S]*PROCESSING[\s\S]*PROCESSED[\s\S]*FAILED/,
    );

    const upload = schemaBlock("model", "Upload");
    expect(upload).toMatch(/status\s+UploadStatus\s+@default\(PENDING\)/);
    expect(upload).toMatch(/uploadedAt\s+DateTime\?/);
    expect(upload).toMatch(/processingStartedAt\s+DateTime\?/);
    expect(upload).toMatch(/processedAt\s+DateTime\?/);
    expect(upload).toMatch(/failedAt\s+DateTime\?/);
    expect(upload).toMatch(/failureMessage\s+String\?/);
    expect(upload).toContain(
      "@@index([organisationId, uploadedByClerkUserId, createdAt])",
    );
  });

  it("retains compact review state and import lifecycle details", () => {
    const tradebookImport = schemaBlock("model", "TradebookImport");

    expect(tradebookImport).toMatch(/selectedSourceOrganisationId\s+String\?/);
    expect(tradebookImport).toMatch(/reviewPatches\s+Json\?/);
    expect(tradebookImport).toMatch(/discardedRows\s+Json\?/);
    expect(tradebookImport).toMatch(/preparedAt\s+DateTime\?/);
    expect(tradebookImport).toMatch(/importedAt\s+DateTime\?/);
    expect(tradebookImport).toMatch(/failedAt\s+DateTime\?/);
    expect(tradebookImport).toMatch(/failureMessage\s+String\?/);
  });

  it("ships a migration for pending uploads and review metadata", () => {
    const migration = read(
      "prisma/migrations/20260715143000_prepare_tradebook_uploads/migration.sql",
    );

    expect(migration).toContain(
      `ALTER TYPE "UploadStatus" ADD VALUE 'PENDING' BEFORE 'UPLOADED'`,
    );
    expect(migration).toMatch(
      /ALTER TABLE "Upload"[\s\S]*ALTER COLUMN "status" SET DEFAULT 'PENDING'/,
    );
    expect(migration).toContain('ADD COLUMN "reviewPatches" JSONB');
    expect(migration).toContain(
      'CREATE INDEX "Upload_organisationId_uploadedByClerkUserId_createdAt_idx"',
    );
  });
});
