"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ContractAuditTrail } from "@/components/contracts/contract-audit-trail";
import { ContractStatusActions } from "@/components/contracts/contract-status-actions";
import { TableEmptyState } from "@/components/contracts/contracts-table-states";
import { CreateLineItemDialog } from "@/components/contracts/create-line-item-dialog";
import { EditContractDialog } from "@/components/contracts/edit-contract-dialog";
import { EditLineItemDialog } from "@/components/contracts/edit-line-item-dialog";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/client";

const statusLabels = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  ARCHIVED: "Archived",
};
const date = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function ContractDetail({
  organisationId,
  contractId,
}: {
  organisationId: string;
  contractId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    trpc.contract.get.queryOptions({
      organisationId,
      id: contractId,
    }),
  );
  const deleteContract = useMutation(trpc.contract.delete.mutationOptions());
  const deleteLineItem = useMutation(trpc.lineItem.delete.mutationOptions());
  const isDraft = data.status === "DRAFT";

  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (event.entity !== "contract" && event.entity !== "lineItem") {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.get.queryFilter({
            organisationId,
            id: contractId,
          }),
        ),
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.lineItem.list.queryFilter({ organisationId, contractId }),
        ),
        queryClient.invalidateQueries(
          trpc.audit.list.queryFilter({
            organisationId,
            filters: { contractId },
          }),
        ),
      ]);
    },
  });

  async function handleDeleteContract() {
    if (!window.confirm("Delete this draft contract and its line items?")) {
      return;
    }

    try {
      await deleteContract.mutateAsync({ organisationId, id: contractId });
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.lineItem.list.queryFilter({ organisationId, contractId }),
        ),
      ]);
      toast.success("Contract deleted");
      router.push(`/org/${organisationId}/contracts`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Contract could not be deleted",
      );
    }
  }

  async function handleDeleteLineItem(id: string) {
    if (!window.confirm("Delete this draft line item?")) {
      return;
    }

    try {
      await deleteLineItem.mutateAsync({ organisationId, id });
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
      ]);
      toast.success("Line item deleted");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Line item could not be deleted",
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              {data.poRefNo}
            </h2>
            <Badge variant="outline">{statusLabels[data.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.clientName} · PO date {date.format(new Date(data.poDate))}
          </p>
          <p className="text-sm text-muted-foreground">
            Source: {data.sourceType.replace("_", " ")}
          </p>
          <p className="text-sm font-medium text-foreground">
            Contract total: {number.format(Number(data.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditContractDialog
            organisationId={organisationId}
            contract={{ ...data, poDate: new Date(data.poDate) }}
          />
          <ContractStatusActions
            organisationId={organisationId}
            contractId={contractId}
            status={data.status}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!isDraft || deleteContract.isPending}
            onClick={() => void handleDeleteContract()}
          >
            <Trash2Icon />
            {deleteContract.isPending ? "Deleting..." : "Delete contract"}
          </Button>
          <CreateLineItemDialog
            organisationId={organisationId}
            contractId={data.id}
            disabled={!isDraft}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <h3 className="text-base font-medium">Line items</h3>
          <p className="text-sm text-muted-foreground">
            {isDraft
              ? "You can add and update line items while this contract is in draft."
              : "This contract is no longer draft. Line items are read only."}
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {data.lineItems.length === 0 ? (
            <TableEmptyState
              noun="line items"
              description="Add the first line item to complete this contract draft."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(item.quantity))}{" "}
                        {item.quantityUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(item.unitPrice))}{" "}
                        {item.pricingUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {item.total === null
                          ? "—"
                          : number.format(Number(item.total))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {date.format(new Date(item.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <EditLineItemDialog
                            organisationId={organisationId}
                            contractId={data.id}
                            lineItem={item}
                            disabled={!isDraft}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isDraft || deleteLineItem.isPending}
                            onClick={() => void handleDeleteLineItem(item.id)}
                          >
                            <Trash2Icon />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractAuditTrail
        organisationId={organisationId}
        contractId={contractId}
      />
    </section>
  );
}
