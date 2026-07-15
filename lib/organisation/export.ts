import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

type ExportLineItem = {
  id: string;
  workbookItemId: string | null;
  description: string;
  quantity: number | string | { toString(): string };
  quantityUnit: string | null;
  unitPrice: number | string | { toString(): string };
  pricingUnit: string | null;
  total: number | string | { toString(): string } | null;
  sortOrder: number;
};

type ExportContract = {
  id: string;
  status: string;
  clientName: string;
  poRefNo: string;
  poDate: Date;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  lineItems: readonly ExportLineItem[];
};

type ExportOrganisation = {
  id: string;
  name: string;
};

function resolveTemplatePath() {
  const candidates = [
    path.resolve(process.cwd(), "samples-for-testing/sample_tradebook_xl.xlsx"),
    path.resolve(process.cwd(), "sample_tradebook_xl.xlsx"),
    path.resolve(
      process.cwd(),
      "../samples-for-testing/sample_tradebook_xl.xlsx",
    ),
    path.resolve(process.cwd(), "../sample_tradebook_xl.xlsx"),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error("Tradebook export template could not be found.");
  }

  return match;
}

async function loadTemplateBuffer(
  templateBuffer?: Uint8Array<ArrayBufferLike>,
) {
  if (templateBuffer) {
    return templateBuffer;
  }

  return readFile(resolveTemplatePath());
}

function toNumber(value: number | string | { toString(): string } | null) {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value.toString());
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sortContracts<T extends ExportContract>(contracts: readonly T[]) {
  return [...contracts].sort((left, right) =>
    left.poRefNo.localeCompare(right.poRefNo),
  );
}

function sortLineItems<T extends ExportLineItem>(lineItems: readonly T[]) {
  return [...lineItems].sort((left, right) => left.sortOrder - right.sortOrder);
}

function formulaOrZero(
  hasData: boolean,
  formula: string,
  result: number,
): ExcelJS.CellFormulaValue {
  return hasData ? { formula, result } : { formula: "0", result: 0 };
}

type JsonLineItem = {
  description: string;
  quantity: number;
  quantity_unit: string | null;
  unit_price: number;
  pricing_unit: string | null;
  total: number | null;
};

type JsonContract = {
  client_name: string;
  po_ref_no: string;
  po_date: string;
  payment_terms: string | null;
  delivery_terms: string | null;
  items: JsonLineItem[];
};

export function buildOrganisationContractsJson(
  contracts: readonly ExportContract[],
): JsonContract[] {
  return sortContracts(contracts).map((contract) => ({
    client_name: contract.clientName,
    po_ref_no: contract.poRefNo,
    po_date: toIsoDate(contract.poDate),
    payment_terms: contract.paymentTerms,
    delivery_terms: contract.deliveryTerms,
    items: sortLineItems(contract.lineItems).map((item) => ({
      description: item.description,
      quantity: toNumber(item.quantity) ?? 0,
      quantity_unit: item.quantityUnit,
      unit_price: toNumber(item.unitPrice) ?? 0,
      pricing_unit: item.pricingUnit,
      total:
        toNumber(item.total) ??
        (toNumber(item.quantity) ?? 0) * (toNumber(item.unitPrice) ?? 0),
    })),
  }));
}

function setRowValues(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<ExcelJS.CellValue>,
) {
  values.forEach((value, index) => {
    worksheet.getCell(rowNumber, index + 1).value = value;
  });
}

function clearTrailingCells(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  fromColumn: number,
) {
  for (let column = fromColumn; column <= worksheet.columnCount; column += 1) {
    worksheet.getCell(rowNumber, column).value = null;
  }
}

function ensureRowCountForFooterSheet(
  worksheet: ExcelJS.Worksheet,
  dataStartRow: number,
  desiredDataCount: number,
) {
  // ExcelJS does not reliably splice a large loaded range in one operation.
  // Delete bottom-up while retaining one styled data row and the styled footer.
  for (let row = worksheet.rowCount - 1; row > dataStartRow; row -= 1) {
    worksheet.spliceRows(row, 1);
  }

  if (desiredDataCount === 0) {
    worksheet.spliceRows(dataStartRow, 1);
    return;
  }

  let footerRowNumber = dataStartRow + 1;
  for (
    let currentDataCount = 1;
    currentDataCount < desiredDataCount;
    currentDataCount += 1
  ) {
    worksheet.insertRow(footerRowNumber, [], "i");
    footerRowNumber += 1;
  }
}

function deleteRowsFrom(worksheet: ExcelJS.Worksheet, firstRow: number) {
  for (let row = worksheet.rowCount; row >= firstRow; row -= 1) {
    worksheet.spliceRows(row, 1);
  }
}

export async function buildOrganisationWorkbook({
  organisation,
  contracts,
  templateBuffer,
}: {
  organisation: ExportOrganisation;
  contracts: readonly ExportContract[];
  templateBuffer?: Uint8Array<ArrayBufferLike>;
}) {
  const workbook = new ExcelJS.Workbook();
  const source = await loadTemplateBuffer(templateBuffer);
  await workbook.xlsx.load(
    source as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const organizationsSheet = workbook.getWorksheet("Organizations");
  const lineItemsSheet = workbook.getWorksheet("Line Items");
  const summarySheet = workbook.getWorksheet("Summary");
  const dashboardSheet = workbook.getWorksheet("Dashboard");

  if (
    !organizationsSheet ||
    !lineItemsSheet ||
    !summarySheet ||
    !dashboardSheet
  ) {
    throw new Error("Tradebook export template is missing one or more sheets.");
  }

  const sortedContracts = sortContracts(contracts);
  const flattenedLineItems = sortedContracts.flatMap((contract) =>
    sortLineItems(contract.lineItems).map((item) => ({
      contract,
      item,
      total:
        toNumber(item.total) ??
        (toNumber(item.quantity) ?? 0) * (toNumber(item.unitPrice) ?? 0),
    })),
  );

  deleteRowsFrom(organizationsSheet, 3);
  setRowValues(organizationsSheet, 2, [
    organisation.id,
    organisation.name,
    null,
  ]);

  ensureRowCountForFooterSheet(lineItemsSheet, 2, flattenedLineItems.length);
  flattenedLineItems.forEach(({ contract, item, total }, index) => {
    const rowNumber = index + 2;
    setRowValues(lineItemsSheet, rowNumber, [
      item.workbookItemId ?? item.id,
      contract.poRefNo,
      item.description,
      toNumber(item.quantity),
      item.quantityUnit,
      toNumber(item.unitPrice),
      item.pricingUnit,
      {
        formula: `D${rowNumber}*F${rowNumber}`,
        result: total,
      },
    ]);
  });
  const lineItemDataStart = 2;
  const lineItemDataEnd = flattenedLineItems.length + 1;
  const lineItemFooterRow = flattenedLineItems.length + 2;
  setRowValues(lineItemsSheet, lineItemFooterRow, [
    "TOTAL",
    null,
    null,
    null,
    null,
    null,
    null,
    formulaOrZero(
      flattenedLineItems.length > 0,
      `SUM(H${lineItemDataStart}:H${lineItemDataEnd})`,
      flattenedLineItems.reduce((sum, entry) => sum + entry.total, 0),
    ),
  ]);
  clearTrailingCells(lineItemsSheet, lineItemFooterRow, 9);

  ensureRowCountForFooterSheet(summarySheet, 2, sortedContracts.length);
  sortedContracts.forEach((contract, index) => {
    const rowNumber = index + 2;
    const contractLineItems = flattenedLineItems.filter(
      (entry) => entry.contract.id === contract.id,
    );
    const contractTotal = contractLineItems.reduce(
      (sum, entry) => sum + entry.total,
      0,
    );
    setRowValues(summarySheet, rowNumber, [
      organisation.id,
      contract.clientName,
      contract.poRefNo,
      contract.poDate,
      contract.paymentTerms,
      contract.deliveryTerms,
      contract.status,
      formulaOrZero(
        flattenedLineItems.length > 0,
        `COUNTIF('Line Items'!$B$${lineItemDataStart}:$B$${lineItemDataEnd},C${rowNumber})`,
        contractLineItems.length,
      ),
      formulaOrZero(
        flattenedLineItems.length > 0,
        `SUMIF('Line Items'!$B$${lineItemDataStart}:$B$${lineItemDataEnd},C${rowNumber},'Line Items'!$H$${lineItemDataStart}:$H$${lineItemDataEnd})`,
        contractTotal,
      ),
    ]);
  });
  const summaryDataStart = 2;
  const summaryDataEnd = sortedContracts.length + 1;
  const summaryFooterRow = sortedContracts.length + 2;
  setRowValues(summarySheet, summaryFooterRow, [
    "GRAND TOTAL",
    null,
    null,
    null,
    null,
    null,
    null,
    formulaOrZero(
      sortedContracts.length > 0,
      `SUM(H${summaryDataStart}:H${summaryDataEnd})`,
      flattenedLineItems.length,
    ),
    formulaOrZero(
      sortedContracts.length > 0,
      `SUM(I${summaryDataStart}:I${summaryDataEnd})`,
      flattenedLineItems.reduce((sum, entry) => sum + entry.total, 0),
    ),
  ]);
  clearTrailingCells(summarySheet, summaryFooterRow, 10);

  deleteRowsFrom(dashboardSheet, 16);
  const grandTotal = flattenedLineItems.reduce(
    (sum, entry) => sum + entry.total,
    0,
  );
  const averageLineValue =
    flattenedLineItems.length === 0
      ? 0
      : grandTotal / flattenedLineItems.length;
  const largestLineValue = flattenedLineItems.reduce(
    (max, entry) => Math.max(max, entry.total),
    0,
  );

  dashboardSheet.getCell("B4").value = formulaOrZero(
    sortedContracts.length > 0,
    `COUNTA(Summary!C${summaryDataStart}:C${summaryDataEnd})`,
    sortedContracts.length,
  );
  dashboardSheet.getCell("B5").value = formulaOrZero(
    flattenedLineItems.length > 0,
    `COUNTA('Line Items'!A${lineItemDataStart}:A${lineItemDataEnd})`,
    flattenedLineItems.length,
  );
  dashboardSheet.getCell("B6").value = formulaOrZero(
    flattenedLineItems.length > 0,
    `SUM('Line Items'!H${lineItemDataStart}:H${lineItemDataEnd})`,
    grandTotal,
  );
  dashboardSheet.getCell("B7").value = formulaOrZero(
    flattenedLineItems.length > 0,
    `AVERAGE('Line Items'!H${lineItemDataStart}:H${lineItemDataEnd})`,
    averageLineValue,
  );
  dashboardSheet.getCell("B8").value = formulaOrZero(
    flattenedLineItems.length > 0,
    `MAX('Line Items'!H${lineItemDataStart}:H${lineItemDataEnd})`,
    largestLineValue,
  );

  for (const [status, cell] of [
    ["DRAFT", "B9"],
    ["FINALIZED", "B10"],
    ["ARCHIVED", "B11"],
  ] as const) {
    dashboardSheet.getCell(cell).value = formulaOrZero(
      sortedContracts.length > 0,
      `COUNTIF(Summary!G${summaryDataStart}:G${summaryDataEnd},"${status}")`,
      sortedContracts.filter((contract) => contract.status === status).length,
    );
  }

  setRowValues(dashboardSheet, 15, [
    organisation.id,
    formulaOrZero(
      sortedContracts.length > 0,
      `COUNTIF(Summary!$A$${summaryDataStart}:$A$${summaryDataEnd},A15)`,
      sortedContracts.length,
    ),
    formulaOrZero(
      sortedContracts.length > 0,
      `SUMIF(Summary!$A$${summaryDataStart}:$A$${summaryDataEnd},A15,Summary!$I$${summaryDataStart}:$I$${summaryDataEnd})`,
      grandTotal,
    ),
  ]);

  const output = (await workbook.xlsx.writeBuffer()) as
    | ArrayBuffer
    | Uint8Array;
  return Buffer.from(
    output instanceof Uint8Array ? output : new Uint8Array(output),
  );
}

export function buildOrganisationExportFileName({
  orgId,
  format,
}: {
  orgId: string;
  format: "excel" | "json";
}) {
  return format === "excel"
    ? `organisation-${orgId}-export.xlsx`
    : `organisation-${orgId}-contracts.json`;
}
