import { z } from "zod";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value?.trim() || undefined);
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
  quantity: z.coerce.number().positive(),
  quantityUnit: optionalText(50),
  unitPrice: z.coerce.number().min(0),
  pricingUnit: optionalText(50),
});

export type ContractInput = z.infer<typeof contractInputSchema>;
export type LineItemInput = z.infer<typeof lineItemInputSchema>;
