import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { SheetSnapshot, SnapshotValue } from "@/lib/tradebook/parser";

type WorkbookSnapshot = { sheets: SheetSnapshot[] };
type SheetRole = "ORGANIZATIONS" | "LINE_ITEMS" | "SUMMARY" | "OTHER";

const fieldAliases = {
  ORGANIZATIONS: {
    sourceOrganisationId: ["orgid", "organisationid", "organizationid"],
    organisationName: ["orgname", "organisationname", "organizationname"],
    region: ["region", "market"],
  },
  LINE_ITEMS: {
    workbookItemId: ["itemid", "lineitemid", "productid"],
    poRefNo: ["porefno", "poreference", "ponumber", "purchaseordernumber"],
    description: ["description", "itemdescription", "productdescription"],
    quantity: ["quantity", "qty"],
    quantityUnit: ["quantityunit", "qtyunit", "unitofmeasure", "uom", "unit"],
    unitPrice: ["unitprice", "price", "rate"],
    pricingUnit: ["pricingunit", "priceunit", "rateunit"],
    total: ["linetotal", "total", "amount", "lineamount"],
  },
  SUMMARY: {
    sourceOrganisationId: ["orgid", "organisationid", "organizationid"],
    clientName: ["clientname", "customername", "buyername"],
    poRefNo: ["porefno", "poreference", "ponumber", "purchaseordernumber"],
    poDate: ["podate", "purchaseorderdate", "orderdate"],
    paymentTerms: ["paymentterms", "paymentterm"],
    deliveryTerms: ["deliveryterms", "deliveryterm", "incoterms"],
    status: ["status", "contractstatus", "postatus"],
    itemCount: ["itemcount", "lineitemcount", "lines"],
    total: ["lineitemtotal", "contracttotal", "totalvalue", "total"],
  },
} as const;

const requiredFields = {
  ORGANIZATIONS: ["sourceOrganisationId", "organisationName"],
  LINE_ITEMS: [
    "workbookItemId",
    "poRefNo",
    "description",
    "quantity",
    "unitPrice",
  ],
  SUMMARY: ["sourceOrganisationId", "clientName", "poRefNo", "poDate"],
} as const;

type MappableRole = keyof typeof fieldAliases;
type ColumnMapping = Record<string, number>;

export type SheetMappingAnalysis = {
  name: string;
  role: SheetRole;
  headerRow: number | null;
  headers: string[];
  mapping: ColumnMapping;
  missingRequired: string[];
};

export type WorkbookMappingAnalysis = {
  sheets: SheetMappingAnalysis[];
  sourceOrganisations: Array<{
    id: string;
    name: string | null;
    contractCount: number;
    lineItemCount: number;
  }>;
  requiresAssistance: boolean;
};

function normalize(value: SnapshotValue) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapHeaders(headers: SnapshotValue[], role: MappableRole) {
  const mapping: ColumnMapping = {};
  for (const [columnIndex, header] of headers.entries()) {
    const normalized = normalize(header);
    for (const [field, aliases] of Object.entries(fieldAliases[role])) {
      if (
        !(field in mapping) &&
        (aliases as readonly string[]).includes(normalized)
      ) {
        mapping[field] = columnIndex;
      }
    }
  }
  return mapping;
}

function candidateForRole(sheet: SheetSnapshot, role: MappableRole) {
  let best = { headerRow: 0, mapping: {} as ColumnMapping, score: 0 };
  for (let index = 0; index < Math.min(sheet.rows.length, 25); index += 1) {
    const mapping = mapHeaders(sheet.rows[index] ?? [], role);
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { headerRow: index + 1, mapping, score };
  }
  return best;
}

function analyzeSheet(sheet: SheetSnapshot): SheetMappingAnalysis {
  const candidates = (Object.keys(fieldAliases) as MappableRole[])
    .map((role) => ({ role, ...candidateForRole(sheet, role) }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const minimumScore =
    best?.role === "LINE_ITEMS" ? 4 : best?.role === "SUMMARY" ? 3 : 2;

  if (!best || best.score < minimumScore) {
    return {
      name: sheet.name,
      role: "OTHER",
      headerRow: null,
      headers: [],
      mapping: {},
      missingRequired: [],
    };
  }

  const headers = (sheet.rows[best.headerRow - 1] ?? []).map((value) =>
    String(value ?? ""),
  );
  return {
    name: sheet.name,
    role: best.role,
    headerRow: best.headerRow,
    headers,
    mapping: best.mapping,
    missingRequired: [...requiredFields[best.role]].filter(
      (field) => !(field in best.mapping),
    ),
  };
}

function dataRows(snapshot: WorkbookSnapshot, analysis: SheetMappingAnalysis) {
  const sheet = snapshot.sheets.find((entry) => entry.name === analysis.name);
  if (!sheet || analysis.headerRow === null) return [];
  const headerRow = analysis.headerRow;
  return sheet.rows.filter(
    (_, index) =>
      index + 1 > headerRow && !sheet.footerRows.includes(index + 1),
  );
}

function mappedValue(
  row: SnapshotValue[],
  mapping: ColumnMapping,
  field: string,
) {
  const index = mapping[field];
  return index === undefined ? null : (row[index] ?? null);
}

function sourceOrganisationFacets(
  snapshot: WorkbookSnapshot,
  sheets: SheetMappingAnalysis[],
) {
  const organizations = sheets.find((sheet) => sheet.role === "ORGANIZATIONS");
  const summary = sheets.find((sheet) => sheet.role === "SUMMARY");
  const lineItems = sheets.find((sheet) => sheet.role === "LINE_ITEMS");
  if (!summary || !lineItems) return [];

  const names = new Map<string, string>();
  if (organizations) {
    for (const row of dataRows(snapshot, organizations)) {
      const id = String(
        mappedValue(row, organizations.mapping, "sourceOrganisationId") ?? "",
      ).trim();
      const name = String(
        mappedValue(row, organizations.mapping, "organisationName") ?? "",
      ).trim();
      if (id) names.set(id, name);
    }
  }

  const counts = new Map<
    string,
    {
      id: string;
      name: string | null;
      contractCount: number;
      lineItemCount: number;
    }
  >();
  const poOrganisations = new Map<string, string>();
  for (const row of dataRows(snapshot, summary)) {
    const id = String(
      mappedValue(row, summary.mapping, "sourceOrganisationId") ?? "",
    ).trim();
    const poRefNo = String(
      mappedValue(row, summary.mapping, "poRefNo") ?? "",
    ).trim();
    if (!id) continue;
    const count = counts.get(id) ?? {
      id,
      name: names.get(id) ?? null,
      contractCount: 0,
      lineItemCount: 0,
    };
    count.contractCount += 1;
    counts.set(id, count);
    if (poRefNo) poOrganisations.set(poRefNo, id);
  }

  for (const row of dataRows(snapshot, lineItems)) {
    const poRefNo = String(
      mappedValue(row, lineItems.mapping, "poRefNo") ?? "",
    ).trim();
    const id = poOrganisations.get(poRefNo);
    const count = id ? counts.get(id) : undefined;
    if (count) count.lineItemCount += 1;
  }

  const organisationOrder = organizations
    ? dataRows(snapshot, organizations).map((row) =>
        String(
          mappedValue(row, organizations.mapping, "sourceOrganisationId") ?? "",
        ).trim(),
      )
    : [...counts.keys()];
  return organisationOrder
    .map((id) => counts.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

export function analyzeWorkbookMapping(
  snapshot: WorkbookSnapshot,
): WorkbookMappingAnalysis {
  const sheets = snapshot.sheets.map(analyzeSheet);
  return {
    sheets,
    sourceOrganisations: sourceOrganisationFacets(snapshot, sheets),
    requiresAssistance: sheets.some(
      (sheet) => sheet.role !== "OTHER" && sheet.missingRequired.length > 0,
    ),
  };
}

export function buildAiMappingRequest(
  snapshot: WorkbookSnapshot,
  analysis: WorkbookMappingAnalysis,
) {
  return {
    sheets: analysis.sheets
      .filter((sheet) => sheet.missingRequired.length > 0)
      .map((sheet) => ({
        sheetName: sheet.name,
        role: sheet.role,
        candidateHeaders: sheet.headers,
        missingRequired: sheet.missingRequired,
        sampleRows: dataRows(snapshot, sheet).slice(0, 10),
      })),
  };
}

const aiMappingOutput = z
  .object({
    suggestions: z.array(
      z
        .object({
          sheetName: z.string().min(1),
          field: z.string().min(1),
          columnIndex: z.number().int().nonnegative(),
          confidence: z.number().min(0).max(1),
          rationale: z.string().min(1).max(300),
        })
        .strict(),
    ),
  })
  .strict();

type MappingClient = {
  parse: (
    request: Record<string, unknown>,
  ) => Promise<{ output_parsed: unknown }>;
};

export class MappingSuggestionError extends Error {
  override name = "MappingSuggestionError";
}

export async function suggestMappingsWithAi({
  apiKey,
  model = process.env.OPENAI_MAPPING_MODEL ?? "gpt-5-nano",
  request,
  client,
}: {
  apiKey: string | undefined;
  model?: string;
  request: ReturnType<typeof buildAiMappingRequest> | { sheets: [] };
  client?: MappingClient;
}) {
  if (!apiKey) {
    return {
      available: false as const,
      suggestions: [],
      reason:
        "AI mapping suggestions are unavailable until OPENAI_API_KEY is configured.",
    };
  }

  const responses =
    client ??
    ({
      parse: (input) => new OpenAI({ apiKey }).responses.parse(input),
    } as MappingClient);

  try {
    const response = await responses.parse({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "Suggest only missing tradebook column mappings. Never invent columns.",
        },
        { role: "user", content: JSON.stringify(request) },
      ],
      text: { format: zodTextFormat(aiMappingOutput, "tradebook_mapping") },
    });
    const parsed = aiMappingOutput.parse(response.output_parsed);
    return {
      available: true as const,
      suggestions: parsed.suggestions.map((suggestion) => ({
        ...suggestion,
        confirmed: false as const,
      })),
    };
  } catch (error) {
    throw new MappingSuggestionError(
      "AI mapping suggestions could not be validated.",
      { cause: error },
    );
  }
}
