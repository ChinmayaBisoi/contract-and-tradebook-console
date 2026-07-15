import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";

export default async function OrganisationOverviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const queryClient = getQueryClient();
  const organisation = await queryClient.fetchQuery(
    trpc.organisation.get.queryOptions({ id: orgId }),
  );

  if (organisation.role !== "OWNER" && organisation.role !== "ADMIN") {
    return null;
  }

  return (
    <HydrateClient>
      <section aria-labelledby="organisation-overview-title" className="space-y-4">
        <div>
          <h2 id="organisation-overview-title" className="text-2xl font-semibold tracking-tight">Overview</h2>
          <p className="text-sm text-muted-foreground">Quick actions for this organisation workspace.</p>
        </div>
        <Card>
          <CardHeader>
            <h3 className="text-base font-medium">Data exchange</h3>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<Link href={`/org/${orgId}/imports`} />}>Import workbook</Button>
            <Button variant="outline" render={<Link href={`/api/org/${orgId}/export?format=excel`} />}>Export Excel</Button>
            <Button variant="outline" render={<Link href={`/api/org/${orgId}/export?format=json`} />}>Export JSON</Button>
          </CardContent>
        </Card>
      </section>
    </HydrateClient>
  );
}
