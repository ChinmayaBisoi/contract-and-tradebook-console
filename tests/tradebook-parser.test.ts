// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  type ParsedWorkbook,
  parseWorkbookBuffer,
} from "@/lib/tradebook/parser";

const sample = readFileSync(
  path.resolve(__dirname, "../../sample_tradebook_xl.xlsx"),
);
let parsed: ParsedWorkbook;

beforeAll(async () => {
  parsed = await parseWorkbookBuffer(sample);
}, 30_000);

describe("tradebook workbook parser", () => {
  it("preserves sample sheet order and exact dimensions", () => {
    expect(parsed.workbookSnapshot.sheets.map((sheet) => sheet.name)).toEqual([
      "Organizations",
      "Line Items",
      "Summary",
      "Dashboard",
    ]);
    expect(
      parsed.workbookSnapshot.sheets.map((sheet) => sheet.rowCount),
    ).toEqual([4, 3452, 44, 17]);
  });

  it("retains raw formulas and cached values without importing footers", () => {
    const lineItems = parsed.workbookSnapshot.sheets[1];
    const summary = parsed.workbookSnapshot.sheets[2];

    expect(parsed.formulaSnapshot.cells).toHaveLength(3551);
    expect(parsed.formulaSnapshot.cells).toContainEqual(
      expect.objectContaining({
        sheet: "Summary",
        address: "H2",
        formula: "COUNTIF('Line Items'!$B$2:$B$3451,C2)",
        cachedValue: expect.any(Number),
      }),
    );
    expect(lineItems?.footerRows).toEqual([3452]);
    expect(summary?.footerRows).toEqual([44]);
    expect(lineItems?.rowCount - 1 - (lineItems?.footerRows.length ?? 0)).toBe(
      3450,
    );
    expect(summary?.rowCount - 1 - (summary?.footerRows.length ?? 0)).toBe(42);
  });

  it("preserves date identity alongside compact ISO values", () => {
    const summary = parsed.workbookSnapshot.sheets[2];

    expect(summary?.dateCells).toContainEqual({
      address: "D2",
      row: 2,
      column: 4,
    });
    expect(summary?.rows[1]?.[3]).toMatch(/^2025-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it("rejects malformed workbook bytes with a safe parser error", async () => {
    await expect(
      parseWorkbookBuffer(Buffer.from("not an xlsx workbook")),
    ).rejects.toMatchObject({
      name: "WorkbookParseError",
      message: "The uploaded file is not a valid .xlsx workbook.",
    });
  });

  it("enforces workbook row and cell limits", async () => {
    await expect(
      parseWorkbookBuffer(sample, { maxRowsPerSheet: 100 }),
    ).rejects.toMatchObject({
      name: "WorkbookParseError",
      message: expect.stringContaining("Line Items"),
    });
  });
});
