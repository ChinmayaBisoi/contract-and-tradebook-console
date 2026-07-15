import { describe, expect, it } from "vitest";

import { lineItemInputSchema } from "@/lib/contracts/contract-schemas";

describe("lineItemInputSchema", () => {
  it("rejects unit prices with multiple decimal points", () => {
    const parsed = lineItemInputSchema.safeParse({
      description: "Copper",
      quantity: "2",
      unitPrice: "2.2.2",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path).toContain("unitPrice");
    expect(parsed.error.issues[0]?.message).toMatch(/valid decimal/i);
  });

  it("rejects empty unit price instead of coercing to zero", () => {
    const parsed = lineItemInputSchema.safeParse({
      description: "Copper",
      quantity: "2",
      unitPrice: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts valid decimal unit prices", () => {
    const parsed = lineItemInputSchema.safeParse({
      description: "Copper",
      quantity: "2.5",
      unitPrice: "12.34",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.unitPrice).toBe(12.34);
    expect(parsed.data.quantity).toBe(2.5);
  });
});
