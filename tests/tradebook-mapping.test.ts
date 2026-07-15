// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  analyzeWorkbookMapping,
  buildAiMappingRequest,
  suggestMappingsWithAi,
} from "@/lib/tradebook/mapping";
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
});

describe("deterministic workbook mapping", () => {
  it("detects sheet roles, headers, and canonical sample columns", () => {
    const analysis = analyzeWorkbookMapping(parsed.workbookSnapshot);

    expect(
      analysis.sheets.map(({ name, role, headerRow }) => ({
        name,
        role,
        headerRow,
      })),
    ).toEqual([
      { name: "Organizations", role: "ORGANIZATIONS", headerRow: 1 },
      { name: "Line Items", role: "LINE_ITEMS", headerRow: 1 },
      { name: "Summary", role: "SUMMARY", headerRow: 1 },
      { name: "Dashboard", role: "OTHER", headerRow: null },
    ]);

    expect(analysis.sheets[1]?.mapping).toMatchObject({
      workbookItemId: 0,
      poRefNo: 1,
      description: 2,
      quantity: 3,
      quantityUnit: 4,
      unitPrice: 5,
      pricingUnit: 6,
      total: 7,
    });
    expect(analysis.sheets[2]?.mapping).toMatchObject({
      sourceOrganisationId: 0,
      clientName: 1,
      poRefNo: 2,
      poDate: 3,
      status: 6,
    });
  });

  it("computes exact source organisation contract and line counts", () => {
    const analysis = analyzeWorkbookMapping(parsed.workbookSnapshot);

    expect(analysis.sourceOrganisations).toEqual([
      {
        id: "ORG-001",
        name: "Helios Trading Co.",
        contractCount: 14,
        lineItemCount: 1153,
      },
      {
        id: "ORG-002",
        name: "Meridian Commodities Ltd.",
        contractCount: 14,
        lineItemCount: 1186,
      },
      {
        id: "ORG-003",
        name: "Pinnacle Global Supply",
        contractCount: 14,
        lineItemCount: 1111,
      },
    ]);
  });

  it("reports required fields that deterministic aliases cannot map", () => {
    const snapshot = structuredClone(parsed.workbookSnapshot);
    const summary = snapshot.sheets[2];
    if (!summary) throw new Error("Summary sheet missing");
    summary.rows[0] =
      summary.rows[0]?.map((header) =>
        header === "po_ref_no" ? "customer_reference" : header,
      ) ?? [];

    const analysis = analyzeWorkbookMapping(snapshot);
    expect(analysis.sheets[2]?.missingRequired).toContain("poRefNo");
    expect(analysis.requiresAssistance).toBe(true);
  });

  it("marks assistance required when required headers are fuzzy matches", () => {
    const snapshot = structuredClone(parsed.workbookSnapshot);
    const summary = snapshot.sheets[2];
    if (!summary) throw new Error("Summary sheet missing");
    summary.rows[0] =
      summary.rows[0]?.map((header) =>
        header === "po_ref_no" ? "vendor_po_ref_no" : header,
      ) ?? [];

    const analysis = analyzeWorkbookMapping(snapshot);
    expect(analysis.sheets[2]?.mapping.poRefNo).toBeTypeOf("number");
    expect(analysis.sheets[2]?.headerMatches.poRefNo?.matchType).toBe(
      "FUZZY_ALIAS",
    );
    expect(analysis.requiresAssistance).toBe(true);
  });
});

describe("AI mapping fallback", () => {
  it("limits AI context to sheet names, headers, and ten sample rows", () => {
    const analysis = analyzeWorkbookMapping(parsed.workbookSnapshot);
    const request = buildAiMappingRequest(parsed.workbookSnapshot, analysis);

    expect(request.sheets.every((sheet) => sheet.sampleRows.length <= 10)).toBe(
      true,
    );
    expect(JSON.stringify(request)).not.toContain("formulaSnapshot");
    expect(JSON.stringify(request)).not.toContain("COUNTIF(");
  });

  it("keeps manual mapping available when no API key is configured", async () => {
    await expect(
      suggestMappingsWithAi({
        apiKey: undefined,
        request: { sheets: [] },
      }),
    ).resolves.toEqual({
      available: false,
      suggestions: [],
      reason:
        "AI mapping suggestions are unavailable until OPENAI_API_KEY is configured.",
    });
  });

  it("uses strict stored-disabled responses and leaves suggestions unconfirmed", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        suggestions: [
          {
            sheetName: "Summary",
            field: "poRefNo",
            columnIndex: 2,
            confidence: 0.9,
            rationale: "Reference-like values",
          },
        ],
      },
    });

    const result = await suggestMappingsWithAi({
      apiKey: "test-key",
      model: "gpt-5-nano",
      request: { sheets: [] },
      client: { parse },
    });

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-nano",
        store: false,
        text: expect.objectContaining({ format: expect.any(Object) }),
      }),
    );
    expect(result).toMatchObject({
      available: true,
      suggestions: [
        { sheetName: "Summary", field: "poRefNo", confirmed: false },
      ],
    });
  });

  it("rejects malformed AI output instead of trusting it", async () => {
    await expect(
      suggestMappingsWithAi({
        apiKey: "test-key",
        request: { sheets: [] },
        client: {
          parse: vi.fn().mockResolvedValue({
            output_parsed: { suggestions: [{ sheetName: "Summary" }] },
          }),
        },
      }),
    ).rejects.toMatchObject({ name: "MappingSuggestionError" });
  });
});
