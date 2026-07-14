"use client";

import type { Table } from "@tanstack/react-table";
import type { z } from "zod";
import { DataTable } from "@/components/custom/data-table";
import {
  orgListDataTableColumns,
  type orgListDataTableSchema,
} from "@/components/org-data-table/org-list.data-table.columns";
import { OrgListDataTableHeader } from "@/components/org-data-table/org-list.data-table-header";
import { OrgListDataTableLeftSlot } from "@/components/org-data-table/org-list.data-table-left-slot";
import { OrgListDataTableRightSlot } from "@/components/org-data-table/org-list.data-table-right-slot";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrgListDataTableProps {
  data: z.infer<typeof orgListDataTableSchema>[];
}

function renderOrgTableHeader(
  table: Table<z.infer<typeof orgListDataTableSchema>>,
) {
  return (
    <OrgListDataTableHeader
      leftSlot={<OrgListDataTableLeftSlot table={table} />}
      rightSlot={<OrgListDataTableRightSlot />}
    />
  );
}

function renderOrgTableToolbar(
  table: Table<z.infer<typeof orgListDataTableSchema>>,
) {
  return (
    <div className="flex flex-col gap-2 px-4 lg:flex-row lg:items-center">
      <Input
        placeholder="Filter header..."
        className="h-8 w-full lg:max-w-sm"
        value={(table.getColumn("header")?.getFilterValue() as string) ?? ""}
        onChange={(event) => {
          table.getColumn("header")?.setFilterValue(event.target.value);
        }}
      />
      <Select
        value={
          (table.getColumn("status")?.getFilterValue() as string) ?? "__all"
        }
        onValueChange={(value) => {
          table
            .getColumn("status")
            ?.setFilterValue(value === "__all" ? undefined : value);
        }}
        items={[
          { label: "All statuses", value: "__all" },
          { label: "Done", value: "Done" },
          { label: "In Progress", value: "In Progress" },
          { label: "Not Started", value: "Not Started" },
        ]}
      >
        <SelectTrigger className="h-8 w-full lg:w-48">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="__all">All statuses</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Not Started">Not Started</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function OrgListDataTable({ data }: OrgListDataTableProps) {
  return (
    <DataTable
      data={data}
      columns={orgListDataTableColumns}
      renderHeader={renderOrgTableHeader}
      renderToolbar={renderOrgTableToolbar}
    />
  );
}
