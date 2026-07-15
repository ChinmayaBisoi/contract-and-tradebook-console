import { Suspense } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { OrganisationWorkspace } from "@/components/organisation/organisation-workspace";
import { OrganisationWorkspaceSkeleton } from "@/components/organisation/organisation-workspace-skeleton";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function OrganisationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery(
    trpc.organisation.get.queryOptions({ id: orgId }),
  );

  return (
    <DashboardShell title="Organisation">
      <HydrateClient>
        <Suspense fallback={<OrganisationWorkspaceSkeleton />}>
          <OrganisationWorkspace orgId={orgId}>
            {children}
          </OrganisationWorkspace>
        </Suspense>
      </HydrateClient>
    </DashboardShell>
  );
}
