"use client";

import {
  QueryErrorResetBoundary,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { Component, useState, useTransition } from "react";
import { toast } from "sonner";

import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
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

const SAFE_MUTATION_ERROR = "The team change could not be saved. Try again.";

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

type RequesterRole = "OWNER" | "ADMIN" | "MEMBER";
type InvitationInput = {
  organisationId: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  expiresAt: Date;
};

function TeamHeading({
  organisationId,
  organisationName,
  requesterRole,
  total,
  isInvitationPending,
  mutationError,
  onCreateInvitation,
}: {
  organisationId: string;
  organisationName: string;
  requesterRole: RequesterRole;
  total: number;
  isInvitationPending: boolean;
  mutationError: string | null;
  onCreateInvitation: (input: InvitationInput) => Promise<boolean>;
}) {
  return (
    <>
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
        <div className="flex flex-wrap items-center gap-3">
          <p
            className="text-sm tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {total} {total === 1 ? "member" : "members"}
          </p>
          {requesterRole !== "MEMBER" ? (
            <CreateInvitationDialog
              organisationId={organisationId}
              organisationName={organisationName}
              requesterRole={requesterRole}
              isPending={isInvitationPending}
              error={mutationError}
              onCreate={onCreateInvitation}
            />
          ) : null}
        </div>
      </div>
      {mutationError ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>Team change failed</AlertTitle>
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function TeamToolbar({
  filters,
  hasFilters,
  onFilterChange,
  onClearFilters,
}: {
  filters: TeamFilter[];
  hasFilters: boolean;
  onFilterChange: (id: TeamFilter["id"], value: string) => void;
  onClearFilters: () => void;
}) {
  return (
    <CardHeader className="flex flex-col gap-3 border-b md:flex-row md:items-center">
      <label htmlFor="team-member-search" className="relative min-w-0 flex-1">
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
          value={filterValue(filters, "search")}
          onChange={(event) => onFilterChange("search", event.target.value)}
        />
      </label>
      <NativeSelect
        aria-label="Filter by role"
        value={filterValue(filters, "role")}
        onChange={(event) => onFilterChange("role", event.target.value)}
      >
        <NativeSelectOption value="">All roles</NativeSelectOption>
        <NativeSelectOption value="OWNER">Owner</NativeSelectOption>
        <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
        <NativeSelectOption value="MEMBER">Member</NativeSelectOption>
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by status"
        value={filterValue(filters, "status")}
        onChange={(event) => onFilterChange("status", event.target.value)}
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
        onClick={onClearFilters}
      >
        <XIcon aria-hidden="true" />
        Clear filters
      </Button>
    </CardHeader>
  );
}

export function OrganisationTeam({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isTransitioning, startTransition] = useTransition();
  const [mutationError, setMutationError] = useState<string | null>(null);
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
  const { data: organisation } = useSuspenseQuery(
    trpc.organisation.get.queryOptions({ id: organisationId }),
  );
  const { data } = useSuspenseQuery(
    trpc.organisation.listMembers.queryOptions(input),
  ) as { data: TeamResult };
  const createInvitation = useMutation(
    trpc.invitation.create.mutationOptions(),
  );
  const updateMemberRole = useMutation(
    trpc.organisation.updateMemberRole.mutationOptions(),
  );
  const updateMemberStatus = useMutation(
    trpc.organisation.updateMemberStatus.mutationOptions(),
  );
  const removeMember = useMutation(
    trpc.organisation.removeMember.mutationOptions(),
  );
  const hasFilters = queryState.filters.length > 0;
  const requesterRole = organisation.role as "OWNER" | "ADMIN" | "MEMBER";
  const isMutating =
    createInvitation.isPending ||
    updateMemberRole.isPending ||
    updateMemberStatus.isPending ||
    removeMember.isPending;

  async function invalidateTeam(includeInvitations = false) {
    const invalidations = [
      queryClient.invalidateQueries(
        trpc.organisation.listMembers.queryFilter({ organisationId }),
      ),
      queryClient.invalidateQueries(
        trpc.organisation.getAnalytics.queryFilter({ organisationId }),
      ),
      queryClient.invalidateQueries(
        trpc.organisation.get.queryFilter({ id: organisationId }),
      ),
      queryClient.invalidateQueries(
        trpc.audit.list.queryFilter({ organisationId }),
      ),
    ];

    if (includeInvitations) {
      invalidations.push(
        queryClient.invalidateQueries(trpc.invitation.list.queryFilter()),
      );
    }

    await Promise.all(invalidations);
  }

  async function runMemberMutation(
    mutation: Promise<unknown>,
    successMessage: string,
  ) {
    setMutationError(null);
    try {
      await mutation;
      await invalidateTeam();
      toast.success(successMessage);
      return true;
    } catch {
      setMutationError(SAFE_MUTATION_ERROR);
      return false;
    }
  }

  async function handleCreateInvitation(input: InvitationInput) {
    setMutationError(null);
    try {
      await createInvitation.mutateAsync(input);
      await invalidateTeam(true);
      toast.success("Invitation created");
      return true;
    } catch {
      setMutationError(SAFE_MUTATION_ERROR);
      return false;
    }
  }

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
      <TeamHeading
        organisationId={organisationId}
        organisationName={organisation.name}
        requesterRole={requesterRole}
        total={data.pagination.total}
        isInvitationPending={createInvitation.isPending}
        mutationError={mutationError}
        onCreateInvitation={handleCreateInvitation}
      />

      <Card aria-busy={isTransitioning}>
        <TeamToolbar
          filters={queryState.filters}
          hasFilters={hasFilters}
          onFilterChange={updateFilter}
          onClearFilters={clearFilters}
        />
        <CardContent className="px-0">
          <OrganisationTeamTable
            members={data.data}
            requesterRole={requesterRole}
            isMutating={isMutating}
            hasFilters={hasFilters}
            sort={queryState.sort}
            sortDirection={queryState.sortDirection}
            onSort={handleSort}
            onChangeRole={(member, role) =>
              runMemberMutation(
                updateMemberRole.mutateAsync({
                  organisationId,
                  clerkUserId: member.clerkUserId,
                  role,
                }),
                "Member role updated",
              )
            }
            onChangeStatus={(member, status) =>
              runMemberMutation(
                updateMemberStatus.mutateAsync({
                  organisationId,
                  clerkUserId: member.clerkUserId,
                  status,
                }),
                status === "ACTIVE" ? "Member enabled" : "Member disabled",
              )
            }
            onRemove={(member) =>
              runMemberMutation(
                removeMember.mutateAsync({
                  organisationId,
                  clerkUserId: member.clerkUserId,
                }),
                "Member removed",
              )
            }
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
