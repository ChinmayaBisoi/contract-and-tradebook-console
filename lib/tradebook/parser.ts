import ExcelJS from "exceljs";

export type SnapshotValue = string | number | boolean | null;

export type SheetSnapshot = {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  rows: SnapshotValue[][];
  footerRows: number[];
  dateCells: Array<{ address: string; row: number; column: number }>;
};

export type FormulaCellSnapshot = {
  sheet: string;
  address: string;
  row: number;
  column: number;
  formula: string;
  cachedValue: SnapshotValue;
};

export type ParsedWorkbook = {
  workbookSnapshot: { sheets: SheetSnapshot[] };
  formulaSnapshot: { cells: FormulaCellSnapshot[] };
};

type ParserLimits = {
  maxRowsPerSheet?: number;
  maxColumnsPerSheet?: number;
  maxTotalCells?: number;
};

const defaultLimits = {
  maxRowsPerSheet: 100_000,
  maxColumnsPerSheet: 256,
  maxTotalCells: 2_000_000,
};

export class WorkbookParseError extends Error {
  override name = "WorkbookParseError";
}

function scalarValue(value: unknown): SnapshotValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if ("result" in value) return scalarValue(value.result);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          typeof part === "object" && part && "text" in part
            ? String(part.text)
            : "",
        )
        .join("");
    }
    if ("error" in value && typeof value.error === "string") {
      return value.error;
    }
  }

  return String(value);
}

function isFooterRow(row: SnapshotValue[]) {
  const firstValue = row.find(
    (value) => value !== null && String(value).trim() !== "",
  );
  if (firstValue === undefined) return false;

  const normalized = String(firstValue)
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return normalized === "total" || normalized === "grandtotal";
}

export async function parseWorkbookBuffer(
  buffer: Buffer,
  limits: ParserLimits = {},
): Promise<ParsedWorkbook> {
  const resolvedLimits = { ...defaultLimits, ...limits };
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch (error) {
    throw new WorkbookParseError(
      "The uploaded file is not a valid .xlsx workbook.",
      { cause: error },
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new WorkbookParseError("The workbook does not contain any sheets.");
  }

  const sheets: SheetSnapshot[] = [];
  const formulas: FormulaCellSnapshot[] = [];
  let totalCells = 0;

  for (const [sheetIndex, worksheet] of workbook.worksheets.entries()) {
    if (worksheet.rowCount > resolvedLimits.maxRowsPerSheet) {
      throw new WorkbookParseError(
        `Sheet "${worksheet.name}" exceeds the ${resolvedLimits.maxRowsPerSheet.toLocaleString()} row limit.`,
      );
    }
    if (worksheet.columnCount > resolvedLimits.maxColumnsPerSheet) {
      throw new WorkbookParseError(
        `Sheet "${worksheet.name}" exceeds the ${resolvedLimits.maxColumnsPerSheet.toLocaleString()} column limit.`,
      );
    }

    totalCells += worksheet.rowCount * worksheet.columnCount;
    if (totalCells > resolvedLimits.maxTotalCells) {
      throw new WorkbookParseError(
        `The workbook exceeds the ${resolvedLimits.maxTotalCells.toLocaleString()} cell limit.`,
      );
    }

    const rows: SnapshotValue[][] = [];
    const footerRows: number[] = [];
    const dateCells: SheetSnapshot["dateCells"] = [];

    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row: SnapshotValue[] = [];
      for (
        let columnNumber = 1;
        columnNumber <= worksheet.columnCount;
        columnNumber += 1
      ) {
        const cell = worksheet.getCell(rowNumber, columnNumber);
        const value = cell.value;

        if (value instanceof Date) {
          dateCells.push({
            address: cell.address,
            row: rowNumber,
            column: columnNumber,
          });
        }

        const formula = cell.formula;
        const snapshotValue = scalarValue(value);
        row.push(snapshotValue);
        if (formula) {
          formulas.push({
            sheet: worksheet.name,
            address: cell.address,
            row: rowNumber,
            column: columnNumber,
            formula,
            cachedValue: snapshotValue,
          });
        }
      }

      rows.push(row);
      if (isFooterRow(row)) footerRows.push(rowNumber);
    }

    sheets.push({
      name: worksheet.name,
      index: sheetIndex,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      rows,
      footerRows,
      dateCells,
    });
  }

  return {
    workbookSnapshot: { sheets },
    formulaSnapshot: { cells: formulas },
  };
}
