"use client";

import type { Table } from "@tanstack/react-table";
import { OrgListDataTableColumnSelector } from "./org-list.data-table-column-selector";

export function OrgListDataTableLeftSlot<TData>({
  table,
}: {
  table: Table<TData>;
}) {
  return (
    <div className="flex items-center gap-2">
      <OrgListDataTableColumnSelector table={table} />
    </div>
  );
}
