import { createLoader } from "nuqs/server";

import { OrganisationAuditTrail } from "@/components/operations/audit-trail";
import {
  auditSearchParams,
  getAuditListInput,
} from "@/components/operations/search-params";
import { OperationsErrorBoundary } from "@/components/operations/table-states";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

const loadAuditSearchParams = createLoader(auditSearchParams);

export default async function OrganisationAuditTrailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgId }, queryState] = await Promise.all([
    params,
    loadAuditSearchParams(searchParams),
  ]);
  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(
    trpc.audit.list.queryOptions(getAuditListInput(orgId, queryState)),
  );

  return (
    <HydrateClient>
      <OperationsErrorBoundary>
        <OrganisationAuditTrail organisationId={orgId} />
      </OperationsErrorBoundary>
    </HydrateClient>
  );
}
