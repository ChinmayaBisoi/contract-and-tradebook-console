import { z } from "zod";

import { parseStrictDecimal } from "@/lib/tradebook/money";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value?.trim() || undefined);
}

function strictDecimalNumber({
  min,
  positive,
}: {
  min?: number;
  positive?: boolean;
}) {
  return z
    .union([z.number(), z.string()])
    .superRefine((value, ctx) => {
      const parsed = parseStrictDecimal(value);
      if (parsed === null) {
        ctx.addIssue({
          code: "custom",
          message: "Must be a valid decimal number",
        });
        return;
      }
      if (positive && !(parsed > 0)) {
        ctx.addIssue({
          code: "custom",
          message: "Must be greater than zero",
        });
        return;
      }
      if (min !== undefined && parsed < min) {
        ctx.addIssue({
          code: "custom",
          message: `Must be greater than or equal to ${min}`,
        });
      }
    })
    .transform((value) => parseStrictDecimal(value) as number);
}

export const contractInputSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
  poRefNo: z.string().trim().min(1).max(120),
  poDate: z.coerce.date(),
  paymentTerms: optionalText(2000),
  deliveryTerms: optionalText(2000),
});

export const lineItemInputSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  quantity: strictDecimalNumber({ positive: true }),
  quantityUnit: optionalText(50),
  unitPrice: strictDecimalNumber({ min: 0 }),
  pricingUnit: optionalText(50),
});

export type ContractInput = z.infer<typeof contractInputSchema>;
export type LineItemInput = z.infer<typeof lineItemInputSchema>;
