"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  DatabaseIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Component, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

const skeletonRows = ["one", "two", "three", "four", "five", "six", "seven"];

export function toggleSortDirection<T extends string>(
  currentSort: T,
  currentDirection: "asc" | "desc",
  column: T,
  defaultDirection: "asc" | "desc" = "asc",
): "asc" | "desc" {
  if (currentSort === column) {
    return currentDirection === "asc" ? "desc" : "asc";
  }

  return defaultDirection;
}

function OperationsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Records unavailable</AlertTitle>
      <AlertDescription>
        The organisation records could not be loaded. Your filters are still
        preserved.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden="true" /> Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

class OperationsBoundary extends Component<
  { children: React.ReactNode; resetQueries: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  retry = () => {
    this.props.resetQueries();
    this.setState({ hasError: false });
  };
  render() {
    return this.state.hasError ? (
      <OperationsError onRetry={this.retry} />
    ) : (
      this.props.children
    );
  }
}

export function OperationsErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <OperationsBoundary resetQueries={reset}>{children}</OperationsBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function OperationsTableSkeleton({
  title = "Loading records",
}: {
  title?: string;
}) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card>
        <CardHeader className="flex-row gap-3 border-b">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4">
          {skeletonRows.map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export function TableEmptyState({
  filtered,
  noun,
}: {
  filtered: boolean;
  noun: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="rounded-full border bg-muted/40 p-3">
        <DatabaseIcon
          className="size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <p className="font-medium">
        {filtered ? `No matching ${noun}` : `No ${noun} yet`}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Adjust or clear the filters to broaden this view."
          : "Records will appear here when they are available for this organisation."}
      </p>
    </div>
  );
}

export function TableSkeletonRows({
  rows = 7,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {skeletonRows.slice(0, rows).map((row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, index) => (
            <TableCell key={`${row}-${index}`}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function TableBodyLoadingState({
  isLoading,
  isFetching,
  hasData,
  rowCount = 7,
  columnCount = 6,
  children,
}: {
  isLoading: boolean;
  isFetching: boolean;
  hasData: boolean;
  rowCount?: number;
  columnCount?: number;
  children: ReactNode;
}) {
  if (isLoading && !hasData) {
    return (
      <TableBody>
        <TableSkeletonRows rows={rowCount} columns={columnCount} />
      </TableBody>
    );
  }

  return (
    <TableBody
      aria-busy={isFetching || undefined}
      className={isFetching ? "opacity-60 transition-opacity" : undefined}
    >
      {children}
    </TableBody>
  );
}

export function SortButton<T extends string>({
  label,
  column,
  sort,
  direction,
  onSort,
}: {
  label: string;
  column: T;
  sort: T;
  direction: "asc" | "desc";
  onSort: (column: T) => void;
}) {
  const active = sort === column;
  const Icon = active
    ? direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <span>{label}</span>
      <Icon aria-hidden="true" />
    </Button>
  );
}

export function OperationsPagination({
  page,
  pageSize,
  total,
  pageCount,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: 10 | 20 | 50;
  total: number;
  pageCount: number;
  onPage: (page: number) => void;
  onPageSize: (size: 10 | 20 | 50) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span aria-live="polite">
        {total === 0
          ? "No results"
          : `${total} records · Page ${page} of ${Math.max(pageCount, 1)}`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="operations-page-size"
          className="flex items-center gap-2"
        >
          Rows
          <NativeSelect
            id="operations-page-size"
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) =>
              onPageSize(Number(event.target.value) as 10 | 20 | 50)
            }
          >
            <NativeSelectOption value="10">10</NativeSelectOption>
            <NativeSelectOption value="20">20</NativeSelectOption>
            <NativeSelectOption value="50">50</NativeSelectOption>
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pageCount === 0 || page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
