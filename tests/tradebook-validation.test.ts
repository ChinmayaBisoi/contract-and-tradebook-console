// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { analyzeWorkbookMapping } from "@/lib/tradebook/mapping";
import {
  type ParsedWorkbook,
  parseWorkbookBuffer,
} from "@/lib/tradebook/parser";
import {
  buildImportDraft,
  recalculateFormulaValues,
} from "@/lib/tradebook/validation";

const sample = readFileSync(
  path.resolve(__dirname, "../../sample_tradebook_xl.xlsx"),
);

let parsed: ParsedWorkbook;

beforeAll(async () => {
  parsed = await parseWorkbookBuffer(sample);
});

describe("editable tradebook validation", () => {
  it("materializes exactly one selected source organisation", () => {
    const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const draft = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
    });

    expect(draft.contracts).toHaveLength(14);
    expect(draft.lineItems).toHaveLength(1153);
    expect(draft.errors).toEqual([]);
    expect(
      draft.contracts.every(
        (contract) => contract.sourceOrganisationId === "ORG-001",
      ),
    ).toBe(true);
    expect(
      draft.lineItems.some((line) => line.workbookItemId === "TOTAL"),
    ).toBe(false);
  });

  it("blocks existing PO references until edited to a unique value", () => {
    const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const first = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
    }).contracts[0];
    if (!first) throw new Error("Expected an ORG-001 contract");

    const blocked = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
      existingPoRefs: new Set([first.poRefNo]),
    });
    expect(blocked.errors).toContainEqual(
      expect.objectContaining({
        row: first.sourceRow,
        field: "poRefNo",
        code: "EXISTING_PO",
      }),
    );

    const edited = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
      existingPoRefs: new Set([first.poRefNo]),
      patches: [
        {
          sheet: "Summary",
          row: first.sourceRow,
          column: 3,
          value: `${first.poRefNo}-REVIEWED`,
        },
      ],
    });
    expect(edited.errors.some((error) => error.code === "EXISTING_PO")).toBe(
      false,
    );
  });

  it("reports field locations and removes discarded contracts with their lines", () => {
    const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const baseline = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
    });
    const first = baseline.contracts[0];
    if (!first) throw new Error("Expected an ORG-001 contract");

    const invalid = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
      patches: [{ sheet: "Line Items", row: 2, column: 4, value: -1 }],
    });
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({
        sheet: "Line Items",
        row: 2,
        column: 4,
        field: "quantity",
        code: "NONNEGATIVE",
      }),
    );

    const discarded = buildImportDraft({
      parsed,
      mapping,
      selectedSourceOrganisationId: "ORG-001",
      discardedContractRows: [first.sourceRow],
    });
    expect(discarded.contracts).toHaveLength(13);
    expect(
      discarded.lineItems.every((line) => line.poRefNo !== first.poRefNo),
    ).toBe(true);
    expect(discarded.discardedCount).toBeGreaterThan(1);
  });

  it("recalculates supported formulas without replacing formula text", () => {
    const beforeFormula = parsed.formulaSnapshot.cells.find(
      (cell) => cell.sheet === "Line Items" && cell.address === "H2",
    );
    const recalculated = recalculateFormulaValues(parsed, [
      { sheet: "Line Items", row: 2, column: 4, value: 2 },
      { sheet: "Line Items", row: 2, column: 6, value: 10 },
    ]);

    expect(recalculated.values.get("Line Items!H2")).toBe(20);
    expect(
      parsed.formulaSnapshot.cells.find(
        (cell) => cell.sheet === "Line Items" && cell.address === "H2",
      ),
    ).toEqual(beforeFormula);
  });
});
