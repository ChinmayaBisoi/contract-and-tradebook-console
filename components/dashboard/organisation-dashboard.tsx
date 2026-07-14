"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { OrganisationDashboardView } from "@/components/dashboard/organisation-dashboard-view";
import {
  dataTableSearchParams,
  getDashboardQueryUpdate,
} from "@/components/data-table-v2/data-table-search-params";
import { useTRPC } from "@/trpc/client";

function filterValue(
  filters: Array<{ id: string; value: string }>,
  id: string,
) {
  return filters.find((filter) => filter.id === id)?.value;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function OrganisationDashboard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useQueryStates(dataTableSearchParams, {
    history: "push",
  });
  const [mutationError, setMutationError] = useState<string | null>(null);

  const search = filterValue(queryState.filters, "search");
  const roleFilter = filterValue(queryState.filters, "role");
  const directionFilter = filterValue(queryState.filters, "direction");
  const statusFilter = filterValue(queryState.filters, "status");

  const organisationQuery = useQuery(
    trpc.organisation.list.queryOptions(
      {
        filters: {
          ...(search ? { search } : {}),
          ...(roleFilter === "OWNER" ||
          roleFilter === "ADMIN" ||
          roleFilter === "MEMBER"
            ? { role: roleFilter }
            : {}),
        },
        page: queryState.page,
        pageSize: queryState.pageSize as 10 | 20 | 50,
        sort: queryState.sort === "name" ? "name" : "createdAt",
        sortDirection: queryState.sortDirection ?? "desc",
      },
      { enabled: queryState.tab === "organisations" },
    ),
  );

  const invitationQuery = useQuery(
    trpc.invitation.list.queryOptions(
      {
        filters: {
          direction:
            directionFilter === "received" || directionFilter === "managed"
              ? directionFilter
              : "all",
          ...(search ? { search } : {}),
          ...(statusFilter === "PENDING" ||
          statusFilter === "ACCEPTED" ||
          statusFilter === "DECLINED" ||
          statusFilter === "EXPIRED" ||
          statusFilter === "CANCELLED"
            ? { status: statusFilter }
            : {}),
        },
        page: queryState.page,
        pageSize: queryState.pageSize as 10 | 20 | 50,
        sort:
          queryState.sort === "email" || queryState.sort === "expiresAt"
            ? queryState.sort
            : "createdAt",
        sortDirection: queryState.sortDirection ?? "desc",
      },
      { enabled: queryState.tab === "invitations" },
    ),
  );

  const createOrganisation = useMutation(
    trpc.organisation.create.mutationOptions(),
  );
  const createInvitation = useMutation(
    trpc.invitation.create.mutationOptions(),
  );
  const updateInvitation = useMutation(
    trpc.invitation.update.mutationOptions(),
  );
  const acceptInvitation = useMutation(
    trpc.invitation.accept.mutationOptions(),
  );
  const declineInvitation = useMutation(
    trpc.invitation.decline.mutationOptions(),
  );
  const cancelInvitation = useMutation(
    trpc.invitation.cancel.mutationOptions(),
  );

  async function invalidateDashboard() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.organisation.queryFilter()),
      queryClient.invalidateQueries(trpc.invitation.queryFilter()),
    ]);
  }

  async function runFormMutation<T>(
    mutation: Promise<T>,
    successMessage: string,
  ) {
    setMutationError(null);
    try {
      await mutation;
      await invalidateDashboard();
      toast.success(successMessage);
    } catch (error) {
      setMutationError(errorMessage(error));
      throw error;
    }
  }

  function runRowMutation(mutation: Promise<unknown>, successMessage: string) {
    setMutationError(null);
    void mutation
      .then(async () => {
        await invalidateDashboard();
        toast.success(successMessage);
      })
      .catch((error: unknown) => setMutationError(errorMessage(error)));
  }

  const activeQuery =
    queryState.tab === "organisations" ? organisationQuery : invitationQuery;
  const pagination = activeQuery.data?.pagination ?? {
    page: queryState.page,
    pageSize: queryState.pageSize,
    total: 0,
    pageCount: 0,
  };
  const isMutating =
    createOrganisation.isPending ||
    createInvitation.isPending ||
    updateInvitation.isPending ||
    acceptInvitation.isPending ||
    declineInvitation.isPending ||
    cancelInvitation.isPending;

  return (
    <OrganisationDashboardView
      {...queryState}
      activeTab={queryState.tab}
      organisations={organisationQuery.data?.data ?? []}
      invitations={invitationQuery.data?.data ?? []}
      pagination={pagination}
      isLoading={activeQuery.isLoading}
      error={activeQuery.error ? errorMessage(activeQuery.error) : null}
      mutationError={mutationError}
      isMutating={isMutating}
      onQueryChange={(update) =>
        setQueryState(getDashboardQueryUpdate(queryState, update))
      }
      onCreateOrganisation={(input) =>
        runFormMutation(
          createOrganisation.mutateAsync(input),
          "Organisation created",
        )
      }
      onCreateInvitation={(input) =>
        runFormMutation(
          createInvitation.mutateAsync(input),
          "Invitation created",
        )
      }
      onUpdateInvitation={(input) =>
        runFormMutation(
          updateInvitation.mutateAsync(input),
          "Invitation updated",
        )
      }
      onAcceptInvitation={(id) =>
        runRowMutation(
          acceptInvitation.mutateAsync({ id }),
          "Invitation accepted",
        )
      }
      onDeclineInvitation={(id) =>
        runRowMutation(
          declineInvitation.mutateAsync({ id }),
          "Invitation declined",
        )
      }
      onCancelInvitation={(id) =>
        runRowMutation(
          cancelInvitation.mutateAsync({ id }),
          "Invitation cancelled",
        )
      }
      onRetry={() => void activeQuery.refetch()}
    />
  );
}
