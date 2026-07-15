import { Suspense } from "react";

import { TradebookReviewWorkspace } from "@/components/imports/tradebook-review-workspace";
import {
  OperationsErrorBoundary,
  OperationsTableSkeleton,
} from "@/components/operations/table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function TradebookImportReviewPage({
  params,
}: {
  params: Promise<{ orgId: string; importId: string }>;
}) {
  const { orgId, importId } = await params;
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.tradebookImport.get.queryOptions({
      organisationId: orgId,
      importId,
    }),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <Suspense
          fallback={<OperationsTableSkeleton title="Loading import review" />}
        >
          <TradebookReviewWorkspace
            organisationId={orgId}
            importId={importId}
          />
        </Suspense>
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
