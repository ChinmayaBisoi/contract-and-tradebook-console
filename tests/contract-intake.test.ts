// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  ContractExtractionError,
  extractContractProposal,
} from "@/lib/contracts/contract-extraction";
import {
  parseContractJson,
  parseContractJsonFile,
} from "@/lib/contracts/contract-proposal";

const validContractJson = {
  client_name: "Acme Trading",
  po_ref_no: "PO-100",
  po_date: "2026-07-15",
  payment_terms: "Net 30",
  delivery_terms: "FOB Mumbai",
  items: [
    {
      description: "Copper cathodes",
      quantity: 10,
      quantity_unit: "MT",
      unit_price: 125,
      pricing_unit: "MT",
    },
  ],
};

describe("contract proposal parsing", () => {
  it("normalizes the assignment JSON shape for review", () => {
    expect(parseContractJson(validContractJson)).toEqual({
      contract: {
        clientName: "Acme Trading",
        poRefNo: "PO-100",
        poDate: new Date("2026-07-15T00:00:00.000Z"),
        paymentTerms: "Net 30",
        deliveryTerms: "FOB Mumbai",
      },
      items: [
        {
          description: "Copper cathodes",
          quantity: 10,
          quantityUnit: "MT",
          unitPrice: 125,
          pricingUnit: "MT",
        },
      ],
    });
  });

  it("re-imports organisation JSON exports with derived totals", () => {
    const exported = {
      ...validContractJson,
      items: [{ ...validContractJson.items[0], total: 1250 }],
    };

    expect(parseContractJsonFile([exported, exported])).toHaveLength(2);
    expect(parseContractJson(exported).items[0]).toEqual({
      description: "Copper cathodes",
      quantity: 10,
      quantityUnit: "MT",
      unitPrice: 125,
      pricingUnit: "MT",
    });
  });

  it.each([
    [{ ...validContractJson, client_name: "" }],
    [{ ...validContractJson, po_date: "not-a-date" }],
    [
      {
        ...validContractJson,
        items: [{ ...validContractJson.items[0], quantity: 0 }],
      },
    ],
  ])("rejects invalid contract JSON", (value) => {
    expect(() => parseContractJson(value)).toThrow();
  });
});

describe("AI contract extraction", () => {
  it("returns a clear configuration error when OpenAI is unavailable", async () => {
    await expect(
      extractContractProposal({ text: "Contract text", apiKey: "" }),
    ).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      message:
        "AI contract extraction is unavailable until OPENAI_API_KEY is configured.",
    });
  });

  it("normalizes a structured OpenAI response", async () => {
    const parse = vi
      .fn()
      .mockResolvedValue({ output_parsed: validContractJson });

    await expect(
      extractContractProposal({
        text: "Purchase order PO-100 for Acme Trading",
        apiKey: "test-key",
        model: "test-model",
        responses: { parse },
      }),
    ).resolves.toEqual(parseContractJson(validContractJson));

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        input: expect.any(Array),
        text: expect.objectContaining({ format: expect.anything() }),
      }),
    );
  });

  it("hides provider details behind a stable user-facing error", async () => {
    const responses = {
      parse: vi.fn().mockRejectedValue(new Error("secret provider detail")),
    };

    await expect(
      extractContractProposal({
        text: "Contract text",
        apiKey: "test-key",
        responses,
      }),
    ).rejects.toEqual(
      new ContractExtractionError(
        "PROVIDER_ERROR",
        "AI contract extraction could not be completed. Please try again.",
      ),
    );
  });
});
