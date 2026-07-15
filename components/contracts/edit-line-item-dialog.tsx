"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
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

type EditableLineItem = {
  id: string;
  description: string;
  quantity: string;
  quantityUnit: string | null;
  unitPrice: string;
  pricingUnit: string | null;
};

export function EditLineItemDialog({
  organisationId,
  contractId,
  lineItem,
  disabled,
}: {
  organisationId: string;
  contractId: string;
  lineItem: EditableLineItem;
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateLineItem = useMutation(trpc.lineItem.update.mutationOptions());

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
      await updateLineItem.mutateAsync({
        organisationId,
        id: lineItem.id,
        lineItem: parsed.data,
      });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.get.queryFilter({ organisationId, id: contractId }),
        ),
        queryClient.invalidateQueries(trpc.lineItem.list.queryFilter()),
        queryClient.invalidateQueries(trpc.contract.list.queryFilter()),
      ]);
      toast.success("Line item updated");
      setOpen(false);
    } catch (submitError) {
      const message = getMutationErrorMessage(submitError);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={disabled} />}>
        <PencilIcon />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit line item</DialogTitle>
          <DialogDescription>
            Update quantity and pricing details while this contract is in draft.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <form
            key={lineItem.id}
            className="grid gap-4"
            onSubmit={handleSubmit}
          >
          <Field>
            <FieldLabel htmlFor={`edit-line-item-description-${lineItem.id}`}>
              Description
            </FieldLabel>
            <Input
              id={`edit-line-item-description-${lineItem.id}`}
              name="description"
              defaultValue={lineItem.description}
              required
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`edit-line-item-quantity-${lineItem.id}`}>
                Quantity
              </FieldLabel>
              <Input
                id={`edit-line-item-quantity-${lineItem.id}`}
                name="quantity"
                inputMode="decimal"
                defaultValue={lineItem.quantity}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-line-item-quantity-unit-${lineItem.id}`}>
                Quantity unit
              </FieldLabel>
              <Input
                id={`edit-line-item-quantity-unit-${lineItem.id}`}
                name="quantityUnit"
                defaultValue={lineItem.quantityUnit ?? ""}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`edit-line-item-unit-price-${lineItem.id}`}>
                Unit price
              </FieldLabel>
              <Input
                id={`edit-line-item-unit-price-${lineItem.id}`}
                name="unitPrice"
                inputMode="decimal"
                defaultValue={lineItem.unitPrice}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`edit-line-item-pricing-unit-${lineItem.id}`}>
                Pricing unit
              </FieldLabel>
              <Input
                id={`edit-line-item-pricing-unit-${lineItem.id}`}
                name="pricingUnit"
                defaultValue={lineItem.pricingUnit ?? ""}
              />
            </Field>
          </div>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="submit" disabled={updateLineItem.isPending || disabled}>
              {updateLineItem.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
