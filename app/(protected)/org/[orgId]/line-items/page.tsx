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

export default async function OrganisationLineItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, queryState] = await Promise.all([
    params,
    loadLineItemSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.lineItem.list.queryOptions(
      getLineItemListInput(orgId, undefined, queryState),
    ),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <Suspense
          fallback={<OperationsTableSkeleton title="Loading line items" />}
        >
          <OrganisationLineItems organisationId={orgId} />
        </Suspense>
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
