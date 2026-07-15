"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { CreateContractDialog } from "@/components/contracts/create-contract-dialog";
import { getDefaultContractListInput } from "@/components/contracts/contracts-query";
import { TableEmptyState } from "@/components/contracts/contracts-table-states";
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

export function OrganisationContracts({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.contract.list.queryOptions(getDefaultContractListInput(organisationId)),
  );

  return (
    <section aria-labelledby="contracts-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="contracts-title" className="text-2xl font-semibold tracking-tight">
            Contracts
          </h2>
          <p className="text-sm text-muted-foreground">
            Create and manage contract drafts with line items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {data.pagination.total} contracts
          </p>
          <CreateContractDialog organisationId={organisationId} />
        </div>
      </div>
      <Card>
        <CardHeader className="border-b">
          <p className="text-sm text-muted-foreground">
            Recently updated contracts in this organisation.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {data.data.length === 0 ? (
            <TableEmptyState
              noun="contracts"
              description="Create your first draft contract to start adding line items."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>PO date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {row.poRefNo}
                      </TableCell>
                      <TableCell className="font-medium">{row.clientName}</TableCell>
                      <TableCell>{date.format(new Date(row.poDate))}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{statusLabels[row.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.itemCount}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(row.lineTotal))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {date.format(new Date(row.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <Button
                          render={
                            <Link
                              href={`/org/${organisationId}/contracts/${row.id}`}
                            />
                          }
                          variant="ghost"
                          size="sm"
                        >
                          Open
                          <ArrowRightIcon aria-hidden="true" />
                        </Button>
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
