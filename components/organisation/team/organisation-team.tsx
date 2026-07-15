"use client";

import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { Component, useTransition } from "react";

import {
  type OrganisationTeamMember,
  OrganisationTeamTable,
} from "@/components/organisation/team/organisation-team-table";
import {
  getTeamMemberFilters,
  getTeamQueryUpdate,
  type TeamFilter,
  type TeamSort,
  teamSearchParams,
} from "@/components/organisation/team/team-search-params";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useTRPC } from "@/trpc/client";

type TeamResult = {
  data: OrganisationTeamMember[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

function TeamSectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>
        <h2>Team unavailable</h2>
      </AlertTitle>
      <AlertDescription>
        <p>
          Organisation members could not be loaded. Try again to refresh this
          section.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCwIcon aria-hidden="true" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

class TeamErrorBoundary extends Component<
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
    if (this.state.hasError) {
      return <TeamSectionError onRetry={this.retry} />;
    }

    return this.props.children;
  }
}

export function OrganisationTeamErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <TeamErrorBoundary resetQueries={reset}>{children}</TeamErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function filterValue(filters: TeamFilter[], id: TeamFilter["id"]) {
  return filters.find((filter) => filter.id === id)?.value ?? "";
}

export function OrganisationTeam({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const [isTransitioning, startTransition] = useTransition();
  const [queryState, setQueryState] = useQueryStates(teamSearchParams, {
    history: "push",
    shallow: true,
    startTransition,
  });
  const input = {
    organisationId,
    filters: getTeamMemberFilters(queryState.filters),
    page: queryState.page,
    pageSize: queryState.pageSize,
    sort: queryState.sort,
    sortDirection: queryState.sortDirection,
  };
  const { data } = useSuspenseQuery(
    trpc.organisation.listMembers.queryOptions(input),
  ) as { data: TeamResult };
  const hasFilters = queryState.filters.length > 0;

  function updateQuery(update: Parameters<typeof getTeamQueryUpdate>[1]) {
    void setQueryState(getTeamQueryUpdate(queryState, update));
  }

  function updateFilter(id: TeamFilter["id"], value: string) {
    const nextFilters = queryState.filters.filter((filter) => filter.id !== id);

    if (value) {
      nextFilters.push({ id, value } as TeamFilter);
    }

    updateQuery({ filters: nextFilters });
  }

  function handleSort(sort: TeamSort) {
    updateQuery({
      sort,
      sortDirection:
        queryState.sort === sort && queryState.sortDirection === "asc"
          ? "desc"
          : "asc",
    });
  }

  function clearFilters() {
    updateQuery({ filters: [] });
  }

  return (
    <section aria-labelledby="organisation-team-title" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2
            id="organisation-team-title"
            className="text-lg font-semibold tracking-tight"
          >
            Team
          </h2>
          <p className="text-sm text-muted-foreground">
            Find and review everyone with access to this organisation.
          </p>
        </div>
        <p
          className="text-sm tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {data.pagination.total}{" "}
          {data.pagination.total === 1 ? "member" : "members"}
        </p>
      </div>

      <Card aria-busy={isTransitioning}>
        <CardHeader className="flex flex-col gap-3 border-b md:flex-row md:items-center">
          <label
            htmlFor="team-member-search"
            className="relative min-w-0 flex-1"
          >
            <span className="sr-only">Search members</span>
            <SearchIcon
              aria-hidden="true"
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="team-member-search"
              type="search"
              aria-label="Search members"
              placeholder="Search name or email"
              className="pl-8"
              value={filterValue(queryState.filters, "search")}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </label>
          <NativeSelect
            aria-label="Filter by role"
            value={filterValue(queryState.filters, "role")}
            onChange={(event) => updateFilter("role", event.target.value)}
          >
            <NativeSelectOption value="">All roles</NativeSelectOption>
            <NativeSelectOption value="OWNER">Owner</NativeSelectOption>
            <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
            <NativeSelectOption value="MEMBER">Member</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by status"
            value={filterValue(queryState.filters, "status")}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">Active</NativeSelectOption>
            <NativeSelectOption value="DISABLED">Disabled</NativeSelectOption>
            <NativeSelectOption value="REMOVED">Removed</NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasFilters}
            onClick={clearFilters}
          >
            <XIcon aria-hidden="true" />
            Clear filters
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <OrganisationTeamTable
            members={data.data}
            hasFilters={hasFilters}
            sort={queryState.sort}
            sortDirection={queryState.sortDirection}
            onSort={handleSort}
          />
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {data.pagination.total === 0
                ? "No results"
                : `Page ${data.pagination.page} of ${Math.max(data.pagination.pageCount, 1)}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="team-page-size"
                className="flex items-center gap-2"
              >
                <span>Rows</span>
                <NativeSelect
                  id="team-page-size"
                  aria-label="Rows per page"
                  value={queryState.pageSize}
                  onChange={(event) =>
                    updateQuery({
                      pageSize: Number(event.target.value) as 10 | 20 | 50,
                    })
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
                disabled={queryState.page <= 1}
                onClick={() => updateQuery({ page: queryState.page - 1 })}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  data.pagination.pageCount === 0 ||
                  queryState.page >= data.pagination.pageCount
                }
                onClick={() => updateQuery({ page: queryState.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
