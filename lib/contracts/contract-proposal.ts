import { z } from "zod";

import {
  contractInputSchema,
  lineItemInputSchema,
} from "@/lib/contracts/contract-schemas";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "PO date must use YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "PO date must be a valid date.");

const optionalJsonText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((value) => value?.trim() || undefined);

export const contractJsonSchema = z
  .object({
    client_name: z.string().trim().min(1).max(200),
    po_ref_no: z.string().trim().min(1).max(120),
    po_date: dateOnlySchema,
    payment_terms: optionalJsonText,
    delivery_terms: optionalJsonText,
    items: z.array(
      z
        .object({
          description: z.string().trim().min(1).max(2000),
          quantity: z.coerce.number().positive(),
          quantity_unit: z.string().trim().max(50).nullable().optional(),
          unit_price: z.coerce.number().min(0),
          pricing_unit: z.string().trim().max(50).nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();

// Structured Outputs cannot represent Zod transforms/refinements. Parse this
// provider-facing shape through contractJsonSchema before it reaches the app.
export const contractExtractionOutputSchema = z
  .object({
    client_name: z.string(),
    po_ref_no: z.string(),
    po_date: z.string(),
    payment_terms: z.string().nullable(),
    delivery_terms: z.string().nullable(),
    items: z.array(
      z
        .object({
          description: z.string(),
          quantity: z.number(),
          quantity_unit: z.string().nullable(),
          unit_price: z.number(),
          pricing_unit: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const contractProposalSchema = z.object({
  contract: contractInputSchema,
  items: z.array(lineItemInputSchema).max(500),
});

export type ContractProposal = z.infer<typeof contractProposalSchema>;

export function parseContractJson(value: unknown): ContractProposal {
  const parsed = contractJsonSchema.parse(value);

  return contractProposalSchema.parse({
    contract: {
      clientName: parsed.client_name,
      poRefNo: parsed.po_ref_no,
      poDate: new Date(`${parsed.po_date}T00:00:00.000Z`),
      paymentTerms: parsed.payment_terms,
      deliveryTerms: parsed.delivery_terms,
    },
    items: parsed.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      quantityUnit: item.quantity_unit?.trim() || undefined,
      unitPrice: item.unit_price,
      pricingUnit: item.pricing_unit?.trim() || undefined,
    })),
  });
}
