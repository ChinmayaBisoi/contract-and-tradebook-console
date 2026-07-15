// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { analyzeWorkbookMapping } from "@/lib/tradebook/mapping";
import {
  type ParsedWorkbook,
  parseWorkbookBuffer,
} from "@/lib/tradebook/parser";
import { persistReviewedDraft } from "@/lib/tradebook/persistence";
import { buildImportDraft } from "@/lib/tradebook/validation";

const sample = readFileSync(
  path.resolve(__dirname, "../samples-for-testing/sample_tradebook_xl.xlsx"),
);

let parsed: ParsedWorkbook;

beforeAll(async () => {
  parsed = await parseWorkbookBuffer(sample);
});

describe("atomic reviewed import persistence", () => {
  it("builds one transaction with exact ORG-001 records, provenance, and audits", async () => {
    const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const draft = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
    });
    const executeTransaction = vi.fn().mockResolvedValue(undefined);

    await expect(
      persistReviewedDraft({
        organisationId: "app_org_1",
        importId: "import_1",
        uploadId: "upload_1",
        actor: {
          clerkUserId: "member_1",
          name: "Member User",
          email: "member@example.com",
        },
        actorRole: "MEMBER",
        draft,
        executeTransaction,
      }),
    ).resolves.toEqual({
      importId: "import_1",
      contractCount: 14,
      lineItemCount: 1153,
      discardedCount: 0,
    });

    expect(executeTransaction).toHaveBeenCalledTimes(1);
    const queries = executeTransaction.mock.calls[0]?.[0];
    expect(queries[0]).toEqual({
      text: expect.stringContaining('FOR UPDATE'),
      values: ["import_1", "app_org_1"],
    });
    expect(queries[0].text).toContain("1 / CASE");
    const contracts = JSON.parse(String(queries[1].values[0]));
    const lineItems = JSON.parse(String(queries[2].values[0]));
    const audits = JSON.parse(String(queries[3].values[0]));

    expect(contracts).toHaveLength(14);
    expect(lineItems).toHaveLength(1153);
    expect(audits).toHaveLength(15);
    expect(
      contracts.every(
        (row: Record<string, unknown>) =>
          row.organisationId === "app_org_1" &&
          row.uploadId === "upload_1" &&
          row.tradebookImportId === "import_1" &&
          typeof row.total === "string" &&
          Number(row.total) > 0 &&
          typeof (row.fieldData as { total?: unknown })?.total === "number" &&
          typeof (row.fieldData as { client_name?: unknown })?.client_name ===
            "string" &&
          typeof (row.fieldData as { po_ref_no?: unknown })?.po_ref_no ===
            "string" &&
          typeof (row.fieldData as { po_date?: unknown })?.po_date === "string",
      ),
    ).toBe(true);
    expect(
      lineItems.every(
        (row: Record<string, unknown>) =>
          row.organisationId === "app_org_1" &&
          row.uploadId === "upload_1" &&
          row.tradebookImportId === "import_1" &&
          contracts.some(
            (contract: Record<string, unknown>) =>
              contract.id === row.contractId,
          ),
      ),
    ).toBe(true);
    expect(
      lineItems.some(
        (row: Record<string, unknown>) =>
          typeof row.quantityUnit === "string" &&
          row.quantityUnit.length > 0 &&
          typeof row.pricingUnit === "string" &&
          row.pricingUnit.length > 0,
      ),
    ).toBe(true);
    expect(
      audits.filter(
        (row: Record<string, unknown>) => row.entityType === "CONTRACT",
      ),
    ).toHaveLength(14);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "IMPORT",
        entityType: "TRADEBOOK_IMPORT",
        entityId: "import_1",
      }),
    );
    expect(queries[1].text).not.toContain("ON CONFLICT");
  });

  it("refuses to persist a draft with blocking validation errors", async () => {
    const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const baseline = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
    });
    const draft = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
      existingPoRefs: new Set([baseline.contracts[0]?.poRefNo ?? ""]),
    });

    await expect(
      persistReviewedDraft({
        organisationId: "app_org_1",
        importId: "import_1",
        uploadId: "upload_1",
        actor: {
          clerkUserId: "member_1",
          name: "Member User",
          email: "member@example.com",
        },
        actorRole: "MEMBER",
        draft,
        executeTransaction: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "ImportPersistenceError" });
  });
});
