import { Suspense } from "react";

import { getDefaultContractListInput } from "@/components/contracts/contracts-query";
import { OrganisationContracts } from "@/components/contracts/organisation-contracts";
import {
  ContractsErrorBoundary,
  ContractsTableSkeleton,
} from "@/components/contracts/contracts-table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

async function OrganisationContractsSection({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.contract.list.queryOptions(getDefaultContractListInput(orgId)),
  );

  return <OrganisationContracts organisationId={orgId} />;
}

export default function OrganisationContractsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  return (
    <HydrateClient>
      <ContractsErrorBoundary>
        <Suspense fallback={<ContractsTableSkeleton title="Loading contracts" />}>
          <OrganisationContractsSection params={params} />
        </Suspense>
      </ContractsErrorBoundary>
    </HydrateClient>
  );
}
