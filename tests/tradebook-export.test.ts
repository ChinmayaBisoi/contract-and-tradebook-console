// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { analyzeWorkbookMapping } from "@/lib/tradebook/mapping";
import {
  type ParsedWorkbook,
  parseWorkbookBuffer,
} from "@/lib/tradebook/parser";
import { buildReviewedWorkbook } from "@/lib/tradebook/export";

const sample = readFileSync(
  path.resolve(__dirname, "../../sample_tradebook_xl.xlsx"),
);

let parsed: ParsedWorkbook;

beforeAll(async () => {
  parsed = await parseWorkbookBuffer(sample);
});

describe("tradebook workbook export", () => {
  it("round-trips workbook sheets, formulas, and reviewed edits", async () => {
    const workbookBuffer = await buildReviewedWorkbook({
      sourceBuffer: sample,
      parsed,
      patches: [
        { sheet: "Line Items", row: 2, column: 4, value: 2 },
        { sheet: "Line Items", row: 2, column: 6, value: 10 },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Organizations",
      "Line Items",
      "Summary",
      "Dashboard",
    ]);

    const lineItems = workbook.getWorksheet("Line Items");
    const summary = workbook.getWorksheet("Summary");
    const quantityCell = lineItems.getCell("D2");
    const totalCell = lineItems.getCell("H2");
    const summaryCountCell = summary.getCell("H2");

    expect(quantityCell.value).toBe(2);
    expect(totalCell.value).toEqual({ formula: "D2*F2", result: 20 });
    expect(summaryCountCell.value).toEqual({
      formula: "COUNTIF('Line Items'!$B$2:$B$3451,C2)",
      result: 51,
    });
  });

  it("preserves source number formats and representative styles", async () => {
    const workbookBuffer = await buildReviewedWorkbook({
      sourceBuffer: sample,
      parsed,
      patches: [
        {
          sheet: "Summary",
          row: 2,
          column: 4,
          value: "2026-02-03T00:00:00.000Z",
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);

    const organizations = workbook.getWorksheet("Organizations");
    const lineItems = workbook.getWorksheet("Line Items");
    const summary = workbook.getWorksheet("Summary");

    expect(organizations.getCell("A1").font?.bold).toBe(true);
    expect(organizations.getCell("A1").fill).toMatchObject({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F3864" },
    });
    expect(lineItems.getCell("D2").numFmt).toBe("#,##0.00");
    expect(lineItems.getCell("F2").numFmt).toBe("$#,##0.00");
    expect(lineItems.getCell("H2").numFmt).toBe("$#,##0.00");
    expect(summary.getCell("D2").numFmt).toBe("yyyy-mm-dd");
  });
});
