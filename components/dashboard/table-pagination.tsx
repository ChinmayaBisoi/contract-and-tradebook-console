"use client";

import type { Pagination } from "@/components/dashboard/organisation-dashboard-types";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export function TablePagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        {pagination.total === 0
          ? "No results"
          : `Page ${pagination.page} of ${Math.max(pagination.pageCount, 1)} · ${pagination.total} total`}
      </span>
      <div className="flex items-center gap-2">
        <label
          htmlFor="dashboard-page-size"
          className="flex items-center gap-2"
        >
          <span>Rows</span>
          <NativeSelect
            id="dashboard-page-size"
            aria-label="Rows per page"
            value={pagination.pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <NativeSelectOption value="10">10</NativeSelectOption>
            <NativeSelectOption value="20">20</NativeSelectOption>
            <NativeSelectOption value="50">50</NativeSelectOption>
          </NativeSelect>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            pagination.pageCount === 0 ||
            pagination.page >= pagination.pageCount
          }
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
