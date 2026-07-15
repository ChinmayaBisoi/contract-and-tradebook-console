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
import { Textarea } from "@/components/ui/textarea";
import { contractInputSchema } from "@/lib/contracts/contract-schemas";
import { useTRPC } from "@/trpc/client";

type EditableContract = {
  id: string;
  clientName: string;
  poRefNo: string;
  poDate: Date;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  total: string;
  status: "DRAFT" | "FINALIZED" | "ARCHIVED";
};

export function EditContractDialog({
  organisationId,
  contract,
}: {
  organisationId: string;
  contract: EditableContract;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateContract = useMutation(trpc.contract.update.mutationOptions());
  const isDraft = contract.status === "DRAFT";
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = contractInputSchema.safeParse({
      clientName: String(form.get("clientName") ?? ""),
      poRefNo: String(form.get("poRefNo") ?? ""),
      poDate: String(form.get("poDate") ?? ""),
      paymentTerms: String(form.get("paymentTerms") ?? ""),
      deliveryTerms: String(form.get("deliveryTerms") ?? ""),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form values.");
      return;
    }

    try {
      await updateContract.mutateAsync({
        organisationId,
        id: contract.id,
        contract: parsed.data,
      });
      await Promise.all([
        queryClient.invalidateQueries(trpc.contract.list.queryFilter()),
        queryClient.invalidateQueries(
          trpc.contract.get.queryFilter({
            organisationId,
            id: contract.id,
          }),
        ),
      ]);
      toast.success("Contract updated");
      setOpen(false);
    } catch (submitError) {
      const message = getMutationErrorMessage(submitError);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={!isDraft} />
        }
      >
        <PencilIcon />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit contract</DialogTitle>
          <DialogDescription>
            Contracts can be updated only while they are in draft status.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <form key={contract.id} className="grid gap-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="edit-contract-client">Client name</FieldLabel>
              <Input
                id="edit-contract-client"
                name="clientName"
                defaultValue={contract.clientName}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-po-ref">
                PO reference number
              </FieldLabel>
              <Input
                id="edit-contract-po-ref"
                name="poRefNo"
                defaultValue={contract.poRefNo}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-po-date">PO date</FieldLabel>
              <Input
                id="edit-contract-po-date"
                name="poDate"
                type="date"
                defaultValue={contract.poDate.toISOString().slice(0, 10)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-total">
                Derived contract total
              </FieldLabel>
              <Input
                id="edit-contract-total"
                value={contract.total}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-payment-terms">
                Payment terms
              </FieldLabel>
              <Textarea
                id="edit-contract-payment-terms"
                name="paymentTerms"
                defaultValue={contract.paymentTerms ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-delivery-terms">
                Delivery terms
              </FieldLabel>
              <Textarea
                id="edit-contract-delivery-terms"
                name="deliveryTerms"
                defaultValue={contract.deliveryTerms ?? ""}
              />
            </Field>
            <FieldError>{error}</FieldError>
            <DialogFooter>
              <Button type="submit" disabled={updateContract.isPending || !isDraft}>
                {updateContract.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
