import { describe, expect, it } from "vitest";

import * as searchParams from "@/components/data-table-v2/data-table-search-params";

describe("dashboard table search params", () => {
  it("uses the exact shareable dashboard query keys", () => {
    expect(Object.keys(searchParams.dataTableSearchParams)).toEqual([
      "tab",
      "filters",
      "page",
      "pageSize",
      "sort",
      "sortDirection",
    ]);
  });

  it("parses one-based pages and approved page sizes", () => {
    expect(searchParams.dataTableSearchParams.page.parse("1")).toBe(1);
    expect(searchParams.dataTableSearchParams.page.parse("0")).toBeNull();
    expect(searchParams.dataTableSearchParams.pageSize.parse("20")).toBe(20);
    expect(searchParams.dataTableSearchParams.pageSize.parse("25")).toBeNull();
  });

  it("maps TanStack sorting to sort and sortDirection", () => {
    expect(searchParams.sortingStateFromQuery("name", "desc")).toEqual([
      { id: "name", desc: true },
    ]);
    expect(
      searchParams.sortingStateToQuery([{ id: "name", desc: false }]),
    ).toEqual({ sort: "name", sortDirection: "asc" });
  });

  it("resets incompatible table state when switching tabs", () => {
    expect(
      searchParams.getDashboardQueryUpdate(
        {
          tab: "organisations",
          filters: [{ id: "role", value: "OWNER" }],
          page: 3,
          pageSize: 20,
          sort: "name",
          sortDirection: "asc",
        },
        { tab: "invitations" },
      ),
    ).toEqual({
      tab: "invitations",
      filters: [],
      page: 1,
      sort: null,
      sortDirection: null,
    });
  });

  it("resets to page one when filters, sorting, or page size changes", () => {
    const current = {
      tab: "organisations" as const,
      filters: [],
      page: 4,
      pageSize: 10,
      sort: "createdAt",
      sortDirection: "desc" as const,
    };

    expect(
      searchParams.getDashboardQueryUpdate(current, { pageSize: 20 }),
    ).toEqual({ pageSize: 20, page: 1 });
    expect(
      searchParams.getDashboardQueryUpdate(current, {
        filters: [{ id: "search", value: "ops" }],
      }),
    ).toEqual({
      filters: [{ id: "search", value: "ops" }],
      page: 1,
    });
    expect(
      searchParams.getDashboardQueryUpdate(current, {
        sort: "name",
        sortDirection: "asc",
      }),
    ).toEqual({ sort: "name", sortDirection: "asc", page: 1 });
  });
});
