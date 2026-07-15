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

type LineItemFormValues = {
  description: string;
  quantity: string;
  quantityUnit: string;
  unitPrice: string;
  pricingUnit: string;
};

function toLineItemFormValues(lineItem: EditableLineItem): LineItemFormValues {
  return {
    description: lineItem.description,
    quantity: lineItem.quantity,
    quantityUnit: lineItem.quantityUnit ?? "",
    unitPrice: lineItem.unitPrice,
    pricingUnit: lineItem.pricingUnit ?? "",
  };
}

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
  const [formValues, setFormValues] = useState<LineItemFormValues>(() =>
    toLineItemFormValues(lineItem),
  );
  const updateLineItem = useMutation(trpc.lineItem.update.mutationOptions());

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setFormValues(toLineItemFormValues(lineItem));
      setError(null);
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = lineItemInputSchema.safeParse(formValues);

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                value={formValues.description}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
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
                  value={formValues.quantity}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
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
                  value={formValues.quantityUnit}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      quantityUnit: event.target.value,
                    }))
                  }
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
                  value={formValues.unitPrice}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
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
                  value={formValues.pricingUnit}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      pricingUnit: event.target.value,
                    }))
                  }
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
