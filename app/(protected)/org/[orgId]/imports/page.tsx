import { UploadIcon } from "lucide-react";

import { UnavailableSection } from "@/components/organisation/unavailable-section";

export default async function OrganisationImportsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <UnavailableSection
      title="Imports"
      description="Import processing is not connected or available for this organisation yet."
      icon={UploadIcon}
      orgId={orgId}
    />
  );
}
