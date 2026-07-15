"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

type ContractStatus = "DRAFT" | "FINALIZED" | "ARCHIVED";

export function ContractStatusActions({
  organisationId,
  contractId,
  status,
}: {
  organisationId: string;
  contractId: string;
  status: ContractStatus;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const updateStatus = useMutation(trpc.contract.updateStatus.mutationOptions());

  if (status === "ARCHIVED") {
    return null;
  }

  const nextStatus = status === "DRAFT" ? "FINALIZED" : "ARCHIVED";
  const actionLabel = nextStatus === "FINALIZED" ? "finalize" : "archive";
  const buttonLabel =
    nextStatus === "FINALIZED"
      ? updateStatus.isPending
        ? "Finalizing..."
        : "Finalize"
      : updateStatus.isPending
        ? "Archiving..."
        : "Archive";

  async function handleUpdateStatus() {
    if (!window.confirm(`Are you sure you want to ${actionLabel} this contract?`)) {
      return;
    }

    try {
      await updateStatus.mutateAsync({
        organisationId,
        id: contractId,
        status: nextStatus,
      });
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
      toast.success(
        nextStatus === "FINALIZED" ? "Contract finalized" : "Contract archived",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Contract status could not be updated",
      );
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={updateStatus.isPending}
      onClick={() => void handleUpdateStatus()}
    >
      {buttonLabel}
    </Button>
  );
}
