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
import { Textarea } from "@/components/ui/textarea";
import { contractInputSchema } from "@/lib/contracts/contract-schemas";
import { useTRPC } from "@/trpc/client";

export function CreateContractDialog({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createContract = useMutation(trpc.contract.create.mutationOptions());

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
      await createContract.mutateAsync({
        organisationId,
        contract: parsed.data,
      });
      await queryClient.invalidateQueries(trpc.contract.list.queryFilter());
      toast.success("Contract created");
      setOpen(false);
    } catch (submitError) {
      const message = getMutationErrorMessage(submitError);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon />
        Create contract
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create contract</DialogTitle>
          <DialogDescription>
            Add a new draft contract manually. Required fields are client name,
            PO reference number, and PO date.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="create-contract-client">Client name</FieldLabel>
            <Input id="create-contract-client" name="clientName" required autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-contract-po-ref">
              PO reference number
            </FieldLabel>
            <Input id="create-contract-po-ref" name="poRefNo" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-contract-po-date">PO date</FieldLabel>
            <Input id="create-contract-po-date" name="poDate" type="date" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-contract-payment-terms">
              Payment terms
            </FieldLabel>
            <Textarea
              id="create-contract-payment-terms"
              name="paymentTerms"
              placeholder="Optional payment terms"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-contract-delivery-terms">
              Delivery terms
            </FieldLabel>
            <Textarea
              id="create-contract-delivery-terms"
              name="deliveryTerms"
              placeholder="Optional delivery terms"
            />
          </Field>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="submit" disabled={createContract.isPending}>
              {createContract.isPending ? "Creating..." : "Create contract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
