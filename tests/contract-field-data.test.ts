import { describe, expect, it } from "vitest";

import {
  buildContractFieldData,
  toFieldDataItem,
} from "@/lib/contracts/contract-field-data";

describe("contract field data", () => {
  it("calculates decimal totals without binary floating-point artifacts", () => {
    const item = toFieldDataItem({
      description: "Precision item",
      quantity: 0.1,
      quantityUnit: undefined,
      unitPrice: 0.2,
      pricingUnit: undefined,
    });

    expect(item.total).toBe(0.02);
  });

  it("matches the required json contract shape and tolerates missing optional fields", () => {
    const contract = {
      clientName: "Granite Construction Materials",
      poRefNo: "PO-2026-1000",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: undefined,
      deliveryTerms: undefined,
    };
    const item = toFieldDataItem({
      description: "Citric acid anhydrous",
      quantity: 2,
      quantityUnit: undefined,
      unitPrice: 10,
      pricingUnit: undefined,
    });

    expect(
      buildContractFieldData({
        contract,
        items: [item],
      }),
    ).toEqual({
      client_name: "Granite Construction Materials",
      po_ref_no: "PO-2026-1000",
      po_date: "2026-07-01",
      payment_terms: null,
      delivery_terms: null,
      total: 20,
      items: [
        {
          description: "Citric acid anhydrous",
          quantity: 2,
          quantity_unit: undefined,
          unit_price: 10,
          pricing_unit: undefined,
          total: 20,
        },
      ],
    });
  });
});
