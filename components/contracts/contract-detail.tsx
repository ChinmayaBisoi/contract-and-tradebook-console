"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { CreateLineItemDialog } from "@/components/contracts/create-line-item-dialog";
import { EditContractDialog } from "@/components/contracts/edit-contract-dialog";
import { EditLineItemDialog } from "@/components/contracts/edit-line-item-dialog";
import { TableEmptyState } from "@/components/contracts/contracts-table-states";
import { Badge } from "@/components/ui/badge";
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
  const { data } = useSuspenseQuery(
    trpc.contract.get.queryOptions({
      organisationId,
      id: contractId,
    }),
  );
  const isDraft = data.status === "DRAFT";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{data.poRefNo}</h2>
            <Badge variant="outline">{statusLabels[data.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.clientName} · PO date {date.format(new Date(data.poDate))}
          </p>
          <p className="text-sm text-muted-foreground">
            Source: {data.sourceType.replace("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditContractDialog organisationId={organisationId} contract={data} />
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
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(item.quantity))} {item.quantityUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(item.unitPrice))}{" "}
                        {item.pricingUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {item.total === null ? "—" : number.format(Number(item.total))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {date.format(new Date(item.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <EditLineItemDialog
                          organisationId={organisationId}
                          contractId={data.id}
                          lineItem={item}
                          disabled={!isDraft}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
