"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { getMutationErrorMessage } from "@/components/contracts/dialog-helpers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { lineItemInputSchema } from "@/lib/contracts/contract-schemas";
import { useTRPC } from "@/trpc/client";

export function CreateLineItemDialog({
  organisationId,
  contractId,
  disabled,
}: {
  organisationId: string;
  contractId: string;
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createLineItem = useMutation(trpc.lineItem.create.mutationOptions());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = lineItemInputSchema.safeParse({
      description: String(form.get("description") ?? ""),
      quantity: String(form.get("quantity") ?? ""),
      quantityUnit: String(form.get("quantityUnit") ?? ""),
      unitPrice: String(form.get("unitPrice") ?? ""),
      pricingUnit: String(form.get("pricingUnit") ?? ""),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form values.");
      return;
    }

    try {
      await createLineItem.mutateAsync({
        organisationId,
        contractId,
        lineItem: parsed.data,
      });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.get.queryFilter({ organisationId, id: contractId }),
        ),
        queryClient.invalidateQueries(trpc.lineItem.list.queryFilter()),
        queryClient.invalidateQueries(trpc.contract.list.queryFilter()),
      ]);
      toast.success("Line item created");
      setOpen(false);
    } catch (submitError) {
      const message = getMutationErrorMessage(submitError);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <PlusIcon />
        Add line item
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create line item</DialogTitle>
          <DialogDescription>
            Add a priced line item to this contract draft.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="create-line-item-description">
              Description
            </FieldLabel>
            <Input
              id="create-line-item-description"
              name="description"
              required
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="create-line-item-quantity">Quantity</FieldLabel>
              <Input
                id="create-line-item-quantity"
                name="quantity"
                inputMode="decimal"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-line-item-quantity-unit">
                Quantity unit
              </FieldLabel>
              <Input id="create-line-item-quantity-unit" name="quantityUnit" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="create-line-item-unit-price">
                Unit price
              </FieldLabel>
              <Input
                id="create-line-item-unit-price"
                name="unitPrice"
                inputMode="decimal"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-line-item-pricing-unit">
                Pricing unit
              </FieldLabel>
              <Input id="create-line-item-pricing-unit" name="pricingUnit" />
            </Field>
          </div>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="submit" disabled={createLineItem.isPending}>
              {createLineItem.isPending ? "Creating..." : "Create line item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
