import { Suspense } from "react";

import { OrganisationAnalytics } from "@/components/organisation/organisation-analytics";
import { OrganisationAnalyticsSkeleton } from "@/components/organisation/organisation-analytics-skeleton";
import { OrganisationSectionErrorBoundary } from "@/components/organisation/organisation-section-error";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function OrganisationOverviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();
  const organisation = await queryClient.fetchQuery(
    trpc.organisation.get.queryOptions({ id: orgId }),
  );
  void queryClient.prefetchQuery(
    trpc.organisation.getAnalytics.queryOptions({ organisationId: orgId }),
  );

  if (organisation.role !== "OWNER" && organisation.role !== "ADMIN") {
    return null;
  }

  return (
    <HydrateClient>
      <OrganisationSectionErrorBoundary>
        <Suspense fallback={<OrganisationAnalyticsSkeleton />}>
          <OrganisationAnalytics organisationId={orgId} />
        </Suspense>
      </OrganisationSectionErrorBoundary>
    </HydrateClient>
  );
}
