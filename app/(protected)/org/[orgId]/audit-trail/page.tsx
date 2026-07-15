import { ScrollTextIcon } from "lucide-react";

import { UnavailableSection } from "@/components/organisation/unavailable-section";

export default async function OrganisationAuditTrailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <UnavailableSection
      title="Audit Trail"
      description="Audit event storage is not connected or available for this organisation yet."
      icon={ScrollTextIcon}
      orgId={orgId}
    />
  );
}
