import { createParser, parseAsJson, parseAsStringLiteral } from "nuqs/server";
import { z } from "zod";

const pageSizes = [10, 20, 50] as const;
const teamSorts = ["clerkUserName", "role", "status", "createdAt"] as const;
const sortDirections = ["asc", "desc"] as const;

const teamFilterSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("search"), value: z.string() }),
  z.object({
    id: z.literal("role"),
    value: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  }),
  z.object({
    id: z.literal("status"),
    value: z.enum(["ACTIVE", "DISABLED", "REMOVED"]),
  }),
]);

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
      ? (parsed as (typeof pageSizes)[number])
      : null;
  },
  serialize: String,
});

export type TeamFilter = z.infer<typeof teamFilterSchema>;
export type TeamSort = (typeof teamSorts)[number];
export type TeamSortDirection = (typeof sortDirections)[number];

export type TeamQueryState = {
  filters: TeamFilter[];
  page: number;
  pageSize: (typeof pageSizes)[number];
  sort: TeamSort;
  sortDirection: TeamSortDirection;
};

export type TeamQueryUpdate = Partial<TeamQueryState>;

export const teamSearchParams = {
  filters: parseAsJson(z.array(teamFilterSchema)).withDefault([]),
  page: positiveIntegerParser.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
  sort: parseAsStringLiteral(teamSorts).withDefault("createdAt"),
  sortDirection: parseAsStringLiteral(sortDirections).withDefault("desc"),
};

export function getTeamQueryUpdate(
  _current: TeamQueryState,
  update: TeamQueryUpdate,
): TeamQueryUpdate {
  const resetsPage = ["filters", "pageSize", "sort", "sortDirection"].some(
    (key) => Object.hasOwn(update, key),
  );

  return resetsPage ? { ...update, page: 1 } : update;
}

export function getTeamMemberFilters(filters: TeamFilter[]) {
  const result: {
    search?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER";
    status?: "ACTIVE" | "DISABLED" | "REMOVED";
  } = {};

  for (const filter of filters) {
    if (filter.id === "search") {
      const search = filter.value.trim();
      if (search) {
        result.search = search;
      }
    } else if (filter.id === "role") {
      result.role = filter.value;
    } else {
      result.status = filter.value;
    }
  }

  return result;
}
