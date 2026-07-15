"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTRPC } from "@/trpc/client";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export function ContractAuditTrail({
  organisationId,
  contractId,
}: {
  organisationId: string;
  contractId: string;
}) {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const input = {
    organisationId,
    filters: { contractId },
    page,
    pageSize: 10 as const,
    sort: "occurredAt" as const,
    sortDirection: "desc" as const,
  };
  const { data, isLoading, isError, isFetching } = useQuery({
    ...trpc.audit.list.queryOptions(input),
    placeholderData: keepPreviousData,
  });

  return (
    <Card aria-busy={isFetching}>
      <CardHeader className="border-b">
        <h3 className="text-base font-medium">Contract history</h3>
        <p className="text-sm text-muted-foreground">
          Who changed this contract and what changed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading contract history...
          </p>
        ) : null}
        {isError ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            Contract history could not be loaded.
          </p>
        ) : null}
        {!isLoading && !isError && data?.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No contract changes recorded.
          </p>
        ) : null}
        {data?.data.map((event) => (
          <article key={event.id} className="rounded-lg border bg-muted/15 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{label(event.action)}</Badge>
                  <span className="text-sm font-medium">
                    {event.entityLabel ?? event.entityId}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.actorName ?? event.actorEmail ?? "Unknown user"} ·{" "}
                  {dateTime.format(new Date(event.occurredAt))}
                </p>
              </div>
              {event.changedFields.length ? (
                <span className="text-xs text-muted-foreground">
                  Changed: {event.changedFields.join(", ")}
                </span>
              ) : null}
            </div>
            {event.beforeState || event.afterState ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  Before and after
                </summary>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <pre className="overflow-auto rounded-md bg-muted p-2">
                    {JSON.stringify(event.beforeState ?? null, null, 2)}
                  </pre>
                  <pre className="overflow-auto rounded-md bg-muted p-2">
                    {JSON.stringify(event.afterState ?? null, null, 2)}
                  </pre>
                </div>
              </details>
            ) : null}
          </article>
        ))}
        {data && data.pagination.pageCount > 1 ? (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= data.pagination.pageCount || isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
