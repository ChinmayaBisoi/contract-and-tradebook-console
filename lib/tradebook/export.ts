import ExcelJS from "exceljs";

import type { ParsedWorkbook, SnapshotValue } from "@/lib/tradebook/parser";
import {
  recalculateFormulaValues,
  type CellPatch,
} from "@/lib/tradebook/validation";

function toExcelColumn(columnNumber: number) {
  let dividend = columnNumber;
  let columnName = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName;
}

function coercePatchedValue(
  cell: ExcelJS.Cell,
  value: SnapshotValue,
): ExcelJS.CellValue {
  if (value === null) return null;

  if (cell.type === ExcelJS.ValueType.Date) {
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.valueOf())) return parsed;
    }
  }

  return value;
}

export async function buildReviewedWorkbook({
  sourceBuffer,
  parsed,
  patches,
}: {
  sourceBuffer: Buffer;
  parsed: ParsedWorkbook;
  patches: CellPatch[];
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBuffer as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0]);

  for (const patch of patches) {
    const worksheet = workbook.getWorksheet(patch.sheet);
    if (!worksheet) continue;
    const cell = worksheet.getCell(patch.row, patch.column);
    cell.value = coercePatchedValue(cell, patch.value);
  }

  const recalculated = recalculateFormulaValues(parsed, patches);
  for (const formula of parsed.formulaSnapshot.cells) {
    const worksheet = workbook.getWorksheet(formula.sheet);
    if (!worksheet) continue;

    const cell = worksheet.getCell(formula.row, formula.column);
    const address = `${formula.sheet}!${formula.address}`;
    cell.value = {
      formula: formula.formula,
      result: recalculated.values.get(address) ?? formula.cachedValue ?? undefined,
    };
  }

  const output = (await workbook.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  return Buffer.from(
    output instanceof Uint8Array ? output : new Uint8Array(output),
  );
}

export function buildTradebookExportFileName(fileName: string | null) {
  const safeName = (fileName ?? "tradebook-review.xlsx").trim();
  const baseName = safeName.toLowerCase().endsWith(".xlsx")
    ? safeName.slice(0, -5)
    : safeName;

  return `${baseName || "tradebook-review"}-reviewed.xlsx`;
}

export function cellAddress(column: number, row: number) {
  return `${toExcelColumn(column)}${row}`;
}
