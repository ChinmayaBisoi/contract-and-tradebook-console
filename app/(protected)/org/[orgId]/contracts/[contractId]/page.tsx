import { Suspense } from "react";

import { ContractDetail } from "@/components/contracts/contract-detail";
import {
  ContractsErrorBoundary,
  ContractsTableSkeleton,
} from "@/components/contracts/contracts-table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

async function ContractDetailSection({
  params,
}: {
  params: Promise<{ orgId: string; contractId: string }>;
}) {
  const { orgId, contractId } = await params;
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.contract.get.queryOptions({
      organisationId: orgId,
      id: contractId,
    }),
  );
  void queryClient.prefetchQuery(
    trpc.audit.list.queryOptions({
      organisationId: orgId,
      filters: { contractId },
      page: 1,
      pageSize: 10,
      sort: "occurredAt",
      sortDirection: "desc",
    }),
  );

  return <ContractDetail organisationId={orgId} contractId={contractId} />;
}

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; contractId: string }>;
}) {
  return (
    <HydrateClient>
      <ContractsErrorBoundary>
        <Suspense
          fallback={<ContractsTableSkeleton title="Loading contract details" />}
        >
          <ContractDetailSection params={params} />
        </Suspense>
      </ContractsErrorBoundary>
    </HydrateClient>
  );
}
