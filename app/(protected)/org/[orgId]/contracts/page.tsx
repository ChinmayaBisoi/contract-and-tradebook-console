import { createLoader } from "nuqs/server";
import { Suspense } from "react";

import { OrganisationContracts } from "@/components/operations/contracts";
import {
  contractSearchParams,
  getContractListInput,
} from "@/components/operations/search-params";
import {
  OperationsErrorBoundary,
  OperationsTableSkeleton,
} from "@/components/operations/table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

const loadContractSearchParams = createLoader(contractSearchParams);

export default async function OrganisationContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, queryState] = await Promise.all([
    params,
    loadContractSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.contract.list.queryOptions(getContractListInput(orgId, queryState)),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <Suspense
          fallback={<OperationsTableSkeleton title="Loading contracts" />}
        >
          <OrganisationContracts organisationId={orgId} />
        </Suspense>
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
