"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, FileSpreadsheetIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import {
  getImportListInput,
  importSearchParams,
} from "@/components/imports/search-params";
import { TradebookUpload } from "@/components/imports/tradebook-upload";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import {
  OperationsPagination,
  TableBodyLoadingState,
  TableEmptyState,
} from "@/components/operations/table-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/client";

const date = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const number = new Intl.NumberFormat("en-US");
const labels = {
  PENDING: "Needs review",
  MAPPED: "Ready",
  IMPORTED: "Imported",
  FAILED: "Failed",
};

export function OrganisationImports({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(importSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const { data, isLoading, isFetching } = useQuery({
    ...trpc.tradebookImport.list.queryOptions(
      getImportListInput(organisationId, state),
    ),
    placeholderData: keepPreviousData,
  });

  useOrganisationEvents({
    organisationId,
    entity: "upload",
    onEvent: async () => {
      await queryClient.invalidateQueries(
        trpc.tradebookImport.list.queryFilter({ organisationId }),
      );
    },
  });

  const facets = data?.facets ?? { statuses: [] };
  const pagination = data?.pagination ?? {
    page: state.page,
    pageSize: state.pageSize,
    total: 0,
    pageCount: 0,
  };
  const rows = data?.data ?? [];
  const showEmpty = !isLoading && rows.length === 0;

  return (
    <section aria-labelledby="imports-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Intake ledger
          </p>
          <h2
            id="imports-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Tradebook imports
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload privately, inspect every sheet, then commit reviewed records.
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {number.format(pagination.total)} imports
        </p>
      </div>

      <TradebookUpload organisationId={organisationId} />

      <Card aria-busy={pending || isFetching}>
        <CardHeader className="flex-row items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <FileSpreadsheetIcon aria-hidden="true" className="size-4" />
            <h3 className="font-heading font-medium">Import history</h3>
          </div>
          <NativeSelect
            aria-label="Filter imports by status"
            value={state.status ?? ""}
            onChange={(event) =>
              void setState({
                status: (event.target.value || null) as typeof state.status,
                page: 1,
              })
            }
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {facets.statuses.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {labels[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardHeader>
        <CardContent className="px-0">
          {showEmpty ? (
            <TableEmptyState filtered={Boolean(state.status)} noun="imports" />
          ) : (
            <Table aria-label="Tradebook import history">
              <TableHeader>
                <TableRow>
                  <TableHead>Workbook</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source organisation</TableHead>
                  <TableHead className="text-right">Contracts</TableHead>
                  <TableHead className="text-right">Line items</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>
                    <span className="sr-only">Review</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBodyLoadingState
                isLoading={isLoading}
                isFetching={isFetching}
                hasData={Boolean(data)}
                rowCount={state.pageSize}
                columnCount={7}
              >
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="max-w-72 truncate font-medium">
                        {row.fileName ?? "Workbook"}
                      </p>
                      {row.failureMessage ? (
                        <p className="max-w-72 truncate text-xs text-destructive">
                          {row.failureMessage}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{labels[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.sourceOrganisationId ?? "Not selected"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(row.contractCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(row.lineItemCount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {date.format(new Date(row.updatedAt))}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            href={`/org/${organisationId}/imports/${row.id}`}
                          />
                        }
                      >
                        {row.status === "IMPORTED" ? "View" : "Review"}
                        <ArrowRightIcon aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBodyLoadingState>
            </Table>
          )}
          <OperationsPagination
            {...pagination}
            onPage={(page) => void setState({ page })}
            onPageSize={(pageSize) => void setState({ pageSize, page: 1 })}
          />
        </CardContent>
      </Card>
    </section>
  );
}
