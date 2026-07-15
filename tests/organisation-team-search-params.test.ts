import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as searchParams from "@/components/organisation/team/team-search-params";

const current = {
  filters: [{ id: "search" as const, value: "ops" }],
  page: 4,
  pageSize: 10 as const,
  sort: "createdAt" as const,
  sortDirection: "desc" as const,
};

describe("organisation team search params", () => {
  it("defines shared parsers through the server-safe nuqs entrypoint", () => {
    const source = readFileSync(
      join(process.cwd(), "components/organisation/team/team-search-params.ts"),
      "utf8",
    );

    expect(source).toContain('from "nuqs/server"');
    expect(source).not.toContain('from "nuqs"');
  });

  it("uses the exact shareable team query keys", () => {
    expect(Object.keys(searchParams.teamSearchParams)).toEqual([
      "filters",
      "page",
      "pageSize",
      "sort",
      "sortDirection",
    ]);
  });

  it("parses supported JSON filters and rejects malformed filters", () => {
    expect(
      searchParams.teamSearchParams.filters.parse(
        '[{"id":"search","value":"taylor"},{"id":"role","value":"ADMIN"},{"id":"status","value":"ACTIVE"}]',
      ),
    ).toEqual([
      { id: "search", value: "taylor" },
      { id: "role", value: "ADMIN" },
      { id: "status", value: "ACTIVE" },
    ]);
    expect(
      searchParams.teamSearchParams.filters.parse(
        '[{"id":"unknown","value":"value"}]',
      ),
    ).toBeNull();
    expect(searchParams.teamSearchParams.filters.parse("not-json")).toBeNull();
    expect(
      searchParams.teamSearchParams.filters.serialize([
        { id: "search", value: "taylor" },
        { id: "role", value: "ADMIN" },
      ]),
    ).toBe('[{"id":"search","value":"taylor"},{"id":"role","value":"ADMIN"}]');
  });

  it("accepts only one-based pages, approved sizes, sorts, and directions", () => {
    expect(searchParams.teamSearchParams.page.parse("1")).toBe(1);
    expect(searchParams.teamSearchParams.page.parse("0")).toBeNull();
    expect(searchParams.teamSearchParams.page.parse("1.5")).toBeNull();
    expect(searchParams.teamSearchParams.pageSize.parse("20")).toBe(20);
    expect(searchParams.teamSearchParams.pageSize.parse("25")).toBeNull();
    expect(searchParams.teamSearchParams.sort.parse("clerkUserName")).toBe(
      "clerkUserName",
    );
    expect(searchParams.teamSearchParams.sort.parse("email")).toBeNull();
    expect(searchParams.teamSearchParams.sortDirection.parse("asc")).toBe(
      "asc",
    );
    expect(
      searchParams.teamSearchParams.sortDirection.parse("sideways"),
    ).toBeNull();
  });

  it("resets page one for filter, page size, sort, and direction changes", () => {
    expect(
      searchParams.getTeamQueryUpdate(current, {
        filters: [{ id: "role", value: "OWNER" }],
      }),
    ).toEqual({ filters: [{ id: "role", value: "OWNER" }], page: 1 });
    expect(searchParams.getTeamQueryUpdate(current, { pageSize: 20 })).toEqual({
      pageSize: 20,
      page: 1,
    });
    expect(searchParams.getTeamQueryUpdate(current, { sort: "role" })).toEqual({
      sort: "role",
      page: 1,
    });
    expect(
      searchParams.getTeamQueryUpdate(current, { sortDirection: "asc" }),
    ).toEqual({ sortDirection: "asc", page: 1 });
  });

  it("does not reset a direct page change", () => {
    expect(searchParams.getTeamQueryUpdate(current, { page: 3 })).toEqual({
      page: 3,
    });
  });

  it("maps URL filters to the listMembers filter object", () => {
    expect(
      searchParams.getTeamMemberFilters([
        { id: "search", value: " Taylor " },
        { id: "role", value: "ADMIN" },
        { id: "status", value: "DISABLED" },
      ]),
    ).toEqual({ search: "Taylor", role: "ADMIN", status: "DISABLED" });
  });
});
