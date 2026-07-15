"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { toast } from "sonner";

import { EditLineItemDialog } from "@/components/contracts/edit-line-item-dialog";
import { DebouncedInput } from "@/components/filters/debounced-input";
import {
  getLineItemListInput,
  lineItemSearchParams,
} from "@/components/operations/search-params";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
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

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const date = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function OrganisationLineItems({
  organisationId,
  contractId,
}: {
  organisationId: string;
  contractId?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deleteLineItem = useMutation(trpc.lineItem.delete.mutationOptions());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(lineItemSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const input = getLineItemListInput(organisationId, contractId, state);
  const { data, isLoading, isFetching } = useQuery({
    ...trpc.lineItem.list.queryOptions(input),
    placeholderData: keepPreviousData,
  });
  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (event.entity !== "contract" && event.entity !== "lineItem") {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries(trpc.lineItem.list.queryFilter(input)),
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
      ]);
    },
  });
  const filtered = Boolean(
    state.q ||
      state.contract ||
      state.quantityUnit ||
      state.pricingUnit ||
      state.source ||
      state.totalMin ||
      state.totalMax,
  );
  const update = (next: Partial<typeof state>) =>
    void setState({ ...next, ...("page" in next ? {} : { page: 1 }) });
  const sort = (column: typeof state.sort) =>
    update({
      sort: column,
      direction: toggleSortDirection(state.sort, state.direction, column),
    });
  const facets = data?.facets ?? {
    contracts: [],
    quantityUnits: [],
    pricingUnits: [],
    sourceTypes: [],
  };
  const pagination = data?.pagination ?? {
    page: state.page,
    pageSize: state.pageSize,
    total: 0,
    pageCount: 0,
  };
  const rows = data?.data ?? [];
  const showEmpty = !isLoading && rows.length === 0;
  const columnCount = contractId ? 8 : 10;

  async function handleDeleteLineItem(id: string, currentContractId: string) {
    if (!window.confirm("Delete this draft line item?")) {
      return;
    }

    try {
      await deleteLineItem.mutateAsync({ organisationId, id });
      await Promise.all([
        queryClient.invalidateQueries(trpc.lineItem.list.queryFilter(input)),
        queryClient.invalidateQueries(
          trpc.contract.list.queryFilter({ organisationId }),
        ),
        queryClient.invalidateQueries(
          trpc.contract.get.queryFilter({
            organisationId,
            id: currentContractId,
          }),
        ),
      ]);
      toast.success("Line item deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Line item could not be deleted",
      );
    }
  }

  return (
    <section aria-labelledby="line-items-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Tradebook ledger
          </p>
          <h2
            id="line-items-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {data?.contract
              ? `${data.contract.poRefNo} line items`
              : "Line items"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {data?.contract
              ? `${data.contract.clientName} · focused contract view`
              : "Every priced row across this organisation."}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {pagination.total} items
        </p>
      </div>
      <Card aria-busy={pending || isFetching}>
        <CardHeader className="grid gap-3 border-b md:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="line-item-search" className="relative md:col-span-2">
            <span className="sr-only">Search line items</span>
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <DebouncedInput
              id="line-item-search"
              aria-label="Search line items"
              placeholder="Search item, description, PO or client"
              className="pl-9"
              value={state.q}
              onCommit={(q) => update({ q })}
            />
          </label>
          {!contractId ? (
            <NativeSelect
              aria-label="Filter by contract"
              value={state.contract}
              onChange={(e) => update({ contract: e.target.value })}
            >
              <NativeSelectOption value="">All contracts</NativeSelectOption>
              {facets.contracts.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.poRefNo} · {item.clientName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
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
          <NativeSelect
            aria-label="Filter by quantity unit"
            value={state.quantityUnit}
            onChange={(e) => update({ quantityUnit: e.target.value })}
          >
            <NativeSelectOption value="">All quantity units</NativeSelectOption>
            {facets.quantityUnits.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by pricing unit"
            value={state.pricingUnit}
            onChange={(e) => update({ pricingUnit: e.target.value })}
          >
            <NativeSelectOption value="">All pricing units</NativeSelectOption>
            {facets.pricingUnits.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <DebouncedInput
              inputMode="decimal"
              aria-label="Minimum total"
              placeholder="Min total"
              value={state.totalMin}
              onCommit={(totalMin) => update({ totalMin })}
            />
            <DebouncedInput
              inputMode="decimal"
              aria-label="Maximum total"
              placeholder="Max total"
              value={state.totalMax}
              onCommit={(totalMax) => update({ totalMax })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear line item filters"
              disabled={!filtered}
              onClick={() =>
                void setState({
                  q: "",
                  contract: "",
                  quantityUnit: "",
                  pricingUnit: "",
                  source: null,
                  totalMin: "",
                  totalMax: "",
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
            <TableEmptyState filtered={filtered} noun="line items" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item ID</TableHead>
                    <TableHead>
                      <SortButton
                        label="Description"
                        column="description"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    {!contractId ? (
                      <>
                        <TableHead>
                          <SortButton
                            label="PO reference"
                            column="poRefNo"
                            sort={state.sort}
                            direction={state.direction}
                            onSort={sort}
                          />
                        </TableHead>
                        <TableHead>Client</TableHead>
                      </>
                    ) : null}
                    <TableHead className="text-right">
                      <SortButton
                        label="Quantity"
                        column="quantity"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        label="Unit price"
                        column="unitPrice"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortButton
                        label="Total"
                        column="total"
                        sort={state.sort}
                        direction={state.direction}
                        onSort={sort}
                      />
                    </TableHead>
                    <TableHead>Source</TableHead>
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
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyLoadingState
                  isLoading={isLoading}
                  isFetching={isFetching}
                  hasData={Boolean(data)}
                  rowCount={state.pageSize}
                  columnCount={columnCount}
                >
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.workbookItemId ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-64 font-medium">
                        {row.description}
                      </TableCell>
                      {!contractId ? (
                        <>
                          <TableCell className="font-mono text-xs font-semibold">
                            {row.contract.poRefNo}
                          </TableCell>
                          <TableCell>{row.contract.clientName}</TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(row.quantity))}{" "}
                        {row.quantityUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {number.format(Number(row.unitPrice))}{" "}
                        {row.pricingUnit ?? ""}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {row.total === null
                          ? "—"
                          : number.format(Number(row.total))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.sourceType.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {date.format(new Date(row.updatedAt))}
                      </TableCell>
                      <TableCell>
                        {row.contract.status === "DRAFT" ? (
                          <div className="flex items-center justify-end gap-2">
                            <EditLineItemDialog
                              organisationId={organisationId}
                              contractId={row.contract.id}
                              lineItem={row}
                              disabled={row.contract.status !== "DRAFT"}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deleteLineItem.isPending}
                              onClick={() =>
                                void handleDeleteLineItem(row.id, row.contract.id)
                              }
                            >
                              <Trash2Icon />
                              Delete
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Read only
                          </span>
                        )}
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
