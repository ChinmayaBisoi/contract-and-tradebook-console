"use client";

import type { Table } from "@tanstack/react-table";
import { DataTableColumnSelector } from "./data-table-column-selector";

export function DataTableLeftSlot<TData>({ table }: { table: Table<TData> }) {
  return (
    <div className="flex items-center gap-2">
      <DataTableColumnSelector table={table} />
    </div>
  );
}
