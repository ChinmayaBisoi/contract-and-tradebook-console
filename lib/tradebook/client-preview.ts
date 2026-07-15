import { HyperFormula } from "hyperformula";

import { formatMoneyDisplay, multiplyToMoney, truncateMoney } from "@/lib/tradebook/money";
import type {
  FormulaCellSnapshot,
  SheetSnapshot,
  SnapshotValue,
} from "@/lib/tradebook/parser";

export type ClientCellPatch = {
  sheet: string;
  row: number;
  column: number;
  value: SnapshotValue;
};

export type ClientWorkbookData = {
  sheets: SheetSnapshot[];
  formulas: FormulaCellSnapshot[];
};

type SheetRole = "ORGANIZATIONS" | "LINE_ITEMS" | "SUMMARY" | "OTHER";

export type ClientSheetMapping = {
  name: string;
  role: SheetRole;
  headerRow: number | null;
  mapping: Record<string, number>;
};

function cloneSheets(sheets: SheetSnapshot[]) {
  return sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => [...row]),
  }));
}

function applyPatches(
  sheets: SheetSnapshot[],
  patches: ClientCellPatch[],
) {
  const byName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  for (const patch of patches) {
    const sheet = byName.get(patch.sheet);
    const row = sheet?.rows[patch.row - 1];
    if (row && patch.column > 0) {
      row[patch.column - 1] = patch.value;
    }
  }
  return sheets;
}

function clearDiscardedRows(
  sheets: SheetSnapshot[],
  mappings: ClientSheetMapping[],
  discardedContractRows: number[],
  discardedLineItemRows: number[],
) {
  const discardedBySheet = new Map<string, Set<number>>();
  for (const mapping of mappings) {
    if (mapping.role === "SUMMARY") {
      discardedBySheet.set(mapping.name, new Set(discardedContractRows));
    }
    if (mapping.role === "LINE_ITEMS") {
      discardedBySheet.set(mapping.name, new Set(discardedLineItemRows));
    }
  }
  for (const sheet of sheets) {
    const discarded = discardedBySheet.get(sheet.name);
    if (!discarded) continue;
    for (const rowNumber of discarded) {
      const row = sheet.rows[rowNumber - 1];
      if (!row) continue;
      for (let index = 0; index < row.length; index += 1) {
        row[index] = null;
      }
    }
  }
  return sheets;
}

export function recalculateClientWorkbook(
  data: ClientWorkbookData,
  patches: ClientCellPatch[],
  options: {
    mappings: ClientSheetMapping[];
    discardedContractRows: number[];
    discardedLineItemRows: number[];
  },
): ClientWorkbookData {
  const sheets = clearDiscardedRows(
    applyPatches(cloneSheets(data.sheets), patches),
    options.mappings,
    options.discardedContractRows,
    options.discardedLineItemRows,
  );

  const engineSheets = Object.fromEntries(
    sheets.map((sheet) => {
      const rows = sheet.rows.map((row) => [...row]);
      for (const formula of data.formulas) {
        if (formula.sheet !== sheet.name) continue;
        const row = rows[formula.row - 1];
        if (row) row[formula.column - 1] = `=${formula.formula}`;
      }
      return [sheet.name, rows];
    }),
  );

  const engine = HyperFormula.buildFromSheets(engineSheets, {
    licenseKey: "gpl-v3",
  });

  for (const formula of data.formulas) {
    const sheetId = engine.getSheetId(formula.sheet);
    if (sheetId === undefined) continue;
    const value = engine.getCellValue({
      sheet: sheetId,
      row: formula.row - 1,
      col: formula.column - 1,
    });
    const sheet = sheets.find((entry) => entry.name === formula.sheet);
    const row = sheet?.rows[formula.row - 1];
    if (!row) continue;
    if (typeof value === "number") {
      row[formula.column - 1] = truncateMoney(value) ?? value;
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      row[formula.column - 1] = value;
    }
  }
  engine.destroy();

  return {
    sheets,
    formulas: data.formulas,
  };
}

function syncMappedLineTotals(
  sheets: SheetSnapshot[],
  mappings: ClientSheetMapping[],
) {
  const lineItems = mappings.find((sheet) => sheet.role === "LINE_ITEMS");
  if (!lineItems) return sheets;
  const sheet = sheets.find((entry) => entry.name === lineItems.name);
  if (!sheet || lineItems.headerRow === null) return sheets;

  const quantityCol = lineItems.mapping.quantity;
  const unitPriceCol = lineItems.mapping.unitPrice;
  const totalCol = lineItems.mapping.total;
  if (
    quantityCol === undefined ||
    unitPriceCol === undefined ||
    totalCol === undefined
  ) {
    return sheets;
  }

  for (let index = 0; index < sheet.rows.length; index += 1) {
    const rowNumber = index + 1;
    if (rowNumber <= lineItems.headerRow) continue;
    if (sheet.footerRows.includes(rowNumber)) continue;
    const row = sheet.rows[index];
    if (!row) continue;
    const computed = multiplyToMoney(row[quantityCol], row[unitPriceCol]);
    if (computed !== null) {
      row[totalCol] = computed;
    }
  }
  return sheets;
}

function truncateMappedFinancials(
  sheets: SheetSnapshot[],
  mappings: ClientSheetMapping[],
) {
  const financialFieldsByRole: Record<SheetRole, string[]> = {
    ORGANIZATIONS: [],
    LINE_ITEMS: ["quantity", "unitPrice", "total"],
    SUMMARY: ["itemCount", "total"],
    OTHER: [],
  };

  for (const mapping of mappings) {
    const sheet = sheets.find((entry) => entry.name === mapping.name);
    if (!sheet) continue;
    const fields = financialFieldsByRole[mapping.role];
    for (const field of fields) {
      const column = mapping.mapping[field];
      if (column === undefined) continue;
      for (let index = 0; index < sheet.rows.length; index += 1) {
        const rowNumber = index + 1;
        if (mapping.headerRow !== null && rowNumber <= mapping.headerRow) {
          continue;
        }
        if (sheet.footerRows.includes(rowNumber)) continue;
        const row = sheet.rows[index];
        if (!row) continue;
        if (field === "itemCount") {
          const asNumber = Number(row[column]);
          if (Number.isFinite(asNumber)) row[column] = Math.trunc(asNumber);
          continue;
        }
        const truncated = truncateMoney(row[column]);
        if (truncated !== null) row[column] = truncated;
      }
    }
  }
  return sheets;
}

export function buildClientPreviewWorkbook(
  data: ClientWorkbookData,
  patches: ClientCellPatch[],
  options: {
    mappings: ClientSheetMapping[];
    discardedContractRows: number[];
    discardedLineItemRows: number[];
  },
): ClientWorkbookData {
  const recalculated = recalculateClientWorkbook(data, patches, options);
  syncMappedLineTotals(recalculated.sheets, options.mappings);
  truncateMappedFinancials(recalculated.sheets, options.mappings);
  return recalculated;
}

export function filterSheetRowsForOrganisation(
  sheet: SheetSnapshot,
  mapping: ClientSheetMapping | undefined,
  selectedSourceOrganisationId: string | undefined,
  allSheets: SheetSnapshot[],
  allMappings: ClientSheetMapping[],
) {
  if (!selectedSourceOrganisationId || !mapping) {
    return sheet.rows.map((row, index) => ({
      rowNumber: index + 1,
      values: row,
    }));
  }

  const headerRow = mapping.headerRow ?? 1;
  const footerRows = new Set(sheet.footerRows);
  const summaryMapping = allMappings.find((entry) => entry.role === "SUMMARY");
  const summarySheet = summaryMapping
    ? allSheets.find((entry) => entry.name === summaryMapping.name)
    : undefined;
  const selectedPoRefs = new Set<string>();

  if (summaryMapping && summarySheet) {
    const sourceOrgColumn = summaryMapping.mapping.sourceOrganisationId;
    const poRefColumn = summaryMapping.mapping.poRefNo;
    const summaryHeader = summaryMapping.headerRow ?? 1;
    if (sourceOrgColumn !== undefined && poRefColumn !== undefined) {
      for (const [index, row] of summarySheet.rows.entries()) {
        const rowNumber = index + 1;
        if (rowNumber <= summaryHeader) continue;
        if (summarySheet.footerRows.includes(rowNumber)) continue;
        const sourceOrg = String(row[sourceOrgColumn] ?? "").trim();
        const poRefNo = String(row[poRefColumn] ?? "").trim();
        if (sourceOrg === selectedSourceOrganisationId && poRefNo) {
          selectedPoRefs.add(poRefNo);
        }
      }
    }
  }

  return sheet.rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row, rowNumber }) => {
      if (rowNumber <= headerRow || footerRows.has(rowNumber)) return true;
      const sourceOrgColumn = mapping.mapping.sourceOrganisationId;
      const poRefColumn = mapping.mapping.poRefNo;
      const sourceOrg =
        sourceOrgColumn === undefined
          ? ""
          : String(row[sourceOrgColumn] ?? "").trim();
      const poRefNo =
        poRefColumn === undefined ? "" : String(row[poRefColumn] ?? "").trim();

      if (mapping.role === "SUMMARY" || mapping.role === "ORGANIZATIONS") {
        return sourceOrg === selectedSourceOrganisationId;
      }
      if (mapping.role === "LINE_ITEMS") {
        return poRefNo ? selectedPoRefs.has(poRefNo) : false;
      }
      // Reference sheets (Dashboard, etc.) have no org column; keep full sheet.
      if (mapping.role === "OTHER") {
        return true;
      }
      if (sourceOrgColumn !== undefined) {
        return sourceOrg === selectedSourceOrganisationId;
      }
      if (poRefColumn !== undefined) {
        return poRefNo ? selectedPoRefs.has(poRefNo) : false;
      }
      return true;
    })
    .map(({ row, rowNumber }) => ({ rowNumber, values: row }));
}

export function displayPreviewValue(
  value: unknown,
  options?: { money?: boolean },
) {
  if (options?.money) return formatMoneyDisplay(value);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
