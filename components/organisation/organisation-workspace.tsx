"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { OrganisationNav } from "@/components/organisation/organisation-nav";
import { Badge } from "@/components/ui/badge";
import { useTRPC } from "@/trpc/client";

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function OrganisationWorkspace({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const trpc = useTRPC();
  const { data: organisation } = useSuspenseQuery(
    trpc.organisation.get.queryOptions({ id: orgId }),
  );

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-5 border-b pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {organisation.name}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {organisation.description || "No description provided."}
            </p>
          </div>
          <Badge variant="outline" className="mt-1">
            {formatRole(organisation.role)}
          </Badge>
        </div>
        <OrganisationNav orgId={orgId} />
      </header>
      {children}
    </main>
  );
}
