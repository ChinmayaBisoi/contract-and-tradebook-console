"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { SearchIcon, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import {
  getLineItemListInput,
  lineItemSearchParams,
} from "@/components/operations/search-params";
import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import {
  OperationsPagination,
  SortButton,
  TableEmptyState,
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
  TableBody,
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
  const [pending, startTransition] = useTransition();
  const [state, setState] = useQueryStates(lineItemSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const input = getLineItemListInput(organisationId, contractId, state);
  const { data } = useSuspenseQuery(trpc.lineItem.list.queryOptions(input));
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
      direction:
        state.sort === column && state.direction === "asc" ? "desc" : "asc",
    });

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
            {data.contract
              ? `${data.contract.poRefNo} line items`
              : "Line items"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.contract
              ? `${data.contract.clientName} · focused contract view`
              : "Every priced row across this organisation."}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {data.pagination.total} items
        </p>
      </div>
      <Card aria-busy={pending}>
        <CardHeader className="grid gap-3 border-b md:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="line-item-search" className="relative md:col-span-2">
            <span className="sr-only">Search line items</span>
            <SearchIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="line-item-search"
              aria-label="Search line items"
              placeholder="Search item, description, PO or client"
              className="pl-9"
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          {!contractId ? (
            <NativeSelect
              aria-label="Filter by contract"
              value={state.contract}
              onChange={(e) => update({ contract: e.target.value })}
            >
              <NativeSelectOption value="">All contracts</NativeSelectOption>
              {data.facets.contracts.map((item) => (
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
            {data.facets.sourceTypes.map((value) => (
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
            {data.facets.quantityUnits.map((value) => (
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
            {data.facets.pricingUnits.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              aria-label="Minimum total"
              placeholder="Min total"
              value={state.totalMin}
              onChange={(e) => update({ totalMin: e.target.value })}
            />
            <Input
              inputMode="decimal"
              aria-label="Maximum total"
              placeholder="Max total"
              value={state.totalMax}
              onChange={(e) => update({ totalMax: e.target.value })}
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
          {data.data.length === 0 ? (
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <OperationsPagination
            {...data.pagination}
            onPage={(page) => update({ page })}
            onPageSize={(pageSize) => update({ pageSize })}
          />
        </CardContent>
      </Card>
    </section>
  );
}
