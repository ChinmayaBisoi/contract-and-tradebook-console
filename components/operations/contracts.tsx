"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ExternalLinkIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { toast } from "sonner";

import { CreateContractDialog } from "@/components/contracts/create-contract-dialog";
import { ContractStatusActions } from "@/components/contracts/contract-status-actions";
import { EditContractDialog } from "@/components/contracts/edit-contract-dialog";
import { DebouncedInput } from "@/components/filters/debounced-input";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import {
  contractSearchParams,
  getContractListInput,
} from "@/components/operations/search-params";
import {
  OperationsPagination,
  SortButton,
  TableBodyLoadingState,
  TableEmptyState,
  toggleSortDirection,
} from "@/components/operations/table-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  timeZone: "UTC",
});
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const statusLabels = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  ARCHIVED: "Archived",
};

export function OrganisationContracts({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deleteContract = useMutation(trpc.contract.delete.mutationOptions());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(contractSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const input = getContractListInput(organisationId, state);
  const { data, isLoading, isFetching } = useQuery({
    ...trpc.contract.list.queryOptions(input),
    placeholderData: keepPreviousData,
  });
  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (event.entity !== "contract" && event.entity !== "lineItem") {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries(trpc.contract.list.queryFilter(input)),
        queryClient.invalidateQueries(
          trpc.lineItem.list.queryFilter({ organisationId }),
        ),
      ]);
    },
  });
  const filtered = Boolean(
    state.q || state.status || state.source || state.poFrom || state.poTo,
  );
  const update = (next: Partial<typeof state>) =>
    void setState({ ...next, ...("page" in next ? {} : { page: 1 }) });
  const sort = (column: typeof state.sort) =>
    update({
      sort: column,
      direction: toggleSortDirection(state.sort, state.direction, column),
    });
  const facets = data?.facets ?? { statuses: [], sourceTypes: [] };
  const pagination = data?.pagination ?? {
    page: state.page,
    pageSize: state.pageSize,
    total: 0,
    pageCount: 0,
  };
  const rows = data?.data ?? [];
  const showEmpty = !isLoading && rows.length === 0;

  async function handleDeleteContract(id: string) {
    if (!window.confirm("Delete this draft contract and its line items?")) {
      return;
    }

    try {
      await deleteContract.mutateAsync({ organisationId, id });
      await Promise.all([
        queryClient.invalidateQueries(trpc.contract.list.queryFilter(input)),
        queryClient.invalidateQueries(
          trpc.lineItem.list.queryFilter({ organisationId }),
        ),
      ]);
      toast.success("Contract deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Contract could not be deleted",
      );
    }
  }

  return (
    <section aria-labelledby="contracts-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Commercial register
          </p>
          <h2
            id="contracts-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Contracts
          </h2>
          <p className="text-sm text-muted-foreground">
            PO commitments, provenance, and tradebook totals in one register.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {pagination.total} contracts
          </p>
          <CreateContractDialog organisationId={organisationId} />
        </div>
      </div>
      <Card aria-busy={pending || isFetching}>
        <CardHeader className="grid gap-3 border-b md:grid-cols-2 xl:grid-cols-6">
          <label htmlFor="contract-search" className="relative md:col-span-2">
            <span className="sr-only">Search contracts</span>
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <DebouncedInput
              id="contract-search"
              aria-label="Search contracts"
              placeholder="Search client or PO reference"
              value={state.q}
              className="pl-9"
              onCommit={(q) => update({ q })}
            />
          </label>
          <NativeSelect
            aria-label="Filter by status"
            value={state.status ?? ""}
            onChange={(e) =>
              update({
                status: (e.target.value || null) as typeof state.status,
              })
            }
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {facets.statuses.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {statusLabels[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by source"
            value={state.source ?? ""}
            onChange={(e) =>
              update({
                source: (e.target.value || null) as typeof state.source,
              })
            }
          >
            <NativeSelectOption value="">All sources</NativeSelectOption>
            {facets.sourceTypes.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value.replace("_", " ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            type="date"
            aria-label="PO date from"
            value={state.poFrom}
            onChange={(e) => update({ poFrom: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="PO date to"
              value={state.poTo}
              onChange={(e) => update({ poTo: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear contract filters"
              disabled={!filtered}
              onClick={() =>
                void setState({
                  q: "",
                  status: null,
                  source: null,
                  poFrom: "",
                  poTo: "",
                  page: 1,
                })
              }
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {showEmpty ? (
            <TableEmptyState filtered={filtered} noun="contracts" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortButton
                        label="PO reference"
                        column="poRefNo"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Client"
                        column="clientName"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="PO date"
                        column="poDate"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Status"
                        column="status"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        label="Items"
                        column="itemCount"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        label="Total"
                        column="lineTotal"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead className="hidden 2xl:table-cell">
                      Terms
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Updated"
                        column="updatedAt"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>
                      <span className="sr-only">Edit</span>
                    </TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyLoadingState
                  isLoading={isLoading}
                  isFetching={isFetching}
                  hasData={Boolean(data)}
                  rowCount={state.pageSize}
                  columnCount={11}
                >
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {row.poRefNo}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.clientName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {date.format(new Date(row.poDate))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {statusLabels[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.sourceType.replace("_", " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.itemCount}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(row.lineTotal))}
                      </TableCell>
                      <TableCell className="hidden max-w-52 truncate text-muted-foreground 2xl:table-cell">
                        {[row.paymentTerms, row.deliveryTerms]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {date.format(new Date(row.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.status === "DRAFT" ? (
                            <>
                              <EditContractDialog
                                organisationId={organisationId}
                                contract={{
                                  id: row.id,
                                  clientName: row.clientName,
                                  poRefNo: row.poRefNo,
                                  poDate: new Date(row.poDate),
                                  paymentTerms: row.paymentTerms,
                                  deliveryTerms: row.deliveryTerms,
                                  total: row.total,
                                  status: row.status,
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleteContract.isPending}
                                onClick={() => void handleDeleteContract(row.id)}
                              >
                                <Trash2Icon />
                                Delete
                              </Button>
                            </>
                          ) : row.status === "ARCHIVED" ? (
                            <span className="text-sm text-muted-foreground">
                              Read only
                            </span>
                          ) : null}
                          <ContractStatusActions
                            organisationId={organisationId}
                            contractId={row.id}
                            status={row.status}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          render={
                            <Link
                              href={`/org/${organisationId}/contracts/${row.id}/line-items`}
                            />
                          }
                          variant="ghost"
                          size="sm"
                        >
                          Items
                          <ExternalLinkIcon aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBodyLoadingState>
              </Table>
            </div>
          )}
          <OperationsPagination
            {...pagination}
            onPage={(page) => update({ page })}
            onPageSize={(pageSize) => update({ pageSize })}
          />
        </CardContent>
      </Card>
    </section>
  );
}
