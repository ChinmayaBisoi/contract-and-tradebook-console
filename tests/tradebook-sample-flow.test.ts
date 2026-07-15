// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeWorkbookMapping } from "@/lib/tradebook/mapping";
import { parseWorkbookBuffer } from "@/lib/tradebook/parser";
import { buildImportDraft } from "@/lib/tradebook/validation";

describe("sample tradebook acceptance flow", () => {
  it(
    "prepares the workbook and isolates the exact ORG-001 import partition",
    async () => {
      const workbook = readFileSync(
        path.resolve(__dirname, "../samples-for-testing/sample_tradebook_xl.xlsx"),
      );
      const parsed = await parseWorkbookBuffer(workbook);
      const mapping = analyzeWorkbookMapping(parsed.workbookSnapshot);
      const draft = buildImportDraft({
        parsed,
        mapping,
        selectedSourceOrganisationId: "ORG-001",
      });

      expect(parsed.workbookSnapshot.sheets).toHaveLength(4);
      expect(parsed.formulaSnapshot.cells).toHaveLength(3551);
      expect(mapping.sourceOrganisations).toHaveLength(3);
      expect(
        mapping.sourceOrganisations.reduce(
          (total, organisation) => total + organisation.contractCount,
          0,
        ),
      ).toBe(42);
      expect(
        mapping.sourceOrganisations.reduce(
          (total, organisation) => total + organisation.lineItemCount,
          0,
        ),
      ).toBe(3450);
      expect(draft.errors).toEqual([]);
      expect(draft.contracts).toHaveLength(14);
      expect(draft.lineItems).toHaveLength(1153);
      expect(
        parsed.workbookSnapshot.sheets
          .flatMap((sheet) => sheet.footerRows.map((row) => ({ sheet, row })))
          .some(({ sheet, row }) =>
            sheet.rows[row - 1]?.some(
              (value) => String(value).trim().toUpperCase() === "TOTAL",
            ),
          ),
      ).toBe(true);
      expect(
        draft.lineItems.some(
          (line) => line.description.trim().toUpperCase() === "TOTAL",
        ),
      ).toBe(false);
    },
    30_000,
  );
});
