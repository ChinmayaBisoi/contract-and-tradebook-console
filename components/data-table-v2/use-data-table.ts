"use client";

import type { UniqueIdentifier } from "@dnd-kit/core";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Updater,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useQueryStates } from "nuqs";
import * as React from "react";
import {
  dataTableSearchParams,
  filtersStateFromQuery,
  filtersStateToQuery,
  getDashboardQueryUpdate,
  sortingStateFromQuery,
  sortingStateToQuery,
} from "./data-table-search-params";

interface UseDataTableParams<TData extends { id: UniqueIdentifier }> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
}

function resolveUpdater<T>(updaterOrValue: Updater<T>, previous: T): T {
  if (typeof updaterOrValue === "function") {
    return (updaterOrValue as (currentValue: T) => T)(previous);
  }

  return updaterOrValue;
}

export function useDataTable<TData extends { id: UniqueIdentifier }>({
  data: initialData,
  columns,
}: UseDataTableParams<TData>) {
  const [data, _setData] = React.useState(() => initialData);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [queryState, setQueryState] = useQueryStates(dataTableSearchParams);

  const sorting = React.useMemo<SortingState>(
    () => sortingStateFromQuery(queryState.sort, queryState.sortDirection),
    [queryState.sort, queryState.sortDirection],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () => filtersStateFromQuery(queryState.filters),
    [queryState.filters],
  );

  const pagination = React.useMemo<PaginationState>(
    () => ({
      pageIndex: queryState.page - 1,
      pageSize: queryState.pageSize,
    }),
    [queryState.page, queryState.pageSize],
  );

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data?.map(({ id }) => id) || [],
    [data],
  );

  const onSortingChange = React.useCallback<OnChangeFn<SortingState>>(
    (updaterOrValue) => {
      const nextSorting = resolveUpdater(updaterOrValue, sorting).slice(0, 1);
      const sortQuery = sortingStateToQuery(nextSorting);

      setQueryState(getDashboardQueryUpdate(queryState, sortQuery));
    },
    [queryState, setQueryState, sorting],
  );

  const onColumnFiltersChange = React.useCallback<
    OnChangeFn<ColumnFiltersState>
  >(
    (updaterOrValue) => {
      const nextFilters = resolveUpdater(updaterOrValue, columnFilters);
      const filterQuery = filtersStateToQuery(nextFilters);

      setQueryState(
        getDashboardQueryUpdate(queryState, { filters: filterQuery }),
      );
    },
    [columnFilters, queryState, setQueryState],
  );

  const onPaginationChange = React.useCallback<OnChangeFn<PaginationState>>(
    (updaterOrValue) => {
      const nextPagination = resolveUpdater(updaterOrValue, pagination);
      const nextPageIndex =
        nextPagination.pageSize !== pagination.pageSize
          ? 0
          : nextPagination.pageIndex;

      const update =
        nextPagination.pageSize !== pagination.pageSize
          ? { pageSize: nextPagination.pageSize }
          : { page: nextPageIndex + 1 };

      setQueryState(getDashboardQueryUpdate(queryState, update));
    },
    [pagination, queryState, setQueryState],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    enableMultiSort: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return { dataIds, table };
}
