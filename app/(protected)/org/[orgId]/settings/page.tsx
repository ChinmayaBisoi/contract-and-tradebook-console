import { OrganisationSettings } from "@/components/organisation/organisation-settings";
import { OrganisationSectionErrorBoundary } from "@/components/organisation/organisation-section-error";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function OrganisationSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.organisation.get.queryOptions({ id: orgId }),
  );

  return (
    <HydrateClient>
      <OrganisationSectionErrorBoundary>
        <OrganisationSettings organisationId={orgId} />
      </OrganisationSectionErrorBoundary>
    </HydrateClient>
  );
}
