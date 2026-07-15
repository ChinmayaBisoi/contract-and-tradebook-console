"use client";

import {
  type CodedOrganisationError,
  OrganisationErrorView,
} from "@/components/organisation/organisation-workspace";

export default function OrganisationError({
  error,
  reset,
}: {
  error: CodedOrganisationError;
  reset: () => void;
}) {
  return <OrganisationErrorView error={error} onRetry={reset} />;
}
