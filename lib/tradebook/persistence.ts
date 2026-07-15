import { randomUUID } from "node:crypto";
import {
  buildContractFieldData,
  toFieldDataItem,
} from "@/lib/contracts/contract-field-data";
import type { buildImportDraft } from "@/lib/tradebook/validation";
import type { AuthContext } from "@/trpc/init";

export type SqlQuery = { text: string; values: unknown[] };
export type ExecuteImportTransaction = (
  queries: SqlQuery[],
) => Promise<unknown>;

export class ImportPersistenceError extends Error {
  override name = "ImportPersistenceError";
}

const insertContracts = `
INSERT INTO "Contract" (
  "id", "organisationId", "uploadId", "tradebookImportId", "status",
  "sourceType", "clientName", "poRefNo", "poDate", "paymentTerms", "total",
  "deliveryTerms", "fieldData", "createdByClerkUserId", "finalizedAt",
  "archivedAt", "createdAt", "updatedAt"
)
SELECT
  row."id", row."organisationId", row."uploadId", row."tradebookImportId",
  row."status"::"ContractStatus", 'EXCEL'::"UploadSourceType", row."clientName",
  row."poRefNo", row."poDate"::timestamptz, row."paymentTerms", row."total"::numeric,
  row."deliveryTerms", row."fieldData", row."createdByClerkUserId",
  row."finalizedAt"::timestamptz, row."archivedAt"::timestamptz,
  row."createdAt"::timestamptz, row."updatedAt"::timestamptz
FROM jsonb_to_recordset($1::jsonb) AS row(
  "id" text, "organisationId" text, "uploadId" text, "tradebookImportId" text,
  "status" text, "clientName" text, "poRefNo" text, "poDate" text, "total" text,
  "paymentTerms" text, "deliveryTerms" text, "fieldData" jsonb,
  "createdByClerkUserId" text, "finalizedAt" text, "archivedAt" text,
  "createdAt" text, "updatedAt" text
)`;

const lockMappedImport = `
SELECT 1 / CASE WHEN locked."id" IS NOT NULL THEN 1 ELSE 0 END AS guard
FROM (VALUES (1)) AS seed(value)
LEFT JOIN LATERAL (
  SELECT "id"
  FROM "TradebookImport"
  WHERE "id" = $1 AND "organisationId" = $2 AND "status" = 'MAPPED'
  FOR UPDATE
) AS locked ON TRUE`;

const insertLineItems = `
INSERT INTO "LineItem" (
  "id", "organisationId", "contractId", "uploadId", "tradebookImportId",
  "sourceRowRef", "workbookItemId", "description", "quantity", "quantityUnit",
  "unitPrice", "pricingUnit", "total", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  row."id", row."organisationId", row."contractId", row."uploadId",
  row."tradebookImportId", row."sourceRowRef", row."workbookItemId",
  row."description", row."quantity"::numeric, row."quantityUnit",
  row."unitPrice"::numeric, row."pricingUnit", row."total"::numeric,
  row."sortOrder", row."createdAt"::timestamptz, row."updatedAt"::timestamptz
FROM jsonb_to_recordset($1::jsonb) AS row(
  "id" text, "organisationId" text, "contractId" text, "uploadId" text,
  "tradebookImportId" text, "sourceRowRef" jsonb, "workbookItemId" text,
  "description" text, "quantity" text, "quantityUnit" text, "unitPrice" text,
  "pricingUnit" text, "total" text, "sortOrder" integer, "createdAt" text,
  "updatedAt" text
)`;

const insertAudits = `
WITH data AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
    "id" text, "organisationId" text, "actorClerkUserId" text,
    "actorName" text, "actorEmail" text, "actorRole" text, "action" text,
    "entityType" text, "entityId" text, "entityLabel" text,
    "beforeState" jsonb, "afterState" jsonb, "changedFields" jsonb,
    "metadata" jsonb, "contractId" text, "uploadId" text,
    "tradebookImportId" text, "occurredAt" text
  )
)
INSERT INTO "AuditEvent" (
  "id", "organisationId", "actorClerkUserId", "actorName", "actorEmail",
  "actorRole", "action", "entityType", "entityId", "entityLabel",
  "beforeState", "afterState", "changedFields", "metadata", "contractId",
  "uploadId", "tradebookImportId", "occurredAt"
)
SELECT
  data."id", data."organisationId", data."actorClerkUserId", data."actorName",
  data."actorEmail", data."actorRole"::"OrganisationUserRole",
  data."action"::"AuditAction", data."entityType"::"AuditEntityType",
  data."entityId", data."entityLabel", data."beforeState", data."afterState",
  ARRAY(SELECT jsonb_array_elements_text(data."changedFields")), data."metadata",
  data."contractId", data."uploadId", data."tradebookImportId",
  data."occurredAt"::timestamptz
FROM data`;

export async function executeDatabaseTransaction(
  queries: SqlQuery[],
  connectionString = process.env.DATABASE_URL,
) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  if (connectionString.includes("neon.tech")) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connectionString);
    return sql.transaction(
      queries.map((query) => sql.query(query.text, query.values)),
    );
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const results = [];
    for (const query of queries) {
      results.push(await client.query(query.text, query.values));
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function persistReviewedDraft({
  organisationId,
  importId,
  uploadId,
  actor,
  actorRole,
  draft,
  executeTransaction = executeDatabaseTransaction,
}: {
  organisationId: string;
  importId: string;
  uploadId: string;
  actor: AuthContext;
  actorRole: "OWNER" | "ADMIN" | "MEMBER";
  draft: ReturnType<typeof buildImportDraft>;
  executeTransaction?: ExecuteImportTransaction;
}) {
  if (draft.errors.length > 0) {
    throw new ImportPersistenceError(
      "Resolve or discard all blocking validation errors before importing.",
    );
  }

  const now = new Date().toISOString();
  const contractIds = new Map(
    draft.contracts.map((contract) => [contract.poRefNo, randomUUID()]),
  );
  const linesByPo = Map.groupBy(draft.lineItems, (line) => line.poRefNo);
  const contracts = draft.contracts.map((contract) => {
    const id = contractIds.get(contract.poRefNo);
    if (!id) throw new ImportPersistenceError("Contract ID generation failed.");
    const items = linesByPo.get(contract.poRefNo) ?? [];
    const total = items.reduce((sum, item) => sum + item.total, 0);
    return {
      id,
      organisationId,
      uploadId,
      tradebookImportId: importId,
      status: contract.status,
      clientName: contract.clientName,
      poRefNo: contract.poRefNo,
      poDate: contract.poDate.toISOString(),
      paymentTerms: contract.paymentTerms,
      total: String(total),
      deliveryTerms: contract.deliveryTerms,
      fieldData: {
        ...buildContractFieldData({
          contract: {
            clientName: contract.clientName,
            poRefNo: contract.poRefNo,
            poDate: contract.poDate,
            paymentTerms: contract.paymentTerms ?? undefined,
            deliveryTerms: contract.deliveryTerms ?? undefined,
          },
          items: items.map((item) =>
            toFieldDataItem({
              description: item.description,
              quantity: item.quantity,
              quantityUnit: item.quantityUnit ?? undefined,
              unitPrice: item.unitPrice,
              pricingUnit: item.pricingUnit ?? undefined,
            }),
          ),
        }),
        sourceOrganisationId: contract.sourceOrganisationId,
        sourceRow: contract.sourceRow,
      },
      createdByClerkUserId: actor.clerkUserId,
      finalizedAt: contract.status === "FINALIZED" ? now : null,
      archivedAt: contract.status === "ARCHIVED" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
  });
  const lineItems = draft.lineItems.map((line, sortOrder) => ({
    id: randomUUID(),
    organisationId,
    contractId: contractIds.get(line.poRefNo),
    uploadId,
    tradebookImportId: importId,
    sourceRowRef: { sheet: "Line Items", row: line.sourceRow },
    workbookItemId: line.workbookItemId,
    description: line.description,
    quantity: String(line.quantity),
    quantityUnit: line.quantityUnit,
    unitPrice: String(line.unitPrice),
    pricingUnit: line.pricingUnit,
    total: String(line.total),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }));
  const audits = [
    ...contracts.map((contract) => ({
      id: randomUUID(),
      organisationId,
      actorClerkUserId: actor.clerkUserId,
      actorName: actor.name ?? actor.email,
      actorEmail: actor.email,
      actorRole,
      action: "CREATE",
      entityType: "CONTRACT",
      entityId: contract.id,
      entityLabel: contract.poRefNo,
      beforeState: null,
      afterState: {
        clientName: contract.clientName,
        poRefNo: contract.poRefNo,
        status: contract.status,
      },
      changedFields: ["clientName", "poRefNo", "status"],
      metadata: { source: "TRADEBOOK_IMPORT" },
      contractId: contract.id,
      uploadId,
      tradebookImportId: importId,
      occurredAt: now,
    })),
    {
      id: randomUUID(),
      organisationId,
      actorClerkUserId: actor.clerkUserId,
      actorName: actor.name ?? actor.email,
      actorEmail: actor.email,
      actorRole,
      action: "IMPORT",
      entityType: "TRADEBOOK_IMPORT",
      entityId: importId,
      entityLabel: `Tradebook import ${importId}`,
      beforeState: null,
      afterState: {
        status: "IMPORTED",
        contractCount: contracts.length,
        lineItemCount: lineItems.length,
      },
      changedFields: ["status", "contractCount", "lineItemCount"],
      metadata: { discardedCount: draft.discardedCount },
      contractId: null,
      uploadId,
      tradebookImportId: importId,
      occurredAt: now,
    },
  ];

  const queries: SqlQuery[] = [
    { text: lockMappedImport, values: [importId, organisationId] },
    { text: insertContracts, values: [JSON.stringify(contracts)] },
    { text: insertLineItems, values: [JSON.stringify(lineItems)] },
    { text: insertAudits, values: [JSON.stringify(audits)] },
    {
      text: `UPDATE "TradebookImport" SET "status" = 'IMPORTED', "importedContractCount" = $1, "importedLineItemCount" = $2, "importedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $3 AND "organisationId" = $4 AND "status" = 'MAPPED'`,
      values: [contracts.length, lineItems.length, importId, organisationId],
    },
    {
      text: `UPDATE "Upload" SET "status" = 'PROCESSED', "processedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1 AND "organisationId" = $2`,
      values: [uploadId, organisationId],
    },
  ];
  await executeTransaction(queries);

  return {
    importId,
    contractCount: contracts.length,
    lineItemCount: lineItems.length,
    discardedCount: draft.discardedCount,
  };
}
