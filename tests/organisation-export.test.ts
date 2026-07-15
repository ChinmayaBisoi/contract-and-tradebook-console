// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  buildOrganisationContractsJson,
  buildOrganisationWorkbook,
} from "@/lib/organisation/export";

const sampleTemplate = readFileSync(
  path.resolve(__dirname, "../../sample_tradebook_xl.xlsx"),
);

const contracts = [
  {
    id: "contract_1",
    status: "DRAFT",
    clientName: "Granite Construction Materials",
    poRefNo: "PO-2026-1000",
    poDate: new Date("2026-07-01T00:00:00.000Z"),
    paymentTerms: "Net 15",
    deliveryTerms: "CIF",
    lineItems: [
      {
        id: "line_1",
        workbookItemId: "LI-00001",
        description: "Citric acid anhydrous",
        quantity: 2,
        quantityUnit: "kg",
        unitPrice: 10,
        pricingUnit: "per kg",
        total: 20,
        sortOrder: 0,
      },
      {
        id: "line_2",
        workbookItemId: "LI-00002",
        description: "Pallet wooden 48x40",
        quantity: 3,
        quantityUnit: "unit",
        unitPrice: 12.5,
        pricingUnit: "per unit",
        total: 37.5,
        sortOrder: 1,
      },
    ],
  },
  {
    id: "contract_2",
    status: "FINALIZED",
    clientName: "Sierra Metals Corp.",
    poRefNo: "PO-2026-1001",
    poDate: new Date("2026-07-02T00:00:00.000Z"),
    paymentTerms: null,
    deliveryTerms: "EXW",
    lineItems: [
      {
        id: "line_3",
        workbookItemId: null,
        description: "Rolled oats organic",
        quantity: 4,
        quantityUnit: "kg",
        unitPrice: 5,
        pricingUnit: "per kg",
        total: 20,
        sortOrder: 0,
      },
    ],
  },
] as const;

describe("organisation export builders", () => {
  it("builds contract JSON exports in the required shape", () => {
    expect(buildOrganisationContractsJson(contracts)).toEqual([
      {
        client_name: "Granite Construction Materials",
        po_ref_no: "PO-2026-1000",
        po_date: "2026-07-01",
        payment_terms: "Net 15",
        delivery_terms: "CIF",
        items: [
          {
            description: "Citric acid anhydrous",
            quantity: 2,
            quantity_unit: "kg",
            unit_price: 10,
            pricing_unit: "per kg",
            total: 20,
          },
          {
            description: "Pallet wooden 48x40",
            quantity: 3,
            quantity_unit: "unit",
            unit_price: 12.5,
            pricing_unit: "per unit",
            total: 37.5,
          },
        ],
      },
      {
        client_name: "Sierra Metals Corp.",
        po_ref_no: "PO-2026-1001",
        po_date: "2026-07-02",
        payment_terms: null,
        delivery_terms: "EXW",
        items: [
          {
            description: "Rolled oats organic",
            quantity: 4,
            quantity_unit: "kg",
            unit_price: 5,
            pricing_unit: "per kg",
            total: 20,
          },
        ],
      },
    ]);
  });

  it("builds excel exports with the imported workbook shape", async () => {
    const buffer = await buildOrganisationWorkbook({
      organisation: {
        id: "ORG-001",
        name: "Helios Trading Co.",
      },
      contracts,
      templateBuffer: sampleTemplate,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Organizations",
      "Line Items",
      "Summary",
      "Dashboard",
    ]);

    const organizations = workbook.getWorksheet("Organizations");
    const lineItems = workbook.getWorksheet("Line Items");
    const summary = workbook.getWorksheet("Summary");
    const dashboard = workbook.getWorksheet("Dashboard");

    expect(organizations.getCell("A2").value).toBe("ORG-001");
    expect(organizations.getCell("B2").value).toBe("Helios Trading Co.");

    expect(lineItems.getCell("A2").value).toBe("LI-00001");
    expect(lineItems.getCell("B2").value).toBe("PO-2026-1000");
    expect(lineItems.getCell("H2").value).toEqual({
      formula: "D2*F2",
      result: 20,
    });
    expect(lineItems.getCell("A5").value).toBe("TOTAL");
    expect(lineItems.getCell("H5").value).toEqual({
      formula: "SUM(H2:H4)",
      result: 77.5,
    });

    expect(summary.getCell("A2").value).toBe("ORG-001");
    expect(summary.getCell("C2").value).toBe("PO-2026-1000");
    expect(summary.getCell("H2").value).toEqual({
      formula: "COUNTIF('Line Items'!$B$2:$B$4,C2)",
      result: 2,
    });
    expect(summary.getCell("I2").value).toEqual({
      formula: "SUMIF('Line Items'!$B$2:$B$4,C2,'Line Items'!$H$2:$H$4)",
      result: 57.5,
    });
    expect(summary.getCell("A4").value).toBe("GRAND TOTAL");

    expect(dashboard.getCell("B4").value).toEqual({
      formula: "COUNTA(Summary!C2:C3)",
      result: 2,
    });
    expect(dashboard.getCell("B5").value).toEqual({
      formula: "COUNTA('Line Items'!A2:A4)",
      result: 3,
    });
    expect(dashboard.getCell("A15").value).toBe("ORG-001");
    expect(dashboard.getCell("B15").value).toEqual({
      formula: "COUNTIF(Summary!$A$2:$A$3,A15)",
      result: 2,
    });
  });
});
