# Contract Upload Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deployable Prisma models for uploads, tradebook imports, normalized contracts, line items, and contract audit events.

**Architecture:** `Upload` owns the source artifact, an optional one-to-one `TradebookImport` owns workbook parsing metadata, and normalized `Contract` and `LineItem` records retain nullable provenance links to both. Organisation-scoped relations enforce tenant ownership, while audit events remain attached to normalized contracts.

**Tech Stack:** Prisma 7, PostgreSQL, Vitest, Bun, Nx

---

### Task 1: Specify the contract domain schema

**Files:**
- Create: `tests/prisma-contract-schema.test.ts`
- Read: `prisma/schema.prisma`

- [x] **Step 1: Write failing schema tests**

Add tests that read `prisma/schema.prisma` and require:

```typescript
expect(readEnumBlock(schema, "ContractStatus")).toContain("DRAFT");
expect(readModelBlock(schema, "Upload")).toContain("tradebookImport");
expect(readModelBlock(schema, "TradebookImport")).toContain("uploadId");
expect(readModelBlock(schema, "Contract")).toContain("lineItems");
expect(readModelBlock(schema, "LineItem")).toContain("quantity");
expect(readModelBlock(schema, "ContractEvent")).toContain("eventType");
```

The tests must also assert organisation ownership, nullable provenance links, one import per upload, decimal money/quantity fields, PO uniqueness within an organisation, cascade deletion for contract children, and set-null behavior when provenance records are removed.

- [x] **Step 2: Verify the new tests fail for the missing domain models**

Run: `bun run test -- tests/prisma-contract-schema.test.ts`

Expected: FAIL because `UploadSourceType` or another new model/enum is absent.

### Task 2: Implement the Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [x] **Step 1: Add organisation back-relations and domain enums**

Add `uploads`, `tradebookImports`, `contracts`, and `contractEvents` to `Organisation`, plus these enums and values:

```prisma
enum UploadSourceType { EXCEL JSON AI_EXTRACT }
enum UploadStatus { UPLOADED PROCESSING PROCESSED FAILED }
enum TradebookImportStatus { PENDING MAPPED IMPORTED FAILED }
enum ContractStatus { DRAFT FINALIZED ARCHIVED }
enum ContractEventType { CREATE UPDATE STATUS_CHANGE DELETE IMPORT }
```

- [x] **Step 2: Add normalized models and provenance relations**

Implement `Upload`, `TradebookImport`, `Contract`, `LineItem`, and `ContractEvent` using the approved spec. Make `TradebookImport.uploadId` unique, use `Decimal` for numeric line-item values, cascade contract children, set nullable upload/import references to null on provenance deletion, and enforce `@@unique([organisationId, poRefNo])`.

- [x] **Step 3: Verify the schema tests pass**

Run: `bun run test -- tests/prisma-contract-schema.test.ts`

Expected: PASS.

### Task 3: Add and verify the database migration

**Files:**
- Create: `prisma/migrations/20260715123000_add_contract_upload_domain/migration.sql`
- Modify: `tests/prisma-contract-schema.test.ts`

- [x] **Step 1: Add a failing migration assertion**

Require the migration to create all five enums and all five tables, including the unique indexes for `TradebookImport.uploadId` and `Contract(organisationId, poRefNo)` and the specified foreign-key delete rules.

- [x] **Step 2: Verify the migration assertion fails**

Run: `bun run test -- tests/prisma-contract-schema.test.ts`

Expected: FAIL because the migration file is absent.

- [x] **Step 3: Add the PostgreSQL migration**

Create the enum types, tables, indexes, and foreign keys corresponding exactly to the Prisma schema. Use `ON DELETE CASCADE` for organisation ownership and contract children, and `ON DELETE SET NULL` for optional upload/import provenance links.

- [x] **Step 4: Run focused and project validation**

Run:

```bash
bun run test -- tests/prisma-contract-schema.test.ts tests/prisma-organisation-schema.test.ts
bunx prisma validate
bunx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
bun run format:check
```

Expected: all commands pass and Prisma emits valid PostgreSQL DDL.

### Task 4: Review the completed change

**Files:**
- Review: `prisma/schema.prisma`
- Review: `prisma/migrations/20260715123000_add_contract_upload_domain/migration.sql`
- Review: `tests/prisma-contract-schema.test.ts`

- [x] **Step 1: Inspect the GitButler diff**

Run: `but diff`

Expected: only the plan, schema, migration, and schema test are part of `chinmaya/contract-upload-schema`.

- [x] **Step 2: Run the full test suite**

Run: `bun run test`

Expected: PASS, or report any unrelated baseline failures with their exact test names.
