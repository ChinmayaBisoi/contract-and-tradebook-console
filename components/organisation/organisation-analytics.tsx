"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarDaysIcon,
  FileTextIcon,
  MailIcon,
  ScrollTextIcon,
  UsersIcon,
  UserXIcon,
} from "lucide-react";
import Link from "next/link";

import { useOrganisationEvents } from "@/components/realtime/use-organisation-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTRPC } from "@/trpc/client";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAge(ageInDays: number) {
  if (ageInDays === 0) {
    return "Created today";
  }

  return `${ageInDays} ${ageInDays === 1 ? "day" : "days"}`;
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  description: React.ReactNode;
  icon: typeof UsersIcon;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function UnavailableCard({
  label,
  description,
  icon: Icon,
}: {
  label: string;
  description: string;
  icon: typeof FileTextIcon;
}) {
  return (
    <Card size="sm" className="bg-muted/20">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Badge variant="outline" className="text-muted-foreground">
          Not connected
        </Badge>
      </CardContent>
    </Card>
  );
}

export function OrganisationAnalytics({
  organisationId,
}: {
  organisationId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { organisationId };
  const { data: analytics } = useSuspenseQuery(
    trpc.organisation.getAnalytics.queryOptions(input),
  );
  useOrganisationEvents({
    organisationId,
    onEvent: async (event) => {
      if (event.entity !== "organisation" && event.entity !== "invitation") {
        return;
      }

      await queryClient.invalidateQueries(
        trpc.organisation.getAnalytics.queryFilter(input),
      );
    },
  });

  return (
    <section
      aria-labelledby="organisation-analytics-title"
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id="organisation-analytics-title"
            className="text-lg font-semibold tracking-tight"
          >
            Overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Current membership and organisation activity at a glance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link href={`/org/${organisationId}/imports`} />}
          >
            Import workbook
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/api/org/${organisationId}/export`} />}
          >
            Export org data
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active members"
          value={analytics.activeMemberCount}
          description="People with current access"
          icon={UsersIcon}
        />
        <MetricCard
          label="Disabled members"
          value={analytics.disabledMemberCount}
          description="Access currently suspended"
          icon={UserXIcon}
        />
        <MetricCard
          label="Pending invitations"
          value={analytics.pendingInvitationCount}
          description="Valid invitations awaiting response"
          icon={MailIcon}
        />
        <MetricCard
          label="Organisation age"
          value={formatAge(analytics.ageInDays)}
          description={
            <>
              Created{" "}
              <time dateTime={new Date(analytics.createdAt).toISOString()}>
                {dateFormatter.format(new Date(analytics.createdAt))}
              </time>
            </>
          }
          icon={CalendarDaysIcon}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <UnavailableCard
          label="Contracts"
          description="Contract metrics are not available in this workspace."
          icon={FileTextIcon}
        />
        <UnavailableCard
          label="Audit activity"
          description="Audit metrics are not available in this workspace."
          icon={ScrollTextIcon}
        />
      </div>
    </section>
  );
}
