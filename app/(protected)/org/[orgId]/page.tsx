import { Suspense } from "react";

import { OrganisationAnalytics } from "@/components/organisation/organisation-analytics";
import { OrganisationAnalyticsSkeleton } from "@/components/organisation/organisation-analytics-skeleton";
import { OrganisationSectionErrorBoundary } from "@/components/organisation/organisation-section-error";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

async function OrganisationAnalyticsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.organisation.getAnalytics.queryOptions({ organisationId: orgId }),
  );

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

export default OrganisationAnalyticsPage;
