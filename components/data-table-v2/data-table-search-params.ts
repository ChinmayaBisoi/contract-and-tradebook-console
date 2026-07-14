"use client";

import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import {
  createParser,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { z } from "zod";

const dashboardTabs = ["organisations", "invitations"] as const;
const sortDirections = ["asc", "desc"] as const;
const pageSizes = [10, 20, 50] as const;

const filterSchema = z.object({
  id: z.string(),
  value: z.string(),
});

const filtersSchema = z.array(filterSchema);

const positiveIntegerParser = createParser({
  parse(value) {
    if (!/^\d+$/.test(value)) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return parsed >= 1 ? parsed : null;
  },
  serialize: String,
});

const pageSizeParser = createParser({
  parse(value) {
    const parsed = Number.parseInt(value, 10);
    return pageSizes.includes(parsed as (typeof pageSizes)[number])
      ? parsed
      : null;
  },
  serialize: String,
});

type DashboardTab = (typeof dashboardTabs)[number];
type SortDirection = (typeof sortDirections)[number];
type UrlFilter = z.infer<typeof filterSchema>;

export type DashboardQueryState = {
  tab: DashboardTab;
  filters: UrlFilter[];
  page: number;
  pageSize: number;
  sort: string | null;
  sortDirection: SortDirection | null;
};

export type DashboardQueryUpdate = Partial<DashboardQueryState>;

export const dataTableSearchParams = {
  tab: parseAsStringLiteral(dashboardTabs).withDefault("organisations"),
  filters: parseAsJson(filtersSchema).withDefault([]),
  page: positiveIntegerParser.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
  sort: parseAsString,
  sortDirection: parseAsStringLiteral(sortDirections),
};

export function getDashboardQueryUpdate(
  current: DashboardQueryState,
  update: DashboardQueryUpdate,
): DashboardQueryUpdate {
  if (update.tab && update.tab !== current.tab) {
    return {
      tab: update.tab,
      filters: [],
      page: 1,
      sort: null,
      sortDirection: null,
    };
  }

  const resetsPage = ["filters", "pageSize", "sort", "sortDirection"].some(
    (key) => Object.hasOwn(update, key),
  );

  return resetsPage ? { ...update, page: 1 } : update;
}

export function sortingStateFromQuery(
  sort: string | null,
  sortDirection: SortDirection | null,
): SortingState {
  if (!sort) {
    return [];
  }

  return [{ id: sort, desc: sortDirection === "desc" }];
}

export function sortingStateToQuery(sorting: SortingState): {
  sort: string | null;
  sortDirection: SortDirection | null;
} {
  const primarySort = sorting[0];

  if (!primarySort) {
    return { sort: null, sortDirection: null };
  }

  return {
    sort: primarySort.id,
    sortDirection: primarySort.desc ? "desc" : "asc",
  };
}

export function filtersStateFromQuery(
  filters: UrlFilter[],
): ColumnFiltersState {
  return filters.map((filter) => ({
    id: filter.id,
    value: filter.value,
  }));
}

export function filtersStateToQuery(filters: ColumnFiltersState): UrlFilter[] {
  return filters.flatMap((filter) =>
    typeof filter.value === "string"
      ? [{ id: filter.id, value: filter.value }]
      : [],
  );
}
