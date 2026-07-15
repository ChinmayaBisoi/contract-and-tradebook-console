import { HyperFormula } from "hyperformula";

import type { WorkbookMappingAnalysis } from "@/lib/tradebook/mapping";
import type {
  ParsedWorkbook,
  SheetSnapshot,
  SnapshotValue,
} from "@/lib/tradebook/parser";

export type CellPatch = {
  sheet: string;
  row: number;
  column: number;
  value: SnapshotValue;
};

export type ImportValidationError = {
  sheet: string;
  row: number;
  column: number;
  field: string;
  code:
    | "REQUIRED"
    | "INVALID_DATE"
    | "INVALID_TYPE"
    | "NONNEGATIVE"
    | "POSITIVE"
    | "INVALID_STATUS"
    | "DUPLICATE_PO"
    | "EXISTING_PO"
    | "DUPLICATE_ITEM_ID"
    | "ORPHAN_LINE";
  message: string;
};

type Mapping = Record<string, number>;

function cloneSheets(parsed: ParsedWorkbook, patches: CellPatch[]) {
  const sheets = new Map(
    parsed.workbookSnapshot.sheets.map((sheet) => [
      sheet.name,
      sheet.rows.map((row) => [...row]),
    ]),
  );
  for (const patch of patches) {
    const row = sheets.get(patch.sheet)?.[patch.row - 1];
    if (row && patch.column > 0) row[patch.column - 1] = patch.value;
  }
  return sheets;
}

export function recalculateFormulaValues(
  parsed: ParsedWorkbook,
  patches: CellPatch[],
) {
  const sheets = cloneSheets(parsed, patches);
  for (const formula of parsed.formulaSnapshot.cells) {
    const row = sheets.get(formula.sheet)?.[formula.row - 1];
    if (row) row[formula.column - 1] = `=${formula.formula}`;
  }

  const engine = HyperFormula.buildFromSheets(Object.fromEntries(sheets), {
    licenseKey: "gpl-v3",
  });
  const values = new Map<string, SnapshotValue>();
  for (const formula of parsed.formulaSnapshot.cells) {
    const sheet = engine.getSheetId(formula.sheet);
    if (sheet === undefined) continue;
    const value = engine.getCellValue({
      sheet,
      row: formula.row - 1,
      col: formula.column - 1,
    });
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      values.set(`${formula.sheet}!${formula.address}`, value);
    }
  }
  engine.destroy();
  return { values };
}

function rowsAfterHeader(
  sheet: SheetSnapshot,
  headerRow: number,
  rows: SnapshotValue[][],
) {
  return rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(
      ({ rowNumber }) =>
        rowNumber > headerRow && !sheet.footerRows.includes(rowNumber),
    );
}

function value(row: SnapshotValue[], mapping: Mapping, field: string) {
  const column = mapping[field];
  return column === undefined ? null : (row[column] ?? null);
}

function text(value: SnapshotValue) {
  return String(value ?? "").trim();
}

function hasText(value: SnapshotValue) {
  return text(value) !== "";
}

function isStringLike(value: SnapshotValue) {
  return typeof value === "string";
}

function numeric(value: SnapshotValue) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

const DECIMAL_SCALE = BigInt(100);
const DECIMAL_SCALE_DIGITS = 2;

function toDecimalString(value: number) {
  if (!Number.isFinite(value)) return null;
  return value.toFixed(12).replace(/\.?0+$/, "");
}

function scaledDecimal(value: SnapshotValue) {
  if (value === null || value === undefined || value === "") return null;
  const normalized =
    typeof value === "number"
      ? toDecimalString(value)
      : typeof value === "string"
        ? value.trim()
        : null;
  if (!normalized) return null;
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1);
  const intPart = BigInt(match[2] ?? "0");
  const fractionRaw = (match[3] ?? "").slice(0, DECIMAL_SCALE_DIGITS);
  const fraction = BigInt(fractionRaw.padEnd(DECIMAL_SCALE_DIGITS, "0"));
  return sign * (intPart * DECIMAL_SCALE + fraction);
}

function scaledMultiply(left: bigint, right: bigint) {
  const product = left * right;
  return product / DECIMAL_SCALE;
}

function scaledToNumber(value: bigint) {
  return Number(value) / Number(DECIMAL_SCALE);
}

function column(mapping: Mapping, field: string) {
  return (mapping[field] ?? 0) + 1;
}

export function buildImportDraft({
  parsed,
  mapping,
  selectedSourceOrganisationId,
  patches = [],
  existingPoRefs = new Set<string>(),
  discardedContractRows = [],
  discardedLineItemRows = [],
}: {
  parsed: ParsedWorkbook;
  mapping: WorkbookMappingAnalysis;
  selectedSourceOrganisationId: string;
  patches?: CellPatch[];
  existingPoRefs?: Set<string>;
  discardedContractRows?: number[];
  discardedLineItemRows?: number[];
}) {
  const summaryAnalysis = mapping.sheets.find(
    (sheet) => sheet.role === "SUMMARY",
  );
  const lineAnalysis = mapping.sheets.find(
    (sheet) => sheet.role === "LINE_ITEMS",
  );
  const summarySheet = parsed.workbookSnapshot.sheets.find(
    (sheet) => sheet.name === summaryAnalysis?.name,
  );
  const lineSheet = parsed.workbookSnapshot.sheets.find(
    (sheet) => sheet.name === lineAnalysis?.name,
  );
  if (
    !summaryAnalysis ||
    !lineAnalysis ||
    !summarySheet ||
    !lineSheet ||
    summaryAnalysis.headerRow === null ||
    lineAnalysis.headerRow === null
  ) {
    throw new Error("Confirmed Summary and Line Items mappings are required.");
  }

  const sheets = cloneSheets(parsed, patches);
  const summaryRows = rowsAfterHeader(
    summarySheet,
    summaryAnalysis.headerRow,
    sheets.get(summarySheet.name) ?? [],
  );
  const lineRows = rowsAfterHeader(
    lineSheet,
    lineAnalysis.headerRow,
    sheets.get(lineSheet.name) ?? [],
  );
  const errors: ImportValidationError[] = [];
  const discardedContracts = new Set(discardedContractRows);
  const discardedLines = new Set(discardedLineItemRows);
  const poCounts = new Map<string, number>();
  const allPos = new Set<string>();
  for (const { row } of summaryRows) {
    const poRefNo = text(value(row, summaryAnalysis.mapping, "poRefNo"));
    if (poRefNo) {
      allPos.add(poRefNo);
      poCounts.set(poRefNo, (poCounts.get(poRefNo) ?? 0) + 1);
    }
  }

  const originalSelectedPos = new Set(
    summaryRows
      .filter(
        ({ row }) =>
          text(value(row, summaryAnalysis.mapping, "sourceOrganisationId")) ===
          selectedSourceOrganisationId,
      )
      .map(({ row }) => text(value(row, summaryAnalysis.mapping, "poRefNo"))),
  );
  const originalContractCount = originalSelectedPos.size;

  const contracts = summaryRows
    .filter(
      ({ row, rowNumber }) =>
        !discardedContracts.has(rowNumber) &&
        text(value(row, summaryAnalysis.mapping, "sourceOrganisationId")) ===
          selectedSourceOrganisationId,
    )
    .map(({ row, rowNumber }) => {
      const poRefNo = text(value(row, summaryAnalysis.mapping, "poRefNo"));
      const clientName = text(
        value(row, summaryAnalysis.mapping, "clientName"),
      );
      const rawPoRefNo = value(row, summaryAnalysis.mapping, "poRefNo");
      const rawClientName = value(row, summaryAnalysis.mapping, "clientName");
      const rawDate = text(value(row, summaryAnalysis.mapping, "poDate"));
      const poDate = new Date(rawDate);
      const rawStatus =
        text(value(row, summaryAnalysis.mapping, "status")) || "DRAFT";
      const status = rawStatus.toUpperCase();

      if (!poRefNo) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "poRefNo"),
          field: "poRefNo",
          code: "REQUIRED",
          message: "PO reference is required.",
        });
      } else if ((poCounts.get(poRefNo) ?? 0) > 1) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "poRefNo"),
          field: "poRefNo",
          code: "DUPLICATE_PO",
          message: "PO reference is duplicated in the workbook.",
        });
      } else if (existingPoRefs.has(poRefNo)) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "poRefNo"),
          field: "poRefNo",
          code: "EXISTING_PO",
          message: "PO reference already exists in this organisation.",
        });
      }
      if (hasText(rawPoRefNo) && !isStringLike(rawPoRefNo)) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "poRefNo"),
          field: "poRefNo",
          code: "INVALID_TYPE",
          message: "PO reference must be text.",
        });
      }
      if (hasText(rawClientName) && !isStringLike(rawClientName)) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "clientName"),
          field: "clientName",
          code: "INVALID_TYPE",
          message: "Client name must be text.",
        });
      }
      if (!clientName) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "clientName"),
          field: "clientName",
          code: "REQUIRED",
          message: "Client name is required.",
        });
      }
      if (!rawDate || Number.isNaN(poDate.getTime())) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "poDate"),
          field: "poDate",
          code: "INVALID_DATE",
          message: "PO date must be a valid date.",
        });
      }
      if (!["DRAFT", "FINALIZED", "ARCHIVED"].includes(status)) {
        errors.push({
          sheet: summarySheet.name,
          row: rowNumber,
          column: column(summaryAnalysis.mapping, "status"),
          field: "status",
          code: "INVALID_STATUS",
          message: "Status must be DRAFT, FINALIZED, or ARCHIVED.",
        });
      }

      return {
        sourceRow: rowNumber,
        sourceOrganisationId: selectedSourceOrganisationId,
        clientName,
        poRefNo,
        poDate,
        paymentTerms:
          text(value(row, summaryAnalysis.mapping, "paymentTerms")) || null,
        deliveryTerms:
          text(value(row, summaryAnalysis.mapping, "deliveryTerms")) || null,
        status: status as "DRAFT" | "FINALIZED" | "ARCHIVED",
      };
    });

  const selectedPos = new Set(contracts.map((contract) => contract.poRefNo));
  const itemIds = new Map<string, number>();
  for (const { row } of lineRows) {
    const itemId = text(value(row, lineAnalysis.mapping, "workbookItemId"));
    if (itemId) itemIds.set(itemId, (itemIds.get(itemId) ?? 0) + 1);
  }

  const formulaValues = recalculateFormulaValues(parsed, patches).values;
  const lineItems = lineRows
    .filter(({ row, rowNumber }) => {
      if (discardedLines.has(rowNumber)) return false;
      const poRefNo = text(value(row, lineAnalysis.mapping, "poRefNo"));
      return selectedPos.has(poRefNo);
    })
    .map(({ row, rowNumber }) => {
      const workbookItemId = text(
        value(row, lineAnalysis.mapping, "workbookItemId"),
      );
      const rawWorkbookItemId = value(row, lineAnalysis.mapping, "workbookItemId");
      const poRefNo = text(value(row, lineAnalysis.mapping, "poRefNo"));
      const rawLinePoRefNo = value(row, lineAnalysis.mapping, "poRefNo");
      const description = text(value(row, lineAnalysis.mapping, "description"));
      const rawDescription = value(row, lineAnalysis.mapping, "description");
      const quantity = numeric(value(row, lineAnalysis.mapping, "quantity"));
      const unitPrice = numeric(value(row, lineAnalysis.mapping, "unitPrice"));
      const totalColumn = column(lineAnalysis.mapping, "total");
      const recalculatedTotal = formulaValues.get(
        `${lineSheet.name}!${String.fromCharCode(64 + totalColumn)}${rowNumber}`,
      );
      const total = numeric(
        recalculatedTotal ?? value(row, lineAnalysis.mapping, "total"),
      );
      const quantityScaled = scaledDecimal(
        value(row, lineAnalysis.mapping, "quantity"),
      );
      const unitPriceScaled = scaledDecimal(
        value(row, lineAnalysis.mapping, "unitPrice"),
      );
      const providedTotalScaled = scaledDecimal(
        recalculatedTotal ?? value(row, lineAnalysis.mapping, "total"),
      );
      const computedTotalScaled =
        quantityScaled !== null && unitPriceScaled !== null
          ? scaledMultiply(quantityScaled, unitPriceScaled)
          : null;

      if (!workbookItemId) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "workbookItemId"),
          field: "workbookItemId",
          code: "REQUIRED",
          message: "Workbook item ID is required.",
        });
      } else if ((itemIds.get(workbookItemId) ?? 0) > 1) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "workbookItemId"),
          field: "workbookItemId",
          code: "DUPLICATE_ITEM_ID",
          message: "Workbook item ID is duplicated.",
        });
      }
      if (hasText(rawWorkbookItemId) && !isStringLike(rawWorkbookItemId)) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "workbookItemId"),
          field: "workbookItemId",
          code: "INVALID_TYPE",
          message: "Workbook item ID must be text.",
        });
      }
      if (hasText(rawLinePoRefNo) && !isStringLike(rawLinePoRefNo)) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "poRefNo"),
          field: "poRefNo",
          code: "INVALID_TYPE",
          message: "PO reference must be text.",
        });
      }
      if (!description) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "description"),
          field: "description",
          code: "REQUIRED",
          message: "Description is required.",
        });
      }
      if (hasText(rawDescription) && !isStringLike(rawDescription)) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "description"),
          field: "description",
          code: "INVALID_TYPE",
          message: "Description must be text.",
        });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "quantity"),
          field: "quantity",
          code: "POSITIVE",
          message: "Quantity must be greater than zero.",
        });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push({
          sheet: lineSheet.name,
          row: rowNumber,
          column: column(lineAnalysis.mapping, "unitPrice"),
          field: "unitPrice",
          code: "NONNEGATIVE",
          message: "Unit price must be nonnegative.",
        });
      }
      return {
        sourceRow: rowNumber,
        workbookItemId,
        poRefNo,
        description,
        quantity:
          quantityScaled !== null
            ? scaledToNumber(quantityScaled)
            : Number.isFinite(quantity)
              ? scaledToNumber(scaledDecimal(quantity) ?? BigInt(0))
              : quantity,
        quantityUnit:
          text(value(row, lineAnalysis.mapping, "quantityUnit")) || null,
        unitPrice:
          unitPriceScaled !== null
            ? scaledToNumber(unitPriceScaled)
            : Number.isFinite(unitPrice)
              ? scaledToNumber(scaledDecimal(unitPrice) ?? BigInt(0))
              : unitPrice,
        pricingUnit:
          text(value(row, lineAnalysis.mapping, "pricingUnit")) || null,
        total: Number.isFinite(total)
          ? scaledToNumber(scaledDecimal(total) ?? BigInt(0))
          : computedTotalScaled !== null
            ? scaledToNumber(computedTotalScaled)
            : scaledToNumber(
                scaledMultiply(
                  scaledDecimal(quantity) ?? BigInt(0),
                  scaledDecimal(unitPrice) ?? BigInt(0),
                ),
              ),
      };
    });

  for (const { row, rowNumber } of lineRows) {
    const poRefNo = text(value(row, lineAnalysis.mapping, "poRefNo"));
    if (poRefNo && !allPos.has(poRefNo)) {
      errors.push({
        sheet: lineSheet.name,
        row: rowNumber,
        column: column(lineAnalysis.mapping, "poRefNo"),
        field: "poRefNo",
        code: "ORPHAN_LINE",
        message: "Line item does not reference a mapped contract.",
      });
    }
  }

  const contractTotals = lineItems.reduce(
    (totals, lineItem) =>
      totals.set(
        lineItem.poRefNo,
        scaledToNumber(
          (scaledDecimal(totals.get(lineItem.poRefNo) ?? 0) ?? BigInt(0)) +
            (scaledDecimal(lineItem.total) ?? BigInt(0)),
        ),
      ),
    new Map<string, number>(),
  );

  const baselineSelectedLines = lineRows.filter(({ row }) =>
    originalSelectedPos.has(text(value(row, lineAnalysis.mapping, "poRefNo"))),
  ).length;
  return {
    contracts: contracts.map((contract) => ({
      ...contract,
      total: contractTotals.get(contract.poRefNo) ?? 0,
    })),
    lineItems,
    errors,
    discardedCount:
      originalContractCount -
      contracts.length +
      baselineSelectedLines -
      lineItems.length,
  };
}
