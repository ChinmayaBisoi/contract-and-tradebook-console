import { describe, expect, it } from "vitest";

import {
  buildClientPreviewWorkbook,
  filterSheetRowsForOrganisation,
  type ClientSheetMapping,
} from "@/lib/tradebook/client-preview";
import { formatMoneyDisplay, multiplyToMoney, truncateMoney } from "@/lib/tradebook/money";
import type { FormulaCellSnapshot, SheetSnapshot } from "@/lib/tradebook/parser";

describe("money truncation", () => {
  it("truncates to 2dp toward zero", () => {
    expect(truncateMoney(12.349)).toBe(12.34);
    expect(truncateMoney(-12.349)).toBe(-12.34);
    expect(formatMoneyDisplay(32883415.119999997)).toBe("32883415.11");
  });

  it("multiplies with truncation", () => {
    expect(multiplyToMoney(3.333, 3.333)).toBe(11.1);
  });

  it("rejects malformed decimals with multiple dots", () => {
    expect(truncateMoney("2.2.2")).toBeNull();
    expect(truncateMoney("12.34.56")).toBeNull();
    expect(truncateMoney("2..2")).toBeNull();
    expect(multiplyToMoney(2, "2.2.2")).toBeNull();
  });
});

describe("client preview workbook", () => {
  const lineItems: SheetSnapshot = {
    name: "Line Items",
    index: 0,
    rowCount: 3,
    columnCount: 4,
    footerRows: [],
    dateCells: [],
    rows: [
      ["id", "qty", "price", "total"],
      ["L1", 2, 10.555, 0],
      ["L2", 1, 5, 0],
    ],
  };
  const summary: SheetSnapshot = {
    name: "Summary",
    index: 1,
    rowCount: 2,
    columnCount: 3,
    footerRows: [],
    dateCells: [],
    rows: [
      ["org", "po", "line_item_total"],
      ["ORG1", "PO-1", 0],
    ],
  };
  const formulas: FormulaCellSnapshot[] = [
    {
      sheet: "Line Items",
      address: "D2",
      row: 2,
      column: 4,
      formula: "B2*C2",
      cachedValue: 0,
    },
    {
      sheet: "Line Items",
      address: "D3",
      row: 3,
      column: 4,
      formula: "B3*C3",
      cachedValue: 0,
    },
    {
      sheet: "Summary",
      address: "C2",
      row: 2,
      column: 3,
      formula: "'Line Items'!D2+'Line Items'!D3",
      cachedValue: 0,
    },
  ];
  const mappings: ClientSheetMapping[] = [
    {
      name: "Line Items",
      role: "LINE_ITEMS",
      headerRow: 1,
      mapping: {
        workbookItemId: 0,
        quantity: 1,
        unitPrice: 2,
        total: 3,
        poRefNo: 0,
      },
    },
    {
      name: "Summary",
      role: "SUMMARY",
      headerRow: 1,
      mapping: {
        sourceOrganisationId: 0,
        poRefNo: 1,
        total: 2,
      },
    },
  ];

  it("recalculates and truncates line and summary totals", () => {
    const result = buildClientPreviewWorkbook(
      { sheets: [lineItems, summary], formulas },
      [],
      {
        mappings,
        discardedContractRows: [],
        discardedLineItemRows: [],
      },
    );
    const lineSheet = result.sheets.find((sheet) => sheet.name === "Line Items");
    const summarySheet = result.sheets.find((sheet) => sheet.name === "Summary");
    expect(lineSheet?.rows[1]?.[3]).toBe(21.11);
    expect(lineSheet?.rows[2]?.[3]).toBe(5);
    expect(summarySheet?.rows[1]?.[2]).toBe(26.11);
  });

  it("clears discarded line rows from aggregate totals", () => {
    const result = buildClientPreviewWorkbook(
      { sheets: [lineItems, summary], formulas },
      [],
      {
        mappings,
        discardedContractRows: [],
        discardedLineItemRows: [2],
      },
    );
    const summarySheet = result.sheets.find((sheet) => sheet.name === "Summary");
    expect(summarySheet?.rows[1]?.[2]).toBe(5);
  });

  it("filters all sheet roles by selected organisation", () => {
    const orgs: SheetSnapshot = {
      name: "Organizations",
      index: 2,
      rowCount: 3,
      columnCount: 2,
      footerRows: [],
      dateCells: [],
      rows: [
        ["id", "name"],
        ["ORG1", "One"],
        ["ORG2", "Two"],
      ],
    };
    const dashboard: SheetSnapshot = {
      name: "Dashboard",
      index: 3,
      rowCount: 3,
      columnCount: 2,
      footerRows: [],
      dateCells: [],
      rows: [
        ["metric", "value"],
        ["Total", 100],
        ["Count", 5],
      ],
    };
    const allMappings: ClientSheetMapping[] = [
      ...mappings,
      {
        name: "Organizations",
        role: "ORGANIZATIONS",
        headerRow: 1,
        mapping: { sourceOrganisationId: 0, organisationName: 1 },
      },
      {
        name: "Dashboard",
        role: "OTHER",
        headerRow: 1,
        mapping: {},
      },
    ];
    const filtered = filterSheetRowsForOrganisation(
      orgs,
      allMappings[2],
      "ORG1",
      [lineItems, summary, orgs, dashboard],
      allMappings,
    );
    expect(filtered.map((row) => row.rowNumber)).toEqual([1, 2]);

    const dashboardRows = filterSheetRowsForOrganisation(
      dashboard,
      allMappings[3],
      "ORG1",
      [lineItems, summary, orgs, dashboard],
      allMappings,
    );
    expect(dashboardRows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
  });
});
