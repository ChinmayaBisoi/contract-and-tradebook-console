import { createLoader } from "nuqs/server";
import { Suspense } from "react";

import {
  OrganisationTeam,
  OrganisationTeamErrorBoundary,
} from "@/components/organisation/team/organisation-team";
import { OrganisationTeamSkeleton } from "@/components/organisation/team/organisation-team-skeleton";
import {
  getTeamMemberFilters,
  teamSearchParams,
} from "@/components/organisation/team/team-search-params";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

const loadTeamSearchParams = createLoader(teamSearchParams);

export default async function OrganisationTeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, queryState] = await Promise.all([
    params,
    loadTeamSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.organisation.listMembers.queryOptions({
      organisationId: orgId,
      filters: getTeamMemberFilters(queryState.filters),
      page: queryState.page,
      pageSize: queryState.pageSize,
      sort: queryState.sort,
      sortDirection: queryState.sortDirection,
    }),
  );

  return (
    <HydrateClient>
      <OrganisationTeamErrorBoundary>
        <Suspense fallback={<OrganisationTeamSkeleton />}>
          <OrganisationTeam organisationId={orgId} />
        </Suspense>
      </OrganisationTeamErrorBoundary>
    </HydrateClient>
  );
}
