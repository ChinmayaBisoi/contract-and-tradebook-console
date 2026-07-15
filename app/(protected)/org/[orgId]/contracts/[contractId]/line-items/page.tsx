import { createLoader } from "nuqs/server";
import { Suspense } from "react";

import { OrganisationLineItems } from "@/components/operations/line-items";
import {
  getLineItemListInput,
  lineItemSearchParams,
} from "@/components/operations/search-params";
import {
  OperationsErrorBoundary,
  OperationsTableSkeleton,
} from "@/components/operations/table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

const loadLineItemSearchParams = createLoader(lineItemSearchParams);

export default async function ContractLineItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; contractId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId, contractId }, queryState] = await Promise.all([
    params,
    loadLineItemSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.lineItem.list.queryOptions(
      getLineItemListInput(orgId, contractId, queryState),
    ),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <Suspense
          fallback={
            <OperationsTableSkeleton title="Loading contract line items" />
          }
        >
          <OrganisationLineItems
            organisationId={orgId}
            contractId={contractId}
          />
        </Suspense>
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
