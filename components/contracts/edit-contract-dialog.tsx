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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { contractInputSchema } from "@/lib/contracts/contract-schemas";
import {
  type ContractStatus,
  contractStatusLabels,
  getSelectableContractStatuses,
  getStatusTransitionLabel,
} from "@/lib/contracts/contract-status";
import { useTRPC } from "@/trpc/client";

type EditableContract = {
  id: string;
  clientName: string;
  poRefNo: string;
  poDate: Date;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  total: string;
  status: ContractStatus;
};

async function invalidateContractQueries({
  queryClient,
  trpc,
  organisationId,
  contractId,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  trpc: ReturnType<typeof useTRPC>;
  organisationId: string;
  contractId: string;
}) {
  await Promise.all([
    queryClient.invalidateQueries(
      trpc.contract.get.queryFilter({ organisationId, id: contractId }),
    ),
    queryClient.invalidateQueries(
      trpc.contract.list.queryFilter({ organisationId }),
    ),
    queryClient.invalidateQueries(
      trpc.lineItem.list.queryFilter({ organisationId, contractId }),
    ),
    queryClient.invalidateQueries(
      trpc.lineItem.list.queryFilter({ organisationId }),
    ),
    queryClient.invalidateQueries(trpc.audit.list.queryFilter({ organisationId })),
  ]);
}

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
  const updateStatus = useMutation(trpc.contract.updateStatus.mutationOptions());
  const isDraft = contract.status === "DRAFT";
  const isArchived = contract.status === "ARCHIVED";
  const selectableStatuses = getSelectableContractStatuses(contract.status);
  const isPending = updateContract.isPending || updateStatus.isPending;

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
    const nextStatus = String(form.get("status") ?? contract.status) as ContractStatus;
    const statusChanged = nextStatus !== contract.status;

    if (
      statusChanged &&
      (nextStatus === "FINALIZED" || nextStatus === "ARCHIVED") &&
      !window.confirm(
        `Are you sure you want to ${getStatusTransitionLabel(nextStatus)} this contract?`,
      )
    ) {
      return;
    }

    try {
      if (isDraft) {
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

        await updateContract.mutateAsync({
          organisationId,
          id: contract.id,
          contract: parsed.data,
        });
      }

      if (statusChanged && nextStatus !== "DRAFT") {
        await updateStatus.mutateAsync({
          organisationId,
          id: contract.id,
          status: nextStatus,
        });
      }

      await invalidateContractQueries({
        queryClient,
        trpc,
        organisationId,
        contractId: contract.id,
      });

      if (statusChanged && nextStatus === "FINALIZED") {
        toast.success("Contract finalized");
      } else if (statusChanged && nextStatus === "ARCHIVED") {
        toast.success("Contract archived");
      } else {
        toast.success("Contract updated");
      }

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
          <Button variant="outline" size="sm" disabled={isArchived} />
        }
      >
        <PencilIcon />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit contract</DialogTitle>
          <DialogDescription>
            {isDraft
              ? "Update draft details or move the contract to the next status."
              : isArchived
                ? "Archived contracts are read only."
                : "Contract details are read only. You can archive this contract."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <form
            key={`${contract.id}-${contract.status}`}
            className="grid gap-4"
            onSubmit={handleSubmit}
          >
            <Field>
              <FieldLabel htmlFor="edit-contract-status">Status</FieldLabel>
              <NativeSelect
                id="edit-contract-status"
                name="status"
                defaultValue={contract.status}
                disabled={isArchived || isPending}
                aria-label="Contract status"
              >
                {selectableStatuses.map((status) => (
                  <NativeSelectOption key={status} value={status}>
                    {contractStatusLabels[status]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contract-client">Client name</FieldLabel>
              <Input
                id="edit-contract-client"
                name="clientName"
                defaultValue={contract.clientName}
                required
                readOnly={!isDraft}
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
                readOnly={!isDraft}
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
                readOnly={!isDraft}
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
                readOnly={!isDraft}
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
                readOnly={!isDraft}
              />
            </Field>
            <FieldError>{error}</FieldError>
            {!isArchived ? (
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            ) : null}
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
