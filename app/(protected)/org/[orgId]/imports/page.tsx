import { createLoader } from "nuqs/server";

import { OrganisationImports } from "@/components/imports/organisation-imports";
import {
  getImportListInput,
  importSearchParams,
} from "@/components/imports/search-params";
import { OperationsErrorBoundary } from "@/components/operations/table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

const loadImportSearchParams = createLoader(importSearchParams);

export default async function OrganisationImportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, queryState] = await Promise.all([
    params,
    loadImportSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.tradebookImport.list.queryOptions(
      getImportListInput(orgId, queryState),
    ),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <OrganisationImports organisationId={orgId} />
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
