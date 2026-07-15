import { FileTextIcon } from "lucide-react";

import { UnavailableSection } from "@/components/organisation/unavailable-section";

export default async function OrganisationContractsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <UnavailableSection
      title="Contracts"
      description="Contract storage is not connected or available for this organisation yet."
      icon={FileTextIcon}
      orgId={orgId}
    />
  );
}
